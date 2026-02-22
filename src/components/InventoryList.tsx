import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { smartSearch } from '../lib/gemini';
import {
  Loader2, Package, Search, MapPin, X, Camera, Sparkles, TrendingUp,
  Star, DollarSign, AlertCircle, Mic, MicOff, Brain, ChevronUp
} from 'lucide-react';
import type { Item } from '../types';
import { useToast } from '../hooks/useToast';
import { getListBatchSize } from '../lib/listPerformance';
import { getCached, setCache } from '../lib/queryCache';
import { motion, useReducedMotion, type Variants } from 'framer-motion';

// Reduced-motion-safe variants (stagger halved, no scale, shorter spring)
const makeContainerVariants = (reducedMotion: boolean): Variants => ({
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: reducedMotion ? 0 : 0.03,
    },
  },
});

const makeItemVariants = (reducedMotion: boolean): Variants => ({
  hidden: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 },
  show: reducedMotion
    ? { opacity: 1, transition: { duration: 0.15 } }
    : { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 28 } },
});

interface DashboardStats {
  totalItems: number;
  totalLocations: number;
  totalCategories: number;
  shoppingCount: number;
  totalValue: string;
  lentCount: number;
  maintenanceDue: number;
}

const ITEMS_BATCH_SIZE = getListBatchSize('inventory');

// Cache key for dashboard stats (TTL: 60s — stats are non-critical)
const STATS_CACHE_KEY = 'inventory:stats';
const STATS_CACHE_TTL = 60_000;

// Cache for AI smart search results, keyed by query hash
const smartSearchCache = new Map<string, { itemName: string; relevance: string; reason: string }[]>();

