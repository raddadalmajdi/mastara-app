import { getResendFromAddress, isResendConfigured } from '@/lib/resend';
import { getListUnsubscribeUrl, getResendReplyTo } from '@/lib/resend-email-deliverability';
import { logServerException, serializeUnknownError } from '@/lib/server-error-log';

export type ResendEnvDiagnostics = {
  configured: boolean;
  apiKeyPresent: boolean;
  apiKeyPrefixOk: boolean;
  apiKeyLength: number;
  fromAddress: string;
  replyTo: string;
  listUnsubscribeUrl: string;
  nodeEnv: string;
};

/** حالة إعداد Resend للتشخيص في سجلات Vercel (بدون كشف المفتاح كاملاً). */
export function getResendEnvDiagnostics(): ResendEnvDiagnostics {
  const key = process.env.RESEND_API_KEY?.trim() ?? '';
  return {
    configured: isResendConfigured(),
    apiKeyPresent: Boolean(key),
    apiKeyPrefixOk: key.startsWith('re_'),
    apiKeyLength: key.length,
    fromAddress: getResendFromAddress(),
    replyTo: getResendReplyTo(),
    listUnsubscribeUrl: getListUnsubscribeUrl(),
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
  };
}

export function logResendEnvDiagnostics(context: string): void {
  const d = getResendEnvDiagnostics();
  console.info(`[Resend/env] ${context}`, {
    configured: d.configured,
    apiKeyPresent: d.apiKeyPresent,
    apiKeyPrefixOk: d.apiKeyPrefixOk,
    apiKeyLength: d.apiKeyLength,
    fromAddress: d.fromAddress,
    replyTo: d.replyTo,
    listUnsubscribeUrl: d.listUnsubscribeUrl,
    nodeEnv: d.nodeEnv,
  });
  if (!d.configured) {
    console.error(
      `[Resend/env] ${context} — RESEND_API_KEY missing or invalid (must start with "re_"). OTP emails will not send via Resend.`
    );
  }
}

type ResendErrorLike = {
  message?: string;
  name?: string;
  statusCode?: number;
};

export function logResendApiFailure(
  context: string,
  details: {
    to: string;
    from: string;
    error: ResendErrorLike | Error | string;
    attempt?: 'primary' | 'fallback';
  }
): void {
  const err = details.error;
  const payload =
    typeof err === 'string'
      ? { message: err }
      : err instanceof Error
        ? { message: err.message, name: err.name, stack: err.stack }
        : {
            message: err.message,
            name: err.name,
            statusCode: err.statusCode,
            serialized: serializeUnknownError(err),
          };

  console.error(`[Resend/api] ${context} FAILED`, {
    attempt: details.attempt ?? 'primary',
    to: details.to,
    from: details.from,
    ...payload,
  });

  logServerException(`Resend/api/${context}`, err, {
    attempt: details.attempt ?? 'primary',
    to: details.to,
    from: details.from,
  });
}

export function logResendApiSuccess(
  context: string,
  details: {
    to: string;
    from: string;
    emailId?: string;
    usedFallbackFrom: boolean;
  }
): void {
  console.info(`[Resend/api] ${context} OK`, {
    to: details.to,
    from: details.from,
    emailId: details.emailId,
    usedFallbackFrom: details.usedFallbackFrom,
  });
}
