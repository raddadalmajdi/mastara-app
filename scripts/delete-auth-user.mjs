#!/usr/bin/env node
/**
 * Dev-only: delete a Supabase Auth user by email (service_role).
 * Usage: node --env-file=.env.local scripts/delete-auth-user.mjs [email]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

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
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    '❌ يلزم NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في .env.local'
  );
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`🔍 البحث عن: ${email}`);

  let page = 1;
  const perPage = 200;
  let user = null;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('❌ listUsers:', error.message);
      process.exit(1);
    }
    user = data.users.find((u) => u.email?.trim().toLowerCase() === email) ?? null;
    if (user || data.users.length < perPage) break;
    page += 1;
  }

  if (!user) {
    console.log(`⚠️  لم يُعثر على مستخدم بالبريد ${email}`);
    process.exit(0);
  }

  console.log(`🗑️  حذف user_id=${user.id} (${user.email})`);
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('❌ deleteUser:', deleteError.message);
    process.exit(1);
  }

  console.log('✅ تم الحذف نهائياً من Supabase Auth. يمكن التسجيل بهذا البريد مجدداً.');
}

main();
