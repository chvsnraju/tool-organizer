-- Phase 1: Insurance Tracking Additions
-- Run this in the Supabase SQL editor

ALTER TABLE items ADD COLUMN IF NOT EXISTS purchase_date date;
ALTER TABLE items ADD COLUMN IF NOT EXISTS purchase_price decimal(10,2);
ALTER TABLE items ADD COLUMN IF NOT EXISTS receipt_image_url text;

-- Create storage bucket for receipts if it doesn't exist
-- INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false) ON CONFLICT DO NOTHING;

-- Policies for receipts (Private bucket)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can upload receipts'
  ) THEN
    CREATE POLICY "Users can upload receipts"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'receipts'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can manage their receipts'
  ) THEN
    CREATE POLICY "Users can manage their receipts"
      ON storage.objects FOR ALL
      TO authenticated
      USING (
        bucket_id = 'receipts'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'receipts'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
