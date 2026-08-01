import { Resend } from 'resend';
import { extractSupabaseEmailOtp } from '@/lib/supabase-email-otp';
import { OTP_CODE_LENGTH, OTP_LENGTH_AR } from '@/lib/otp-config';
import { APP_NAME, APP_TAGLINE } from '@/lib/brand';

/** المرسل الرسمي المعتمد للمشروع. */
export const DEFAULT_RESEND_FROM = `${APP_NAME} <code@malaktout.com>`;

/**
 * نطاق Resend التجريبي — يعمل دائماً بدون توثيق DNS مسبق.
 * يُستخدم فقط كخطة احتياط تلقائية إن فشل الإرسال من النطاق الرسمي
 * (مثلاً قبل اكتمال توثيق malaktout.com في لوحة Resend)، حتى لا يتعطل
 * تسجيل المستخدمين بالكامل بسبب إعداد DNS ناقص.
 */
const FALLBACK_RESEND_FROM = `${APP_NAME} (تجريبي) <onboarding@resend.dev>`;

export function isResendConfigured(): boolean {
  const key = process.env.RESEND_API_KEY?.trim();
  return Boolean(key && key.startsWith('re_'));
}

export function getResendFromAddress(): string {
  // ندعم كلا الاسمين لأن Vercel يحتوي حالياً على RESEND_FROM_EMAIL.
  return (
    process.env.RESEND_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    DEFAULT_RESEND_FROM
  );
}

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY (server-only). أضِفه في .env.local.');
  }
  if (!apiKey.startsWith('re_')) {
    throw new Error(
      `RESEND_API_KEY لا يبدو مفتاحاً صالحاً (يجب أن يبدأ بـ "re_"). الطول الحالي: ${apiKey.length}.`
    );
  }
  return new Resend(apiKey);
}

/** يكتشف أخطاء "النطاق غير موثّق" الشائعة من Resend لعرض إرشاد واضح + تفعيل fallback. */
function isDomainVerificationError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('domain is not verified') ||
    m.includes('domain not verified') ||
    m.includes('verify a domain') ||
    m.includes('you can only send testing emails') ||
    (m.includes('domain') && m.includes('not authorized')) ||
    (m.includes('from') && m.includes('not allowed'))
  );
}

export type SendSignupVerificationParams = {
  to: string;
  /** رمز التحقق الرقمي — الوسيلة الوحيدة للتفعيل (لا روابط سحرية). */
  otp: string;
};

