-- Fixes the infinite recursion bug and allows users to join workspaces

-- 1. Fix infinite recursion in workspace_members
DROP POLICY IF EXISTS "Users can view members of their workspaces" ON workspace_members;
DROP POLICY IF EXISTS "Users can view their own membership" ON workspace_members;

CREATE POLICY "Users can view their own membership"
  ON workspace_members FOR SELECT
  USING (user_id = auth.uid());

-- 2. Allow users to voluntarily join a workspace 
DROP POLICY IF EXISTS "Users can join a workspace" ON workspace_members;

CREATE POLICY "Users can join a workspace"
  ON workspace_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 3. Allow authenticated users to view workspaces (necessary for joining via ID)
DROP POLICY IF EXISTS "Users can view workspaces they are members of" ON workspaces;
DROP POLICY IF EXISTS "Users can view any workspace" ON workspaces;

CREATE POLICY "Users can view any workspace"
  ON workspaces FOR SELECT
  TO authenticated
  USING (true);
