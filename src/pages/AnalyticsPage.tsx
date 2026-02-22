import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  Loader2, ArrowLeft, DollarSign, BarChart3,
  Package, TrendingUp, Award, ChevronRight
} from 'lucide-react';

interface ItemRow {
  id: string;
  name: string;
  category: string | null;
  purchase_price: number | null;
  estimated_price: string | null;
  quantity: number | null;
  condition: string | null;
  created_at: string;
}

export const AnalyticsPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from('items')
        .select('id, name, category, purchase_price, estimated_price, quantity, condition, created_at')
        .order('created_at', { ascending: false });
      if (!error) setItems((data as ItemRow[]) || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  const stats = useMemo(() => {
    const itemsWithPrice = items.filter(i => i.purchase_price != null);
    const itemsWithoutPrice = items.filter(i => i.purchase_price == null);

    const totalPurchaseValue = itemsWithPrice.reduce(
      (sum, item) => sum + Number(item.purchase_price) * (item.quantity || 1),
      0
    );

    // Estimated value from items that don't have a purchase price
    let estimatedExtra = 0;
    itemsWithoutPrice.forEach(item => {
      if (item.estimated_price) {
        const nums = item.estimated_price.match(/\d+/g);
        if (nums) {
          const avg = nums.reduce((a: number, b: string) => a + parseInt(b), 0) / nums.length;
          estimatedExtra += avg * (item.quantity || 1);
        }
      }
    });

    // Value by category (purchase_price only)
    const categoryMap = new Map<string, number>();
    itemsWithPrice.forEach(item => {
      const cat = item.category || 'Uncategorized';
      const val = Number(item.purchase_price) * (item.quantity || 1);
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + val);
    });

    const categoryBreakdown = Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    const maxCategoryValue = categoryBreakdown[0]?.value || 1;

    // Top items by purchase value
    const topItems = [...itemsWithPrice]
      .sort((a, b) =>
        Number(b.purchase_price) * (b.quantity || 1) -
        Number(a.purchase_price) * (a.quantity || 1)
      )
      .slice(0, 5);

    // Monthly spend — last 6 months
    const monthMap = new Map<string, number>();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, 0);
    }
    itemsWithPrice.forEach(item => {
      const d = new Date(item.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthMap.has(key)) {
        monthMap.set(key, (monthMap.get(key) || 0) + Number(item.purchase_price) * (item.quantity || 1));
      }
    });

    const monthlyData = Array.from(monthMap.entries()).map(([key, value]) => {
      const [year, month] = key.split('-');
      const date = new Date(Number(year), Number(month) - 1, 1);
      return { label: date.toLocaleDateString('en-US', { month: 'short' }), value };
    });

    const maxMonthlyValue = Math.max(...monthlyData.map(m => m.value), 1);

    // Condition breakdown
    const conditionMap = new Map<string, number>();
    items.forEach(item => {
      const cond = item.condition || 'unknown';
      conditionMap.set(cond, (conditionMap.get(cond) || 0) + 1);
    });

    return {
      totalPurchaseValue,
      estimatedExtra,
      itemsWithPrice,
      itemsWithoutPrice,
      categoryBreakdown,
      maxCategoryValue,
      topItems,
      monthlyData,
      maxMonthlyValue,
      conditionMap,
      coveragePercent: items.length > 0 ? Math.round((itemsWithPrice.length / items.length) * 100) : 0,
    };
  }, [items]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  const conditionColors: Record<string, string> = {
    new: 'bg-emerald-500',
    good: 'bg-blue-500',
    fair: 'bg-amber-500',
    worn: 'bg-orange-500',
    'needs-repair': 'bg-red-500',
    unknown: 'bg-muted-foreground',
  };

  return (
    <div className="pb-24 p-4 space-y-5 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Cost Analytics</h1>
          <p className="text-sm text-muted-foreground">{items.length} items in inventory</p>
        </div>
      </div>

      {/* Total Value Hero */}
      <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 rounded-3xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600/80">
              Total Purchase Value
            </p>
            <p className="text-4xl font-bold mt-1">
              ${stats.totalPurchaseValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            {stats.estimatedExtra > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                +~${Math.round(stats.estimatedExtra).toLocaleString()} estimated for untracked items
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {stats.itemsWithPrice.length} of {items.length} items have purchase prices
            </p>
          </div>
          <div className="bg-emerald-500/10 p-3 rounded-xl shrink-0">
            <DollarSign className="w-7 h-7 text-emerald-500" />
          </div>
        </div>

        {/* Coverage progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Price coverage</span>
            <span className="font-semibold text-emerald-600">{stats.coveragePercent}%</span>
          </div>
          <div className="h-2 bg-emerald-500/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-700"
              style={{ width: `${stats.coveragePercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-3 text-center">
          <p className="text-lg font-bold">
            {stats.itemsWithPrice.length > 0
              ? `$${(stats.totalPurchaseValue / stats.itemsWithPrice.length).toFixed(0)}`
              : '—'}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">Avg Value</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 text-center">
          <p className="text-lg font-bold">{stats.categoryBreakdown.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">Categories</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-amber-600">{stats.itemsWithoutPrice.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">Untracked</p>
        </div>
      </div>

      {/* Value by Category */}
      {stats.categoryBreakdown.length > 0 && (
        <div className="bg-card border border-border/40 rounded-3xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Value by Category</h3>
          </div>
          <div className="space-y-3">
            {stats.categoryBreakdown.map(cat => (
              <div key={cat.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-foreground/80">{cat.name}</span>
                  <span className="font-semibold text-emerald-600">
                    ${cat.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700"
                    style={{ width: `${(cat.value / stats.maxCategoryValue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly Additions (last 6 months) */}
      <div className="bg-card border border-border/40 rounded-3xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Monthly Added Value</h3>
        </div>
        <div className="flex items-end gap-2 h-24">
          {stats.monthlyData.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end justify-center" style={{ height: '72px' }}>
                <div
                  className="w-full bg-primary/70 rounded-t-md transition-all duration-700 min-h-[2px]"
                  style={{ height: `${Math.max(2, (m.value / stats.maxMonthlyValue) * 72)}px` }}
                  title={`$${m.value.toFixed(0)}`}
                />
              </div>
              <span className="text-[9px] text-muted-foreground">{m.label}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">Based on item creation date and purchase price</p>
      </div>

      {/* Condition Breakdown */}
      {stats.conditionMap.size > 0 && (
        <div className="bg-card border border-border/40 rounded-2xl p-5 space-y-3">
          <h3 className="font-semibold text-sm">Condition Breakdown</h3>
          <div className="space-y-2">
            {Array.from(stats.conditionMap.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([cond, count]) => (
                <div key={cond} className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${conditionColors[cond] || 'bg-muted-foreground'}`} />
                  <span className="text-sm capitalize flex-1">{cond.replace('-', ' ')}</span>
                  <span className="text-sm font-semibold tabular-nums">{count}</span>
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${conditionColors[cond] || 'bg-muted-foreground'}`}
                      style={{ width: `${(count / items.length) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Top 5 Items */}
      {stats.topItems.length > 0 && (
        <div className="bg-card border border-border/40 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            <h3 className="font-semibold text-sm">Top Valued Items</h3>
          </div>
          <div className="space-y-2">
            {stats.topItems.map((item, index) => (
              <button
                key={item.id}
                onClick={() => navigate(`/items/${item.id}`)}
                className="w-full flex items-center gap-3 hover:bg-muted/40 rounded-xl p-1.5 -mx-1.5 transition-colors"
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  index === 0 ? 'bg-amber-500/15 text-amber-600' :
                  index === 1 ? 'bg-slate-400/15 text-slate-500' :
                  index === 2 ? 'bg-orange-500/15 text-orange-600' :
                  'bg-muted text-muted-foreground'
                }`}>{index + 1}</span>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">{item.category || 'Uncategorized'}</p>
                </div>
                <span className="text-sm font-semibold text-emerald-600 shrink-0">
                  ${(Number(item.purchase_price) * (item.quantity || 1)).toFixed(0)}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Items missing price */}
      {stats.itemsWithoutPrice.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-600">
              {stats.itemsWithoutPrice.length} Items Missing Purchase Price
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Add purchase prices to improve analytics coverage and your insurance report.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {stats.itemsWithoutPrice.slice(0, 10).map(item => (
              <button
                key={item.id}
                onClick={() => navigate(`/items/${item.id}?mode=edit`)}
                className="text-[11px] px-2 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-full hover:bg-amber-500/20 transition-colors"
              >
                {item.name}
              </button>
            ))}
            {stats.itemsWithoutPrice.length > 10 && (
              <span className="text-[11px] px-2 py-0.5 bg-muted text-muted-foreground rounded-full">
                +{stats.itemsWithoutPrice.length - 10} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
