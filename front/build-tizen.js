#!/usr/bin/env node
/**
 * build-tizen.js
 * 
 * Builds the Lumiere React app and copies it into the Samsung Tizen project.
 * Preserves all Tizen Studio service files (.project, .settings, .sign, config.xml, icon.png).
 * 
 * Usage: node build-tizen.js [--install]
 */

import { execSync } from 'child_process';
import { cpSync, rmSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = import.meta.dirname; // front/ directory
const TIZEN_DIR = resolve(ROOT, '..', '..', 'samsung');
const DIST_DIR = join(ROOT, 'dist');
const WEBAPP_DIR = join(ROOT, 'dist-tizen');

// Files/dirs to preserve in the Tizen project (never delete)
const PRESERVE = new Set([
  '.project',
  '.settings',
  '.tproject',
  '.sign',
  'config.xml',
  'icon.png',
  'images',
  'Lumiere.wgt',
  'app.js',
  'css',
]);

console.log('=== Lumiere Tizen TV Build ===\n');

// Step 1: Vite build
console.log('[1/3] Building React app...');
try {
  execSync('node node_modules/.bin/vite build --outDir dist-tizen --base ./', {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, VITE_BUILD_MODE: 'tizen' },
  });
  console.log('  ✓ Vite build complete\n');
} catch (err) {
  console.error('  ✗ Vite build failed:', err.stderr?.toString());
  process.exit(1);
}

// Step 2: Copy dist into Tizen project
console.log('[2/3] Copying to Tizen project...');

// List files currently in Tizen project root
const existing = readdirSync(TIZEN_DIR);

// Remove old web files (but preserve Tizen service files)
for (const item of existing) {
  if (PRESERVE.has(item)) continue;
  const fullPath = join(TIZEN_DIR, item);
  rmSync(fullPath, { recursive: true, force: true });
  console.log(`  - removed: ${item}`);
}

// Copy new build files
const distFiles = readdirSync(WEBAPP_DIR);
for (const item of distFiles) {
  const src = join(WEBAPP_DIR, item);
  const dest = join(TIZEN_DIR, item);
  cpSync(src, dest, { recursive: true });
  console.log(`  + copied: ${item}`);
}

console.log('');

// Step 3: Clean up
console.log('[3/3] Cleaning up...');
rmSync(WEBAPP_DIR, { recursive: true, force: true });
console.log('  ✓ Done\n');

// Summary
console.log('Tizen project updated:');
console.log(`  ${TIZEN_DIR}`);
console.log('');
console.log('Next steps:');
console.log('  1. Open project in Tizen Studio');
console.log('  2. Build Package (right-click → Build Package)');
console.log('  3. Run on TV (right-click → Run As → Tizen Web Application)');
console.log('');

// Install flag
if (process.argv.includes('--install')) {
  const TV_IP = process.argv.find(a => a.startsWith('--ip='))?.split('=')[1] || process.env.TV_IP;
  if (!TV_IP) {
    console.error('Please specify TV IP via --ip=<TV_IP> or TV_IP environment variable.');
    process.exit(1);
  }
  console.log(`Installing on TV (${TV_IP})...`);
  try {
    execSync(`sdb connect ${TV_IP}`, { stdio: 'inherit' });
    execSync(`tizen install -s ${TV_IP} --name Lumiere.wgt -- ${TIZEN_DIR}`, { stdio: 'inherit' });
    console.log('✓ Installed!');
  } catch {
    console.log('✗ Install failed — try manually via Tizen Studio');
  }
}
