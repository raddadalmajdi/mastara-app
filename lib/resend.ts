import { Resend } from 'resend';
import { normalizeOtpCode } from '@/lib/otp-normalize';
import {
  logResendApiFailure,
  logResendApiSuccess,
  logResendEnvDiagnostics,
} from '@/lib/resend-diagnostics';
import { logServerException } from '@/lib/server-error-log';
import {
  buildOtpEmailDeliverabilityHeaders,
  buildOtpPlainText,
  getOtpSenderFromAddress,
  getResendReplyTo,
  OTP_SENDER_DISPLAY_NAME,
  type OtpEmailContext,
} from '@/lib/resend-email-deliverability';
import { OTP_LENGTH_AR } from '@/lib/otp-config';
import { APP_NAME, APP_TAGLINE } from '@/lib/brand';

/** المرسل الرسمي المعتمد للمشروع — اسم واضح + نطاق موثّق. */
export const DEFAULT_RESEND_FROM = getOtpSenderFromAddress();

/**
 * نطاق Resend التجريبي — يعمل دائماً بدون توثيق DNS مسبق.
 * يُستخدم فقط كخطة احتياط تلقائية إن فشل الإرسال من النطاق الرسمي
 * (مثلاً قبل اكتمال توثيق malaktout.com في لوحة Resend)، حتى لا يتعطل
 * تسجيل المستخدمين بالكامل بسبب إعداد DNS ناقص.
 */
export const FALLBACK_RESEND_FROM = `${OTP_SENDER_DISPLAY_NAME} (تجريبي) <onboarding@resend.dev>`;

export function isResendConfigured(): boolean {
  const key = process.env.RESEND_API_KEY?.trim();
  return Boolean(key && key.startsWith('re_'));
}

/** يُنسّق عنوان المرسل لصيغة Resend: "Name <email@domain.com>". */
export function normalizeResendFromAddress(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_RESEND_FROM;
  if (trimmed.includes('<') && trimmed.includes('>')) return trimmed;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return getOtpSenderFromAddress(trimmed);
  }
  return DEFAULT_RESEND_FROM;
}

export function getResendFromAddress(): string {
  const raw =
    process.env.RESEND_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    DEFAULT_RESEND_FROM;
  return normalizeResendFromAddress(raw);
}

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY (server-only). أضِفه في .env.local / Vercel.');
  }
  if (!apiKey.startsWith('re_')) {
    throw new Error(
      `RESEND_API_KEY لا يبدو مفتاحاً صالحاً (يجب أن يبدأ بـ "re_"). الطول الحالي: ${apiKey.length}.`
    );
  }
  return new Resend(apiKey);
}

type ResendSendError = { message?: string; name?: string; statusCode?: number | null };

/** يحدّد إن كان فشل الإرسال مرتبطاً بالنطاق/المرسل ويستحق تجربة onboarding@resend.dev. */
export function shouldFallbackResendFrom(error: ResendSendError): boolean {
  const m = (error.message ?? '').toLowerCase();
  const name = (error.name ?? '').toLowerCase();
  const status = error.statusCode ?? 0;

  if (status === 403 || status === 422) return true;

  return (
    isDomainVerificationError(m) ||
    name.includes('validation') ||
    m.includes('invalid from') ||
    m.includes('invalid `from`') ||
    m.includes('not authorized') ||
    m.includes('unauthorized') ||
    m.includes('rate limit') ||
    m.includes('too many requests')
  );
}

function isDomainVerificationError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('domain is not verified') ||
    m.includes('domain not verified') ||
    m.includes('verify a domain') ||
    m.includes('you can only send testing emails') ||
    m.includes('only send testing emails') ||
    m.includes('testing emails to your own') ||
    (m.includes('domain') && m.includes('not authorized')) ||
    (m.includes('from') && m.includes('not allowed')) ||
    (m.includes('from') && m.includes('invalid'))
  );
}

export type SendSignupVerificationParams = {
  to: string;
  otp: string;
};

