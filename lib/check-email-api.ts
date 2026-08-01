export type CheckEmailResponse =
  | { ok: true; exists: boolean }
  | { ok: false; code: string; message: string };

/** يتحقق من Supabase Auth عبر مسار API إن كان البريد مسجّلاً مسبقاً. */
export async function checkEmailRegistered(email: string): Promise<CheckEmailResponse> {
  const res = await fetch('/api/auth/check-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });

  const data = (await res.json()) as CheckEmailResponse;
  return data;
}
