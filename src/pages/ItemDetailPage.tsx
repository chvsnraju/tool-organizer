import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  Loader2, ArrowLeft, MapPin, Edit3, Trash2, ChevronLeft, ChevronRight,
  Star, Wrench, ArrowLeftRight, ExternalLink, BookOpen, Play,
  Package, DollarSign, AlertCircle, Tag, Hash, X, FileText, Calendar, QrCode
} from 'lucide-react';
import { EditItemModal } from '../components/EditItemModal';
import { useToast } from '../hooks/useToast';
import { triggerSmartReminderSync } from '../lib/notifications';
import { PrintableQRCode } from '../components/PrintableQRCode';
import { type Item, type ItemCondition, type ToolLoan, CONDITION_LABELS, CONDITION_COLORS } from '../types';

export const ItemDetailPage: React.FC = () => {
  const { itemId: id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addToast } = useToast();

  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Modals controlled by URL params
  const showEditModal = searchParams.get('mode') === 'edit';
  const showFullImage = searchParams.get('view') === 'full';

  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Lending form
  // ... existing code ...

  // ... inside return ...


      {/* Content */}
  const [showLendForm, setShowLendForm] = useState(false);
  const [lendBorrower, setLendBorrower] = useState('');
  const [lendExpectedReturn, setLendExpectedReturn] = useState('');
  const [activeLoan, setActiveLoan] = useState<ToolLoan | null>(null);

  // Maintenance form
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [maintTask, setMaintTask] = useState('');
  const [maintNextDue, setMaintNextDue] = useState('');

  const fetchItem = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('items')
        .select(`
          *,
          container:containers(
            id, name,
            location:locations(id, name)
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setItem(data);

      // Fetch active loan
      const { data: loan } = await supabase
        .from('tool_loans')
        .select('*')
        .eq('item_id', id)
        .is('returned_date', null)
        .maybeSingle();
      setActiveLoan(loan);
    } catch (err) {
      addToast('Error loading item: ' + (err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleToggleFavorite = async () => {
    if (!item) return;
    try {
      const { error } = await supabase
        .from('items')
        .update({ is_favorite: !item.is_favorite })
        .eq('id', item.id);
      if (error) throw error;
      setItem({ ...item, is_favorite: !item.is_favorite });
      addToast(item.is_favorite ? 'Removed from favorites' : 'Added to favorites!', 'success');
    } catch {
      addToast('Failed to update favorite', 'error');
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('items').delete().eq('id', item.id);
      if (error) throw error;
      triggerSmartReminderSync();
      addToast('Item deleted', 'success');
      navigate('/');
    } catch (err) {
      addToast('Error deleting item: ' + (err as Error).message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleLend = async () => {
    if (!item || !lendBorrower.trim()) return;
    try {
      const { error } = await supabase.from('tool_loans').insert({
        item_id: item.id,
        borrower_name: lendBorrower.trim(),
        borrowed_date: new Date().toISOString().split('T')[0],
        expected_return_date: lendExpectedReturn || null,
      });
      if (error) throw error;
      triggerSmartReminderSync();
      addToast('Tool marked as lent!', 'success');
      setShowLendForm(false);
      setLendBorrower('');
      setLendExpectedReturn('');
      fetchItem();
    } catch (err) {
      addToast('Error: ' + (err as Error).message, 'error');
    }
  };

  const handleReturn = async () => {
    if (!activeLoan) return;
    try {
      const { error } = await supabase
        .from('tool_loans')
        .update({ returned_date: new Date().toISOString().split('T')[0] })
        .eq('id', activeLoan.id);
      if (error) throw error;
      triggerSmartReminderSync();
      addToast('Tool marked as returned!', 'success');
      setActiveLoan(null);
    } catch (err) {
      addToast('Error: ' + (err as Error).message, 'error');
    }
  };

  const handleAddMaintenance = async () => {
    if (!item || !maintTask.trim()) return;
    try {
      const { error } = await supabase.from('maintenance_reminders').insert({
        item_id: item.id,
        task_description: maintTask.trim(),
        next_due: maintNextDue || null,
        is_recurring: false,
      });
      if (error) throw error;
      triggerSmartReminderSync();
      addToast('Maintenance reminder added!', 'success');
      setShowMaintenanceForm(false);
      setMaintTask('');
      setMaintNextDue('');
    } catch (err) {
      addToast('Error: ' + (err as Error).message, 'error');
    }
  };

  const handleOpenFullImage = () => {
    setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.set('view', 'full');
        return newParams;
    });
  };

  const handleCloseFullImage = () => {
    navigate(-1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Item not found.</p>
        <button onClick={() => navigate('/')} className="mt-4 text-primary text-sm font-medium">
          Go back
        </button>
      </div>
    );
  }

  const allImages = item.images?.length ? item.images : (item.image_url ? [item.image_url] : []);
  const locationPath = item.container?.location
    ? `${item.container.location.name} › ${item.container.name}`
    : item.container?.name || null;

  const isLowStock = item.is_consumable && item.low_stock_threshold &&
    item.low_stock_threshold > 0 && (item.quantity || 1) <= item.low_stock_threshold;

  return (
    <div className="pb-24">
      {/* Image Gallery */}
      <div className="relative bg-black aspect-square cursor-zoom-in group" onClick={handleOpenFullImage}>
        {allImages.length > 0 ? (
          <>
            <img
              src={allImages[currentImageIndex]}
              alt={item.name}
              className="w-full h-full object-cover transition-opacity group-hover:opacity-90"
            />
            {/* Expand Hint */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="bg-black/50 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5">
                    <ExternalLink className="w-3 h-3" /> View Full
                </div>
            </div>
            {allImages.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(i => i > 0 ? i - 1 : allImages.length - 1); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(i => i < allImages.length - 1 ? i + 1 : 0); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {allImages.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(idx); }}
                      className={`w-2 h-2 rounded-full transition-all ${
                        idx === currentImageIndex ? 'bg-white scale-125' : 'bg-white/40'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full bg-secondary flex items-center justify-center">
            <Package className="w-16 h-16 text-muted-foreground/20" />
          </div>
        )}

        {/* Top bar overlays */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-4 flex items-center justify-between">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(-1); }}
            className="w-9 h-9 bg-black/40 backdrop-blur-md rounded-xl flex items-center justify-center text-white border border-white/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); handleToggleFavorite(); }}
              className="w-9 h-9 bg-black/40 backdrop-blur-md rounded-xl flex items-center justify-center text-white border border-white/10"
            >
              <Star className={`w-4.5 h-4.5 ${item.is_favorite ? 'fill-amber-400 text-amber-400' : 'text-white'}`} />
            </button>
            <button
              onClick={(e) => { 
                e.stopPropagation(); 
                setSearchParams(prev => {
                  const newParams = new URLSearchParams(prev);
                  newParams.set('mode', 'edit');
                  return newParams;
                });
              }}
              className="w-9 h-9 bg-black/40 backdrop-blur-md rounded-xl flex items-center justify-center text-white border border-white/10"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Active loan indicator */}
        {activeLoan && (
          <div className="absolute bottom-3 left-3 bg-amber-500/90 backdrop-blur-md text-white px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5">
            <ArrowLeftRight className="w-3.5 h-3.5" /> Lent to {activeLoan.borrower_name}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-5">
        {/* Title & metadata */}
        <div>
          <h1 className="text-2xl font-bold leading-tight">{item.name}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {item.category && (
              <span className="text-xs font-semibold px-2.5 py-1 bg-primary/10 text-primary rounded-full flex items-center gap-1">
                <Tag className="w-3 h-3" /> {item.category}
              </span>
            )}
            {item.condition && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${CONDITION_COLORS[item.condition as ItemCondition] || ''}`}>
                {CONDITION_LABELS[item.condition as ItemCondition] || item.condition}
              </span>
            )}
            {item.is_consumable && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                Consumable
              </span>
            )}
          </div>
        </div>

        {/* Low stock alert */}
        {isLowStock && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-orange-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-orange-600 dark:text-orange-400">Low Stock</p>
              <p className="text-xs text-muted-foreground">
                Only {item.quantity || 0} remaining (threshold: {item.low_stock_threshold})
              </p>
            </div>
          </div>
        )}

        {/* Quick info row */}
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {locationPath && (
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-card border border-border/40 rounded-xl">
              <MapPin className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-medium">{locationPath}</span>
            </div>
          )}
          {item.quantity != null && (
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-card border border-border/40 rounded-xl">
              <Hash className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Qty: {item.quantity}</span>
            </div>
          )}
          {item.estimated_price && (
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
              <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{item.estimated_price}</span>
            </div>
          )}
        </div>

        {/* Description */}
        {item.description && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Description</h3>
            <p className="text-sm text-foreground/80 leading-relaxed">{item.description}</p>
          </div>
        )}

        {/* Purchase Info */}
        {(item.purchase_date || item.purchase_price || item.receipt_image_url) && (
          <div className="bg-muted/30 border border-border/40 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Purchase & Insurance
            </h3>
            <div className="flex flex-wrap gap-4">
              {item.purchase_date && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{new Date(item.purchase_date).toLocaleDateString()}</span>
                </div>
              )}
              {item.purchase_price != null && (
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{item.purchase_price.toFixed(2)}</span>
                </div>
              )}
            </div>
            {item.receipt_image_url && (
              <a href={item.receipt_image_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2 bg-card border border-border/50 rounded-lg text-xs font-medium hover:border-primary/30 transition-colors">
                <FileText className="w-4 h-4" /> View Receipt
              </a>
            )}
          </div>
        )}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((tag, idx) => (
              <span key={idx} className="text-[11px] font-medium px-2.5 py-1 bg-secondary text-secondary-foreground rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Specs */}
        {item.specs && Object.keys(item.specs).length > 0 && (
          <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5" /> Specifications
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {Object.entries(item.specs).map(([key, value]) => (
                <div key={key} className="flex flex-col">
                  <span className="text-[10px] uppercase text-muted-foreground">{key}</span>
                  <span className="text-sm font-medium">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QR Code Section */}
        <div className="bg-muted/30 border border-border/40 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <QrCode className="w-3.5 h-3.5" /> Item Label 
          </h3>
          <p className="text-xs text-muted-foreground">Print this QR code and attach it to your tool for quick scanning later.</p>
          <div className="flex justify-center">
            <PrintableQRCode 
              url={`${window.location.origin}/item/${item.id}`} 
              title={item.name || 'Unknown Item'} 
              subtitle="Scan with ToolShed App" 
            />
          </div>
        </div>
      {/* Links: Manual & Video */}
        {(item.manual_url || item.video_url) && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Resources</h3>
            <div className="flex gap-2">
              {item.manual_url && (
                <a
                  href={item.manual_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-blue-500/5 border border-blue-500/20 rounded-xl text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors"
                >
                  <BookOpen className="w-4 h-4" /> Find Manuals
                  <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                </a>
              )}
              {item.video_url && (
                <a
                  href={item.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-red-500/5 border border-red-500/20 rounded-xl text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Play className="w-4 h-4" /> How-To Videos
                  <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Product URL */}
        {item.product_url && (
          <a
            href={item.product_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2.5 bg-card border border-border/40 rounded-xl text-sm text-muted-foreground hover:border-primary/30 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="truncate">{item.product_url}</span>
          </a>
        )}

        {/* User Notes */}
        {item.user_description && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">User Notes</h3>
            <p className="text-sm text-foreground/80 italic">"{item.user_description}"</p>
          </div>
        )}

        {/* Lending Section */}
        <div className="border-t border-border/40 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <ArrowLeftRight className="w-3.5 h-3.5" /> Lending
          </h3>
          {activeLoan ? (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <p className="text-sm">
                Currently lent to <span className="font-semibold">{activeLoan.borrower_name}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Since {new Date(activeLoan.borrowed_date).toLocaleDateString()}
                {activeLoan.expected_return_date && (
                  <> · Expected return: {new Date(activeLoan.expected_return_date).toLocaleDateString()}</>
                )}
              </p>
              <button
                onClick={handleReturn}
                className="px-4 py-2 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition-colors"
              >
                Mark as Returned
              </button>
            </div>
          ) : showLendForm ? (
            <div className="bg-card border border-border/40 rounded-xl p-4 space-y-3">
              <input
                placeholder="Borrower name"
                value={lendBorrower}
                onChange={e => setLendBorrower(e.target.value)}
                className="w-full bg-muted/30 border border-border p-2.5 rounded-xl text-sm outline-none"
              />
              <input
                type="date"
                placeholder="Expected return"
                value={lendExpectedReturn}
                onChange={e => setLendExpectedReturn(e.target.value)}
                className="w-full bg-muted/30 border border-border p-2.5 rounded-xl text-sm outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleLend}
                  disabled={!lendBorrower.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  Confirm Lend
                </button>
                <button
                  onClick={() => setShowLendForm(false)}
                  className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowLendForm(true)}
              className="px-4 py-2 bg-card border border-border/40 rounded-xl text-sm font-medium text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors flex items-center gap-2"
            >
              <ArrowLeftRight className="w-4 h-4" /> Lend this tool
            </button>
          )}
        </div>

        {/* Maintenance quick-add */}
        <div className="border-t border-border/40 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Wrench className="w-3.5 h-3.5" /> Maintenance
          </h3>
          {showMaintenanceForm ? (
            <div className="bg-card border border-border/40 rounded-xl p-4 space-y-3">
              <input
                placeholder="Task (e.g. Sharpen blade, Replace filter)"
                value={maintTask}
                onChange={e => setMaintTask(e.target.value)}
                className="w-full bg-muted/30 border border-border p-2.5 rounded-xl text-sm outline-none"
              />
              <input
                type="date"
                placeholder="Next due date"
                value={maintNextDue}
                onChange={e => setMaintNextDue(e.target.value)}
                className="w-full bg-muted/30 border border-border p-2.5 rounded-xl text-sm outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddMaintenance}
                  disabled={!maintTask.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  Add Reminder
                </button>
                <button
                  onClick={() => setShowMaintenanceForm(false)}
                  className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowMaintenanceForm(true)}
              className="px-4 py-2 bg-card border border-border/40 rounded-xl text-sm font-medium text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors flex items-center gap-2"
            >
              <Wrench className="w-4 h-4" /> Add maintenance reminder
            </button>
          )}
        </div>

        {/* Meta */}
        <div className="border-t border-border/40 pt-4 text-xs text-muted-foreground space-y-1">
          <p>Added {new Date(item.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p className="font-mono text-[10px] opacity-50">{item.id}</p>
        </div>

        {/* Delete */}
        <div className="border-t border-border/40 pt-4">
          {showDeleteConfirm ? (
            <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-destructive">Delete "{item.name}"?</p>
              <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 text-sm text-destructive/70 hover:text-destructive transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Delete Item
            </button>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <EditItemModal
          item={item}
          isOpen={showEditModal}
          onClose={() => navigate(-1)}
          onUpdate={(updatedItem) => {
            setItem(updatedItem);
            navigate(-1);
          }}
        />
      )}
      {/* Full Screen Image Modal */}
      {showFullImage && allImages.length > 0 && (
        <div 
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-4 pt-safe animate-in fade-in duration-200"
          onClick={handleCloseFullImage}
        >
          <button 
            className="absolute top-4 pt-safe right-5 p-2 bg-black/50 backdrop-blur text-white rounded-full hover:bg-white/20 transition-colors z-[110]"
            onClick={(e) => { e.stopPropagation(); handleCloseFullImage(); }}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={allImages[currentImageIndex]}
            alt={item.name}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}
    </div>
  );
};
