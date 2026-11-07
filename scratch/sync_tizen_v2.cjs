const { Client } = require('C:/Users/Artrax/.gemini/antigravity-ide/brain/e1e45cd3-e0d1-40e1-9374-7f025f709d42/scratch/node_modules/ssh2');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const wgtPath = path.join(rootDir, 'Lumiere_v2.wgt');

if (!fs.existsSync(wgtPath)) {
  console.error('Lumiere_v2.wgt not found at:', wgtPath);
  process.exit(1);
}

const wgtSizeMb = (fs.statSync(wgtPath).size / (1024 * 1024)).toFixed(2);
console.log(`Starting sync of Samsung Tizen V2 WGT (${wgtSizeMb} MB) to server...`);

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection established');
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      process.exit(1);
    }

    console.log('Uploading to /tmp/Lumiere_v2.wgt...');
    sftp.fastPut(wgtPath, '/tmp/Lumiere_v2.wgt', (uploadErr) => {
      if (uploadErr) {
        console.error('Upload failed:', uploadErr);
        conn.end();
        process.exit(1);
      }
      console.log('Uploaded /tmp/Lumiere_v2.wgt successfully.');

      const copyScript = `echo 'ybeXAS9g3pvP' | sudo -S bash -c "
        mkdir -p /root/docker/lumiere/back/public/tv &&
        cp /tmp/Lumiere_v2.wgt /root/docker/lumiere/back/public/tv/Lumiere_v2.wgt &&
        cp /tmp/Lumiere_v2.wgt /root/docker/lumiere/back/public/Lumiere_v2.wgt &&
        docker exec lumiere-app mkdir -p /app/public/tv 2>/dev/null || true &&
        docker cp /tmp/Lumiere_v2.wgt lumiere-app:/app/public/tv/Lumiere_v2.wgt &&
        docker cp /tmp/Lumiere_v2.wgt lumiere-app:/app/public/Lumiere_v2.wgt &&
        ls -lh /root/docker/lumiere/back/public/tv/Lumiere_v2.wgt &&
        docker exec lumiere-app ls -lh /app/public/tv/Lumiere_v2.wgt
      "`;

      conn.exec(copyScript, (execErr, stream) => {
        if (execErr) {
          console.error('Remote copy execution error:', execErr);
          conn.end();
          process.exit(1);
        }
        stream.on('close', (code) => {
          console.log('Remote script exited with code', code);
          conn.end();
        }).on('data', (data) => {
          process.stdout.write(data.toString());
        }).stderr.on('data', (data) => {
          process.stderr.write(data.toString());
        });
      });
    });
  });
}).on('error', (err) => {
  console.error('SSH error:', err);
}).connect({
  host: '192.168.1.196',
  port: 22,
  username: 'artrax',
  password: 'ybeXAS9g3pvP',
  readyTimeout: 30000,
});
