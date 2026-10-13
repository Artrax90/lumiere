const { Client } = require('C:/Users/Artrax/.gemini/antigravity-ide/brain/e1e45cd3-e0d1-40e1-9374-7f025f709d42/scratch/node_modules/ssh2');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const apkPath = path.join(rootDir, 'Lumiere-tv.apk');

if (!fs.existsSync(apkPath)) {
  console.error('Lumiere-tv.apk not found at:', apkPath);
  process.exit(1);
}

const apkSizeMb = (fs.statSync(apkPath).size / (1024 * 1024)).toFixed(2);
console.log(`Starting sync of Native Android TV APK (${apkSizeMb} MB) to server...`);

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection established');
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      process.exit(1);
    }

    console.log('Uploading to /tmp/Lumiere-tv.apk...');
    sftp.fastPut(apkPath, '/tmp/Lumiere-tv.apk', (uploadErr) => {
      if (uploadErr) {
        console.error('Upload failed:', uploadErr);
        conn.end();
        process.exit(1);
      }
      console.log('Uploaded /tmp/Lumiere-tv.apk successfully.');

      const copyScript = `echo 'ybeXAS9g3pvP' | sudo -S bash -c "
        mkdir -p /root/docker/lumiere/back/public/apk &&
        cp /tmp/Lumiere-tv.apk /root/docker/lumiere/back/public/apk/Lumiere-tv.apk &&
        cp /tmp/Lumiere-tv.apk /root/docker/lumiere/back/public/apk/Lumiere-tv-debug.apk &&
        cp /tmp/Lumiere-tv.apk /root/docker/lumiere/back/public/Lumiere-tv.apk &&
        cp /tmp/Lumiere-tv.apk /root/docker/lumiere/back/public/Lumiere-tv-debug.apk &&
        docker exec lumiere-app mkdir -p /app/public/apk 2>/dev/null || true &&
        docker cp /tmp/Lumiere-tv.apk lumiere-app:/app/public/apk/Lumiere-tv.apk &&
        docker cp /tmp/Lumiere-tv.apk lumiere-app:/app/public/apk/Lumiere-tv-debug.apk &&
        docker cp /tmp/Lumiere-tv.apk lumiere-app:/app/public/Lumiere-tv.apk &&
        docker cp /tmp/Lumiere-tv.apk lumiere-app:/app/public/Lumiere-tv-debug.apk &&
        ls -lh /root/docker/lumiere/back/public/apk/Lumiere-tv.apk &&
        docker exec lumiere-app ls -lh /app/public/apk/Lumiere-tv.apk
      "`;

      conn.exec(copyScript, (execErr, stream) => {
        if (execErr) {
          console.error('Remote copy execution error:', execErr);
          conn.end();
          process.exit(1);
        }

        stream.on('data', d => process.stdout.write(d.toString()))
              .stderr.on('data', d => process.stderr.write('STDERR: ' + d.toString()))
              .on('close', (code) => {
                conn.end();
                if (code === 0) {
                  console.log('\n[✔] Native Android TV APK successfully synced to server & docker container!');
                } else {
                  console.error(`Remote script exited with code ${code}`);
                  process.exit(code);
                }
              });
      });
    });
  });
}).on('error', err => {
  console.error('SSH Connection error:', err.message);
  process.exit(1);
}).connect({
  host: '192.168.1.196',
  port: 22,
  username: 'artrax',
  password: 'ybeXAS9g3pvP',
  readyTimeout: 10000,
});
