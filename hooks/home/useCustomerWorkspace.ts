'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentScanResult } from '@/lib/document-scanner/scan-result';
import type { InvoiceSaveUiPhase } from '@/components/invoices/InvoiceSaveProgressRing';
import {
  FULL_PHONE_LOCAL_LENGTH,
  INVOICE_SEARCH_DEBOUNCE_MS,
} from '@/lib/home/constants';
import { searchInvoicesInstant } from '@/lib/home/invoice-local-search';
import type { AppUser, CustomerBookStatus, CustomerInvoice } from '@/lib/home/types';
import { appUserId } from '@/lib/home/types';
import { blobToDataUrl, buildInvoicePdfLabel } from '@/lib/home/invoice-helpers';
import { isFirebaseConfigured } from '@/lib/firebase-auth-client';
import {
  fetchInvoicesByCustomerPhone,
  fetchInvoicesForUser,
  saveScannedInvoiceWithCustomer,
  invoiceShareDocumentUrl,
} from '@/lib/upload-scanned-invoice';
import {
  isCustomerNameLookupReady,
  isCustomerPhoneSearchable,
  lookupTailorCustomerByPhone,
  lookupTailorCustomerByPhoneSync,
  normalizeStoredPhone,
  phoneMatchVariants,
  phonesMatch,
  upsertTailorCustomer,
} from '@/lib/tailor-customers';

type UseCustomerWorkspaceOptions = {
  user: AppUser | null;
  organizationId: string | null;
};

