import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, Tag as TagIcon, Trash2, ImagePlus, Star, DollarSign, Hash, AlertCircle, Plus, Sparkles, Crop, Calendar, FileText } from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { supabase } from '../lib/supabase';
import { uploadImage, deleteImage } from '../lib/storage';
import { reEnrichItem } from '../lib/gemini';
import { useToast } from '../hooks/useToast';
import { triggerSmartReminderSync } from '../lib/notifications';
import { ContainerSelector } from './ContainerSelector';
import { ImageCropper } from './ImageCropper';
import type { Item, ItemCondition } from '../types';

interface EditItemModalProps {
  item: Item | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedItem: Item) => void;
}

export const EditItemModal: React.FC<EditItemModalProps> = ({ item, isOpen, onClose, onUpdate }) => {
  const MAX_IMAGES = 8;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [containerId, setContainerId] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const { addToast } = useToast();

  // Cropping state
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [croppingIndex, setCroppingIndex] = useState<number | null>(null);

  // Fields
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<ItemCondition>('good');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isConsumable, setIsConsumable] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(0);
  const [estimatedPrice, setEstimatedPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchasePrice, setPurchasePrice] = useState<number | ''>('');
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  // Specs editor
  const [specs, setSpecs] = useState<[string, string][]>([]);
  const [newSpecKey, setNewSpecKey] = useState('');
  const [newSpecValue, setNewSpecValue] = useState('');

  // AI re-enrichment
  const [showEnrichSection, setShowEnrichSection] = useState(false);
  const [enrichSource, setEnrichSource] = useState('');
  const [enriching, setEnriching] = useState(false);

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const isSchemaMismatchError = (error: { code?: string; message?: string } | null) => {
    if (!error) return false;
    const message = (error.message || '').toLowerCase();
    return (
      error.code === 'PGRST204' ||
      message.includes('column') ||
      message.includes('schema cache') ||
      message.includes('could not find')
    );
  };

  useEffect(() => {
    if (item) {
      setName(item.name || '');
      setDescription(item.description || '');
      setCategory(item.category || '');
      setTags(item.tags ? item.tags.join(', ') : '');
      setContainerId(item.container_id || null);
      const itemImages = item.images?.length > 0 ? [...item.images] : item.image_url ? [item.image_url] : [];
      setImages(itemImages);
      setQuantity(item.quantity || 1);
      setCondition((item.condition as ItemCondition) || 'good');
      setIsFavorite(item.is_favorite || false);
      setIsConsumable(item.is_consumable || false);
      setLowStockThreshold(item.low_stock_threshold || 0);
      setEstimatedPrice(item.estimated_price || '');
      setPurchaseDate(item.purchase_date || '');
      setPurchasePrice(item.purchase_price ?? '');
      setReceiptImageUrl(item.receipt_image_url || null);

      // Initialize specs from item
      if (item.specs && typeof item.specs === 'object') {
        const entries = Object.entries(item.specs).map(([k, v]) => [k, String(v)] as [string, string]);
        setSpecs(entries);
      } else {
        setSpecs([]);
      }

      setShowEnrichSection(false);
      setEnrichSource('');
    }
  }, [item]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose, saving]);

  if (!isOpen || !item) return null;

  // --- Image handlers ---
  const handleAddImage = async () => {
    if (images.length >= MAX_IMAGES) {
      addToast(`You can add up to ${MAX_IMAGES} photos.`, 'info');
      return;
    }

    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true, // Enabled editing/cropping
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt, // Prompts user for Camera or Photos
      });

      if (!image.base64String) return;

      setUploadingImage(true);
      const base64 = `data:image/${image.format};base64,${image.base64String}`;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const imageUrl = await uploadImage(base64, 'items', user.id);
      setImages(prev => (prev.includes(imageUrl) ? prev : [...prev, imageUrl]));

      if (imageUrl.startsWith('data:')) {
        addToast('Cloud upload failed; using optimized local image data.', 'info');
      }
    } catch (error) {
       // User cancelled or error — don't show toast for cancellation
       if ((error as Error).message !== 'User cancelled photos app') {
          console.debug('Camera error:', error);
       }
    } finally {
      setUploadingImage(false);
    }
  };

  const handleReplaceImage = async (index: number) => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true, // Native cropping/editing
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
      });

      if (!image.base64String) return;

      setUploadingImage(true);
      const base64 = `data:image/${image.format};base64,${image.base64String}`;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const imageUrl = await uploadImage(base64, 'items', user.id);
      
      setImages(prev => {
        const next = [...prev];
        next[index] = imageUrl;
        return next;
      });

      if (imageUrl.startsWith('data:')) {
        addToast('Cloud upload failed; using optimized local image data.', 'info');
      }
    } catch (error) {
       if ((error as Error).message !== 'User cancelled photos app') {
          console.debug('Camera error:', error);
       }
    } finally {
      setUploadingImage(false);
    }
  };

  const handleUploadReceipt = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
      });
      if (!image.base64String) return;
      setUploadingReceipt(true);
      const base64 = `data:image/${image.format};base64,${image.base64String}`;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const imageUrl = await uploadImage(base64, 'receipts', user.id);
      setReceiptImageUrl(imageUrl);
      addToast('Receipt uploaded', 'success');
    } catch (error) {
       if ((error as Error).message !== 'User cancelled photos app') {
          console.debug('Receipt upload error:', error);
       }
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleStartCrop = (index: number) => {
    setCroppingImage(images[index]);
    setCroppingIndex(index);
  };

  const handleCancelCrop = () => {
    setCroppingImage(null);
    setCroppingIndex(null);
  };

  const handleCropComplete = async (croppedBase64: string) => {
    if (croppingIndex === null) return;
    
    try {
      setUploadingImage(true);
      // Upload the new cropped version
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const imageUrl = await uploadImage(croppedBase64, 'items', user.id);
      
      setImages(prev => {
        const next = [...prev];
        next[croppingIndex] = imageUrl;
        return next;
      });

      handleCancelCrop();
      addToast('Image cropped successfully!', 'success');
    } catch (error) {
       console.error('Crop upload error:', error);
       addToast('Failed to save cropped image.', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSetMainImage = (index: number) => {
    if (index === 0) return;
    setImages(prev => {
      if (index < 0 || index >= prev.length) return prev;
      const next = [...prev];
      const [selected] = next.splice(index, 1);
      next.unshift(selected);
      return next;
    });
  };

  // --- Specs handlers ---
  const handleAddSpec = () => {
    const key = newSpecKey.trim();
    const val = newSpecValue.trim();
    if (!key) return;
    // Update existing or add new
    setSpecs(prev => {
      const idx = prev.findIndex(([k]) => k.toLowerCase() === key.toLowerCase());
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = [key, val];
        return next;
      }
      return [...prev, [key, val]];
    });
    setNewSpecKey('');
    setNewSpecValue('');
  };

  const handleRemoveSpec = (index: number) => {
    setSpecs(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateSpec = (index: number, field: 'key' | 'value', val: string) => {
    setSpecs(prev => {
      const next = [...prev];
      if (field === 'key') next[index] = [val, next[index][1]];
      else next[index] = [next[index][0], val];
      return next;
    });
  };

  // --- AI Re-enrichment ---
  const handleEnrich = async () => {
    if (!enrichSource.trim()) return;
    setEnriching(true);
    try {
      const tagArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
      const specsObj = Object.fromEntries(specs.filter(([k]) => k.trim()));

      // Only pass image if it's base64 data, not a URL
      const mainImage = images[0];
      const imageForAI = mainImage && mainImage.startsWith('data:') ? mainImage : undefined;

      const result = await reEnrichItem(
        {
          name, description, category, tags: tagArray,
          specs: specsObj,
          estimatedPrice,
        },
        enrichSource.trim(),
        imageForAI
      );

      // Apply ALL enriched data — always overwrite with AI results
      setName(result.name || name);
      setDescription(result.description || description);
      setCategory(result.category || category);
      if (result.tags && result.tags.length > 0) {
        setTags(result.tags.join(', '));
      }
      if (result.estimatedPrice) setEstimatedPrice(result.estimatedPrice);
      if (result.specs && Object.keys(result.specs).length > 0) {
        const newSpecs = Object.entries(result.specs).map(([k, v]) => [k, String(v)] as [string, string]);
        setSpecs(newSpecs);
      }

      addToast('AI updated item details! Review and save.', 'success');
      setShowEnrichSection(false);
      setEnrichSource('');
    } catch (err) {
      addToast('AI enrichment failed: ' + (err as Error).message, 'error');
    } finally {
      setEnriching(false);
    }
  };

  // --- Save ---
  const handleSave = async () => {
    setSaving(true);
    try {
      const tagArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
      const normalizedContainerId = containerId && isUuid(containerId) ? containerId : null;
      const normalizedImageUrl = images[0] || null;
      const originalImages = item.images?.length > 0 ? item.images : item.image_url ? [item.image_url] : [];
      const imagesChanged = JSON.stringify(originalImages) !== JSON.stringify(images);
      const removedImages = originalImages.filter(url => !images.includes(url));
      const specsObj = Object.fromEntries(specs.filter(([k]) => k.trim()));

      const payload: Record<string, unknown> = {
        name,
        description,
        tags: tagArray,
        container_id: normalizedContainerId,
        image_url: normalizedImageUrl,
        quantity,
        condition,
        is_favorite: isFavorite,
        is_consumable: isConsumable,
        low_stock_threshold: isConsumable ? lowStockThreshold : 0,
        estimated_price: estimatedPrice || null,
        purchase_date: purchaseDate || null,
        purchase_price: purchasePrice === '' ? null : purchasePrice,
        receipt_image_url: receiptImageUrl,
        specs: specsObj,
      };

      if (category !== (item.category || '')) {
        payload.category = category || null;
      }
      if (imagesChanged) {
        payload.images = images;
      }

      const { data: updatedData, error: saveError } = await supabase
        .from('items')
        .update(payload)
        .eq('id', item.id)
        .select(`
          *,
          container:containers(
            id, name,
            location:locations(id, name)
          )
        `)
        .single();

      if (saveError) {
        if (isSchemaMismatchError(saveError)) {
          const fallbackPayload: Record<string, unknown> = {
            name,
            description,
            tags: tagArray,
            container_id: normalizedContainerId,
            image_url: normalizedImageUrl,
            purchase_date: purchaseDate || null,
            purchase_price: purchasePrice === '' ? null : purchasePrice,
            receipt_image_url: receiptImageUrl,
            specs: specsObj,
          };

          const { data: fbData, error: fbError } = await supabase
            .from('items')
            .update(fallbackPayload)
            .eq('id', item.id)
            .select(`*, container:containers(id, name, location:locations(id, name))`)
            .single();

          if (fbError) throw fbError;

          addToast('Saved basic fields. Run migration_v2.sql for full support.', 'info');
          triggerSmartReminderSync();
          if (fbData) onUpdate(fbData as Item);
          onClose();
          return;
        }

        throw saveError;
      }

      if (imagesChanged) {
        for (const url of removedImages) {
          await deleteImage(url, 'items');
        }
      }

      addToast('Item updated!', 'success');
      triggerSmartReminderSync();
      if (updatedData) onUpdate(updatedData as Item);
      onClose();
    } catch (e) {
      addToast('Error updating item: ' + (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const tagArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
  const conditions: ItemCondition[] = ['new', 'good', 'fair', 'worn', 'needs-repair'];

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 isolation-isolate">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[1px]" onClick={onClose} />

      <div className="relative z-10 bg-[hsl(var(--background))] text-[hsl(var(--foreground))] w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-border">

        <div className="px-5 pt-4 pb-3 border-b border-border/70 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-lg">Edit Item</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-full transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 bg-[hsl(var(--background))]">

          {/* Image Gallery */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Photos</label>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
              {images.map((url, index) => (
                <div
                  key={index}
                  className={`relative shrink-0 w-32 h-32 rounded-xl overflow-hidden border-2 transition-all ${index === 0 ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'}`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => handleSetMainImage(index)} className="absolute inset-0 z-10" title={index === 0 ? 'Main photo' : 'Set as main photo'} aria-label={index === 0 ? 'Main photo' : 'Set as main photo'} />
                  
                  {/* Actions Overlay */}
                  <div className="absolute top-1.5 right-1.5 z-20 flex flex-col gap-1.5">
                     <button type="button" aria-label="Remove photo" onClick={e => { e.stopPropagation(); handleRemoveImage(index); }} className="w-8 h-8 rounded-full bg-black/60 hover:bg-destructive text-white flex items-center justify-center transition-colors backdrop-blur-sm">
                        <Trash2 className="w-4 h-4" />
                     </button>
                     <button type="button" aria-label="Crop photo" onClick={e => { e.stopPropagation(); handleStartCrop(index); }} className="w-8 h-8 rounded-full bg-black/60 hover:bg-primary text-white flex items-center justify-center transition-colors backdrop-blur-sm">
                        <Crop className="w-4 h-4" />
                     </button>
                     <button type="button" aria-label="Replace photo" onClick={e => { e.stopPropagation(); handleReplaceImage(index); }} className="w-8 h-8 rounded-full bg-black/60 hover:bg-primary text-white flex items-center justify-center transition-colors backdrop-blur-sm">
                        <ImagePlus className="w-4 h-4" />
                     </button>
                  </div>

                  {index === 0 && <span className="absolute bottom-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 bg-primary/90 text-primary-foreground rounded backdrop-blur-md">MAIN</span>}
                </div>
              ))}
              <button
                onClick={handleAddImage}
                disabled={uploadingImage || images.length >= MAX_IMAGES}
                className="shrink-0 w-32 h-32 rounded-xl border-2 border-dashed border-border hover:border-primary/60 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 bg-[hsl(var(--muted)/0.3)]"
              >
                {uploadingImage ? <Loader2 className="w-6 h-6 animate-spin" /> : <><ImagePlus className="w-8 h-8 opacity-50" /><span className="text-[10px] font-medium">Add Photo</span></>}
              </button>
              {/* Camera plugin handles inputs now, so hidden input removed */}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{images.length}/{MAX_IMAGES} photos • Tap a photo to set it as main</p>
          </div>

          {/* Name */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2.5 border rounded-lg bg-[hsl(var(--background))] text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none transition-all" />
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2.5 border rounded-lg bg-[hsl(var(--background))] text-sm h-20 resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none transition-all" />
          </div>

          {/* Category & Tags */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Category</label>
              <input value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2.5 border rounded-lg bg-[hsl(var(--background))] text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none transition-all" placeholder="Hand Tools" />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Tags</label>
              <input value={tags} onChange={e => setTags(e.target.value)} placeholder="drill, power" className="w-full px-3 py-2.5 border rounded-lg bg-[hsl(var(--background))] text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none transition-all" />
            </div>
          </div>

          {tagArray.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tagArray.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-secondary text-secondary-foreground rounded-full">
                  <TagIcon className="w-2.5 h-2.5" /> {tag}
                </span>
              ))}
            </div>
          )}

          {/* Quantity & Condition */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5 flex items-center gap-1">
                <Hash className="w-3 h-3" /> Quantity
              </label>
              <input type="number" min={0} value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 0)} className="w-full px-3 py-2.5 border rounded-lg bg-[hsl(var(--background))] text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none transition-all" />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Condition</label>
              <select value={condition} onChange={e => setCondition(e.target.value as ItemCondition)} className="w-full px-3 py-2.5 border rounded-lg bg-[hsl(var(--background))] text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none transition-all">
                {conditions.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1).replace('-', ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Estimated Price */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5 flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Estimated Price
            </label>
            <input value={estimatedPrice} onChange={e => setEstimatedPrice(e.target.value)} placeholder="$29-49" className="w-full px-3 py-2.5 border rounded-lg bg-[hsl(var(--background))] text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none transition-all" />
          </div>

          {/* Insurance / Purchase Info */}
          <div className="border-t border-border/50 pt-4 space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Insurance & Purchase Tracking</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground block mb-1">Purchase Date</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className="w-full pl-9 pr-3 py-2 border rounded-lg bg-card text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground block mb-1">Purchase Price</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="number" min="0" step="0.01" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value === '' ? '' : Number(e.target.value))} className="w-full pl-9 pr-3 py-2 border rounded-lg bg-card text-sm focus:ring-2 focus:ring-primary/20 outline-none" placeholder="0.00" />
                </div>
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground block mb-1">Receipt / Proof of Purchase</label>
              {receiptImageUrl ? (
                <div className="relative inline-block border rounded-xl overflow-hidden group">
                  <img src={receiptImageUrl} alt="Receipt" className="h-20 w-20 object-cover" />
                  <button type="button" onClick={() => setReceiptImageUrl(null)} className="absolute inset-0 bg-black/50 text-white flex justify-center items-center opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></button>
                </div>
              ) : (
                <button type="button" onClick={handleUploadReceipt} disabled={uploadingReceipt} className="w-full py-2 border border-dashed rounded-lg text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors flex items-center justify-center gap-2 bg-card">
                  {uploadingReceipt ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ImagePlus className="w-4 h-4" /> Upload Receipt</>}
                </button>
              )}
            </div>
          </div>

          {/* ====== SPECS EDITOR ====== */}
          <div className="border-t border-border/50 pt-4">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
              Specifications
            </label>

            {/* Existing specs list */}
            {specs.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {specs.map(([key, value], index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      value={key}
                      onChange={e => handleUpdateSpec(index, 'key', e.target.value)}
                      className="flex-1 px-2.5 py-1.5 border rounded-lg bg-[hsl(var(--background))] text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                      placeholder="Key"
                    />
                    <input
                      value={value}
                      onChange={e => handleUpdateSpec(index, 'value', e.target.value)}
                      className="flex-1 px-2.5 py-1.5 border rounded-lg bg-[hsl(var(--background))] text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                      placeholder="Value"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveSpec(index)}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      aria-label="Remove spec"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new spec row */}
            <div className="flex items-center gap-2">
              <input
                value={newSpecKey}
                onChange={e => setNewSpecKey(e.target.value)}
                className="flex-1 px-2.5 py-1.5 border rounded-lg bg-[hsl(var(--background))] text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                placeholder="New key (e.g. Voltage)"
                onKeyDown={e => e.key === 'Enter' && handleAddSpec()}
              />
              <input
                value={newSpecValue}
                onChange={e => setNewSpecValue(e.target.value)}
                className="flex-1 px-2.5 py-1.5 border rounded-lg bg-[hsl(var(--background))] text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                placeholder="Value (e.g. 18V)"
                onKeyDown={e => e.key === 'Enter' && handleAddSpec()}
              />
              <button
                type="button"
                onClick={handleAddSpec}
                disabled={!newSpecKey.trim()}
                className="p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-30 shrink-0"
                aria-label="Add spec"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">Type key and value, then press Enter or + to add</p>
          </div>

          {/* ====== AI RE-ENRICHMENT ====== */}
          <div className="border-t border-border/50 pt-4">
            {!showEnrichSection ? (
              <button
                onClick={() => setShowEnrichSection(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-500/10 to-blue-500/10 border border-violet-500/20 rounded-xl text-sm font-medium text-violet-600 dark:text-violet-400 hover:from-violet-500/20 hover:to-blue-500/20 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                AI Re-evaluate from URL or Description
              </button>
            ) : (
              <div className="bg-gradient-to-br from-violet-500/5 to-blue-500/5 border border-violet-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400">
                  <Sparkles className="w-4 h-4" />
                  AI Re-evaluation
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste a product URL or type additional details. AI will update name, description, specs, price, and tags.
                </p>
                <textarea
                  value={enrichSource}
                  onChange={e => setEnrichSource(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-violet-500/20 rounded-lg bg-[hsl(var(--background))] text-sm resize-none focus:ring-2 focus:ring-violet-500/20 outline-none"
                  placeholder={"https://www.homedepot.com/p/dewalt-...\nor\nDeWalt DCD771C2 20V MAX Cordless Drill, 1/2 inch chuck, 300 unit watts out..."}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleEnrich}
                    disabled={enriching || !enrichSource.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-xs font-medium disabled:opacity-50 hover:bg-violet-700 transition-colors"
                  >
                    {enriching ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing...</>
                    ) : (
                      <><Sparkles className="w-3.5 h-3.5" /> Update with AI</>
                    )}
                  </button>
                  <button
                    onClick={() => { setShowEnrichSection(false); setEnrichSource(''); }}
                    className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Toggles */}
          <div className="space-y-3 border-t border-border/50 pt-4">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-10 h-6 rounded-full relative transition-colors ${isFavorite ? 'bg-amber-500' : 'bg-muted'}`}
                   onClick={() => setIsFavorite(!isFavorite)}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${isFavorite ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
              <div className="flex items-center gap-1.5">
                <Star className={`w-4 h-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                <span className="text-sm font-medium">Favorite</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-10 h-6 rounded-full relative transition-colors ${isConsumable ? 'bg-violet-500' : 'bg-muted'}`}
                   onClick={() => setIsConsumable(!isConsumable)}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${isConsumable ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
              <div className="flex items-center gap-1.5">
                <AlertCircle className={`w-4 h-4 ${isConsumable ? 'text-violet-500' : 'text-muted-foreground'}`} />
                <span className="text-sm font-medium">Consumable (track stock)</span>
              </div>
            </label>

            {isConsumable && (
              <div className="ml-[52px]">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Low Stock Alert At</label>
                <input type="number" min={0} value={lowStockThreshold} onChange={e => setLowStockThreshold(parseInt(e.target.value) || 0)} className="w-24 px-3 py-2 border rounded-lg bg-[hsl(var(--background))] text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none" placeholder="5" />
              </div>
            )}
          </div>

          {/* Container / Location */}
          <ContainerSelector value={containerId} onChange={setContainerId} />
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border/70 bg-[hsl(var(--muted)/0.2)] flex items-center gap-2 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-muted-foreground hover:bg-secondary rounded-lg transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || uploadingImage || enriching || !name.trim()}
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
        </div>
      </div>
      
      {croppingImage && (
        <ImageCropper
          imageSrc={croppingImage}
          onCancel={handleCancelCrop}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  );
};
