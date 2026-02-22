import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MapPin, Loader2, ImagePlus, ChevronRight, Pencil, Trash2, X, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadImage } from '../lib/storage';
import { useToast } from '../hooks/useToast';
import { getListBatchSize } from '../lib/listPerformance';
import { getCached, setCache, invalidateCache } from '../lib/queryCache';
import type { Location } from '../types';

interface LocationWithCounts extends Location {
  container_count: number;
  item_count: number;
}

const LOCATIONS_BATCH_SIZE = getListBatchSize('locations');

export const LocationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [locations, setLocations] = useState<LocationWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(LOCATIONS_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [locName, setLocName] = useState('');
  const [locDesc, setLocDesc] = useState('');
  const [locImage, setLocImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchLocations = async () => {
    const cached = getCached<LocationWithCounts[]>('locations:list');
    if (cached) {
      setLocations(cached);
      setLoading(false);
    }

    try {
      const { data, error } = await supabase
        .from('locations')
        .select('*, containers(count), items(count)')
        .order('name');

      if (error) throw error;

      const mapped: LocationWithCounts[] = (data || []).map((loc: Record<string, unknown>) => {
        const { containers, items, ...rest } = loc;
        const containerArr = containers as { count: number }[] | undefined;
        const itemArr = items as { count: number }[] | undefined;
        return {
          ...rest,
          container_count: containerArr?.[0]?.count ?? 0,
          item_count: itemArr?.[0]?.count ?? 0,
        } as LocationWithCounts;
      });
      setLocations(mapped);
      setCache('locations:list', mapped);
    } catch (e) {
      if (!cached) addToast('Error loading locations: ' + (e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setVisibleCount(LOCATIONS_BATCH_SIZE);
  }, [locations.length]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || visibleCount >= locations.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          setVisibleCount((current) => Math.min(current + LOCATIONS_BATCH_SIZE, locations.length));
        }
      },
      {
        root: null,
        rootMargin: '400px 0px',
        threshold: 0,
      }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [locations.length, visibleCount]);

  const visibleLocations = useMemo(
    () => locations.slice(0, visibleCount),
    [locations, visibleCount]
  );

  const resetForm = () => {
    setLocName('');
    setLocDesc('');
    setLocImage(null);
    setEditingId(null);
    setIsFormOpen(false);
  };

  const openCreateForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditForm = (e: React.MouseEvent, location: Location) => {
    e.stopPropagation();
    setLocName(location.name);
    setLocDesc(location.description || '');
    setLocImage(location.image_url || null);
    setEditingId(location.id);
    setIsFormOpen(true);
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(file);
      });
      setLocImage(base64);
    } catch {
      addToast('Failed to load image', 'error');
    }
  };

  const confirmDelete = (e: React.MouseEvent, location: Location) => {
    e.stopPropagation();
    setDeleteTarget(location);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    // Optimistic: remove immediately
    const targetId = deleteTarget.id;
    const previousLocations = locations;
    setLocations(prev => prev.filter(l => l.id !== targetId));
    setShowDeleteConfirm(false);
    setDeleteTarget(null);

    try {
      const { error } = await supabase.from('locations').delete().eq('id', targetId);
      if (error) throw error;

      invalidateCache('locations:');
      addToast('Location deleted', 'success');
    } catch {
      // Revert optimistic update on failure
      setLocations(previousLocations);
      setShowDeleteConfirm(true);
      setDeleteTarget(previousLocations.find(l => l.id === targetId) ?? null);
      addToast('Error deleting location', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async () => {
    if (!locName.trim()) return;
    setIsSubmitting(true);

    const previousLocations = locations;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let imageUrl = locImage;
      if (locImage && locImage.startsWith('data:')) {
        imageUrl = await uploadImage(locImage, 'items', user.id);
      }

      const payload = {
        name: locName,
        description: locDesc,
        image_url: imageUrl,
      };

      if (editingId) {
        // Optimistic: apply name/desc/image change immediately
        setLocations(prev =>
          prev.map(l =>
            l.id === editingId
              ? { ...l, name: locName, description: locDesc, image_url: imageUrl ?? l.image_url }
              : l
          )
        );
        resetForm();

        const { error } = await supabase
          .from('locations')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        addToast('Location updated', 'success');
      } else {
        resetForm();

        const { data: inserted, error } = await supabase
          .from('locations')
          .insert({ ...payload, user_id: user.id })
          .select('*')
          .single();
        if (error) throw error;
        // Append the real row returned by the server
        if (inserted) {
          setLocations(prev => [...prev, { ...(inserted as LocationWithCounts), container_count: 0, item_count: 0 }]);
        }
        addToast('Location created', 'success');
      }

      invalidateCache('locations:');
    } catch (e) {
      // Revert optimistic update on failure
      setLocations(previousLocations);
      addToast('Error saving location: ' + (e as Error).message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Loading Skeleton ---
  if (loading) {
    return (
      <div className="p-4 pb-24 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-40 bg-muted rounded-lg animate-pulse" />
            <div className="h-4 w-56 bg-muted/60 rounded-md animate-pulse" />
          </div>
          <div className="w-10 h-10 bg-muted rounded-full animate-pulse" />
        </div>
        <div className="grid gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 p-4 bg-white dark:bg-card border border-border/40 rounded-2xl">
              <div className="w-16 h-16 rounded-xl bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 bg-muted rounded-md animate-pulse" />
                <div className="h-4 w-48 bg-muted/60 rounded-md animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="w-6 h-6 text-primary" /> Locations
            </h2>
            {locations.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold bg-primary/10 text-primary rounded-full">
                {locations.length}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Manage your tool storage areas</p>
        </div>
        <button
          onClick={openCreateForm}
          className="p-2.5 bg-primary text-primary-foreground rounded-full shadow-lg shadow-primary/25 hover:shadow-xl hover:scale-105 active:scale-95 transition-all"
          aria-label="Add location"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Empty State */}
      {locations.length === 0 && !isFormOpen && (
        <div className="text-center py-20 space-y-4">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-secondary/50 flex items-center justify-center mb-2">
            <MapPin className="w-10 h-10 text-muted-foreground/40" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">No locations yet</p>
            <p className="text-sm text-muted-foreground max-w-[220px] mx-auto">
              Add your first location to start organizing your tools
            </p>
          </div>
          <button
            onClick={openCreateForm}
            className="mt-4 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold shadow-lg shadow-primary/25 hover:shadow-xl active:scale-95 transition-all"
          >
            Add Location
          </button>
        </div>
      )}

      {/* Location Cards */}
      <div className="grid gap-3">
        {visibleLocations.map((loc, index) => (
          <div
            key={loc.id}
            className="group relative flex items-center gap-3 p-3 pr-2 bg-white dark:bg-card border border-border/40 rounded-2xl shadow-sm hover:shadow-md hover:border-primary/20 transition-all"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div
              className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer active:scale-[0.99] transition-transform"
              onClick={() => navigate(`/locations/${loc.id}/containers?name=${encodeURIComponent(loc.name)}`)}
            >
              {/* Thumbnail */}
              <div className="w-16 h-16 rounded-xl bg-secondary shrink-0 overflow-hidden relative border border-border/20 group-hover:ring-2 group-hover:ring-primary/20 transition-all">
                {loc.image_url ? (
                  <img src={loc.image_url} alt={loc.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/15">
                    <MapPin className="w-7 h-7 text-primary/40" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base text-foreground/90 group-hover:text-primary transition-colors leading-tight">{loc.name}</h3>
                {loc.description && (
                  <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{loc.description}</p>
                )}
                {/* Counts */}
                <div className="flex items-center gap-3 mt-1.5">
                  {loc.container_count > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                      <Package className="w-3 h-3" />
                      {loc.container_count} container{loc.container_count !== 1 ? 's' : ''}
                    </span>
                  )}
                  {loc.item_count > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                      {loc.item_count} item{loc.item_count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              <ChevronRight className="w-5 h-5 text-muted-foreground/30 shrink-0 group-hover:text-primary/50 group-hover:translate-x-0.5 transition-all" />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); openEditForm(e, loc); }}
                className="p-2 rounded-lg text-muted-foreground/50 hover:bg-primary/10 hover:text-primary active:bg-primary/20 transition-colors"
                aria-label={`Edit ${loc.name}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => confirmDelete(e, loc)}
                className="p-2 rounded-lg text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive active:bg-destructive/20 transition-colors"
                aria-label={`Delete ${loc.name}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {locations.length > visibleLocations.length && (
        <div ref={loadMoreRef} className="py-4 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      )}

      {/* Add/Edit Form Modal (Bottom Sheet) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/65 backdrop-blur-[1px]" onClick={resetForm} />

          {/* Panel */}
          <div className="relative bg-[hsl(var(--background))] text-[hsl(var(--foreground))] w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-border animate-in slide-in-from-bottom-4">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="text-lg font-bold">{editingId ? 'Edit Location' : 'New Location'}</h3>
              <button
                onClick={resetForm}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Form Body */}
            <div className="px-5 pb-5 space-y-4 overflow-y-auto">
              {/* Image Picker */}
              <div className="flex items-start gap-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 shrink-0 rounded-xl border-2 border-dashed border-border hover:border-primary/60 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors overflow-hidden relative"
                >
                  {locImage ? (
                    <>
                      <img src={locImage} alt="Preview" className="w-full h-full object-cover" />
                      <div
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
                        onClick={(e) => { e.stopPropagation(); setLocImage(null); }}
                      >
                        <X className="w-3.5 h-3.5 text-white" />
                      </div>
                    </>
                  ) : (
                    <>
                      <ImagePlus className="w-6 h-6" />
                      <span className="text-[10px] font-medium">Add Photo</span>
                    </>
                  )}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />

                <div className="flex-1 space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Name</label>
                    <input
                      value={locName}
                      onChange={e => setLocName(e.target.value)}
                      placeholder="e.g. Garage, Workshop"
                      className="w-full px-3 py-2.5 border rounded-lg bg-[hsl(var(--background))] text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none transition-all"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Description</label>
                    <input
                      value={locDesc}
                      onChange={e => setLocDesc(e.target.value)}
                      placeholder="Optional description"
                      className="w-full px-3 py-2.5 border rounded-lg bg-[hsl(var(--background))] text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-5 pb-5 pt-2 flex gap-3 border-t border-border/50">
              <button
                onClick={resetForm}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !locName.trim()}
                className="flex-1 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold shadow-lg shadow-primary/25 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  editingId ? 'Update Location' : 'Create Location'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[90] p-4">
          <div className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <h3 className="text-lg font-bold">Delete Location?</h3>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This will also delete all containers and items within it. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
