#!/usr/bin/env node
/**
 * Ensures `out/` exists for Capacitor when using remote server URL (no static export).
 * Copies public assets and writes a minimal index.html bootstrap page.
 */
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const outDir = join(root, 'out');
const publicDir = join(root, 'public');
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || 'https://www.eysalk.com';

mkdirSync(outDir, { recursive: true });

if (existsSync(publicDir)) {
  cpSync(publicDir, outDir, { recursive: true, force: true });
}

const indexHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>إيصالك</title>
    <meta http-equiv="refresh" content="0;url=${serverUrl}" />
    <style>
      body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #f5f0e8; color: #3d2c1e; }
    </style>
  </head>
  <body>
    <p>جاري فتح إيصالك…</p>
    <script>location.replace(${JSON.stringify(serverUrl)});</script>
  </body>
</html>
`;

writeFileSync(join(outDir, 'index.html'), indexHtml, 'utf8');
console.log(`[capacitor] prepared webDir at out/ (server: ${serverUrl})`);
