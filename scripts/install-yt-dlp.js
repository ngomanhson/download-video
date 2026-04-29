/**
 * Script chạy lúc Railway build (npm run build)
 * Tải yt-dlp binary vào ./bin/ bằng Node.js https — không cần pip/curl
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp');

// Kiểm tra đã có chưa
if (fs.existsSync(YTDLP_PATH)) {
  try {
    const v = execSync(`${YTDLP_PATH} --version`, { encoding: 'utf8' }).trim();
    console.log('✅ yt-dlp đã có:', v);
    process.exit(0);
  } catch {}
}

fs.mkdirSync(BIN_DIR, { recursive: true });

const URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
console.log('⏳ Đang tải yt-dlp binary...');

function download(url, dest, redirects = 0) {
  if (redirects > 5) { console.error('Too many redirects'); process.exit(1); }

  https.get(url, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      return download(res.headers.location, dest, redirects + 1);
    }
    if (res.statusCode !== 200) {
      console.error('HTTP', res.statusCode);
      process.exit(1);
    }

    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      fs.chmodSync(dest, 0o755);
      try {
        const v = execSync(`${dest} --version`, { encoding: 'utf8' }).trim();
        console.log('✅ yt-dlp cài xong:', v);
      } catch (e) {
        console.error('❌ yt-dlp binary lỗi:', e.message);
        process.exit(1);
      }
    });
  }).on('error', (e) => {
    console.error('❌ Download lỗi:', e.message);
    process.exit(1);
  });
}

download(URL, YTDLP_PATH);
