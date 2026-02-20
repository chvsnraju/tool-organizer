export interface Location {
  id: string;
  created_at: string;
  name: string;
  description: string | null;
  image_url: string | null;
  user_id: string;
}

export interface Container {
  id: string;
  created_at: string;
  name: string;
  description: string | null;
  location_id: string | null;
  image_url: string | null;
  user_id: string;
  location?: Location;
}

export interface Item {
  id: string;
  created_at: string;
  name: string;
  description: string;
  container_id: string | null;
  image_url: string;
  images: string[];
  tags: string[];
  category: string | null;
  user_id: string;
  container?: Container | null;
  location_id?: string | null;
  product_url?: string | null;
  user_description?: string | null;
  specs?: Record<string, string | number | boolean>;
  quantity?: number;
  condition?: 'new' | 'good' | 'fair' | 'worn' | 'needs-repair';
  is_favorite?: boolean;
  is_consumable?: boolean;
  low_stock_threshold?: number;
  estimated_price?: string | null;
  manual_url?: string | null;
  video_url?: string | null;
}

export interface ShoppingListItem {
  id: string;
  created_at: string;
  tool_name: string;
  estimated_price: string | null;
  notes: string | null;
  purchased: boolean;
  user_id: string;
}

export type ItemCondition = 'new' | 'good' | 'fair' | 'worn' | 'needs-repair';

export const CONDITION_LABELS: Record<ItemCondition, string> = {
  'new': 'New',
  'good': 'Good',
  'fair': 'Fair',
  'worn': 'Worn',
  'needs-repair': 'Needs Repair',
};

export const CONDITION_COLORS: Record<ItemCondition, string> = {
  'new': 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  'good': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  'fair': 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  'worn': 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  'needs-repair': 'bg-red-500/10 text-red-600 border-red-500/20',
};

export interface ToolLoan {
  id: string;
  item_id: string;
  item?: Item;
  borrower_name: string;
  borrowed_date: string;
  expected_return_date?: string | null;
  returned_date?: string | null;
  notes?: string | null;
  created_at: string;
  user_id?: string;
}

export interface MaintenanceReminder {
  id: string;
  item_id: string;
  item?: Item;
  task_description: string;
  interval_days?: number | null;
  last_performed?: string | null;
  next_due?: string | null;
  is_recurring: boolean;
  created_at: string;
  user_id?: string;
}
