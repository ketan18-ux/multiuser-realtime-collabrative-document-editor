-- =============================================================
-- Supabase SQL: Create documents table with RLS policies
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- =============================================================

-- 1. Create the documents table
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Document',
  content TEXT DEFAULT '',
  content_format TEXT DEFAULT 'html',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies — users can only access their own documents
CREATE POLICY "Users can view own documents"
  ON public.documents FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own documents"
  ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own documents"
  ON public.documents FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own documents"
  ON public.documents FOR DELETE
  USING (auth.uid() = owner_id);

-- 4. Auto-update the updated_at timestamp on every UPDATE
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 5. Create indexes for performance
CREATE INDEX idx_documents_owner_id ON public.documents(owner_id);
CREATE INDEX idx_documents_updated_at ON public.documents(updated_at DESC);
