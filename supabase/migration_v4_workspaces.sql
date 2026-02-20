-- Phase 3: Shared Workspaces & Collaboration

-- 1. Create Workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  owner_id uuid default auth.uid() not null
);

-- 2. Create Workspace Members table
CREATE TABLE IF NOT EXISTS workspace_members (
  id uuid default uuid_generate_v4() primary key,
  workspace_id uuid references workspaces(id) on delete cascade not null,
  user_id uuid not null,
  role text default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  UNIQUE(workspace_id, user_id)
);

-- 3. Add workspace_id to all core tables
ALTER TABLE locations ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE shopping_list ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE tool_loans ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE maintenance_reminders ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;

-- 4. Enable RLS on new tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- 5. Backfill existing data 
-- (Create a default workspace for every unique user_id that currently has items/locations)
DO $$
DECLARE
  rec RECORD;
  new_ws_id uuid;
BEGIN
  FOR rec IN 
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM items WHERE user_id IS NOT NULL
      UNION SELECT user_id FROM locations WHERE user_id IS NOT NULL
    ) as users
  LOOP
    -- Create a workspace
    INSERT INTO workspaces (name, owner_id) VALUES ('My Workspace', rec.user_id) RETURNING id INTO new_ws_id;
    
    -- Add user to workspace_members as owner
    INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (new_ws_id, rec.user_id, 'owner');
    
    -- Update existing records to link to this new workspace
    UPDATE locations set workspace_id = new_ws_id WHERE user_id = rec.user_id;
    UPDATE containers set workspace_id = new_ws_id WHERE user_id = rec.user_id;
    UPDATE items set workspace_id = new_ws_id WHERE user_id = rec.user_id;
    UPDATE shopping_list set workspace_id = new_ws_id WHERE user_id = rec.user_id;
    UPDATE tool_loans set workspace_id = new_ws_id WHERE user_id = rec.user_id;
    UPDATE maintenance_reminders set workspace_id = new_ws_id WHERE user_id = rec.user_id;
  END LOOP;
END $$;

-- 6. Create RLS Policies for Workspaces
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view workspaces they are members of') THEN
    CREATE POLICY "Users can view workspaces they are members of"
      ON workspaces FOR SELECT
      USING (id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own workspaces') THEN
    CREATE POLICY "Users can insert their own workspaces"
      ON workspaces FOR INSERT
      WITH CHECK (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own workspaces') THEN
    CREATE POLICY "Users can update their own workspaces"
      ON workspaces FOR UPDATE
      USING (owner_id = auth.uid());
  END IF;

  -- Workspace Members access
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view members of their workspaces') THEN
    CREATE POLICY "Users can view members of their workspaces"
      ON workspace_members FOR SELECT
      USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
  END IF;
  
  -- Create Trigger to auto-add workspace owner as a member upon workspace creation
  -- (Normally this is done in application logic or a trigger function, but we can do it via function)
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_workspace() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists then create it
DROP TRIGGER IF EXISTS on_workspace_created ON workspaces;
CREATE TRIGGER on_workspace_created
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace();


-- 7. Update core tables RLS to use workspace_id instead of user_id
-- We will add an OR condition so they don't break immediately if workspace_id is null for some reason
DO $$
BEGIN
  -- Locations
  DROP POLICY IF EXISTS "Users can access their own locations" ON locations;
  CREATE POLICY "Users can access their own locations"
    ON locations FOR ALL
    USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()) OR user_id = auth.uid());

  -- Containers
  DROP POLICY IF EXISTS "Users can access their own containers" ON containers;
  CREATE POLICY "Users can access their own containers"
    ON containers FOR ALL
    USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()) OR user_id = auth.uid());

  -- Items
  DROP POLICY IF EXISTS "Users can access their own items" ON items;
  CREATE POLICY "Users can access their own items"
    ON items FOR ALL
    USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()) OR user_id = auth.uid());

  -- Shopping List
  DROP POLICY IF EXISTS "Users can manage their own shopping list" ON shopping_list;
  CREATE POLICY "Users can manage their own shopping list"
    ON shopping_list FOR ALL
    USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()) OR user_id = auth.uid());

  -- Tool Loans
  DROP POLICY IF EXISTS "Users can update their own loans" ON tool_loans;
  CREATE POLICY "Users can update their own loans"
    ON tool_loans FOR ALL
    USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()) OR user_id = auth.uid());

  -- Maintenance Reminders
  DROP POLICY IF EXISTS "Users can update their own maintenance" ON maintenance_reminders;
  CREATE POLICY "Users can update their own maintenance"
    ON maintenance_reminders FOR ALL
    USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()) OR user_id = auth.uid());
END $$;
