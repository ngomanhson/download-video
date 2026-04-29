# 🎬 VidFetch — Universal Video Downloader

Ứng dụng tải video từ bất kỳ URL nào, sử dụng Node.js + Express.

## ⚡ Cài đặt & Chạy

```bash
# 1. Cài dependencies
npm install

# 2. Cài yt-dlp (Python tool, bắt buộc để hỗ trợ YouTube, TikTok, v.v.)
pip install yt-dlp
# hoặc nếu dùng pip3:
pip3 install yt-dlp

# 3. Cài ffmpeg (để xử lý HLS/DASH streams)
# Ubuntu/Debian:
sudo apt install ffmpeg
# macOS:
brew install ffmpeg
# Windows: Tải tại https://ffmpeg.org/download.html

# 4. Khởi động server
npm start
# Truy cập: http://localhost:3000
```

## 🔧 Các trường hợp xử lý

| Loại Video | Phương pháp | Mô tả |
|---|---|---|
| Direct `.mp4`, `.webm`, `.mkv` | Stream proxy | Tải trực tiếp với giả mạo Referer/UA |
| HLS `.m3u8` | FFmpeg | Ghép segments thành MP4 |
| DASH `.mpd` | FFmpeg | Ghép video+audio streams |
| HTML `<video>` tags | HTML Parser | Trích xuất từ DOM |
| OG meta tags | HTML Parser | `og:video` meta |
| JSON-LD schema | JS Parser | `contentUrl`, `embedUrl` |
| Inline JavaScript | Regex patterns | JWPlayer, VideoJS, v.v. |
| YouTube | yt-dlp | Hỗ trợ chất lượng 4K |
| TikTok | yt-dlp | Không watermark |
| Instagram | yt-dlp | Reels, Stories, Posts |
| Facebook | yt-dlp | Public videos |
| Vimeo | yt-dlp | HD streams |
| Dailymotion | yt-dlp | Auto detect |
| Twitter/X | yt-dlp | Videos và GIFs |

## 🌐 API Endpoints

### POST `/api/analyze`
Phân tích URL và trả về danh sách nguồn video.

```json
{
  "url": "https://example.com/video-page"
}
```

### POST `/api/download`
Tải video tự động (auto-detect method).

```json
{
  "url": "https://example.com/video-page",
  "quality": "best",
  "filename": "my-video"
}
```

### POST `/api/download/source`
Tải từ URL nguồn cụ thể.

```json
{
  "sourceUrl": "https://cdn.example.com/video.m3u8",
  "referer": "https://example.com",
  "method": "ffmpeg",
  "filename": "video"
}
```

### GET `/api/download/proxy?url=...&referer=...`
Proxy stream cho video bị chặn CORS.

## 📁 Cấu trúc dự án

```
video-downloader/
├── index.js              # Entry point
├── routes/
│   ├── analyze.js        # Phân tích URL
│   └── download.js       # Tải xuống
├── utils/
│   ├── analyzer.js       # Logic phân tích video
│   └── downloader.js     # Logic tải xuống
└── public/
    └── index.html        # Giao diện web
```

## ⚠️ Lưu ý

- Chỉ dùng để tải video hợp pháp, video cá nhân hoặc video có bản quyền Creative Commons
- Một số trang web có cơ chế anti-bot mạnh (Cloudflare, etc.) có thể không tải được
- YouTube Premium/Private videos không thể tải
- Cần có `yt-dlp` và `ffmpeg` được cài trên hệ thống
