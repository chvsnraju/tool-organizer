import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Plus, X, Wrench, CheckCircle2, AlertCircle, Calendar, RotateCcw } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { triggerSmartReminderSync } from '../lib/notifications';
import { getListBatchSize } from '../lib/listPerformance';
import type { MaintenanceReminder, Item } from '../types';

const MAINTENANCE_BATCH_SIZE = getListBatchSize('maintenance');

export const MaintenancePage: React.FC = () => {
  const [reminders, setReminders] = useState<MaintenanceReminder[]>([]);
  const [items, setItems] = useState<Pick<Item, 'id' | 'name' | 'image_url'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { addToast } = useToast();

  // Form state
  const [selectedItemId, setSelectedItemId] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [intervalDays, setIntervalDays] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [visibleDueCount, setVisibleDueCount] = useState(MAINTENANCE_BATCH_SIZE);
  const [visibleUpcomingCount, setVisibleUpcomingCount] = useState(MAINTENANCE_BATCH_SIZE);
  const [visibleOtherCount, setVisibleOtherCount] = useState(MAINTENANCE_BATCH_SIZE);
  const loadMoreDueRef = useRef<HTMLDivElement | null>(null);
  const loadMoreUpcomingRef = useRef<HTMLDivElement | null>(null);
  const loadMoreOtherRef = useRef<HTMLDivElement | null>(null);

  const fetchData = async () => {
    try {
      const [remResult, itemsResult] = await Promise.all([
        supabase.from('maintenance_reminders').select('*').order('next_due', { ascending: true, nullsFirst: false }),
        supabase.from('items').select('id, name, image_url').order('name'),
      ]);
      if (remResult.error) throw remResult.error;
      if (itemsResult.error) throw itemsResult.error;

      const itemMap = new Map((itemsResult.data || []).map(i => [i.id, i]));
      const enriched = (remResult.data || []).map(r => ({
        ...r,
        item: itemMap.get(r.item_id) || undefined,
      }));

      setReminders(enriched);
      setItems(itemsResult.data || []);
    } catch (err) {
      addToast('Error loading reminders: ' + (err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async () => {
    if (!selectedItemId || !taskDesc.trim()) {
      addToast('Please select a tool and describe the task.', 'info');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('maintenance_reminders').insert({
        item_id: selectedItemId,
        task_description: taskDesc.trim(),
        interval_days: intervalDays ? parseInt(intervalDays) : null,
        next_due: nextDue || null,
        is_recurring: isRecurring,
      });
      if (error) throw error;
      triggerSmartReminderSync();
      addToast('Maintenance reminder added!', 'success');
      setShowForm(false);
      setSelectedItemId('');
      setTaskDesc('');
      setIntervalDays('');
      setNextDue('');
      setIsRecurring(false);
      fetchData();
    } catch (err) {
      addToast('Error: ' + (err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkDone = async (reminder: MaintenanceReminder) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const updates: Record<string, unknown> = { last_performed: today };

      if (reminder.is_recurring && reminder.interval_days) {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + reminder.interval_days);
        updates.next_due = nextDate.toISOString().split('T')[0];
      } else {
        updates.next_due = null;
      }

      const { error } = await supabase
        .from('maintenance_reminders')
        .update(updates)
        .eq('id', reminder.id);
      if (error) throw error;
      triggerSmartReminderSync();
      addToast('Maintenance marked as done!', 'success');
      fetchData();
    } catch (err) {
      addToast('Error: ' + (err as Error).message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('maintenance_reminders').delete().eq('id', id);
      if (error) throw error;
      triggerSmartReminderSync();
      addToast('Reminder deleted.', 'success');
      fetchData();
    } catch (err) {
      addToast('Error: ' + (err as Error).message, 'error');
    }
  };

  const isDue = (r: MaintenanceReminder) => {
    if (!r.next_due) return false;
    return new Date(r.next_due) <= new Date();
  };

  const isUpcoming = (r: MaintenanceReminder) => {
    if (!r.next_due) return false;
    const due = new Date(r.next_due);
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    return due > new Date() && due <= weekFromNow;
  };

  const dueReminders = useMemo(() => reminders.filter(isDue), [reminders]);
  const upcomingReminders = useMemo(
    () => reminders.filter(r => isUpcoming(r) && !isDue(r)),
    [reminders]
  );
  const otherReminders = useMemo(
    () => reminders.filter(r => !isDue(r) && !isUpcoming(r)),
    [reminders]
  );

  useEffect(() => {
    setVisibleDueCount(MAINTENANCE_BATCH_SIZE);
    setVisibleUpcomingCount(MAINTENANCE_BATCH_SIZE);
    setVisibleOtherCount(MAINTENANCE_BATCH_SIZE);
  }, [reminders.length]);

  useEffect(() => {
    const target = loadMoreDueRef.current;
    if (!target || visibleDueCount >= dueReminders.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          setVisibleDueCount((current) => Math.min(current + MAINTENANCE_BATCH_SIZE, dueReminders.length));
        }
      },
      { root: null, rootMargin: '400px 0px', threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [dueReminders.length, visibleDueCount]);

  useEffect(() => {
    const target = loadMoreUpcomingRef.current;
    if (!target || visibleUpcomingCount >= upcomingReminders.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          setVisibleUpcomingCount((current) => Math.min(current + MAINTENANCE_BATCH_SIZE, upcomingReminders.length));
        }
      },
      { root: null, rootMargin: '400px 0px', threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [upcomingReminders.length, visibleUpcomingCount]);

  useEffect(() => {
    const target = loadMoreOtherRef.current;
    if (!target || visibleOtherCount >= otherReminders.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          setVisibleOtherCount((current) => Math.min(current + MAINTENANCE_BATCH_SIZE, otherReminders.length));
        }
      },
      { root: null, rootMargin: '400px 0px', threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [otherReminders.length, visibleOtherCount]);

  const visibleDueReminders = useMemo(
    () => dueReminders.slice(0, visibleDueCount),
    [dueReminders, visibleDueCount]
  );

  const visibleUpcomingReminders = useMemo(
    () => upcomingReminders.slice(0, visibleUpcomingCount),
    [upcomingReminders, visibleUpcomingCount]
  );

  const visibleOtherReminders = useMemo(
    () => otherReminders.slice(0, visibleOtherCount),
    [otherReminders, visibleOtherCount]
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
          <h2 className="text-2xl font-bold">Maintenance</h2>
          <p className="text-sm text-muted-foreground">Track tool maintenance schedules</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="p-2.5 bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all"
        >
          {showForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-4 animate-in fade-in slide-in-from-top-2 shadow-sm">
          <h3 className="font-semibold text-sm">Add Maintenance Reminder</h3>

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
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Task</label>
            <input
              value={taskDesc}
              onChange={e => setTaskDesc(e.target.value)}
              placeholder="e.g. Sharpen blade, Change oil..."
              className="w-full bg-muted/30 border border-border p-2.5 rounded-xl text-sm outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Next Due</label>
              <input
                type="date"
                value={nextDue}
                onChange={e => setNextDue(e.target.value)}
                className="w-full bg-muted/30 border border-border p-2.5 rounded-xl text-sm outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Repeat Every (days)</label>
              <input
                type="number"
                value={intervalDays}
                onChange={e => setIntervalDays(e.target.value)}
                placeholder="e.g. 90"
                className="w-full bg-muted/30 border border-border p-2.5 rounded-xl text-sm outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={e => setIsRecurring(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-muted-foreground">Recurring (auto-schedule next after completion)</span>
          </label>

          <button
            onClick={handleAdd}
            disabled={saving || !selectedItemId || !taskDesc.trim()}
            className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold shadow-lg shadow-primary/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            Add Reminder
          </button>
        </div>
      )}

      {/* Due Now */}
      {dueReminders.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-red-500 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Due Now ({dueReminders.length})
          </h3>
          {renderReminderList(visibleDueReminders, 'due')}
          {dueReminders.length > visibleDueReminders.length && (
            <div ref={loadMoreDueRef} className="py-3 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}
        </div>
      )}

      {/* Upcoming */}
      {upcomingReminders.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-amber-500 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Upcoming ({upcomingReminders.length})
          </h3>
          {renderReminderList(visibleUpcomingReminders, 'upcoming')}
          {upcomingReminders.length > visibleUpcomingReminders.length && (
            <div ref={loadMoreUpcomingRef} className="py-3 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}
        </div>
      )}

      {/* All / Scheduled */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Wrench className="w-4 h-4" /> All Reminders ({otherReminders.length})
        </h3>
        {otherReminders.length === 0 && dueReminders.length === 0 && upcomingReminders.length === 0 ? (
          <div className="text-center py-8 bg-card border border-border/40 rounded-2xl">
            <Wrench className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No maintenance reminders yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add one to keep your tools in top shape</p>
          </div>
        ) : (
          <>
            {renderReminderList(visibleOtherReminders, 'normal')}
            {otherReminders.length > visibleOtherReminders.length && (
              <div ref={loadMoreOtherRef} className="py-3 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  function renderReminderList(list: MaintenanceReminder[], type: 'due' | 'upcoming' | 'normal') {
    return (
      <div className="space-y-2">
        {list.map(r => (
          <div
            key={r.id}
            className={`bg-card border rounded-2xl p-4 shadow-sm ${
              type === 'due' ? 'border-red-300 dark:border-red-800' :
              type === 'upcoming' ? 'border-amber-300 dark:border-amber-800' :
              'border-border/40'
            }`}
            style={{ contentVisibility: 'auto', containIntrinsicSize: '120px' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {r.item?.image_url && (
                  <img src={r.item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{r.task_description}</p>
                  <p className="text-xs text-muted-foreground">{r.item?.name || 'Unknown Tool'}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {r.next_due && (
                      <span className={`text-[11px] font-medium ${type === 'due' ? 'text-red-500' : 'text-muted-foreground'}`}>
                        Due: {new Date(r.next_due).toLocaleDateString()}
                      </span>
                    )}
                    {r.is_recurring && (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                        <RotateCcw className="w-2.5 h-2.5" /> Every {r.interval_days}d
                      </span>
                    )}
                    {r.last_performed && (
                      <span className="text-[11px] text-muted-foreground">
                        Last: {new Date(r.last_performed).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => handleMarkDone(r)}
                  className="px-2.5 py-1.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                  title="Mark as done"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="px-2.5 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors"
                  title="Delete"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
};
