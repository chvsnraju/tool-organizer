-- Migration V2: Add new feature columns and tables
-- Run this in Supabase SQL editor

-- 1. Add new columns to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false;
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_consumable boolean DEFAULT false;
ALTER TABLE items ADD COLUMN IF NOT EXISTS low_stock_threshold integer DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS estimated_price text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS manual_url text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS video_url text;

-- 2. Create Tool Loans table
CREATE TABLE IF NOT EXISTS tool_loans (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  item_id uuid references items(id) on delete cascade not null,
  borrower_name text not null,
  borrowed_date date not null default current_date,
  expected_return_date date,
  returned_date date,
  notes text,
  user_id uuid default auth.uid()
);

-- 3. Create Maintenance Reminders table
CREATE TABLE IF NOT EXISTS maintenance_reminders (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  item_id uuid references items(id) on delete cascade not null,
  task_description text not null,
  interval_days integer,
  last_performed date,
  next_due date,
  is_recurring boolean default false,
  user_id uuid default auth.uid()
);

-- 4. Enable RLS on new tables
ALTER TABLE tool_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_reminders ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policies for new tables
DO $$
BEGIN
  DROP POLICY IF EXISTS "Enable all access for authenticated users" ON tool_loans;
  DROP POLICY IF EXISTS "Enable all access for authenticated users" ON maintenance_reminders;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own tool loans' AND tablename = 'tool_loans'
  ) THEN
    CREATE POLICY "Users can manage their own tool loans" ON tool_loans
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own maintenance reminders' AND tablename = 'maintenance_reminders'
  ) THEN
    CREATE POLICY "Users can manage their own maintenance reminders" ON maintenance_reminders
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 6. Add indexes for new tables
CREATE INDEX IF NOT EXISTS idx_tool_loans_item_id ON tool_loans(item_id);
CREATE INDEX IF NOT EXISTS idx_tool_loans_user_id ON tool_loans(user_id);
CREATE INDEX IF NOT EXISTS idx_tool_loans_returned ON tool_loans(returned_date) WHERE returned_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_item_id ON maintenance_reminders(item_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_user_id ON maintenance_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_next_due ON maintenance_reminders(next_due);
CREATE INDEX IF NOT EXISTS idx_items_favorite ON items(is_favorite) WHERE is_favorite = true;
