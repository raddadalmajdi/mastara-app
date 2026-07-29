-- حقول مستخرجة من OCR (اسم المورد، التاريخ، المبلغ...) كـ JSON — اختيارية.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS extracted_fields jsonb;

COMMENT ON COLUMN public.invoices.extracted_fields IS 'OCR-parsed invoice metadata (supplier, date, amount, etc.)';
