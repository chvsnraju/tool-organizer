import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Camera, MapPin, Search, X, ChevronUp, Loader2, QrCode } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import { getListBatchSize } from '../lib/listPerformance';
import { PrintableQRCode } from '../components/PrintableQRCode';
import type { Location, Item } from '../types';

const CONTAINER_ITEMS_BATCH_SIZE = getListBatchSize('containers');

export const ContainersPage: React.FC = () => {
  const { locationId } = useParams<{ locationId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [location, setLocation] = useState<Location | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [visibleCount, setVisibleCount] = useState(CONTAINER_ITEMS_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!locationId) return;

      try {
        const { data: locData, error: locError } = await supabase
          .from('locations')
          .select('*')
          .eq('id', locationId)
          .single();

        if (locError) throw locError;
        setLocation(locData);

        const { data: itemData, error: itemError } = await supabase
          .from('items')
          .select('*')
          .eq('location_id', locationId)
          .order('created_at', { ascending: false });

        if (itemError) throw itemError;
        setItems(itemData || []);
      } catch (e) {
        addToast('Error loading location data: ' + (e as Error).message, 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 420);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const filteredItems = useMemo(
    () => items.filter(item => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        item.name.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term) ||
        item.category?.toLowerCase().includes(term) ||
        item.tags?.some(tag => tag.toLowerCase().includes(term))
      );
    }),
    [items, searchTerm]
  );

  useEffect(() => {
    setVisibleCount(CONTAINER_ITEMS_BATCH_SIZE);
  }, [searchTerm, items.length]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || visibleCount >= filteredItems.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          setVisibleCount((current) => Math.min(current + CONTAINER_ITEMS_BATCH_SIZE, filteredItems.length));
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
  }, [filteredItems.length, visibleCount]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount]
  );

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-background pb-24">
        <div className="h-40 bg-muted animate-pulse" />
        <div className="flex-1 p-4 space-y-4">
          <div className="h-20 rounded-xl bg-muted/70 animate-pulse" />
          <div className="h-11 rounded-xl bg-muted/70 animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((card) => (
              <div key={card} className="rounded-2xl overflow-hidden bg-white dark:bg-card border border-border/40 shadow-sm">
                <div className="aspect-[4/3] bg-muted animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-1/2 bg-muted/70 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-muted-foreground">Location not found</p>
        <button onClick={() => navigate('/locations')} className="text-primary hover:underline text-sm">
          Back to Locations
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      {/* Hero Header with Location Image */}
      <div className="relative">
        {location.image_url ? (
          <div className="h-44 bg-black relative overflow-hidden">
            <img
              src={location.image_url}
              alt={location.name}
              className="w-full h-full object-cover opacity-80"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          </div>
        ) : (
          <div className="h-32 bg-gradient-to-br from-primary/10 to-primary/5 relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <MapPin className="w-12 h-12 text-primary/20" />
            </div>
          </div>
        )}

        {/* Back Button */}
        <button
          onClick={() => navigate('/locations')}
          className="absolute top-4 left-4 bg-black/50 backdrop-blur-md p-2 rounded-full text-white hover:bg-black/70 transition-colors pt-safe"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Location Info Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h1 className={`font-bold text-xl leading-tight ${location.image_url ? 'text-white' : 'text-foreground'}`}>
            {location.name}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-sm ${location.image_url ? 'text-white/70' : 'text-muted-foreground'}`}>
              {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
            {location.description && (
              <span className={`text-sm ${location.image_url ? 'text-white/60' : 'text-muted-foreground/70'}`}>
                {location.description}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 space-y-4">
        {/* QR Code Section */}
        <div className="bg-muted/30 border border-border/40 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <QrCode className="w-3.5 h-3.5" /> Location Label
          </h3>
          <p className="text-xs text-muted-foreground">Print this QR code and place it on your toolbox, shelf, or storage room.</p>
          <div className="flex justify-center">
            <PrintableQRCode 
              url={`${window.location.origin}/locations/${location.id}/containers`} 
              title={location.name} 
              subtitle="Scan with ToolShed App" 
            />
          </div>
        </div>

        {/* Scan CTA */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center justify-between">
          <div className="space-y-0.5 flex-1 mr-3">
            <h3 className="font-semibold text-sm text-primary flex items-center gap-2">
              <Camera className="w-4 h-4" /> Add items here
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Scan tools to add them to <strong>{location.name}</strong>
            </p>
          </div>
          <Link
            to={`/scan?locationId=${location.id}`}
            className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium shadow-lg shadow-primary/25 active:scale-95 transition-all shrink-0"
          >
            Start Scanning
          </Link>
        </div>

        {/* Search (show when there are items) */}
        {items.length > 3 && (
          <div className="sticky top-2 z-20 rounded-2xl border border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
              <input
                type="text"
                placeholder={`Search in ${location.name}...`}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 rounded-xl border bg-card text-sm shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/30 outline-none transition-all placeholder:text-muted-foreground/50"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-secondary transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Section Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
            Items in {location.name}
          </h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Items Grid */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-secondary/50 flex items-center justify-center">
              <Package className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                {items.length === 0 ? 'No items here yet' : 'No matching items'}
              </p>
              <p className="text-xs text-muted-foreground">
                {items.length === 0 ? 'Scan some tools to add them' : 'Try a different search'}
              </p>
            </div>

            <div className="flex justify-center gap-2 pt-1">
              {items.length === 0 ? (
                <Link
                  to={`/scan?locationId=${location.id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Camera className="w-4 h-4" /> Scan First Item
                </Link>
              ) : (
                <button
                  onClick={() => setSearchTerm('')}
                  className="px-4 py-2 text-sm rounded-xl border bg-card hover:bg-secondary transition-colors"
                >
                  Clear Search
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visibleItems.map(item => (
              <button
                key={item.id}
                className="group text-left rounded-2xl overflow-hidden bg-white dark:bg-card border border-border/40 shadow-sm hover:shadow-md hover:border-primary/20 active:scale-[0.98] transition-all duration-300 flex flex-col"
                onClick={() => navigate(`/items/${item.id}`)}
                style={{ contentVisibility: 'auto', containIntrinsicSize: '280px' }}
              >
                <div className="aspect-[4/3] bg-secondary relative overflow-hidden">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-secondary">
                      <Package className="w-8 h-8 text-muted-foreground/20" />
                    </div>
                  )}
                  {item.category && (
                    <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 bg-black/60 text-white backdrop-blur-md rounded-full border border-white/10">
                      {item.category}
                    </span>
                  )}
                </div>
                <div className="p-3 flex flex-col gap-0.5">
                  <h3 className="font-semibold text-sm leading-tight line-clamp-2 text-foreground/90 group-hover:text-primary transition-colors">
                    {item.name}
                  </h3>
                  {item.description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-1">{item.description}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {filteredItems.length > visibleItems.length && (
          <div ref={loadMoreRef} className="py-4 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        )}
      </div>

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-24 right-4 z-40 p-3 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 transition-colors"
          aria-label="Scroll to top"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
