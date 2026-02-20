import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Plus, X, ArrowLeftRight, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { triggerSmartReminderSync } from '../lib/notifications';
import { getListBatchSize } from '../lib/listPerformance';
import type { ToolLoan, Item } from '../types';

const LENDING_BATCH_SIZE = getListBatchSize('lending');

export const LendingPage: React.FC = () => {
  const [loans, setLoans] = useState<ToolLoan[]>([]);
  const [items, setItems] = useState<Pick<Item, 'id' | 'name' | 'image_url'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { addToast } = useToast();

  // Form state
  const [selectedItemId, setSelectedItemId] = useState('');
  const [borrowerName, setBorrowerName] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [visibleActiveCount, setVisibleActiveCount] = useState(LENDING_BATCH_SIZE);
  const [visibleReturnedCount, setVisibleReturnedCount] = useState(LENDING_BATCH_SIZE);
  const loadMoreActiveRef = useRef<HTMLDivElement | null>(null);
  const loadMoreReturnedRef = useRef<HTMLDivElement | null>(null);

  const fetchData = async () => {
    try {
      const [loansResult, itemsResult] = await Promise.all([
        supabase.from('tool_loans').select('*').order('created_at', { ascending: false }),
        supabase.from('items').select('id, name, image_url').order('name'),
      ]);
      if (loansResult.error) throw loansResult.error;
      if (itemsResult.error) throw itemsResult.error;

      // Attach item info to loans
      const itemMap = new Map((itemsResult.data || []).map(i => [i.id, i]));
      const enrichedLoans = (loansResult.data || []).map(loan => ({
        ...loan,
        item: itemMap.get(loan.item_id) || undefined,
      }));

      setLoans(enrichedLoans);
      setItems(itemsResult.data || []);
    } catch (err) {
      addToast('Error loading loans: ' + (err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLend = async () => {
    if (!selectedItemId || !borrowerName.trim()) {
      addToast('Please select a tool and enter borrower name.', 'info');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('tool_loans').insert({
        item_id: selectedItemId,
        borrower_name: borrowerName.trim(),
        borrowed_date: new Date().toISOString().split('T')[0],
        expected_return_date: expectedReturn || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      triggerSmartReminderSync();
      addToast('Tool marked as lent!', 'success');
      setShowForm(false);
      setSelectedItemId('');
      setBorrowerName('');
      setExpectedReturn('');
      setNotes('');
      fetchData();
    } catch (err) {
      addToast('Error: ' + (err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReturn = async (loanId: string) => {
    try {
      const { error } = await supabase
        .from('tool_loans')
        .update({ returned_date: new Date().toISOString().split('T')[0] })
        .eq('id', loanId);
      if (error) throw error;
      triggerSmartReminderSync();
      addToast('Tool marked as returned!', 'success');
      fetchData();
    } catch (err) {
      addToast('Error: ' + (err as Error).message, 'error');
    }
  };

  const activeLoans = useMemo(() => loans.filter(l => !l.returned_date), [loans]);
  const returnedLoans = useMemo(() => loans.filter(l => l.returned_date), [loans]);

  const isOverdue = (loan: ToolLoan) => {
    if (!loan.expected_return_date || loan.returned_date) return false;
    return new Date(loan.expected_return_date) < new Date();
  };

  useEffect(() => {
    setVisibleActiveCount(LENDING_BATCH_SIZE);
    setVisibleReturnedCount(LENDING_BATCH_SIZE);
  }, [loans.length]);

  useEffect(() => {
    const target = loadMoreActiveRef.current;
    if (!target || visibleActiveCount >= activeLoans.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          setVisibleActiveCount((current) => Math.min(current + LENDING_BATCH_SIZE, activeLoans.length));
        }
      },
      { root: null, rootMargin: '400px 0px', threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [activeLoans.length, visibleActiveCount]);

  useEffect(() => {
    const target = loadMoreReturnedRef.current;
    if (!target || visibleReturnedCount >= returnedLoans.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          setVisibleReturnedCount((current) => Math.min(current + LENDING_BATCH_SIZE, returnedLoans.length));
        }
      },
      { root: null, rootMargin: '400px 0px', threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [returnedLoans.length, visibleReturnedCount]);

  const visibleActiveLoans = useMemo(
    () => activeLoans.slice(0, visibleActiveCount),
    [activeLoans, visibleActiveCount]
  );

  const visibleReturnedLoans = useMemo(
    () => returnedLoans.slice(0, visibleReturnedCount),
    [returnedLoans, visibleReturnedCount]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Tool Lending</h2>
          <p className="text-sm text-muted-foreground">Track tools lent to others</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="p-2.5 bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all"
        >
          {showForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
        </button>
      </div>

      {/* Lend Form */}
      {showForm && (
        <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-4 animate-in fade-in slide-in-from-top-2 shadow-sm">
          <h3 className="font-semibold text-sm">Lend a Tool</h3>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tool</label>
            <select
              value={selectedItemId}
              onChange={e => setSelectedItemId(e.target.value)}
              className="w-full bg-muted/30 border border-border p-2.5 rounded-xl text-sm outline-none"
            >
              <option value="">Select a tool...</option>
              {items.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Borrower Name</label>
            <input
              value={borrowerName}
              onChange={e => setBorrowerName(e.target.value)}
              placeholder="Who are you lending to?"
              className="w-full bg-muted/30 border border-border p-2.5 rounded-xl text-sm outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Expected Return Date</label>
            <input
              type="date"
              value={expectedReturn}
              onChange={e => setExpectedReturn(e.target.value)}
              className="w-full bg-muted/30 border border-border p-2.5 rounded-xl text-sm outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes..."
              className="w-full bg-muted/30 border border-border p-2.5 rounded-xl text-sm outline-none min-h-[60px] resize-none"
            />
          </div>

          <button
            onClick={handleLend}
            disabled={saving || !selectedItemId || !borrowerName.trim()}
            className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold shadow-lg shadow-primary/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
            Mark as Lent
          </button>
        </div>
      )}

      {/* Active Loans */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-500" /> Currently Lent ({activeLoans.length})
        </h3>
        {activeLoans.length === 0 ? (
          <div className="text-center py-8 bg-card border border-border/40 rounded-2xl">
            <p className="text-sm text-muted-foreground">No tools currently lent out</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleActiveLoans.map(loan => (
              <div
                key={loan.id}
                className={`bg-card border rounded-2xl p-4 shadow-sm ${
                  isOverdue(loan) ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20' : 'border-border/40'
                }`}
                style={{ contentVisibility: 'auto', containIntrinsicSize: '120px' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {loan.item?.image_url && (
                      <img src={loan.item.image_url} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{loan.item?.name || 'Unknown Tool'}</p>
                      <p className="text-xs text-muted-foreground">
                        Lent to <span className="font-medium text-foreground">{loan.borrower_name}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(loan.borrowed_date).toLocaleDateString()}
                        {loan.expected_return_date && (
                          <> · Due {new Date(loan.expected_return_date).toLocaleDateString()}</>
                        )}
                      </p>
                      {isOverdue(loan) && (
                        <p className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="w-3 h-3" /> Overdue!
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleReturn(loan.id)}
                    className="shrink-0 px-3 py-1.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                  >
                    Returned
                  </button>
                </div>
                {loan.notes && (
                  <p className="text-xs text-muted-foreground mt-2 italic">"{loan.notes}"</p>
                )}
              </div>
            ))}

            {activeLoans.length > visibleActiveLoans.length && (
              <div ref={loadMoreActiveRef} className="py-3 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* History */}
      {returnedLoans.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Returned ({returnedLoans.length})
          </h3>
          <div className="space-y-2">
            {visibleReturnedLoans.map(loan => (
              <div key={loan.id} className="bg-card border border-border/40 rounded-2xl p-4 opacity-70" style={{ contentVisibility: 'auto', containIntrinsicSize: '92px' }}>
                <div className="flex items-center gap-3">
                  {loan.item?.image_url && (
                    <img src={loan.item.image_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{loan.item?.name || 'Unknown Tool'}</p>
                    <p className="text-xs text-muted-foreground">
                      {loan.borrower_name} · Returned {new Date(loan.returned_date!).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {returnedLoans.length > visibleReturnedLoans.length && (
              <div ref={loadMoreReturnedRef} className="py-3 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
