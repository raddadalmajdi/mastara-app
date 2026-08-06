import { randomUUID } from 'crypto';
import { APP_NAME, APP_SITE_URL } from '@/lib/brand';
import { getAppPublicUrl } from '@/lib/supabase/env';

export type OtpEmailContext = 'signup' | 'login';

const DEFAULT_REPLY_TO = 'support@malaktout.com';
const DEFAULT_FROM_LOCAL_PART = 'code@malaktout.com';

/** اسم مرسل واضح — يظهر في صندوق الوارد ويُفضّل أن يطابق نطاقاً موثّقاً في Resend. */
export const OTP_SENDER_DISPLAY_NAME = `${APP_NAME} — رمز التحقق`;

export function getOtpSenderFromAddress(emailLocalPart = DEFAULT_FROM_LOCAL_PART): string {
  return `${OTP_SENDER_DISPLAY_NAME} <${emailLocalPart}>`;
}

/** عنوان Reply-To — يُفضّل صندوقاً يراقَب فعلياً. */
export function getResendReplyTo(): string {
  const raw =
    process.env.RESEND_REPLY_TO?.trim() ||
    process.env.RESEND_SUPPORT_EMAIL?.trim() ||
    DEFAULT_REPLY_TO;
  return raw;
}

export function getListUnsubscribeUrl(): string {
  const base = getAppPublicUrl(APP_SITE_URL).replace(/\/$/, '');
  return `${base}/api/email/list-unsubscribe`;
}

export function buildOtpEmailDeliverabilityHeaders(
  context: OtpEmailContext
): Record<string, string> {
  const unsubscribeUrl = getListUnsubscribeUrl();
  const replyTo = getResendReplyTo();
  const mailtoUnsubscribe = `mailto:${replyTo}?subject=${encodeURIComponent(
    `إلغاء رسائل ${APP_NAME} — ${context === 'signup' ? 'تفعيل' : 'دخول'}`
  )}`;

  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>, <${mailtoUnsubscribe}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    Precedence: 'auto',
    'X-Auto-Response-Suppress': 'All',
    'X-Entity-Ref-ID': randomUUID(),
    'X-Mailer': `${APP_NAME}-otp`,
    'X-Email-Type': context === 'signup' ? 'signup-verification' : 'login-otp',
  };
}

export function buildOtpPlainText(params: {
  heading: string;
  body: string;
  otp: string;
  footerNote: string;
}): string {
  const siteUrl = getAppPublicUrl(APP_SITE_URL);
  const replyTo = getResendReplyTo();

  return [
    params.heading,
    '',
    params.body,
    '',
    `رمز التحقق: ${params.otp}`,
    '',
    params.footerNote,
    '',
    '—',
    `${APP_NAME}`,
    siteUrl,
    '',
    `للاستفسار: ${replyTo}`,
  ].join('\n');
}
