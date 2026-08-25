#!/usr/bin/env node
/**
 * Dev-only: delete a Firebase Auth user by email (Admin SDK).
 * Usage: node --env-file=.env.local scripts/delete-auth-user.mjs [email]
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const DEFAULT_EMAIL = 'rraddad@hotmail.com';

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const email = (process.argv[2] || DEFAULT_EMAIL).trim().toLowerCase();
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();

if (!raw) {
  console.error('❌ يلزم FIREBASE_SERVICE_ACCOUNT_KEY في .env.local');
  process.exit(1);
}

const serviceAccount = JSON.parse(raw);
if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount) });
}

const auth = getAuth();

async function main() {
  console.log(`🔍 البحث عن: ${email}`);

  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    const code = error?.code;
    if (code === 'auth/user-not-found') {
      console.log(`⚠️  لم يُعثر على مستخدم بالبريد ${email}`);
      process.exit(0);
    }
    console.error('❌ getUserByEmail:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log(`🗑️  حذف user_id=${user.uid} (${user.email})`);
  await auth.deleteUser(user.uid);
  console.log('✅ تم الحذف نهائياً من Firebase Auth. يمكن التسجيل بهذا البريد مجدداً.');
}

main();
