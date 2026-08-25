#!/usr/bin/env node
/**
 * Mobile build for Capacitor.
 *
 * Default (hybrid): prepares `out/` and points the WebView at CAPACITOR_SERVER_URL
 * (production API + Next.js on Vercel). Required while `app/api/*` routes exist.
 *
 * Static export (`--static`) is available for future use once API routes are externalized.
 */
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const mode = args.includes('--static') ? 'static' : 'hybrid';

function run(command, commandArgs, env = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (mode === 'static') {
  console.log('[build:mobile] static export → out/ (requires no incompatible API routes)');
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { MOBILE_EXPORT: '1' });
} else {
  console.log('[build:mobile] hybrid shell → out/ + remote server URL');
  run('node', ['scripts/prepare-capacitor-webdir.mjs']);
}