function buildOtpEmailHtml(params: {
  heading: string;
  body: string;
  otp: string;
  footerNote: string;
}): string {
  const { heading, body, otp, footerNote } = params;
  const otpFontSize = '36px';
  const otpLetterSpacing = '10px';
  return `
    <div dir="rtl" style="background:#f1f5f9;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Tahoma,Arial,sans-serif;">
      <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 20px 50px -20px rgba(15,23,42,0.25);">
        <div style="background:linear-gradient(135deg,#003B73 0%,#0073CF 100%);padding:28px 32px;text-align:center;">
          <p style="margin:0;color:#FFFFFF;font-size:15px;letter-spacing:1px;font-weight:800;">${APP_NAME}</p>
        </div>
        <div style="padding:36px 32px 28px;">
          <h1 style="margin:0 0 10px;font-size:19px;color:#0f172a;font-weight:800;">${heading}</h1>
          <p style="margin:0 0 26px;color:#64748b;font-size:13.5px;line-height:1.8;">
            ${body}
          </p>
          <p style="margin:0 0 20px;color:#94a3b8;font-size:11px;line-height:1.6;">
            رسالة معاملاتية من ${APP_NAME} — لا تُشارك رمزك مع أي شخص.
          </p>
          <div style="background:#f0fdfa;border:1.5px dashed #22d3ee;border-radius:18px;padding:22px 12px;text-align:center;margin-bottom:26px;">
            <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#0e7490;letter-spacing:0.5px;">رمز التحقق — ${OTP_LENGTH_AR}</p>
            <span dir="ltr" style="display:inline-block;font-size:${otpFontSize};font-weight:800;letter-spacing:${otpLetterSpacing};color:#0e7490;font-family:'Courier New',Courier,monospace;unicode-bidi:embed;word-break:keep-all;white-space:nowrap;">${otp}</span>
          </div>
          <p style="margin:0;color:#94a3b8;font-size:11.5px;line-height:1.7;">
            ${footerNote}
          </p>
        </div>
        <div style="background:#f8fafc;padding:14px 32px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:10.5px;">© ${APP_NAME} — ${APP_TAGLINE}</p>
        </div>
      </div>
    </div>
  `;
}

export type { OtpEmailContext as SendAuthOtpEmailContext } from '@/lib/resend-email-deliverability';

/**
 * إرسال بريد OTP عبر Resend API.
 * يسجّل تفاصيل الفشل/النجاح في سجلات Vercel ويجرب onboarding@resend.dev تلقائياً عند فشل النطاق الرسمي.
 */
