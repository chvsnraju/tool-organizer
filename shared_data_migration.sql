-- Migration to enable Shared Workspace (Multi-User Access)
-- adhering to user request: "not tied to user, it should always show in all places"

-- 1. Drop existing restrictive policies (if they exist)
DROP POLICY IF EXISTS "Users can access their own locations" ON locations;
DROP POLICY IF EXISTS "Users can access their own containers" ON containers;
DROP POLICY IF EXISTS "Users can access their own items" ON items;
DROP POLICY IF EXISTS "Users can manage their own shopping list" ON shopping_list;

-- 2. Create Permissive Policies (Shared Workspace)

-- LOCATIONS: Allow verified users to do everything
CREATE POLICY "Enable all access for authenticated users" ON locations 
FOR ALL 
USING (auth.role() = 'authenticated') 
WITH CHECK (auth.role() = 'authenticated');

-- CONTAINERS: Allow verified users to do everything
CREATE POLICY "Enable all access for authenticated users" ON containers 
FOR ALL 
USING (auth.role() = 'authenticated') 
WITH CHECK (auth.role() = 'authenticated');

-- ITEMS: Allow verified users to do everything
CREATE POLICY "Enable all access for authenticated users" ON items 
FOR ALL 
USING (auth.role() = 'authenticated') 
WITH CHECK (auth.role() = 'authenticated');

-- SHOPPING LIST: Let's keep this shared too, or per user? 
-- Assuming "ordering-poc" tool is for a team, shared shopping list makes sense.
CREATE POLICY "Enable all access for authenticated users" ON shopping_list
FOR ALL 
USING (auth.role() = 'authenticated') 
WITH CHECK (auth.role() = 'authenticated');
