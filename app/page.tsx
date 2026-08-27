'use client';

/** لوحة إيصالك — حاوية رئيسية تربط المصادقة، ملف المحل، والفواتير. */

import { useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { AuthBootScreen } from '@/components/auth/AuthBootScreen';
import { AuthScreen } from '@/components/home/AuthScreen';
import { CustomerContactSection } from '@/components/home/CustomerContactSection';
import { HomeHeader } from '@/components/home/HomeHeader';
import { InvoiceArchiveSection } from '@/components/home/InvoiceArchiveSection';
import { InvoiceLightbox } from '@/components/home/InvoiceLightbox';
import { ScannerFab } from '@/components/home/ScannerFab';
import { TailorProfileModal } from '@/components/home/TailorProfileModal';
import { WelcomeSuccessOverlay } from '@/components/home/WelcomeSuccessOverlay';
import { useOrganization } from '@/components/organization/OrganizationProvider';
import { useAppSession } from '@/hooks/home/useAppSession';
import { useAuthFlow } from '@/hooks/home/useAuthFlow';
import { useCustomerWorkspace } from '@/hooks/home/useCustomerWorkspace';
import { useTailorProfile } from '@/hooks/home/useTailorProfile';
import { isFirebaseConfigured } from '@/lib/firebase-auth-client';

const OpenCvDocumentScannerModal = dynamic(
  () =>
    import('@/components/scanner/OpenCvDocumentScannerModal').then((m) => m.OpenCvDocumentScannerModal),
  { ssr: false }
);

export default function Home() {
  const { organizationId, refreshOrganization } = useOrganization();
  const resetProfileRef = useRef<(() => void) | null>(null);

  const session = useAppSession({
    onSessionCleared: useCallback(() => {
      resetProfileRef.current?.();
    }, []),
  });

  const tailor = useTailorProfile({
    user: session.user,
    organizationId,
    authBootstrapping: session.authBootstrapping,
    setLoading: session.setLoading,
  });

  useEffect(() => {
    resetProfileRef.current = tailor.resetProfile;
  }, [tailor.resetProfile]);

  const auth = useAuthFlow({
    refreshOrganization,
    onVerified: () => session.setShowWelcomeSuccess(true),
  });

  const workspace = useCustomerWorkspace({
    user: session.user,
    organizationId,
  });

  const handleLogout = useCallback(async () => {
    await session.performLogout(false);
    auth.resetAuthForm();
  }, [session, auth]);

  const showAppBootScreen =
    Boolean(session.user) &&
    (session.loading || tailor.checkingTailor || session.authBootstrapping);

  if (showAppBootScreen) {
    return (
      <AuthBootScreen
        message={
          session.authBootstrapping
            ? 'جاري التحقق من جلسة الدخول...'
            : 'جاري تحميل بيانات حسابك...'
        }
      />
    );
  }

  if (!session.user && isFirebaseConfigured()) {
    return (
      <AuthScreen
        sessionCheckPending={session.sessionCheckPending}
        sessionFeedback={session.authFeedback}
        authPhase={auth.authPhase}
        email={auth.email}
        setEmail={auth.setEmail}
        password={auth.password}
        setPassword={auth.setPassword}
        isSignUp={auth.isSignUp}
        loginMethod={auth.loginMethod}
        setLoginMethod={auth.setLoginMethod}
        otpCode={auth.otpCode}
        setOtpCode={auth.setOtpCode}
        authFeedback={auth.authFeedback}
        setAuthFeedback={auth.setAuthFeedback}
        emailDuplicateError={auth.emailDuplicateError}
        setEmailDuplicateError={auth.setEmailDuplicateError}
        emailCheckPending={auth.emailCheckPending}
        authSubmitting={auth.authSubmitting}
        otpResendCooldown={auth.otpResendCooldown}
        devDeleteStatus={auth.devDeleteStatus}
        devDeleteLoading={auth.devDeleteLoading}
        switchAuthMode={auth.switchAuthMode}
        onSubmitAuth={(e) => void auth.handleAuth(e)}
        onVerifyOtp={(e) => void auth.handleVerifyOtp(e)}
        onResendOtp={() => void auth.handleResendOtp()}
        onBackFromConfirm={auth.resetAuthForm}
        onEnterGuest={session.enterGuestMode}
        onDevDelete={() => void auth.handleDevDeleteAuthUser()}
      />
    );
  }

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col bg-mistara-sand text-mistara-espresso"
      dir="rtl"
    >
      {session.showWelcomeSuccess && <WelcomeSuccessOverlay />}

      <HomeHeader
        menuRef={session.menuRef}
        showMenu={session.showMenu}
        setShowMenu={session.setShowMenu}
        userEmail={session.user?.email}
        tailorShopName={tailor.tailorShopName}
        isTailorRegistered={tailor.isTailorRegistered}
        tailorCountryCode={tailor.tailorCountryCode}
        tailorLocalPhone={tailor.tailorLocalPhone}
        tailorAvatarUrl={tailor.tailorAvatarUrl}
        pendingAvatarPreview={tailor.pendingAvatarPreview}
        hasPendingAvatar={tailor.hasPendingAvatar}
        savingAvatar={tailor.savingAvatar}
        avatarFeedback={tailor.avatarFeedback}
        onAvatarFilePick={(file) => void tailor.handleAvatarFilePick(file)}
        onSaveAvatar={() => void tailor.handleSaveAvatar()}
        onRemoveAvatar={tailor.handleRemoveAvatar}
        onDiscardPendingAvatar={tailor.handleDiscardPendingAvatar}
        onOpenSettings={() => {
          session.setShowMenu(false);
          tailor.setShowTailorProfileModal(true);
        }}
        onLogout={() => void handleLogout()}
      />

      <main className="dashboard-main">
        <CustomerContactSection
          customerLocalPhone={workspace.customerLocalPhone}
          customerCountryCode={workspace.customerCountryCode}
          customerDisplayName={workspace.customerDisplayName}
          onPhoneChange={workspace.handleCustomerPhoneInput}
          onCountryCodeChange={workspace.handleCountryCodeChange}
          onDisplayNameChange={workspace.setCustomerDisplayName}
          customerBookStatus={workspace.customerBookStatus}
          customerNameLocked={workspace.customerNameLocked}
          customerNameEditing={workspace.customerNameEditing}
          onStartNameEdit={() => {
            workspace.setCustomerNameEditing(true);
            workspace.setCustomerNameLocked(false);
          }}
          onSaveContact={() => void workspace.handleSaveCustomerContact()}
          isRefreshingInvoices={workspace.isRefreshingInvoices}
          customerInvoicesCount={workspace.customerInvoices.length}
          uploadSaveError={workspace.uploadSaveError}
          uploadSavePhase={workspace.uploadSavePhase}
        />

        <InvoiceArchiveSection
          customerLocalPhone={workspace.customerLocalPhone}
          customerInvoices={workspace.customerInvoices}
          whatsappMessages={workspace.whatsappMessages}
          onWhatsappMessageChange={(invoiceId, message) =>
            workspace.setWhatsappMessages({ ...workspace.whatsappMessages, [invoiceId]: message })
          }
          onOpenImage={workspace.setActiveImageIndex}
          onSendWhatsApp={workspace.sendViaWhatsApp}
          onDownloadPdf={(invoice, number) => void workspace.handleDownloadInvoicePdf(invoice, number)}
          onPrintPdf={(invoice, number) => void workspace.handlePrintInvoicePdf(invoice, number)}
          exportingPdfId={workspace.exportingPdfId}
        />
      </main>

      <ScannerFab
        visible={workspace.customerLocalPhone.trim().length >= 1}
        uploadSavePhase={workspace.uploadSavePhase}
        uploadSaveError={workspace.uploadSaveError}
        isUploading={workspace.isUploading}
        onOpenScanner={workspace.handleOpenOpenCvScanner}
      />

      {workspace.showOpenCvScanner && (
        <OpenCvDocumentScannerModal
          onClose={() => workspace.setShowOpenCvScanner(false)}
          onConfirm={workspace.handleDocumentCaptured}
        />
      )}

      <TailorProfileModal
        open={tailor.showTailorProfileModal}
        onClose={() => {
          tailor.setShowTailorProfileModal(false);
          tailor.setSettingsFeedback(null);
        }}
        tailorShopName={tailor.tailorShopName}
        onShopNameChange={tailor.setTailorShopName}
        tailorLocalPhone={tailor.tailorLocalPhone}
        onLocalPhoneChange={tailor.setTailorLocalPhone}
        tailorCountryCode={tailor.tailorCountryCode}
        onCountryCodeChange={tailor.setTailorCountryCode}
        cloudNotes={tailor.cloudNotes}
        onCloudNotesChange={tailor.setCloudNotes}
        tailorAvatarUrl={tailor.tailorAvatarUrl}
        pendingAvatarPreview={tailor.pendingAvatarPreview}
        hasPendingAvatar={tailor.hasPendingAvatar}
        savingAvatar={tailor.savingAvatar}
        avatarFeedback={tailor.avatarFeedback}
        onAvatarFilePick={(file) => void tailor.handleAvatarFilePick(file)}
        onSaveAvatar={() => void tailor.handleSaveAvatar()}
        onRemoveAvatar={tailor.handleRemoveAvatar}
        onDiscardPendingAvatar={tailor.handleDiscardPendingAvatar}
        settingsFeedback={tailor.settingsFeedback}
        savingSettings={tailor.savingSettings}
        onSubmit={(e) => void tailor.handleSaveTailorProfile(e)}
      />

      <InvoiceLightbox
        activeIndex={workspace.activeImageIndex}
        invoices={workspace.customerInvoices}
        exportingPdfId={workspace.exportingPdfId}
        onClose={() => workspace.setActiveImageIndex(null)}
        onNavigate={workspace.setActiveImageIndex}
        onDownloadPdf={(invoice, number) => void workspace.handleDownloadInvoicePdf(invoice, number)}
        onPrintPdf={(invoice, number) => void workspace.handlePrintInvoicePdf(invoice, number)}
      />
    </div>
  );
}
