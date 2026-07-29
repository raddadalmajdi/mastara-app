-- رابط ملف PDF الممسوح (المصدر الرسمي) — صورة JPEG تبقى في image_url للمعاينة المصغّرة.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS pdf_url text;

COMMENT ON COLUMN public.invoices.pdf_url IS 'Public URL of scanned document PDF in Supabase Storage';
