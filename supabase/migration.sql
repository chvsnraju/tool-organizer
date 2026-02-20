-- Migration script for existing databases
-- Run this in Supabase SQL editor if you already have the base tables

-- Add category column to items (if not exists)
ALTER TABLE items ADD COLUMN IF NOT EXISTS category text;

-- Add images array column to items (for multiple images per item)
ALTER TABLE items ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}';

-- Add location_id to items (direct location reference)
ALTER TABLE items ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id) ON DELETE SET NULL;

-- Add product URL and user notes
ALTER TABLE items ADD COLUMN IF NOT EXISTS product_url text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS user_description text;

-- Add specs as JSONB
ALTER TABLE items ADD COLUMN IF NOT EXISTS specs jsonb DEFAULT '{}';

-- Add quantity and condition tracking
ALTER TABLE items ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1;
ALTER TABLE items ADD COLUMN IF NOT EXISTS condition text DEFAULT 'good';

-- Add image_url to locations
ALTER TABLE locations ADD COLUMN IF NOT EXISTS image_url text;

-- Create Shopping List table
CREATE TABLE IF NOT EXISTS shopping_list (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  tool_name text not null,
  estimated_price text,
  notes text,
  purchased boolean default false,
  user_id uuid default auth.uid()
);

-- Enable RLS on shopping_list
ALTER TABLE shopping_list ENABLE ROW LEVEL SECURITY;

-- Create RLS policy (use DO block to avoid error if exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own shopping list'
  ) THEN
    CREATE POLICY "Users can manage their own shopping list"
      ON shopping_list FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Add indexes (IF NOT EXISTS requires PostgreSQL 9.5+)
CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);
CREATE INDEX IF NOT EXISTS idx_items_container_id ON items(container_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_containers_location_id ON containers(location_id);
CREATE INDEX IF NOT EXISTS idx_containers_user_id ON containers(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_user_id ON locations(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_user_id ON shopping_list(user_id);

-- Storage buckets (uncomment and run if not already created)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('items', 'items', true) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('containers', 'containers', true) ON CONFLICT DO NOTHING;

-- Storage object policies (required for authenticated uploads)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can upload item images'
  ) THEN
    CREATE POLICY "Users can upload item images"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'items'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can manage their item images'
  ) THEN
    CREATE POLICY "Users can manage their item images"
      ON storage.objects FOR ALL
      TO authenticated
      USING (
        bucket_id = 'items'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'items'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can upload container images'
  ) THEN
    CREATE POLICY "Users can upload container images"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'containers'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can manage their container images'
  ) THEN
    CREATE POLICY "Users can manage their container images"
      ON storage.objects FOR ALL
      TO authenticated
      USING (
        bucket_id = 'containers'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'containers'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
