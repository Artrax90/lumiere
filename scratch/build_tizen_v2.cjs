const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const tizenV2Dir = path.join(rootDir, 'front/tizen_v2');
const tizenCli = 'C:\\tizen-studio\\tools\\ide\\bin\\tizen.bat';
const sdbCli = 'C:\\tizen-studio\\tools\\sdb.exe';
const profileName = 'LumiereSamsungProfile';

console.log('==================================================');
console.log('         BUILDING SAMSUNG TIZEN WGT V2            ');
console.log('==================================================');

if (!fs.existsSync(tizenV2Dir)) {
  console.error('[✖] tizen_v2 directory not found at:', tizenV2Dir);
  process.exit(1);
}

// 1. Build Package
console.log(`Running: ${tizenCli} package -t wgt -s ${profileName} -- "${tizenV2Dir}"`);
const pkgRes = spawnSync(tizenCli, ['package', '-t', 'wgt', '-s', profileName, '--', tizenV2Dir], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

if (pkgRes.status !== 0) {
  console.error('[✖] Tizen packaging failed with status:', pkgRes.status);
  process.exit(pkgRes.status || 1);
}

const builtWgt = path.join(tizenV2Dir, 'Lumiere_v2.wgt');
if (!fs.existsSync(builtWgt)) {
  console.error('[✖] Built WGT not found at:', builtWgt);
  process.exit(1);
}

const wgtSizeMb = (fs.statSync(builtWgt).size / (1024 * 1024)).toFixed(2);
console.log(`[✔] Build successful! Produced WGT (${wgtSizeMb} MB): ${builtWgt}`);

// 2. Copy artifacts
const dests = [
  path.join(rootDir, 'Lumiere_v2.wgt'),
  path.join(rootDir, 'back/public/Lumiere_v2.wgt'),
  path.join(rootDir, 'back/public/tv/Lumiere_v2.wgt'),
];

for (const dest of dests) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(builtWgt, dest);
  console.log(`[✔] Copied to: ${path.relative(rootDir, dest)}`);
}

// 3. Sync to Server
console.log('\n--- Syncing to Server Container ---');
try {
  const syncScript = path.join(__dirname, 'sync_tizen_v2.cjs');
  if (fs.existsSync(syncScript)) {
    require(syncScript);
  }
} catch (err) {
  console.warn('[!] Server sync notice:', err.message);
}

// 4. Check for Connected Samsung TVs via SDB
console.log('\n--- Checking for Connected Samsung TV Devices ---');
if (fs.existsSync(sdbCli)) {
  try {
    const devicesOutput = execSync(`"${sdbCli}" devices`, { encoding: 'utf8', timeout: 10000 });
    const lines = devicesOutput.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('List of'));
    const connectedDevices = lines
      .map(l => l.split('\t')[0].trim())
      .filter(id => id.length > 0 && !id.includes('offline'));

    if (connectedDevices.length > 0) {
      console.log(`Found ${connectedDevices.length} connected device(s): ${connectedDevices.join(', ')}`);
      for (const dev of connectedDevices) {
        console.log(`Installing Lumiere_v2.wgt on device ${dev}...`);
        try {
          execSync(`"${tizenCli}" install -s ${dev} --name Lumiere_v2.wgt -- "${tizenV2Dir}"`, {
            stdio: 'inherit',
            timeout: 60000,
          });
          console.log(`[✔] Installed successfully on ${dev}`);
        } catch (installErr) {
          console.warn(`[!] Install notice on ${dev}:`, installErr.message);
        }
      }
    } else {
      console.log('No SDB devices currently connected.');
    }
  } catch (sdbErr) {
    console.warn('[!] SDB command note:', sdbErr.message);
  }
} else {
  console.log('SDB not found at', sdbCli);
}

console.log('\n==================================================');
console.log('  ГОТОВО! Samsung Tizen V2 WGT собран и обновлён! ');
console.log('==================================================');
