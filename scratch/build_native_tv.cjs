const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const androidDir = path.join(rootDir, 'android');
const javaHome = 'C:\\Users\\Artrax\\jdk-21\\jdk-21.0.5+11';
const builtApk = path.join(androidDir, 'tv/build/outputs/apk/debug/tv-debug.apk');
const adbPath = fs.existsSync('C:\\Users\\Artrax\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe')
  ? 'C:\\Users\\Artrax\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe'
  : path.join(rootDir, 'scratch/platform-tools/adb.exe');

console.log('==================================================');
console.log('       BUILDING NATIVE ANDROID TV APP             ');
console.log('==================================================');

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${javaHome}\\bin;${process.env.PATH}`,
};

const gradlew = path.join(androidDir, 'gradlew.bat');
console.log(`Running: ${gradlew} :tv:assembleDebug in ${androidDir}`);

const buildRes = spawnSync(gradlew, [':tv:assembleDebug', '--no-daemon'], {
  cwd: androidDir,
  env,
  stdio: 'inherit',
  shell: true,
});

if (buildRes.status !== 0) {
  console.error('[✖] Gradle build failed with status:', buildRes.status);
  process.exit(buildRes.status || 1);
}

if (!fs.existsSync(builtApk)) {
  console.error('[✖] Built APK not found at:', builtApk);
  process.exit(1);
}

const apkSizeMb = (fs.statSync(builtApk).size / (1024 * 1024)).toFixed(2);
console.log(`[✔] Build successful! Produced APK (${apkSizeMb} MB): ${builtApk}`);

const dests = [
  path.join(rootDir, 'Lumiere-tv.apk'),
  path.join(rootDir, 'Lumiere-tv-debug.apk'),
  path.join(rootDir, 'back/public/Lumiere-tv.apk'),
  path.join(rootDir, 'back/public/Lumiere-tv-debug.apk'),
  path.join(rootDir, 'back/public/apk/Lumiere-tv.apk'),
  path.join(rootDir, 'back/public/apk/Lumiere-tv-debug.apk'),
];

for (const dest of dests) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(builtApk, dest);
  console.log(`[✔] Copied to: ${path.relative(rootDir, dest)}`);
}

// 1. Sync to Server
console.log('\n--- Syncing to Server Container ---');
try {
  require('./sync_tv_apk.cjs');
} catch (err) {
  console.warn('[!] Server sync notice:', err.message);
}

// 2. Check for Connected ADB devices and install
console.log('\n--- Checking for Connected ADB Devices ---');
if (fs.existsSync(adbPath)) {
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Connecting to 192.168.1.128:5555 (attempt ${attempt})...`);
        const connOut = execSync(`"${adbPath}" connect 192.168.1.128:5555`, { encoding: 'utf8', timeout: 15000 });
        console.log(connOut.trim());
        if (connOut.includes('connected')) break;
      } catch (err) {
        console.warn(`Connect attempt ${attempt} notice:`, err.message);
      }
    }
    const devicesOutput = execSync(`"${adbPath}" devices`, { encoding: 'utf8', timeout: 10000 });
    const lines = devicesOutput.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('List of'));
    const connectedDevices = lines.map(l => l.split('\t')[0].trim()).filter(id => id.length > 0 && !id.includes('offline'));
    
    if (connectedDevices.length > 0) {
      console.log(`Found ${connectedDevices.length} connected device(s): ${connectedDevices.join(', ')}`);
      for (const dev of connectedDevices) {
        console.log(`Installing Lumiere-tv.apk on device ${dev}...`);
        execSync(`"${adbPath}" -s ${dev} install -r "${path.join(rootDir, 'Lumiere-tv.apk')}"`, { stdio: 'inherit', timeout: 60000 });
        console.log(`[✔] Installed successfully on ${dev}`);
        try {
          execSync(`"${adbPath}" -s ${dev} shell am force-stop com.lumiere.tv`, { timeout: 10000 });
          execSync(`"${adbPath}" -s ${dev} shell am start -n com.lumiere.tv/.MainActivity`, { timeout: 10000 });
          console.log(`[✔] Restarted com.lumiere.tv on ${dev}`);
        } catch (restartErr) {
          console.warn('App restart notice:', restartErr.message);
        }
      }
    } else {
      console.log('No ADB devices currently connected. To install directly to your Android TV stick / box:');
      console.log(`  "${adbPath}" connect <TV_IP>:5555`);
      console.log(`  "${adbPath}" install -r Lumiere-tv.apk`);
    }
  } catch (adbErr) {
    console.warn('[!] ADB command note:', adbErr.message);
  }
} else {
  console.log('ADB not found at', adbPath);
}

console.log('\n==================================================');
console.log('  ГОТОВО! Native Android TV APK собран и обновлён! ');
console.log('==================================================');
