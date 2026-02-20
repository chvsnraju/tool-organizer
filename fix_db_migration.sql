-- Run this in your Supabase SQL Editor to fix the "Infinite Loading" issue
-- This adds the missing columns that the new update depends on.

-- 1. Add specs column (JSONB for key-value pairs)
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS specs jsonb DEFAULT '{}'::jsonb;

-- 2. Add product_url column
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS product_url text;

-- 3. Add user_description column
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS user_description text;

-- 4. Verify columns exist (Optional, just for your confirmation)
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'items';