/** يبني قالب بريد HTML أنيقاً بأسلوب SaaS حديث يعرض رمز الـ OTP بخط عريض وواضح فقط. */
function buildOtpEmailHtml(params: {
  heading: string;
  body: string;
  otp: string;
  footerNote: string;
}): string {
  const { heading, body, otp, footerNote } = params;
  const otpFontSize = otp.length >= 8 ? '28px' : '36px';
  const otpLetterSpacing = otp.length >= 8 ? '5px' : '10px';
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
          <div style="background:#f0fdfa;border:1.5px dashed #22d3ee;border-radius:18px;padding:22px 12px;text-align:center;margin-bottom:26px;">
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

/**
 * إرسال بريد OTP عبر Resend API (بدون SMTP Supabase).
 * يُستخدم لرسائل التفعيل وتسجيل الدخول.
 */
async function sendAuthOtpEmail(params: {
  to: string;
  otp: string;
  subject: string;
  heading: string;
  body: string;
  footerNote: string;
}): Promise<{ id: string | undefined; usedFallbackFrom: boolean }> {
  const normalizedOtp = extractSupabaseEmailOtp(params.otp);
  if (!normalizedOtp) {
    throw new Error('INTERNAL_INVALID_SUPABASE_OTP');
  }

  const resend = getResendClient();
  const primaryFrom = getResendFromAddress();
  const html = buildOtpEmailHtml({
    heading: params.heading,
    body: params.body,
    otp: normalizedOtp,
    footerNote: params.footerNote,
  });

  const attemptSend = async (from: string) => {
    try {
      return await resend.emails.send({
        from,
        to: params.to,
        subject: params.subject,
        html,
      });
    } catch (networkError) {
      const detail =
        networkError instanceof Error ? networkError.message : 'خطأ شبكة غير معروف';
      throw new Error(`تعذّر الاتصال بـ Resend API (من ${from}): ${detail}`);
    }
  };

  const primaryResult = await attemptSend(primaryFrom);

  if (!primaryResult.error) {
    return { id: primaryResult.data?.id, usedFallbackFrom: false };
  }

  const primaryMessage = primaryResult.error.message || 'Resend API فشل في إرسال البريد.';

  const shouldFallback =
    primaryFrom !== FALLBACK_RESEND_FROM && isDomainVerificationError(primaryMessage);

  if (!shouldFallback) {
    throw new Error(primaryMessage);
  }

  if (process.env.NODE_ENV === 'development') {
    console.warn(
      '[Resend] فشل الإرسال من النطاق الرسمي',
      primaryFrom,
      '— سبب Resend:',
      primaryMessage,
      '— تجربة النطاق الاحتياطي onboarding@resend.dev.'
    );
  }

  const fallbackResult = await attemptSend(FALLBACK_RESEND_FROM);

  if (fallbackResult.error) {
    throw new Error(
      `تعذّر إرسال بريد التحقق. النطاق الرسمي (${primaryFrom}) غير موثّق بعد في Resend: "${primaryMessage}". ` +
        'راجع Resend Dashboard → Domains → أضف malaktout.com وتحقق من سجلات DNS (SPF/DKIM)، ثم أعد المحاولة.'
    );
  }

  return { id: fallbackResult.data?.id, usedFallbackFrom: true };
}

/**
 * إرسال بريد تفعيل الحساب عبر Resend API (بدون SMTP Supabase).
 *
 * - لا يرمي استثناءً غير مُتوقَّع أبداً: أي فشل شبكة أو استجابة خطأ من Resend
 *   يُحوَّل إلى `Error` برسالة عربية واضحة يلتقطها الاستدعاء الأعلى.
 * - إن فشل الإرسال من النطاق الرسمي `malaktout.com` تحديداً بسبب عدم توثيق
 *   النطاق في Resend، يُعاد المحاولة تلقائياً عبر نطاق Resend التجريبي
 *   حتى لا يتعطل تسجيل المستخدمين بالكامل.
 */
export async function sendSignupVerificationEmail(
  params: SendSignupVerificationParams
): Promise<{ id: string | undefined; usedFallbackFrom: boolean }> {
  return sendAuthOtpEmail({
    to: params.to,
    otp: params.otp,
    subject: `رمز تفعيل حسابك — ${APP_NAME}`,
    heading: 'رمز تفعيل حسابك',
    body: `مرحباً بك! استخدم الرمز التالي المكوّن من ${OTP_LENGTH_AR} لإتمام تفعيل حسابك. الرمز صالح لفترة محدودة فقط.`,
    footerNote:
      'لم تطلب إنشاء هذا الحساب؟ تجاهل هذه الرسالة بأمان — لن يُفعَّل أي شيء بدون إدخال هذا الرمز.',
  });
}

export type SendLoginOtpParams = {
  to: string;
  otp: string;
};

/** إرسال رمز تسجيل الدخول (OTP) عبر Resend — بديل لـ Supabase SMTP. */
export async function sendLoginOtpEmail(
  params: SendLoginOtpParams
): Promise<{ id: string | undefined; usedFallbackFrom: boolean }> {
  return sendAuthOtpEmail({
    to: params.to,
    otp: params.otp,
    subject: `رمز تسجيل الدخول — ${APP_NAME}`,
    heading: 'رمز تسجيل الدخول',
    body: `استخدم الرمز التالي المكوّن من ${OTP_LENGTH_AR} لتسجيل الدخول إلى حسابك. الرمز صالح لفترة محدودة فقط.`,
    footerNote:
      'لم تطلب تسجيل الدخول؟ تجاهل هذه الرسالة بأمان — لن يُمنح أي وصول بدون إدخال هذا الرمز.',
  });
}
