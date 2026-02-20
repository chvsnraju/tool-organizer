import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ShoppingCart, Plus, Check, Trash2, Loader2, DollarSign, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import { getListBatchSize } from '../lib/listPerformance';

interface ShoppingItem {
  id: string;
  tool_name: string;
  estimated_price: string | null;
  notes: string | null;
  purchased: boolean;
  created_at: string;
}

const SHOPPING_BATCH_SIZE = getListBatchSize('shopping');

export const ShoppingListPage: React.FC = () => {
  const { addToast } = useToast();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [visibleUnpurchasedCount, setVisibleUnpurchasedCount] = useState(SHOPPING_BATCH_SIZE);
  const [visiblePurchasedCount, setVisiblePurchasedCount] = useState(SHOPPING_BATCH_SIZE);
  const loadMoreUnpurchasedRef = useRef<HTMLDivElement | null>(null);
  const loadMorePurchasedRef = useRef<HTMLDivElement | null>(null);

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('shopping_list')
        .select('*')
        .order('purchased', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch {
      addToast('Error loading shopping list', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async () => {
    if (!newName.trim() || adding) return;
    setAdding(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('shopping_list').insert({
        tool_name: newName.trim(),
        estimated_price: newPrice.trim() || null,
        notes: newNotes.trim() || null,
        user_id: user.id,
      });

      if (error) throw error;

      addToast('Item added to shopping list', 'success');
      setNewName('');
      setNewPrice('');
      setNewNotes('');
      setShowAddForm(false);
      fetchItems();
    } catch (e) {
      addToast('Error adding item: ' + (e as Error).message, 'error');
    } finally {
      setAdding(false);
    }
  };

  const togglePurchased = async (item: ShoppingItem) => {
    try {
      const { error } = await supabase
        .from('shopping_list')
        .update({ purchased: !item.purchased })
        .eq('id', item.id);

      if (error) throw error;

      setItems(prev =>
        prev.map(i => i.id === item.id ? { ...i, purchased: !i.purchased } : i)
      );
    } catch {
      addToast('Error updating item', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await supabase.from('shopping_list').delete().eq('id', id);
      if (error) throw error;
      setItems(prev => prev.filter(i => i.id !== id));
      addToast('Item removed', 'success');
    } catch {
      addToast('Error deleting item', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const clearPurchased = async () => {
    const purchasedIds = items.filter(i => i.purchased).map(i => i.id);
    if (purchasedIds.length === 0) return;

    try {
      const { error } = await supabase
        .from('shopping_list')
        .delete()
        .in('id', purchasedIds);

      if (error) throw error;
      setItems(prev => prev.filter(i => !i.purchased));
      addToast(`Cleared ${purchasedIds.length} purchased items`, 'success');
    } catch {
      addToast('Error clearing items', 'error');
    }
  };

  const unpurchasedItems = useMemo(() => items.filter(i => !i.purchased), [items]);
  const purchasedItems = useMemo(() => items.filter(i => i.purchased), [items]);

  useEffect(() => {
    setVisibleUnpurchasedCount(SHOPPING_BATCH_SIZE);
    setVisiblePurchasedCount(SHOPPING_BATCH_SIZE);
  }, [items.length]);

  useEffect(() => {
    const target = loadMoreUnpurchasedRef.current;
    if (!target || visibleUnpurchasedCount >= unpurchasedItems.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          setVisibleUnpurchasedCount((current) => Math.min(current + SHOPPING_BATCH_SIZE, unpurchasedItems.length));
        }
      },
      { root: null, rootMargin: '400px 0px', threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [unpurchasedItems.length, visibleUnpurchasedCount]);

  useEffect(() => {
    const target = loadMorePurchasedRef.current;
    if (!target || visiblePurchasedCount >= purchasedItems.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          setVisiblePurchasedCount((current) => Math.min(current + SHOPPING_BATCH_SIZE, purchasedItems.length));
        }
      },
      { root: null, rootMargin: '400px 0px', threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [purchasedItems.length, visiblePurchasedCount]);

  const visibleUnpurchasedItems = useMemo(
    () => unpurchasedItems.slice(0, visibleUnpurchasedCount),
    [unpurchasedItems, visibleUnpurchasedCount]
  );

  const visiblePurchasedItems = useMemo(
    () => purchasedItems.slice(0, visiblePurchasedCount),
    [purchasedItems, visiblePurchasedCount]
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading shopping list...</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-primary" /> Shopping List
          </h2>
          <p className="text-sm text-muted-foreground">
            {unpurchasedItems.length} item{unpurchasedItems.length !== 1 ? 's' : ''} to buy
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="p-2.5 bg-primary text-primary-foreground rounded-full shadow-lg shadow-primary/25 hover:shadow-xl hover:scale-105 active:scale-95 transition-all"
          aria-label="Add item"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Empty State */}
      {items.length === 0 && !showAddForm && (
        <div className="text-center py-20 space-y-4">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-secondary/50 flex items-center justify-center mb-2">
            <ShoppingCart className="w-10 h-10 text-muted-foreground/40" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">Shopping list is empty</p>
            <p className="text-sm text-muted-foreground max-w-[240px] mx-auto">
              Use AI Assistant to analyze a project and add tools you need to buy
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-4 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold shadow-lg shadow-primary/25 hover:shadow-xl active:scale-95 transition-all"
          >
            Add Item Manually
          </button>
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Add to Shopping List</h3>
            <button onClick={() => setShowAddForm(false)} className="p-1 hover:bg-muted rounded-lg transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Tool name *"
            className="w-full bg-muted/30 border border-border focus:border-primary rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              value={newPrice}
              onChange={e => setNewPrice(e.target.value)}
              placeholder="Est. price (e.g. $25)"
              className="bg-muted/30 border border-border focus:border-primary rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
            />
            <input
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
              placeholder="Notes"
              className="bg-muted/30 border border-border focus:border-primary rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="w-full py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold shadow-lg shadow-primary/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add to List
          </button>
        </div>
      )}

      {/* Unpurchased Items */}
      {unpurchasedItems.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">To Buy</h3>
          {visibleUnpurchasedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 bg-white dark:bg-card border border-border/40 rounded-2xl shadow-sm group hover:border-primary/20 transition-all"
              style={{ contentVisibility: 'auto', containIntrinsicSize: '84px' }}
            >
              <button
                onClick={() => togglePurchased(item)}
                className="w-6 h-6 rounded-full border-2 border-border hover:border-primary shrink-0 flex items-center justify-center transition-colors"
              >
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm leading-tight">{item.tool_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.estimated_price && (
                    <span className="text-[11px] text-primary font-medium flex items-center gap-0.5">
                      <DollarSign className="w-3 h-3" /> {item.estimated_price}
                    </span>
                  )}
                  {item.notes && (
                    <span className="text-[11px] text-muted-foreground line-clamp-1">{item.notes}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(item.id)}
                disabled={deleting === item.id}
                className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
              >
                {deleting === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}

          {unpurchasedItems.length > visibleUnpurchasedItems.length && (
            <div ref={loadMoreUnpurchasedRef} className="py-3 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}
        </div>
      )}

      {/* Purchased Items */}
      {purchasedItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Purchased ({purchasedItems.length})
            </h3>
            <button
              onClick={clearPurchased}
              className="text-[11px] text-destructive hover:text-destructive/80 font-medium transition-colors"
            >
              Clear All
            </button>
          </div>
          {visiblePurchasedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 bg-muted/30 border border-border/20 rounded-2xl group"
              style={{ contentVisibility: 'auto', containIntrinsicSize: '80px' }}
            >
              <button
                onClick={() => togglePurchased(item)}
                className="w-6 h-6 rounded-full bg-primary/20 text-primary shrink-0 flex items-center justify-center transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm leading-tight line-through text-muted-foreground">{item.tool_name}</p>
                {item.estimated_price && (
                  <span className="text-[11px] text-muted-foreground/60">{item.estimated_price}</span>
                )}
              </div>
              <button
                onClick={() => handleDelete(item.id)}
                disabled={deleting === item.id}
                className="p-1.5 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
              >
                {deleting === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}

          {purchasedItems.length > visiblePurchasedItems.length && (
            <div ref={loadMorePurchasedRef} className="py-3 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