async function sendAuthOtpEmail(
  params: {
    to: string;
    otp: string;
    subject: string;
    heading: string;
    body: string;
    footerNote: string;
  },
  context: OtpEmailContext
): Promise<{ id: string | undefined; usedFallbackFrom: boolean }> {
  logResendEnvDiagnostics(`sendAuthOtpEmail:${context}`);

  const normalizedOtp = normalizeOtpCode(params.otp);
  if (!normalizedOtp) {
    console.error(`[Resend] ${context} — INTERNAL_INVALID_OTP`, {
      to: params.to,
      rawOtpLength: String(params.otp ?? '').replace(/\D/g, '').length,
    });
    throw new Error('INTERNAL_INVALID_OTP');
  }

  let resend: Resend;
  try {
    resend = getResendClient();
  } catch (clientError) {
    logServerException(`Resend/getResendClient/sendAuthOtpEmail:${context}`, clientError, {
      to: params.to,
    });
    throw clientError;
  }
  const primaryFrom = getResendFromAddress();
  const replyTo = getResendReplyTo();
  const headers = buildOtpEmailDeliverabilityHeaders(context);
  const text = buildOtpPlainText({
    heading: params.heading,
    body: params.body,
    otp: normalizedOtp,
    footerNote: params.footerNote,
  });
  const html = buildOtpEmailHtml({
    heading: params.heading,
    body: params.body,
    otp: normalizedOtp,
    footerNote: params.footerNote,
  });

  const attemptSend = async (from: string, attempt: 'primary' | 'fallback') => {
    try {
      const result = await resend.emails.send({
        from,
        to: params.to,
        replyTo,
        subject: params.subject,
        html,
        text,
        headers,
      });

      if (result.error) {
        logResendApiFailure(`sendAuthOtpEmail:${context}`, {
          to: params.to,
          from,
          error: result.error,
          attempt,
        });
      }

      return result;
    } catch (networkError) {
      logServerException(`Resend/network/sendAuthOtpEmail:${context}`, networkError, {
        to: params.to,
        from,
        attempt,
      });
      const detail =
        networkError instanceof Error ? networkError.message : 'خطأ شبكة غير معروف';
      logResendApiFailure(`sendAuthOtpEmail:${context}`, {
        to: params.to,
        from,
        error: `Network: ${detail}`,
        attempt,
      });
      throw new Error(`تعذّر الاتصال بـ Resend API (من ${from}): ${detail}`);
    }
  };

  const primaryResult = await attemptSend(primaryFrom, 'primary');

  if (!primaryResult.error) {
    logResendApiSuccess(`sendAuthOtpEmail:${context}`, {
      to: params.to,
      from: primaryFrom,
      emailId: primaryResult.data?.id,
      usedFallbackFrom: false,
    });
    return { id: primaryResult.data?.id, usedFallbackFrom: false };
  }

  const primaryError = primaryResult.error;
  const primaryMessage = primaryError.message || 'Resend API فشل في إرسال البريد.';

  const canFallback =
    primaryFrom !== FALLBACK_RESEND_FROM && shouldFallbackResendFrom(primaryError);

  if (!canFallback) {
    logServerException(`Resend/no-fallback/sendAuthOtpEmail:${context}`, primaryError, {
      to: params.to,
      from: primaryFrom,
      primaryMessage,
    });
    console.error(`[Resend] ${context} — no fallback (non-domain error)`, {
      to: params.to,
      from: primaryFrom,
      message: primaryMessage,
      name: primaryError.name,
      statusCode: primaryError.statusCode,
    });
    throw new Error(primaryMessage);
  }

  console.warn(`[Resend] ${context} — retrying with fallback sender`, {
    primaryFrom,
    fallbackFrom: FALLBACK_RESEND_FROM,
    primaryError: primaryMessage,
    note: 'onboarding@resend.dev may only deliver to your Resend account email until malaktout.com is verified.',
  });

  const fallbackResult = await attemptSend(FALLBACK_RESEND_FROM, 'fallback');

  if (fallbackResult.error) {
    const fallbackMessage = fallbackResult.error.message || primaryMessage;
    logServerException(`Resend/fallback-failed/sendAuthOtpEmail:${context}`, fallbackResult.error, {
      to: params.to,
      primaryFrom,
      fallbackFrom: FALLBACK_RESEND_FROM,
      primaryError: primaryMessage,
      fallbackError: fallbackMessage,
    });
    console.error(`[Resend] ${context} — fallback also failed`, {
      to: params.to,
      fallbackFrom: FALLBACK_RESEND_FROM,
      primaryError: primaryMessage,
      fallbackError: fallbackMessage,
    });
    throw new Error(
      `تعذّر إرسال بريد التحقق. النطاق الرسمي (${primaryFrom}) فشل: "${primaryMessage}". ` +
        `الاحتياطي (${FALLBACK_RESEND_FROM}) فشل أيضاً: "${fallbackMessage}". ` +
        'راجع Resend Dashboard → Domains → malaktout.com وRESEND_API_KEY في Vercel.'
    );
  }

  logResendApiSuccess(`sendAuthOtpEmail:${context}`, {
    to: params.to,
    from: FALLBACK_RESEND_FROM,
    emailId: fallbackResult.data?.id,
    usedFallbackFrom: true,
  });

  return { id: fallbackResult.data?.id, usedFallbackFrom: true };
}

export async function sendSignupVerificationEmail(
  params: SendSignupVerificationParams
): Promise<{ id: string | undefined; usedFallbackFrom: boolean }> {
  return sendAuthOtpEmail(
    {
      to: params.to,
      otp: params.otp,
      subject: `رمز تفعيل حسابك — ${APP_NAME}`,
      heading: 'رمز تفعيل حسابك',
      body: `مرحباً بك! استخدم الرمز التالي المكوّن من ${OTP_LENGTH_AR} لإتمام تفعيل حسابك. الرمز صالح لفترة محدودة فقط.`,
      footerNote:
        'لم تطلب إنشاء هذا الحساب؟ تجاهل هذه الرسالة بأمان — لن يُفعَّل أي شيء بدون إدخال هذا الرمز.',
    },
    'signup'
  );
}

export type SendLoginOtpParams = {
  to: string;
  otp: string;
};

export async function sendLoginOtpEmail(
  params: SendLoginOtpParams
): Promise<{ id: string | undefined; usedFallbackFrom: boolean }> {
  return sendAuthOtpEmail(
    {
      to: params.to,
      otp: params.otp,
      subject: `رمز تسجيل الدخول — ${APP_NAME}`,
      heading: 'رمز تسجيل الدخول',
      body: `استخدم الرمز التالي المكوّن من ${OTP_LENGTH_AR} لتسجيل الدخول إلى حسابك. الرمز صالح لفترة محدودة فقط.`,
      footerNote:
        'لم تطلب تسجيل الدخول؟ تجاهل هذه الرسالة بأمان — لن يُمنح أي وصول بدون إدخال هذا الرمز.',
    },
    'login'
  );
}