export const InventoryList: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const prefersReducedMotion = useReducedMotion() ?? false;
  const containerVariants = makeContainerVariants(prefersReducedMotion);
  const itemVariants = makeItemVariants(prefersReducedMotion);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalItems: 0, totalLocations: 0, totalCategories: 0, shoppingCount: 0,
    totalValue: '$0', lentCount: 0, maintenanceDue: 0
  });

  // Smart search
  const [isSmartSearching, setIsSmartSearching] = useState(false);
  const [smartSearchResults, setSmartSearchResults] = useState<{ itemName: string; relevance: string; reason: string }[] | null>(null);

  // Voice search
  const [isListening, setIsListening] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [visibleCount, setVisibleCount] = useState(ITEMS_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const fetchItems = async () => {
    const cached = getCached<Item[]>('inventory:items');
    if (cached) {
      setItems(cached);
      setLoading(false);
    }

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
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
      setCache('inventory:items', data || []);
    } catch (err) {
      if (!cached) setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    // Serve from cache when available (60s TTL) — stats are non-critical
    const cached = getCached<Pick<DashboardStats, 'totalLocations' | 'shoppingCount' | 'lentCount' | 'maintenanceDue'>>(
      STATS_CACHE_KEY, STATS_CACHE_TTL
    );
    if (cached) {
      setStats(prev => ({ ...prev, ...cached }));
      return;
    }

    try {
      const [locResult, shopResult, loanResult, maintResult] = await Promise.all([
        supabase.from('locations').select('id', { count: 'exact', head: true }),
        supabase.from('shopping_list').select('id', { count: 'exact', head: true }).eq('purchased', false),
        supabase.from('tool_loans').select('id', { count: 'exact', head: true }).is('returned_date', null),
        supabase.from('maintenance_reminders').select('id, next_due').lte('next_due', new Date().toISOString()),
      ]);

      const dueCount = (maintResult.data || []).length;

      const statsUpdate = {
        totalLocations: locResult.count || 0,
        shoppingCount: shopResult.count || 0,
        lentCount: loanResult.count || 0,
        maintenanceDue: dueCount,
      };

      setStats(prev => ({ ...prev, ...statsUpdate }));
      setCache(STATS_CACHE_KEY, statsUpdate);
    } catch (err) {
      console.warn('[InventoryList] fetchStats failed:', err);
    }
  };

  useEffect(() => {
    fetchItems();
    fetchStats();
  }, []);

  // Debounce search term (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 420);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const itemStats = useMemo(() => {
    const categories = new Set(items.map(i => i.category).filter(Boolean));

    let totalValueNum = 0;
    items.forEach(item => {
      if (item.estimated_price) {
        const nums = item.estimated_price.match(/\d+/g);
        if (nums) {
          const avg = nums.reduce((a, b) => a + parseInt(b), 0) / nums.length;
          totalValueNum += avg * (item.quantity || 1);
        }
      }
    });

    return {
      totalItems: items.length,
      totalCategories: categories.size,
      totalValue: totalValueNum > 0 ? `$${Math.round(totalValueNum).toLocaleString()}` : '$0',
    };
  }, [items]);

  useEffect(() => {
    setStats(prev => ({ ...prev, ...itemStats }));
  }, [itemStats]);

  const handleToggleFavorite = async (item: Item, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('items')
        .update({ is_favorite: !item.is_favorite })
        .eq('id', item.id);
      if (error) throw error;
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_favorite: !i.is_favorite } : i));
    } catch {
      addToast('Failed to update favorite', 'error');
    }
  };

  const handleSmartSearch = async () => {
    if (!searchTerm.trim()) {
      addToast('Please enter what you are looking for in the search bar first.', 'info');
      return;
    }

    // Check AI search cache — keyed by normalized query
    const cacheKey = searchTerm.trim().toLowerCase();
    const cachedResult = smartSearchCache.get(cacheKey);
    if (cachedResult) {
      setSmartSearchResults(cachedResult);
      return;
    }

    setIsSmartSearching(true);
    try {
      const inventoryContext = items.map(i =>
        `- ${i.name} [${i.category || 'Uncategorized'}] (Tags: ${i.tags?.join(', ') || 'none'}) - ${i.description || 'No desc'} - Location: ${getLocationPath(i) || 'Unknown'}`
      ).join('\n');

      const resultText = await smartSearch(searchTerm, inventoryContext);
      const parsed = JSON.parse(resultText);
      const matches = parsed.matches || [];
      setSmartSearchResults(matches);
      // Cache result for this query (lives for the session)
      smartSearchCache.set(cacheKey, matches);
      if (matches.length === 0 && parsed.suggestion) {
        addToast(parsed.suggestion, 'info');
      }
    } catch (err) {
      console.warn('[InventoryList] smart search failed:', err);
      addToast('Smart search failed. Using local search.', 'info');
    } finally {
      setIsSmartSearching(false);
    }
  };

  const startVoiceSearch = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      addToast('Voice not supported in this browser', 'info');
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
      setSearchTerm(transcript);
      setIsListening(false);
    };

    recognition.onerror = () => { setIsListening(false); };
    recognition.onend = () => { setIsListening(false); };

    setIsListening(true);
    recognition.start();
  };

  const categories = useMemo(
    () => Array.from(new Set(items.map(i => i.category).filter(Boolean))) as string[],
    [items]
  );

  const filteredItems = useMemo(() => {
    const term = debouncedSearchTerm.toLowerCase();
    let nextItems = items.filter(item => {
      const matchesSearch = !term ||
        item.name.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term) ||
        item.category?.toLowerCase().includes(term) ||
        item.tags?.some(tag => tag.toLowerCase().includes(term));

      const matchesCategory = !categoryFilter || item.category === categoryFilter;
      const matchesFavorite = !showFavoritesOnly || item.is_favorite;

      return matchesSearch && matchesCategory && matchesFavorite;
    });

    if (smartSearchResults && smartSearchResults.length > 0) {
      const matchNames = new Set(smartSearchResults.map(r => r.itemName.toLowerCase()));
      const matched = nextItems.filter(i => matchNames.has(i.name.toLowerCase()));
      const unmatched = nextItems.filter(i => !matchNames.has(i.name.toLowerCase()));
      nextItems = [...matched, ...unmatched];
    }

    return nextItems;
  }, [items, debouncedSearchTerm, categoryFilter, showFavoritesOnly, smartSearchResults]);

  const getLocationPath = (item: Item): string | null => {
    if (!item.container) return null;
    const container = item.container;
    if (container.location) {
      return `${container.location.name} › ${container.name}`;
    }
    return container.name;
  };

  // Low stock items (consumables below threshold)
  const lowStockItems = useMemo(
    () => items.filter(item =>
      item.is_consumable && item.low_stock_threshold && item.low_stock_threshold > 0 &&
      (item.quantity || 1) <= item.low_stock_threshold
    ),
    [items]
  );

  // Get recently added items (last 7 days)
  const recentItems = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    return items.filter(item => {
      const created = new Date(item.created_at);
      return created > weekAgo;
    });
  }, [items]);

  const recentItemIds = useMemo(() => new Set(recentItems.map(item => item.id)), [recentItems]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount]
  );

  useEffect(() => {
    setVisibleCount(ITEMS_BATCH_SIZE);
  }, [debouncedSearchTerm, categoryFilter, showFavoritesOnly, smartSearchResults, items.length]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || visibleCount >= filteredItems.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          setVisibleCount((current) => Math.min(current + ITEMS_BATCH_SIZE, filteredItems.length));
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

  if (loading) {
    return (
      <div className="p-4 pb-24 space-y-4">
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((chip) => (
            <div key={chip} className="bg-white dark:bg-card border border-border/40 rounded-xl p-2.5 text-center">
              <div className="h-5 w-8 mx-auto bg-muted rounded-md animate-pulse" />
              <div className="h-3 w-12 mx-auto mt-1.5 bg-muted/70 rounded animate-pulse" />
            </div>
          ))}
        </div>

        <div className="h-11 rounded-xl bg-muted/70 overflow-hidden relative">
          <motion.div 
            className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent" 
            animate={{ translateX: ['-100%', '100%'] }} 
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 pb-4">
          {[1, 2, 3, 4].map((card) => (
            <div key={card} className="rounded-2xl overflow-hidden bg-white dark:bg-card border border-border/40 shadow-sm relative">
              <motion.div 
                className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 dark:via-white/5 to-transparent z-10" 
                animate={{ translateX: ['-100%', '200%'] }} 
                transition={{ repeat: Infinity, duration: 2, ease: "linear", delay: card * 0.1 }}
              />
              <div className="aspect-[4/3] bg-muted/80" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                <div className="h-3 w-2/3 bg-muted/70 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 m-4 bg-destructive/10 text-destructive rounded-xl text-sm border border-destructive/20">
        Error loading items: {error}
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-4">
      {/* Dashboard Stats */}
      {items.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => {
              setSearchTerm('');
              setCategoryFilter(null);
              setShowFavoritesOnly(false);
              setSmartSearchResults(null);
            }}
            className="bg-white dark:bg-card border border-border/40 rounded-xl p-2.5 text-center hover:border-primary/30 transition-colors"
          >
            <p className="text-lg font-bold text-foreground">{stats.totalItems}</p>
            <p className="text-[10px] text-muted-foreground">Tools</p>
          </button>
          <button
            onClick={() => navigate('/locations')}
            className="bg-white dark:bg-card border border-border/40 rounded-xl p-2.5 text-center hover:border-primary/30 transition-colors"
          >
            <p className="text-lg font-bold text-foreground">{stats.totalLocations}</p>
            <p className="text-[10px] text-muted-foreground">Locations</p>
          </button>
          <button
            onClick={() => navigate('/lending')}
            className="bg-white dark:bg-card border border-border/40 rounded-xl p-2.5 text-center hover:border-primary/30 transition-colors"
          >
            <p className="text-lg font-bold text-foreground">{stats.lentCount}</p>
            <p className="text-[10px] text-muted-foreground">Lent</p>
          </button>
          <button
            onClick={() => navigate('/shopping')}
            className="bg-white dark:bg-card border border-border/40 rounded-xl p-2.5 text-center hover:border-primary/30 transition-colors"
          >
            <p className="text-lg font-bold text-primary">{stats.shoppingCount}</p>
            <p className="text-[10px] text-muted-foreground">To Buy</p>
          </button>
        </div>
      )}

      {/* Alert Row */}
      {items.length > 0 && (stats.lentCount > 0 || stats.maintenanceDue > 0 || lowStockItems.length > 0) && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {stats.lentCount > 0 && (
            <button
              onClick={() => navigate('/lending')}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              <AlertCircle className="w-3.5 h-3.5" /> {stats.lentCount} lent out
            </button>
          )}
          {stats.maintenanceDue > 0 && (
            <button
              onClick={() => navigate('/maintenance')}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-medium text-red-500 hover:bg-red-500/20 transition-colors"
            >
              <AlertCircle className="w-3.5 h-3.5" /> {stats.maintenanceDue} maintenance due
            </button>
          )}
          {lowStockItems.length > 0 && (
            <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-xl text-xs font-medium text-orange-600 dark:text-orange-400">
              <AlertCircle className="w-3.5 h-3.5" /> {lowStockItems.length} low stock
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      {items.length > 0 && (
        <div className="flex gap-2">
          <Link
            to="/scan"
            className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-primary/5 border border-primary/20 rounded-xl text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <Camera className="w-4 h-4" /> Scan Tool
          </Link>
          <Link
            to="/assistant"
            className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-violet-500/5 border border-violet-500/20 rounded-xl text-sm font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition-colors"
          >
            <Sparkles className="w-4 h-4" /> Plan Project
          </Link>
        </div>
      )}

      <div className="sticky top-2 z-20 rounded-2xl border border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-2 space-y-2">
        {/* Search Bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Search tools, categories, tags..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setSmartSearchResults(null); }}
              onKeyDown={e => e.key === 'Enter' && handleSmartSearch()}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border bg-card text-sm shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/30 outline-none transition-all placeholder:text-muted-foreground/50"
            />
            {searchTerm && (
              <button
                onClick={() => { setSearchTerm(''); setSmartSearchResults(null); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-secondary transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <button
            onClick={startVoiceSearch}
            className={`shrink-0 p-2.5 rounded-xl border transition-colors ${
              isListening ? 'bg-red-500/10 border-red-500/30 text-red-500 animate-pulse' : 'bg-card border-border/60 text-muted-foreground hover:text-foreground'
            }`}
            aria-label={isListening ? 'Stop voice search' : 'Start voice search'}
            aria-pressed={isListening}
          >
            {isListening ? <MicOff className="w-4 h-4" aria-hidden="true" /> : <Mic className="w-4 h-4" aria-hidden="true" />}
          </button>
          <button
            onClick={handleSmartSearch}
            disabled={isSmartSearching}
            className="shrink-0 p-2.5 rounded-xl border bg-violet-500/5 border-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition-colors disabled:opacity-40"
            aria-label="AI smart search"
          >
            {isSmartSearching ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Brain className="w-4 h-4" aria-hidden="true" />}
          </button>
        </div>

        {/* Smart Search Results */}
        {smartSearchResults && smartSearchResults.length > 0 && (
          <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-3 space-y-2 animate-in fade-in">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-600 dark:text-violet-400">
              <Brain className="w-3.5 h-3.5" /> AI found {smartSearchResults.length} match(es)
            </div>
            {smartSearchResults.map((r, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium text-foreground">{r.itemName}</span>
                <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  r.relevance === 'high' ? 'bg-emerald-500/10 text-emerald-600' :
                  r.relevance === 'medium' ? 'bg-amber-500/10 text-amber-600' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {r.relevance}
                </span>
                <span className="ml-1 text-muted-foreground"> — {r.reason}</span>
              </div>
            ))}
          </div>
        )}

        {/* Filter Row */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {/* Favorites toggle */}
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            aria-pressed={showFavoritesOnly}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-medium transition-all flex items-center gap-1 ${
              showFavoritesOnly
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                : 'bg-card text-muted-foreground border border-border/60 hover:border-amber-500/40'
            }`}
          >
            <Star className={`w-3 h-3 ${showFavoritesOnly ? 'fill-current' : ''}`} aria-hidden="true" /> Favorites
          </button>

          {/* Category Pills */}
          <button
            onClick={() => setCategoryFilter(null)}
            aria-pressed={!categoryFilter && !showFavoritesOnly}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-medium transition-all ${
              !categoryFilter && !showFavoritesOnly
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-card text-muted-foreground border border-border/60 hover:border-primary/40 hover:text-foreground'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              aria-pressed={categoryFilter === cat}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                categoryFilter === cat
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card text-muted-foreground border border-border/60 hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Recently Added Badge */}
        {!searchTerm && !categoryFilter && !showFavoritesOnly && recentItems.length > 0 && (
          <div className="flex items-center gap-2 px-1">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] font-medium text-primary">
              {recentItems.length} new this week
            </span>
          </div>
        )}
      </div>

      {/* Section Header */}
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-base font-semibold tracking-tight">
          {showFavoritesOnly ? '⭐ Favorites' : categoryFilter ? categoryFilter : 'My Tools'}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">{filteredItems.length} items</span>
      </div>

      {(searchTerm || categoryFilter || showFavoritesOnly) && (
        <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            Active filters: {searchTerm ? 'Search' : ''}{searchTerm && (categoryFilter || showFavoritesOnly) ? ' · ' : ''}{categoryFilter || ''}{categoryFilter && showFavoritesOnly ? ' · ' : ''}{showFavoritesOnly ? 'Favorites' : ''}
          </span>
          <button
            onClick={() => {
              setSearchTerm('');
              setCategoryFilter(null);
              setShowFavoritesOnly(false);
              setSmartSearchResults(null);
            }}
            className="text-primary font-medium hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {filteredItems.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center py-20 space-y-4"
        >
          <motion.div 
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
            className="w-20 h-20 mx-auto rounded-3xl bg-secondary/50 flex items-center justify-center mb-2 shadow-inner"
          >
            <Package className="w-10 h-10 text-muted-foreground/40" />
          </motion.div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              {items.length === 0 ? 'No tools yet' : 'No results found'}
            </p>
            <p className="text-sm text-muted-foreground max-w-[200px] mx-auto">
              {items.length === 0
                ? 'Tap the camera button to scan your first tool'
                : 'Try a different search term or category'}
            </p>
          </div>
          {items.length === 0 && (
            <Link
              to="/scan"
              className="inline-flex items-center gap-2 mt-4 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold shadow-lg shadow-primary/25 hover:shadow-xl active:scale-95 transition-all"
            >
              <Camera className="w-4 h-4" /> Scan Your First Tool
            </Link>
          )}

          {items.length > 0 && (
            <div className="flex justify-center gap-2 pt-2">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setCategoryFilter(null);
                  setShowFavoritesOnly(false);
                  setSmartSearchResults(null);
                }}
                className="px-4 py-2 text-sm rounded-xl border bg-card hover:bg-secondary transition-colors"
              >
                Clear Filters
              </button>
              <Link
                to="/scan"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Camera className="w-4 h-4" /> Scan New Tool
              </Link>
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-3 pb-4"
        >
          {visibleItems.map((item) => {
            const locationPath = getLocationPath(item);
            const isRecent = recentItemIds.has(item.id);
            const isLowStock = item.is_consumable && item.low_stock_threshold &&
              item.low_stock_threshold > 0 && (item.quantity || 1) <= item.low_stock_threshold;
            return (
              <motion.button
                variants={itemVariants}
                key={item.id}
                className="group text-left rounded-2xl overflow-hidden bg-white dark:bg-card border border-border/40 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 flex flex-col relative"
                whileHover={prefersReducedMotion ? undefined : { y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)" }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
                onClick={() => navigate(`/items/${item.id}`)}
                style={{ contentVisibility: 'auto', containIntrinsicSize: '280px' }}
              >
                {/* Thumbnail */}
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

                  {/* Category Badge */}
                  {item.category && (
                    <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 bg-black/60 text-white backdrop-blur-md rounded-full border border-white/10">
                      {item.category}
                    </span>
                  )}

                  {/* Favorite */}
                  <button
                    onClick={(e) => handleToggleFavorite(item, e)}
                    className="absolute top-2 right-2 p-1 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors z-10"
                  >
                    <Star className={`w-3.5 h-3.5 ${item.is_favorite ? 'fill-amber-400 text-amber-400' : 'text-white/70'}`} />
                  </button>

                  {/* New Badge */}
                  {isRecent && !searchTerm && !categoryFilter && (
                    <span className="absolute bottom-2 right-2 text-[9px] font-bold px-1.5 py-0.5 bg-primary text-primary-foreground rounded-full">
                      NEW
                    </span>
                  )}

                  {/* Low Stock Badge */}
                  {isLowStock && (
                    <span className="absolute bottom-2 left-2 text-[9px] font-bold px-1.5 py-0.5 bg-orange-500 text-white rounded-full flex items-center gap-0.5">
                      <AlertCircle className="w-2.5 h-2.5" /> LOW
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 flex flex-col gap-1">
                  <h3 className="font-semibold text-sm leading-tight line-clamp-2 text-foreground/90 group-hover:text-primary transition-colors">{item.name}</h3>
                  <div className="flex items-center gap-2">
                    {locationPath && (
                      <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 line-clamp-1 flex-1 min-w-0">
                        <MapPin className="w-3 h-3 text-primary/70 shrink-0" /> {locationPath}
                      </p>
                    )}
                    {item.estimated_price && (
                      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 shrink-0">
                        <DollarSign className="w-2.5 h-2.5" /> {item.estimated_price}
                      </span>
                    )}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}

      {filteredItems.length > visibleItems.length && (
        <div ref={loadMoreRef} className="py-4 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      )}

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