export function useCustomerWorkspace({ user, organizationId }: UseCustomerWorkspaceOptions) {
  const [customerCountryCode, setCustomerCountryCode] = useState('965');
  const [customerLocalPhone, setCustomerLocalPhone] = useState('');
  const [customerDisplayName, setCustomerDisplayName] = useState('');
  const [customerBookStatus, setCustomerBookStatus] = useState<CustomerBookStatus>('idle');
  const [customerNameLocked, setCustomerNameLocked] = useState(false);
  const [customerNameEditing, setCustomerNameEditing] = useState(false);
  const [customerInvoices, setCustomerInvoices] = useState<CustomerInvoice[]>([]);
  const [isRefreshingInvoices, setIsRefreshingInvoices] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSavePhase, setUploadSavePhase] = useState<InvoiceSaveUiPhase>('idle');
  const [uploadSaveError, setUploadSaveError] = useState<string | null>(null);
  const [showOpenCvScanner, setShowOpenCvScanner] = useState(false);
  const [whatsappMessages, setWhatsappMessages] = useState<Record<string, string>>({});
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

  const invoiceSearchTimerRef = useRef<number | null>(null);
  const invoiceSearchSeqRef = useRef(0);
  const customerLookupSeqRef = useRef(0);
  const customerDisplayNameRef = useRef(customerDisplayName);

  useEffect(() => {
    customerDisplayNameRef.current = customerDisplayName;
  }, [customerDisplayName]);

  useEffect(() => {
    return () => {
      if (invoiceSearchTimerRef.current !== null) {
        window.clearTimeout(invoiceSearchTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!user || !isFirebaseConfigured()) return;
    const userId = appUserId(user);
    void fetchInvoicesForUser({
      userId,
      organizationId,
      allowedOrganizationId: organizationId,
    }).catch(() => undefined);
  }, [user, organizationId]);

  const applyInvoiceSearchResults = useCallback((filtered: CustomerInvoice[]) => {
    setCustomerInvoices(filtered);
    const initialMessages: Record<string, string> = {};
    filtered.forEach((inv) => {
      initialMessages[inv.id] = `تم! شكراً لتعاملك معنا، نسعد بخدمتك. رابط مستندك (PDF): ${invoiceShareDocumentUrl(inv)}`;
    });
    setWhatsappMessages(initialMessages);
  }, []);

  const runInstantInvoiceSearch = useCallback(
    (localPhone: string, cCode: string) => {
      if (!isCustomerPhoneSearchable(localPhone)) {
        setCustomerInvoices([]);
        setWhatsappMessages({});
        return;
      }

      const variants = phoneMatchVariants(cCode, localPhone);
      const userId = user ? appUserId(user) : null;
      const instant = searchInvoicesInstant({
        userId,
        organizationId,
        variants,
        fullPhone: normalizeStoredPhone(`${cCode}${localPhone}`),
      });
      applyInvoiceSearchResults(instant);
    },
    [applyInvoiceSearchResults, organizationId, user]
  );

  const refreshInvoicesFromCloud = useCallback(
    async (localPhone: string, cCode: string) => {
      if (!isCustomerPhoneSearchable(localPhone)) return;

      const variants = phoneMatchVariants(cCode, localPhone);
      const searchSeq = ++invoiceSearchSeqRef.current;
      setIsRefreshingInvoices(true);

      try {
        if (!isFirebaseConfigured()) {
          return;
        }

        if (!user) {
          return;
        }

        const userId = appUserId(user);
        const localDigits = localPhone.replace(/\D/g, '');
        let data: CustomerInvoice[];

        if (localDigits.length >= FULL_PHONE_LOCAL_LENGTH) {
          const fullPhone = normalizeStoredPhone(`${cCode}${localPhone}`);
          data = await fetchInvoicesByCustomerPhone({
            userId,
            customerPhone: fullPhone,
            organizationId,
            allowedOrganizationId: organizationId,
          });

          if (data.length === 0) {
            for (const variant of variants) {
              const normalized = normalizeStoredPhone(variant);
              if (!normalized || normalized === fullPhone) continue;
              const alt = await fetchInvoicesByCustomerPhone({
                userId,
                customerPhone: normalized,
                organizationId,
                allowedOrganizationId: organizationId,
              });
              if (alt.length > 0) {
                data = alt;
                break;
              }
            }
          }
        } else {
          const all = await fetchInvoicesForUser({
            userId,
            organizationId,
            allowedOrganizationId: organizationId,
          });
          data = all.filter((inv) =>
            variants.some((variant) => phonesMatch(String(inv.customer_phone ?? ''), variant))
          );
        }

        if (searchSeq !== invoiceSearchSeqRef.current) return;
        applyInvoiceSearchResults(data);
      } catch (searchErr) {
        if (searchSeq !== invoiceSearchSeqRef.current) return;
        console.warn('[invoices] cloud refresh failed', searchErr);
      } finally {
        if (searchSeq === invoiceSearchSeqRef.current) {
          setIsRefreshingInvoices(false);
        }
      }
    },
    [applyInvoiceSearchResults, organizationId, user]
  );

  const scheduleInvoiceSearch = useCallback(
    (localPhone: string, cCode: string) => {
      runInstantInvoiceSearch(localPhone, cCode);

      if (invoiceSearchTimerRef.current !== null) {
        window.clearTimeout(invoiceSearchTimerRef.current);
      }

      if (!isCustomerPhoneSearchable(localPhone) || !isFirebaseConfigured() || !user) {
        setIsRefreshingInvoices(false);
        return;
      }

      invoiceSearchTimerRef.current = window.setTimeout(() => {
        void refreshInvoicesFromCloud(localPhone, cCode);
      }, INVOICE_SEARCH_DEBOUNCE_MS);
    },
    [refreshInvoicesFromCloud, runInstantInvoiceSearch, user]
  );

  const applyDirectoryHit = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCustomerDisplayName(trimmed);
    setCustomerBookStatus('known');
    setCustomerNameLocked(true);
    setCustomerNameEditing(false);
  }, []);

  const markDirectoryAsNewIfEditable = useCallback(() => {
    if (customerDisplayNameRef.current.trim()) {
      setCustomerBookStatus('new');
      setCustomerNameLocked(false);
      setCustomerNameEditing(false);
    }
  }, []);

  const runCustomerDirectoryLookup = useCallback(
    (localPhone: string, cCode: string) => {
      if (!isCustomerNameLookupReady(localPhone)) {
        customerLookupSeqRef.current += 1;
        if (!isCustomerPhoneSearchable(localPhone)) {
          setCustomerBookStatus('idle');
        }
        return;
      }

      const tailorId = user ? appUserId(user) : 'guest-local-user';
      const fullPhone = `${cCode}${localPhone}`;
      const instantHit = lookupTailorCustomerByPhoneSync(tailorId, fullPhone, organizationId);

      if (instantHit?.customer_name?.trim()) {
        applyDirectoryHit(instantHit.customer_name);
      } else {
        markDirectoryAsNewIfEditable();
      }

      const lookupSeq = ++customerLookupSeqRef.current;
      void (async () => {
        try {
          const hit = await lookupTailorCustomerByPhone(tailorId, fullPhone, organizationId);
          if (lookupSeq !== customerLookupSeqRef.current) return;
          if (hit?.customer_name?.trim()) {
            applyDirectoryHit(hit.customer_name);
          } else if (!instantHit) {
            markDirectoryAsNewIfEditable();
          }
        } catch (lookupError) {
          if (lookupSeq !== customerLookupSeqRef.current) return;
          if (process.env.NODE_ENV === 'development') {
            console.warn('[tailor_customers] lookup failed', lookupError);
          }
          if (!instantHit) markDirectoryAsNewIfEditable();
        }
      })();
    },
    [applyDirectoryHit, markDirectoryAsNewIfEditable, organizationId, user]
  );

  const handleCustomerPhoneInput = (val: string) => {
    const cleanVal = normalizeStoredPhone(val);
    setCustomerLocalPhone(cleanVal);

    if (!isCustomerPhoneSearchable(cleanVal)) {
      setCustomerDisplayName('');
      setCustomerBookStatus('idle');
      setCustomerNameLocked(false);
      setCustomerNameEditing(false);
      setCustomerInvoices([]);
      setWhatsappMessages({});
      setIsRefreshingInvoices(false);
      invoiceSearchSeqRef.current += 1;
      customerLookupSeqRef.current += 1;
      return;
    }

    if (!isCustomerNameLookupReady(cleanVal)) {
      setCustomerBookStatus('idle');
      if (customerNameLocked) {
        setCustomerDisplayName('');
        setCustomerNameLocked(false);
        setCustomerNameEditing(false);
      }
    }

    scheduleInvoiceSearch(cleanVal, customerCountryCode);
    runCustomerDirectoryLookup(cleanVal, customerCountryCode);
  };

  const handleCountryCodeChange = (newCode: string) => {
    setCustomerCountryCode(newCode);
    if (!isCustomerPhoneSearchable(customerLocalPhone)) {
      setCustomerDisplayName('');
      setCustomerBookStatus('idle');
      setCustomerNameLocked(false);
      setCustomerNameEditing(false);
      setCustomerInvoices([]);
      setWhatsappMessages({});
      setIsRefreshingInvoices(false);
      return;
    }

    scheduleInvoiceSearch(customerLocalPhone, newCode);
    runCustomerDirectoryLookup(customerLocalPhone, newCode);
  };

  const handleDisplayNameChange = (value: string) => {
    setCustomerDisplayName(value);
    if (
      value.trim() &&
      isCustomerPhoneSearchable(customerLocalPhone) &&
      !customerNameLocked
    ) {
      setCustomerBookStatus('new');
    }
  };

  const handleSaveCustomerContact = async () => {
    const localPhone = customerLocalPhone.trim();
    const name = customerDisplayName.trim();
    if (!localPhone) {
      setUploadSaveError('أدخل رقم جوال العميل.');
      window.setTimeout(() => setUploadSaveError(null), 3500);
      return;
    }
    if (!name) {
      setUploadSaveError('أدخل اسم العميل.');
      window.setTimeout(() => setUploadSaveError(null), 3500);
      return;
    }
    if (!user) {
      setUploadSaveError('يجب تسجيل الدخول لحفظ بيانات العميل.');
      window.setTimeout(() => setUploadSaveError(null), 3500);
      return;
    }
    try {
      await upsertTailorCustomer(
        appUserId(user),
        `${customerCountryCode}${localPhone}`,
        name,
        organizationId
      );
      setCustomerBookStatus('known');
      setCustomerNameLocked(true);
      setCustomerNameEditing(false);
      setUploadSaveError(null);
    } catch (err) {
      setUploadSaveError(err instanceof Error ? err.message : 'تعذّر حفظ بيانات العميل.');
      window.setTimeout(() => setUploadSaveError(null), 4000);
    }
  };

  const handleOpenOpenCvScanner = () => {
    if (!customerLocalPhone.trim()) return;
    if (!customerDisplayName.trim()) {
      setUploadSaveError('أدخل اسم العميل مع رقم الجوال قبل التصوير.');
      window.setTimeout(() => setUploadSaveError(null), 3500);
      return;
    }
    setUploadSaveError(null);
    setShowOpenCvScanner(true);
  };

  const handleDocumentCaptured = async ({ jpegBlob, pdfBlob }: DocumentScanResult) => {
    if (!customerLocalPhone.trim()) {
      throw new Error('يرجى كتابة رقم جوال العميل أولاً.');
    }

    const localPhone = customerLocalPhone;
    const fullCustomerPhone = normalizeStoredPhone(`${customerCountryCode}${localPhone}`);

    let nameToSave = customerDisplayName.trim();
    if (!nameToSave) {
      const syncHit = lookupTailorCustomerByPhoneSync(
        user ? appUserId(user) : 'guest-local-user',
        fullCustomerPhone,
        organizationId
      );
      if (syncHit?.customer_name) {
        nameToSave = syncHit.customer_name;
        setCustomerDisplayName(syncHit.customer_name);
        setCustomerBookStatus('known');
      } else {
        try {
          const hit = await lookupTailorCustomerByPhone(
            user ? appUserId(user) : 'guest-local-user',
            fullCustomerPhone,
            organizationId
          );
          if (hit) {
            nameToSave = hit.customer_name;
            setCustomerDisplayName(hit.customer_name);
            setCustomerBookStatus('known');
          }
        } catch {
          /* ignore lookup errors before save */
        }
      }
    }
    if (!nameToSave) {
      throw new Error('يرجى إدخال اسم العميل لحفظه في قائمة عملائك.');
    }

    setUploadSavePhase('preparing');
    setUploadSaveError(null);
    setIsUploading(true);

    try {
      if (!isFirebaseConfigured()) {
        setUploadSavePhase('uploading');
        const imageUrl = await blobToDataUrl(jpegBlob);
        const pdfUrl = await blobToDataUrl(pdfBlob);

        await upsertTailorCustomer(
          user ? appUserId(user) : 'guest-local-user',
          fullCustomerPhone,
          nameToSave,
          organizationId
        );

        const newInvoice: CustomerInvoice = {
          id: 'local-' + Date.now(),
          customer_phone: fullCustomerPhone,
          image_url: imageUrl,
          pdf_url: pdfUrl,
          created_at: new Date().toISOString(),
        };

        const savedInvoices = JSON.parse(localStorage.getItem('mistarh_local_invoices') || '[]');
        const updatedInvoices = [newInvoice, ...savedInvoices];
        try {
          localStorage.setItem('mistarh_local_invoices', JSON.stringify(updatedInvoices));
        } catch (storageErr) {
          const name = storageErr instanceof DOMException ? storageErr.name : '';
          if (name === 'QuotaExceededError') {
            throw new Error(
              'حجم المستند كبير جداً للحفظ المحلي. سجّل الدخول لحفظ المستندات في السحابة.'
            );
          }
          throw storageErr;
        }

        runInstantInvoiceSearch(localPhone, customerCountryCode);
        void refreshInvoicesFromCloud(localPhone, customerCountryCode);
        setUploadSavePhase('success');
        setShowOpenCvScanner(false);
        window.setTimeout(() => setUploadSavePhase('idle'), 2800);
      } else {
        if (!user) {
          throw new Error('يجب تسجيل الدخول لحفظ الفاتورة في السحابة.');
        }
        const userId = appUserId(user);
        setUploadSavePhase('uploading');

        await saveScannedInvoiceWithCustomer({
          userId,
          customerPhone: fullCustomerPhone,
          customerName: nameToSave,
          organizationId,
          allowedOrganizationId: organizationId,
          jpegBlob,
          pdfBlob,
        });

        setCustomerBookStatus('known');
        setCustomerNameLocked(true);

        runInstantInvoiceSearch(localPhone, customerCountryCode);
        void refreshInvoicesFromCloud(localPhone, customerCountryCode);
        setUploadSavePhase('success');
        setShowOpenCvScanner(false);
        window.setTimeout(() => setUploadSavePhase('idle'), 2800);
      }
    } catch (saveErr) {
      const msg = saveErr instanceof Error ? saveErr.message : 'تعذّر حفظ الفاتورة.';
      setUploadSaveError(msg);
      setUploadSavePhase('error');
      window.setTimeout(() => {
        setUploadSavePhase('idle');
        setUploadSaveError(null);
      }, 6000);
      throw saveErr;
    } finally {
      setIsUploading(false);
    }
  };

  const sendViaWhatsApp = (fullPhone: string, invoiceId: string) => {
    const cleanPhone = fullPhone.replace(/\D/g, '');
    const messageText = whatsappMessages[invoiceId] || 'شكراً لتعاملك معنا!';
    const encodedMessage = encodeURIComponent(messageText);
    window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`, '_blank');
  };

  const handleDownloadInvoicePdf = async (invoice: CustomerInvoice, invoiceNumber: number) => {
    if ((!invoice?.image_url && !invoice?.pdf_url) || exportingPdfId) return;
    setExportingPdfId(invoice.id);
    try {
      const { fileName, meta } = buildInvoicePdfLabel(invoice, invoiceNumber);
      const pdf = await import('@/lib/pdf-export');
      if (invoice.pdf_url) {
        await pdf.downloadStoredPdf(invoice.pdf_url, fileName);
        return;
      }
      await pdf.downloadInvoiceAsPdf(invoice.image_url, fileName, meta);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'خطأ غير متوقع';
      alert(`تعذّر تنزيل PDF: ${message}`);
    } finally {
      setExportingPdfId(null);
    }
  };

  const handlePrintInvoicePdf = async (invoice: CustomerInvoice, invoiceNumber: number) => {
    if ((!invoice?.image_url && !invoice?.pdf_url) || exportingPdfId) return;
    setExportingPdfId(invoice.id);
    try {
      const pdf = await import('@/lib/pdf-export');
      if (invoice.pdf_url) {
        pdf.openStoredPdfForPrint(invoice.pdf_url);
        return;
      }
      const { meta } = buildInvoicePdfLabel(invoice, invoiceNumber);
      await pdf.openInvoicePdfForPrint(invoice.image_url, meta);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'خطأ غير متوقع';
      alert(`تعذّر تجهيز معاينة الطباعة: ${message}`);
    } finally {
      setExportingPdfId(null);
    }
  };

  return {
    customerCountryCode,
    customerLocalPhone,
    customerDisplayName,
    setCustomerDisplayName: handleDisplayNameChange,
    customerBookStatus,
    customerNameLocked,
    customerNameEditing,
    setCustomerNameEditing,
    setCustomerNameLocked,
    customerInvoices,
    isRefreshingInvoices,
    isUploading,
    uploadSavePhase,
    uploadSaveError,
    showOpenCvScanner,
    setShowOpenCvScanner,
    whatsappMessages,
    setWhatsappMessages,
    activeImageIndex,
    setActiveImageIndex,
    exportingPdfId,
    handleCustomerPhoneInput,
    handleCountryCodeChange,
    handleSaveCustomerContact,
    handleOpenOpenCvScanner,
    handleDocumentCaptured,
    sendViaWhatsApp,
    handleDownloadInvoicePdf,
    handlePrintInvoicePdf,
  };
}
