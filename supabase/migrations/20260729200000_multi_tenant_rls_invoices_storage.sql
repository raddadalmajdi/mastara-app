-- عزل بيانات كل محل (خياط) عبر auth.uid() — فواتير، عملاء، ملفات Storage.
-- نفّذ هذا الملف في Supabase SQL Editor بعد migrations السابقة.

-- ─── invoices: كل سجل مربوط بـ user_id = صاحب المحل ───
CREATE INDEX IF NOT EXISTS invoices_user_id_idx ON public.invoices (user_id);
CREATE INDEX IF NOT EXISTS invoices_user_id_customer_phone_idx
  ON public.invoices (user_id, customer_phone);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_select_own ON public.invoices;
DROP POLICY IF EXISTS invoices_insert_own ON public.invoices;
DROP POLICY IF EXISTS invoices_update_own ON public.invoices;
DROP POLICY IF EXISTS invoices_delete_own ON public.invoices;

CREATE POLICY invoices_select_own ON public.invoices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY invoices_insert_own ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY invoices_update_own ON public.invoices
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY invoices_delete_own ON public.invoices
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.invoices IS 'Scanned invoices/documents; RLS isolates rows per tailor user_id';

-- ─── tailor_customers: upsert/delete لنفس المحل فقط ───
DROP POLICY IF EXISTS tailor_customers_delete_own ON public.tailor_customers;

CREATE POLICY tailor_customers_delete_own ON public.tailor_customers
  FOR DELETE TO authenticated
  USING (auth.uid() = tailor_user_id);

DROP POLICY IF EXISTS tailor_profiles_delete_own ON public.tailor_profiles;

CREATE POLICY tailor_profiles_delete_own ON public.tailor_profiles
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─── Storage: bucket invoices-images — مجلد أول = معرف المستخدم ───
DROP POLICY IF EXISTS mastara_storage_invoices_insert_own ON storage.objects;
DROP POLICY IF EXISTS mastara_storage_invoices_select_own ON storage.objects;
DROP POLICY IF EXISTS mastara_storage_invoices_update_own ON storage.objects;
DROP POLICY IF EXISTS mastara_storage_invoices_delete_own ON storage.objects;

CREATE POLICY mastara_storage_invoices_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoices-images'
    AND (storage.foldername (name))[1] = auth.uid()::text
  );

CREATE POLICY mastara_storage_invoices_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices-images'
    AND (storage.foldername (name))[1] = auth.uid()::text
  );

CREATE POLICY mastara_storage_invoices_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'invoices-images'
    AND (storage.foldername (name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'invoices-images'
    AND (storage.foldername (name))[1] = auth.uid()::text
  );

CREATE POLICY mastara_storage_invoices_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoices-images'
    AND (storage.foldername (name))[1] = auth.uid()::text
  );
