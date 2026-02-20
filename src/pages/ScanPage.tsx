import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { CameraCapture } from '../components/CameraCapture';
import { analyzeImage, analyzeBulkImage, analyzeBarcode, analyzeBarcodeFromImage, findDuplicates, isHttpUrl, type ToolAnalysis } from '../lib/gemini';
import { uploadImage } from '../lib/storage';
import { Loader2, Plus, Sparkles, MapPin, X, Camera, ImagePlus, ChevronRight, Layers, AlertTriangle, Mic, MicOff, Check, ScanBarcode, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import { ContainerSelector } from '../components/ContainerSelector';
import { triggerSmartReminderSync } from '../lib/notifications';

type ScanMode = 'setup' | 'camera' | 'barcode-camera' | 'review' | 'bulk-review';

interface BulkItem extends ToolAnalysis {
  selected: boolean;
  saving: boolean;
  saved: boolean;
}

export const ScanPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const locationIdParam = searchParams.get('locationId');
  const [locationName, setLocationName] = useState<string>('');

  const [mode, setMode] = useState<ScanMode>('setup');
  const [image, setImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ToolAnalysis | null>(null);
  const [barcodeValue, setBarcodeValue] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [nativeBarcodeScanning, setNativeBarcodeScanning] = useState(false);
  const { addToast } = useToast();

  // Bulk scan
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);

  // Duplicate detection
  const [duplicateWarning, setDuplicateWarning] = useState<{ matchedItem: string; confidence: string } | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  // Voice input
  const [isListening, setIsListening] = useState(false);
  const [voiceField, setVoiceField] = useState<'notes' | null>(null);

  // Context state (for AI)
  const [userUrl, setUserUrl] = useState('');
  const [userNotes, setUserNotes] = useState('');
  const [showContextInput, setShowContextInput] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');

  // Controlled form state
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedCategory, setEditedCategory] = useState('');
  const [editedTags, setEditedTags] = useState('');
  const [editedSpecs, setEditedSpecs] = useState<{key: string, value: string}[]>([]);
  const [editedPrice, setEditedPrice] = useState('');
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);

  // File input ref for gallery picking
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (locationIdParam) {
      supabase.from('locations').select('name').eq('id', locationIdParam).single()
        .then(({ data }) => {
          if (data) setLocationName(data.name);
        });
    }
  }, [locationIdParam]);

  // Handle FAB reset click
  useEffect(() => {
    if (location.state && (location.state as {reset?: number}).reset) {
      setMode('setup');
      setImage(null);
      setResult(null);
      setError('');
      setBarcodeValue(null);
      setIsBulkMode(false);
      setBulkItems([]);
      setAnalyzing(false);
    }
  }, [location.state]);

  useEffect(() => {
    if (result) {
      setEditedName(result.name);
      setEditedDescription(result.description);
      setEditedCategory(result.category);
      setEditedTags(result.tags.join(', '));
      setEditedPrice(result.estimatedPrice || '');

      if (result.specs) {
        setEditedSpecs(Object.entries(result.specs).map(([key, value]) => ({ key, value: String(value) })));
      } else {
        setEditedSpecs([]);
      }

      // Check for duplicates
      checkForDuplicates(result.name, result.description);
    }
  }, [result]);

  const checkForDuplicates = async (name: string, description: string) => {
    setCheckingDuplicate(true);
    try {
      const { data: existingItems } = await supabase
        .from('items')
        .select('name, description, category');
      if (existingItems && existingItems.length > 0) {
        const dupResult = await findDuplicates(name, description, existingItems);
        if (dupResult.isDuplicate && dupResult.confidence !== 'low') {
          setDuplicateWarning({ matchedItem: dupResult.matchedItem || '', confidence: dupResult.confidence });
        }
      }
    } catch {
      // Non-critical, ignore
    } finally {
      setCheckingDuplicate(false);
    }
  };

  const handleCapture = async (imgSrc: string) => {
    setImage(imgSrc);
    setAnalyzing(true);
    setError('');
    setDuplicateWarning(null);

    const context = `
      User provided product URL: ${userUrl}
      User provided notes: ${userNotes}
    `.trim();

    if (isBulkMode) {
      setMode('bulk-review');
      try {
        const results = await analyzeBulkImage(imgSrc, context);
        setBulkItems(results.map(r => ({ ...r, selected: true, saving: false, saved: false })));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setAnalyzing(false);
      }
    } else {
      setMode('review');
      try {
        const data = await analyzeImage(imgSrc, context);
        setResult(data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setAnalyzing(false);
      }
    }
  };

  const handleBarcodeDetected = async (barcode: string, frameImage: string | null) => {
    // Intercept internal QR codes for quick navigation
    const appBaseUrl = window.location.origin;
    if (barcode.startsWith(appBaseUrl)) {
      const path = barcode.substring(appBaseUrl.length);
      navigate(path);
      return;
    }

    setBarcodeValue(barcode);
    setImage(frameImage);
    setAnalyzing(true);
    setError('');
    setDuplicateWarning(null);
    setMode('review');

    const context = `
      User provided product URL: ${userUrl}
      User provided notes: ${userNotes}
      Scanned barcode: ${barcode}
    `.trim();

    try {
      const data = await analyzeBarcode(barcode, context, frameImage || undefined);
      setResult(data);
      setUserNotes((prev) => {
        const marker = `Barcode: ${barcode}`;
        return prev.includes(marker) ? prev : (prev ? `${prev}\n${marker}` : marker);
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleManualBarcodeAnalyze = async () => {
    const barcode = manualBarcode.trim();
    if (!barcode) {
      addToast('Enter a barcode value first.', 'info');
      return;
    }

    await handleBarcodeDetected(barcode, null);
  };

  const startNativeBarcodeScan = async () => {
    if (!Capacitor.isNativePlatform()) {
      setMode('barcode-camera');
      return;
    }

    setNativeBarcodeScanning(true);
    try {
      const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');

      const support = await BarcodeScanner.isSupported();
      if (!support.supported) {
        throw new Error('Barcode scanner is not supported on this device.');
      }

      const permissions = await BarcodeScanner.requestPermissions();
      if (permissions.camera !== 'granted' && permissions.camera !== 'limited') {
        throw new Error('Camera permission is required for barcode scanning.');
      }

      if (Capacitor.getPlatform() === 'android') {
        try {
          const moduleStatus = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
          if (!moduleStatus.available) {
            await BarcodeScanner.installGoogleBarcodeScannerModule();
          }
        } catch {
          // Non-blocking; scanner can still work depending on device setup.
        }
      }

      const scanResult = await BarcodeScanner.scan({
        formats: [
          BarcodeFormat.Ean13,
          BarcodeFormat.Ean8,
          BarcodeFormat.UpcA,
          BarcodeFormat.UpcE,
          BarcodeFormat.Code128,
          BarcodeFormat.Code39,
          BarcodeFormat.Itf,
          BarcodeFormat.QrCode,
        ],
        autoZoom: true,
      });

      const first = scanResult.barcodes?.[0];
      const detectedBarcode = first?.rawValue || first?.displayValue;
      if (!detectedBarcode) {
        addToast('No barcode detected. Try photo barcode scan.', 'info');
        setMode('barcode-camera');
        return;
      }

      await handleBarcodeDetected(detectedBarcode, null);
    } catch (scanError) {
      addToast(`Native scanner unavailable: ${(scanError as Error).message}`, 'info');
      setMode('barcode-camera');
    } finally {
      setNativeBarcodeScanning(false);
    }
  };

  const handleBarcodeImageCapture = async (imgSrc: string) => {
    setImage(imgSrc);
    setAnalyzing(true);
    setError('');
    setDuplicateWarning(null);
    setMode('review');

    const context = `
      User provided product URL: ${userUrl}
      User provided notes: ${userNotes}
      Source: barcode photo capture
    `.trim();

    try {
      const data = await analyzeBarcodeFromImage(imgSrc, context);
      setBarcodeValue(data.barcode);
      setResult(data.analysis);
      setUserNotes((prev) => {
        const marker = `Barcode: ${data.barcode}`;
        return prev.includes(marker) ? prev : (prev ? `${prev}\n${marker}` : marker);
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGalleryPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(file);
      });
      handleCapture(base64);
    } catch {
      addToast('Failed to load image', 'error');
    }
  };

  const reset = () => {
    setImage(null);
    setResult(null);
    setBarcodeValue(null);
    setError('');
    setMode('setup');
    setEditedName('');
    setEditedDescription('');
    setEditedCategory('');
    setEditedTags('');
    setEditedSpecs([]);
    setEditedPrice('');
    setSelectedContainerId(null);
    setSaving(false);
    setUserUrl('');
    setUserNotes('');
    setShowContextInput(false);
    setManualBarcode('');
    setBulkItems([]);
    setDuplicateWarning(null);
  };

  const handleAddSpec = () => {
    setEditedSpecs([...editedSpecs, { key: '', value: '' }]);
  };

  const handleSpecChange = (index: number, field: 'key' | 'value', text: string) => {
    const newSpecs = [...editedSpecs];
    newSpecs[index] = { ...newSpecs[index], [field]: text };
    setEditedSpecs(newSpecs);
  };

  const handleRemoveSpec = (index: number) => {
    setEditedSpecs(editedSpecs.filter((_, i) => i !== index));
  };

  // Voice input
  const startVoiceInput = (field: 'notes') => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      addToast('Voice input not supported in this browser', 'info');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Web Speech API lacks standard TS types
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionCtor() as {
      continuous: boolean; interimResults: boolean; lang: string;
      start(): void;
      onresult: ((event: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
    };
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (field === 'notes') {
        setUserNotes(prev => prev ? prev + ' ' + transcript : transcript);
      }
      setIsListening(false);
      setVoiceField(null);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setVoiceField(null);
      addToast('Voice recognition failed', 'error');
    };

    recognition.onend = () => {
      setIsListening(false);
      setVoiceField(null);
    };

    setIsListening(true);
    setVoiceField(field);
    recognition.start();
  };

  const handleSave = async () => {
    if (saving) return;
    if (!editedName.trim()) {
      addToast('Please provide a tool name before saving.', 'info');
      return;
    }
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be logged in to save items.');

      const imageUrl = image ? await uploadImage(image, 'items', user.id) : null;
      const resolvedImageUrl = imageUrl || result?.imageUrl || null;
      const tags = editedTags.split(',').map(t => t.trim()).filter(t => t.length > 0);

      const specsObj = editedSpecs.reduce((acc, curr) => {
        if (curr.key.trim()) {
          acc[curr.key.trim()] = curr.value;
        }
        return acc;
      }, {} as Record<string, string>);
      if (barcodeValue && !specsObj.Barcode) {
        specsObj.Barcode = barcodeValue;
      }

      // Build manual/video URLs from search queries
      const manualUrl = result?.manualUrl || (result?.manualSearchQuery
        ? `https://www.google.com/search?q=${encodeURIComponent(result.manualSearchQuery)}` : null);
      const videoUrl = result?.videoUrl || (result?.videoSearchQuery
        ? `https://www.youtube.com/results?search_query=${encodeURIComponent(result.videoSearchQuery)}` : null);
      const productUrlToSave = userUrl || result?.productUrl || null;

      const { data: newItem, error } = await supabase.from('items').insert({
        name: editedName,
        description: editedDescription,
        category: editedCategory || null,
        tags,
        image_url: resolvedImageUrl,
        images: resolvedImageUrl ? [resolvedImageUrl] : [],
        container_id: selectedContainerId,
        location_id: locationIdParam || null,
        user_id: user.id,
        product_url: productUrlToSave,
        user_description: userNotes || null,
        specs: specsObj,
        estimated_price: editedPrice || null,
        manual_url: manualUrl,
        video_url: videoUrl,
      }).select('id').single();

      if (error) throw error;

      if (result?.requiresMaintenance && result?.maintenanceTask && newItem) {
        const interval = result.maintenanceIntervalDays || 180;
        const nextDue = new Date();
        nextDue.setDate(nextDue.getDate() + interval);

        await supabase.from('maintenance_reminders').insert({
          item_id: newItem.id,
          task_description: result.maintenanceTask,
          interval_days: interval,
          last_performed: new Date().toISOString().split('T')[0],
          next_due: nextDue.toISOString().split('T')[0],
          is_recurring: true,
          user_id: user.id
        });
      }

      triggerSmartReminderSync();

      addToast(locationName ? `Item saved to ${locationName}!` : 'Item saved to inventory!', 'success');
      reset();
    } catch (e) {
      addToast('Error saving: ' + (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSaveAll = async () => {
    if (!image) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      addToast('You must be logged in.', 'error');
      return;
    }

    const imageUrl = await uploadImage(image, 'items', user.id);

    // Identify items to save and mark them all as saving
    const toSaveIndices = bulkItems
      .map((item, idx) => (item.selected && !item.saved ? idx : -1))
      .filter(idx => idx !== -1);

    setBulkItems(prev => prev.map((it, idx) =>
      toSaveIndices.includes(idx) ? { ...it, saving: true } : it
    ));

    // Save all items in parallel
    const results = await Promise.allSettled(
      toSaveIndices.map(async (i) => {
        const item = bulkItems[i];
        const manualUrl = item.manualSearchQuery
          ? `https://www.google.com/search?q=${encodeURIComponent(item.manualSearchQuery)}` : null;
        const videoUrl = item.videoSearchQuery
          ? `https://www.youtube.com/results?search_query=${encodeURIComponent(item.videoSearchQuery)}` : null;

        const { data: newItem, error } = await supabase.from('items').insert({
          name: item.name,
          description: item.description,
          category: item.category || null,
          tags: item.tags || [],
          image_url: imageUrl,
          images: [imageUrl],
          container_id: selectedContainerId,
          location_id: locationIdParam || null,
          user_id: user.id,
          specs: item.specs || {},
          estimated_price: item.estimatedPrice || null,
          manual_url: manualUrl,
          video_url: videoUrl,
        }).select('id').single();

        if (error) throw error;

        if (item.requiresMaintenance && item.maintenanceTask && newItem) {
          const interval = item.maintenanceIntervalDays || 180;
          const nextDue = new Date();
          nextDue.setDate(nextDue.getDate() + interval);

          await supabase.from('maintenance_reminders').insert({
            item_id: newItem.id,
            task_description: item.maintenanceTask,
            interval_days: interval,
            last_performed: new Date().toISOString().split('T')[0],
            next_due: nextDue.toISOString().split('T')[0],
            is_recurring: true,
            user_id: user.id
          });
        }

        return i;
      })
    );

    // Update UI state based on results
    let savedCount = 0;
    setBulkItems(prev => {
      const next = [...prev];
      results.forEach((result, resultIdx) => {
        const itemIdx = toSaveIndices[resultIdx];
        if (result.status === 'fulfilled') {
          next[itemIdx] = { ...next[itemIdx], saving: false, saved: true };
          savedCount++;
        } else {
          next[itemIdx] = { ...next[itemIdx], saving: false };
          addToast(`Failed to save ${next[itemIdx].name}: ${result.reason?.message || 'Unknown error'}`, 'error');
        }
      });
      return next;
    });

    if (savedCount > 0) {
      triggerSmartReminderSync();
      addToast(`${savedCount} tool(s) saved to inventory!`, 'success');
    }
  };

  // ─── SETUP SCREEN (pre-camera) ────────────────────────────────
  if (mode === 'setup') {
    return (
      <div className="flex flex-col min-h-[calc(100vh-56px-88px)] bg-gradient-to-b from-background via-background to-muted/30">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          {/* Icon */}
          <div className="relative mb-6">
            <div className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center">
              <Camera className="w-11 h-11 text-primary" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-violet-500" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-center mb-2">Scan a Tool</h2>
          <p className="text-sm text-muted-foreground text-center max-w-[260px] mb-6">
            Take a photo and AI will identify it, add specs, and organize it for you.
          </p>

          {/* Bulk Mode Toggle */}
          <button
            onClick={() => setIsBulkMode(!isBulkMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all mb-6 ${
              isBulkMode
                ? 'bg-violet-500/10 border border-violet-500/30 text-violet-600 dark:text-violet-400'
                : 'bg-muted/50 border border-border/60 text-muted-foreground hover:border-violet-500/40'
            }`}
          >
            <Layers className="w-4 h-4" />
            {isBulkMode ? 'Bulk Scan ON — Identifies multiple tools' : 'Bulk Scan — Identify multiple tools at once'}
          </button>

          {/* Location indicator */}
          {locationName ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border border-primary/20 rounded-xl mb-6">
              <MapPin className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Saving to {locationName}</span>
              <button onClick={() => setLocationName('')} className="p-0.5 hover:bg-primary/10 rounded-full ml-1">
                <X className="w-3.5 h-3.5 text-primary/60" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate('/locations')}
              className="flex items-center gap-2 px-4 py-2 bg-muted/50 border border-border/60 rounded-xl mb-6 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
            >
              <MapPin className="w-4 h-4" />
              Select a location (optional)
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </button>
          )}

          {/* Main actions */}
          <div className="w-full max-w-xs space-y-3">
            <button
              onClick={() => setMode('camera')}
              className="w-full py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-semibold shadow-lg shadow-primary/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 text-base"
            >
              <Camera className="w-5 h-5" /> {isBulkMode ? 'Open Camera (Bulk)' : 'Open Camera'}
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3.5 bg-card hover:bg-muted/50 border border-border/60 text-foreground rounded-2xl font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 text-sm"
            >
              <ImagePlus className="w-4.5 h-4.5" /> Choose from Gallery
            </button>

            <button
              onClick={startNativeBarcodeScan}
              disabled={nativeBarcodeScanning}
              className="w-full py-3.5 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/30 text-violet-700 dark:text-violet-300 rounded-2xl font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 text-sm disabled:opacity-60"
            >
              {nativeBarcodeScanning ? (
                <>
                  <Loader2 className="w-4.5 h-4.5 animate-spin" /> Opening Scanner...
                </>
              ) : (
                <>
                  <ScanBarcode className="w-4.5 h-4.5" /> Scan Barcode
                </>
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleGalleryPick} />
          </div>

          {/* Context toggle */}
          <div className="mt-8 w-full max-w-xs">
            <button
              onClick={() => setShowContextInput(!showContextInput)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              {showContextInput ? 'Hide context options' : 'Add context for better AI results'}
            </button>

            {showContextInput && (
              <div className="mt-3 bg-card border border-border/50 p-4 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2">
                <input
                  placeholder="Product URL (e.g. Amazon link)"
                  value={userUrl}
                  onChange={e => setUserUrl(e.target.value)}
                  className="w-full bg-muted/30 border border-border focus:border-primary rounded-xl px-3 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/50"
                />
                <div className="relative">
                  <textarea
                    placeholder="Notes for AI (e.g. 'It's the 18V cordless version')"
                    value={userNotes}
                    onChange={e => setUserNotes(e.target.value)}
                    className="w-full bg-muted/30 border border-border focus:border-primary rounded-xl px-3 py-2.5 pr-10 text-sm outline-none transition-all placeholder:text-muted-foreground/50 min-h-[70px] resize-none"
                  />
                  <button
                    type="button"
                    onClick={() => startVoiceInput('notes')}
                    className={`absolute right-2 bottom-2 p-1.5 rounded-lg transition-colors ${
                      isListening && voiceField === 'notes'
                        ? 'bg-red-500/20 text-red-500 animate-pulse'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                    title="Voice input"
                  >
                    {isListening && voiceField === 'notes' ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── CAMERA MODE (fullscreen) ─────────────────────────────────
  if (mode === 'camera') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/70 to-transparent pt-safe">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setMode('setup')}
              className="px-4 py-2 bg-white/15 backdrop-blur-md rounded-full text-white text-sm font-medium border border-white/10"
            >
              Cancel
            </button>

            <div className="flex items-center gap-2">
              {isBulkMode && (
                <div className="bg-violet-500/30 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium text-white flex items-center gap-1.5 border border-violet-400/20">
                  <Layers className="w-3 h-3" /> Bulk
                </div>
              )}
              {locationName && (
                <div className="bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium text-white flex items-center gap-1.5 border border-white/10">
                  <MapPin className="w-3 h-3" /> {locationName}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Camera */}
        <div className="flex-1 relative">
          <CameraCapture onCapture={handleCapture} autoStart />
        </div>
      </div>
    );
  }

  if (mode === 'barcode-camera') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/70 to-transparent pt-safe">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setMode('setup')}
              className="px-4 py-2 bg-white/15 backdrop-blur-md rounded-full text-white text-sm font-medium border border-white/10"
            >
              Cancel
            </button>

            <div className="bg-violet-500/30 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium text-white flex items-center gap-1.5 border border-violet-400/20">
              <ScanBarcode className="w-3 h-3" /> Barcode Photo Scan
            </div>
          </div>
        </div>

        <div className="flex-1 relative">
          <CameraCapture onCapture={handleBarcodeImageCapture} autoStart />

          <div className="absolute bottom-6 left-4 right-4 z-30 pb-safe">
            <div className="bg-black/55 backdrop-blur-md border border-white/15 rounded-2xl p-3 space-y-2">
              <p className="text-[11px] text-white/70">Or enter barcode manually:</p>
              <div className="flex gap-2">
                <input
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  placeholder="Enter barcode"
                  className="flex-1 px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm placeholder:text-white/45 outline-none"
                />
                <button
                  onClick={handleManualBarcodeAnalyze}
                  className="px-3 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-500/90 transition-colors"
                >
                  Analyze
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── BULK REVIEW MODE ─────────────────────────────────────────
  if (mode === 'bulk-review') {
    return (
      <div className="p-4 min-h-screen">
        <div className="max-w-md mx-auto w-full space-y-5 pb-24 animate-in fade-in slide-in-from-bottom-4">
          <div className="relative rounded-2xl overflow-hidden shadow-xl border border-border/50 bg-black aspect-[3/4]">
            <img src={image!} alt="Captured" className="w-full h-full object-cover" />
            <button
              onClick={reset}
              className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 backdrop-blur text-white px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            >
              Retake
            </button>
            <div className="absolute top-3 left-3 bg-violet-500/60 backdrop-blur-md px-2.5 py-1 rounded-full text-white text-[11px] font-medium flex items-center gap-1.5">
              <Layers className="w-3 h-3" /> Bulk Scan
            </div>
          </div>

          {analyzing ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                <Loader2 className="w-10 h-10 animate-spin text-primary relative z-10" />
              </div>
              <p className="font-semibold text-lg">Analyzing...</p>
              <p className="text-sm text-muted-foreground">Identifying all tools in the image</p>
            </div>
          ) : error ? (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-center space-y-3">
              <p className="text-sm text-destructive font-medium">{error}</p>
              <button
                onClick={reset}
                className="px-4 py-2 bg-card border border-border rounded-xl text-sm font-medium hover:bg-muted transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : bulkItems.length > 0 && (
            <div className="space-y-4">
              <div className="bg-violet-500/5 border border-violet-500/20 p-4 rounded-xl flex items-start gap-3">
                <Layers className="w-5 h-5 text-violet-500 mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold text-violet-600 dark:text-violet-400">
                    Found {bulkItems.length} tool{bulkItems.length > 1 ? 's' : ''}
                  </h3>
                  <p className="text-xs text-muted-foreground">Select which ones to save to your inventory.</p>
                </div>
              </div>

              <ContainerSelector value={selectedContainerId} onChange={setSelectedContainerId} />

              {bulkItems.map((item, idx) => (
                <div
                  key={`${item.name}-${idx}`}
                  className={`bg-card border rounded-2xl p-4 shadow-sm transition-all ${
                    item.saved ? 'border-emerald-300 dark:border-emerald-800 opacity-70' :
                    item.selected ? 'border-primary/30' : 'border-border/40 opacity-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => setBulkItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it))}
                      disabled={item.saved}
                      className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                        item.saved ? 'bg-emerald-500 border-emerald-500 text-white' :
                        item.selected ? 'bg-primary border-primary text-primary-foreground' :
                        'border-border'
                      }`}
                    >
                      {(item.selected || item.saved) && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm">{item.name}</h4>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{item.description}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {item.category && (
                          <span className="text-[10px] font-medium px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                            {item.category}
                          </span>
                        )}
                        {item.estimatedPrice && (
                          <span className="text-[10px] font-medium text-muted-foreground">
                            ~{item.estimatedPrice}
                          </span>
                        )}
                        {item.saving && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                        {item.saved && (
                          <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Saved
                          </span>
                        )}
                        {item.requiresMaintenance && item.maintenanceTask && (
                          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-full ml-1">
                            <Wrench className="w-3 h-3" /> Auto-Schedule AI Maintenance
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={handleBulkSaveAll}
                disabled={bulkItems.every(i => i.saved || !i.selected)}
                className="w-full py-3.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold shadow-lg shadow-primary/25 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                <Plus className="w-5 h-5" /> Save Selected ({bulkItems.filter(i => i.selected && !i.saved).length})
              </button>

              <button
                onClick={reset}
                className="w-full py-2.5 bg-card border border-border/60 text-muted-foreground rounded-xl text-sm font-medium hover:bg-muted transition-colors"
              >
                Scan More
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── REVIEW MODE (after capture) ──────────────────────────────
  return (
    <div className="p-4 min-h-screen">
      <div className="max-w-md mx-auto w-full space-y-5 pb-24 animate-in fade-in slide-in-from-bottom-4">
        <div className="relative rounded-2xl overflow-hidden shadow-xl border border-border/50 bg-black aspect-[3/4]">
          {image ? (
            <img src={image} alt="Captured" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-500/10 to-primary/10">
              <div className="text-center space-y-2">
                <ScanBarcode className="w-10 h-10 text-violet-500/70 mx-auto" />
                <p className="text-xs text-muted-foreground">Barcode-only scan</p>
              </div>
            </div>
          )}
          <button
            onClick={reset}
            className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 backdrop-blur text-white px-3 py-1.5 rounded-full text-xs font-medium transition-all"
          >
            Retake
          </button>
          {locationName && (
            <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-full text-white text-[11px] font-medium flex items-center gap-1.5">
              <MapPin className="w-3 h-3" /> {locationName}
            </div>
          )}
          {barcodeValue && (
            <div className="absolute bottom-3 left-3 bg-violet-500/75 backdrop-blur-md px-2.5 py-1 rounded-full text-white text-[11px] font-medium flex items-center gap-1.5">
              <ScanBarcode className="w-3 h-3" /> {barcodeValue}
            </div>
          )}
        </div>

        {analyzing ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
              <Loader2 className="w-10 h-10 animate-spin text-primary relative z-10" />
            </div>
            <p className="font-semibold text-lg">Analyzing...</p>
            <p className="text-sm text-muted-foreground">Identifying tool features via Gemini AI</p>
            {(userUrl || userNotes) && <p className="text-xs text-primary/80 font-medium">Using your context...</p>}
          </div>
        ) : error ? (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-center space-y-3">
            <p className="text-sm text-destructive font-medium">{error}</p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-card border border-border rounded-xl text-sm font-medium hover:bg-muted transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : result && (
          <div className="space-y-4">
            {/* Duplicate Warning */}
            {duplicateWarning && (
              <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-start gap-3 animate-in fade-in">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold text-amber-600 dark:text-amber-400 text-sm">Possible Duplicate</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Similar to <span className="font-medium text-foreground">"{duplicateWarning.matchedItem}"</span> already in your inventory.
                    ({duplicateWarning.confidence} confidence)
                  </p>
                </div>
              </div>
            )}
            {checkingDuplicate && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Checking for duplicates...
              </div>
            )}

            <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold text-primary">AI Suggestions Ready</h3>
                <p className="text-xs text-muted-foreground">Review the details below before saving to your inventory.</p>
              </div>
            </div>

            <div className="space-y-4 bg-card border rounded-2xl p-5 shadow-sm">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tool Name</label>
                <input
                  value={editedName}
                  onChange={e => setEditedName(e.target.value)}
                  className="w-full bg-muted/30 border-b-2 border-transparent focus:border-primary p-2 outline-none font-medium text-lg transition-all focus:bg-muted/50 rounded-t-md"
                  placeholder="Drill, Hammer, etc."
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</label>
                <textarea
                  value={editedDescription}
                  onChange={e => setEditedDescription(e.target.value)}
                  className="w-full bg-muted/30 border border-transparent focus:border-primary/50 p-3 rounded-xl outline-none text-sm min-h-[80px] transition-all focus:bg-muted/50"
                />
              </div>

              {/* Specs Editor */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Specifications</label>
                  <button onClick={handleAddSpec} className="text-[10px] bg-secondary hover:bg-secondary/80 px-2 py-1 rounded text-secondary-foreground flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Spec
                  </button>
                </div>
                {editedSpecs.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic p-2 border border-dashed rounded-lg text-center">No specs detected. Add one?</p>
                ) : (
                  <div className="space-y-2">
                    {editedSpecs.map((spec, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          value={spec.key}
                          onChange={e => handleSpecChange(idx, 'key', e.target.value)}
                          placeholder="Label (e.g. Volts)"
                          className="w-1/3 bg-muted/30 p-2 rounded-lg text-xs font-medium"
                        />
                        <input
                          value={spec.value}
                          onChange={e => handleSpecChange(idx, 'value', e.target.value)}
                          placeholder="Value (e.g. 18V)"
                          className="flex-1 bg-muted/30 p-2 rounded-lg text-xs"
                        />
                        <button onClick={() => handleRemoveSpec(idx)} className="text-muted-foreground hover:text-destructive p-1">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Category</label>
                  <input
                    value={editedCategory}
                    onChange={e => setEditedCategory(e.target.value)}
                    className="w-full bg-muted/30 p-2 rounded-lg text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tags</label>
                  <input
                    value={editedTags}
                    onChange={e => setEditedTags(e.target.value)}
                    className="w-full bg-muted/30 p-2 rounded-lg text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Est. Price</label>
                  <input
                    value={editedPrice}
                    onChange={e => setEditedPrice(e.target.value)}
                    placeholder="$29-49"
                    className="w-full bg-muted/30 p-2 rounded-lg text-sm"
                  />
                </div>
              </div>

              {/* Context Fields */}
              <div className="space-y-3 pt-4 border-t border-border/50">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Source Info</h4>
                <input
                  placeholder="Product URL"
                  value={userUrl}
                  onChange={e => setUserUrl(e.target.value)}
                  className="w-full bg-muted/30 p-2 rounded-lg text-xs"
                />
                <div className="relative">
                  <textarea
                    placeholder="User Notes"
                    value={userNotes}
                    onChange={e => setUserNotes(e.target.value)}
                    className="w-full bg-muted/30 p-2 pr-10 rounded-lg text-xs min-h-[60px]"
                  />
                  <button
                    type="button"
                    onClick={() => startVoiceInput('notes')}
                    className={`absolute right-2 bottom-2 p-1 rounded transition-colors ${
                      isListening && voiceField === 'notes'
                        ? 'bg-red-500/20 text-red-500 animate-pulse'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title="Voice input"
                  >
                    {isListening && voiceField === 'notes' ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {(isHttpUrl(result.productUrl) || isHttpUrl(result.manualUrl) || isHttpUrl(result.videoUrl) || isHttpUrl(result.imageUrl)) && (
                  <div className="space-y-2 pt-2">
                    <h5 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Detected Links</h5>

                    {isHttpUrl(result.imageUrl) && (
                      <div className="rounded-xl border border-border/40 overflow-hidden bg-muted/20">
                        <img
                          src={result.imageUrl}
                          alt="Detected product"
                          className="w-full h-36 object-contain bg-white"
                          loading="lazy"
                        />
                      </div>
                    )}

                    <div className="space-y-1.5 text-xs">
                      {isHttpUrl(result.productUrl) && (
                        <a
                          href={result.productUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-primary"
                        >
                          Product Link
                        </a>
                      )}
                      {isHttpUrl(result.manualUrl) && (
                        <a
                          href={result.manualUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-primary"
                        >
                          Instruction Manual
                        </a>
                      )}
                      {isHttpUrl(result.videoUrl) && (
                        <a
                          href={result.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-primary"
                        >
                          Instruction / Review Video
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {result.requiresMaintenance && result.maintenanceTask && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3 mt-4">
                  <Wrench className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">AI Maintenance Suggestion</h4>
                    <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1">
                      {result.maintenanceTask}
                      {result.maintenanceIntervalDays && ` (Every ${result.maintenanceIntervalDays} days)`}
                    </p>
                    <p className="text-[10px] text-amber-600/60 dark:text-amber-400/60 mt-2 italic">A smart reminder will be scheduled automatically when you save.</p>
                  </div>
                </div>
              )}

              <ContainerSelector
                value={selectedContainerId}
                onChange={setSelectedContainerId}
              />

              <button
                onClick={handleSave}
                disabled={saving || !editedName.trim()}
                className="w-full py-3.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold shadow-lg shadow-primary/25 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {saving ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
                ) : (
                  <><Plus className="w-5 h-5" /> Save Item</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
