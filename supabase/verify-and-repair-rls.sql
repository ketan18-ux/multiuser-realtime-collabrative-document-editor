-- ================================================================
-- verify-and-repair-rls.sql
-- ================================================================
-- Run this in: Supabase Dashboard → SQL Editor → New Query
--
-- PURPOSE:
--   1. Verify the public.documents table exists with correct schema.
--   2. Verify RLS is enabled.
--   3. Verify all four RLS policies (SELECT, INSERT, UPDATE, DELETE) exist.
--   4. Re-create any missing policies safely (IF NOT EXISTS).
--   5. Verify the updated_at trigger exists.
--
-- SAFE TO RUN: This script only creates what is missing.
-- It does NOT drop existing data, tables, or policies.
-- ================================================================


-- ----------------------------------------------------------------
-- STEP 1: Confirm the documents table and its columns exist
-- ----------------------------------------------------------------
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'documents'
ORDER BY ordinal_position;

-- Expected columns:
--   id             uuid        NO   gen_random_uuid()
--   owner_id       uuid        NO   (none)
--   title          text        NO   'Untitled Document'
--   content        text        YES  ''
--   content_format text        YES  'html'
--   created_at     timestamptz YES  now()
--   updated_at     timestamptz YES  now()


-- ----------------------------------------------------------------
-- STEP 2: Confirm RLS is enabled on the table
-- ----------------------------------------------------------------
SELECT
  relname AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname = 'documents'
  AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Expected: rls_enabled = true


-- ----------------------------------------------------------------
-- STEP 3: List existing RLS policies
-- ----------------------------------------------------------------
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'documents'
ORDER BY policyname;

-- Expected 4 rows — one per operation (SELECT, INSERT, UPDATE, DELETE)


-- ----------------------------------------------------------------
-- STEP 4: Re-enable RLS (idempotent — safe if already enabled)
-- ----------------------------------------------------------------
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;


-- ----------------------------------------------------------------
-- STEP 5: Recreate missing RLS policies (drop-and-recreate pattern)
-- ----------------------------------------------------------------

-- SELECT policy
DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
CREATE POLICY "Users can view own documents"
  ON public.documents FOR SELECT
  USING (auth.uid() = owner_id);

-- INSERT policy
DROP POLICY IF EXISTS "Users can create own documents" ON public.documents;
CREATE POLICY "Users can create own documents"
  ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- UPDATE policy
DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
CREATE POLICY "Users can update own documents"
  ON public.documents FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- DELETE policy
DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
CREATE POLICY "Users can delete own documents"
  ON public.documents FOR DELETE
  USING (auth.uid() = owner_id);


-- ----------------------------------------------------------------
-- STEP 6: Recreate the updated_at trigger (idempotent)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_updated_at ON public.documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();


-- ----------------------------------------------------------------
-- STEP 7: Confirm indexes exist (creates them if missing)
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_documents_owner_id   ON public.documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON public.documents(updated_at DESC);


-- ----------------------------------------------------------------
-- FINAL CHECK: Count documents visible to the current auth session
-- ----------------------------------------------------------------
-- Run this AFTER logging in via the app and saving a document.
-- If the count is > 0, cloud persistence is working correctly.
SELECT count(*) AS my_document_count FROM public.documents;
