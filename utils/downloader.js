const { spawn } = require("child_process");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { isHLSUrl, isDASHUrl } = require("./analyzer");
const YtDlpWrap = require("yt-dlp-wrap").default;

// Dùng ffmpeg từ npm package @ffmpeg-installer/ffmpeg (không cần cài hệ thống)
let FFMPEG_PATH = "ffmpeg";
try {
  const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
  FFMPEG_PATH = ffmpegInstaller.path;
  console.log("✅ ffmpeg path:", FFMPEG_PATH);
} catch (e) {
  console.warn("⚠️  @ffmpeg-installer/ffmpeg không tìm thấy, dùng system ffmpeg");
}

// Initialise yt-dlp-wrap (downloads the yt-dlp binary automatically on first use)
const ytDlpWrap = new YtDlpWrap();
YtDlpWrap.downloadFromGithub().catch((e) =>
  console.warn("⚠️  yt-dlp-wrap auto-download failed:", e.message),
);

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Encoding": "gzip, deflate, br",
};

// Stream direct video to response
async function streamDirect(videoUrl, referer, res, filename = "video.mp4") {
  const response = await axios.get(videoUrl, {
    headers: { ...HEADERS, Referer: referer || videoUrl },
    responseType: "stream",
    timeout: 30000,
  });

  const contentType = response.headers["content-type"] || "video/mp4";
  const contentLength = response.headers["content-length"];
  const ext = getExtFromUrl(videoUrl) || getExtFromContentType(contentType) || "mp4";

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${sanitizeFilename(filename)}.${ext}"`,
  );
  res.setHeader("Content-Type", contentType);
  if (contentLength) res.setHeader("Content-Length", contentLength);

  response.data.pipe(res);

  return new Promise((resolve, reject) => {
    response.data.on("end", resolve);
    response.data.on("error", reject);
  });
}

// Download HLS/DASH with ffmpeg
async function downloadWithFFmpeg(manifestUrl, referer, res, filename = "video") {
  return new Promise((resolve, reject) => {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${sanitizeFilename(filename)}.mp4"`,
    );
    res.setHeader("Content-Type", "video/mp4");

    const args = [
      "-headers",
      `Referer: ${referer || manifestUrl}\r\nUser-Agent: ${HEADERS["User-Agent"]}\r\n`,
      "-i",
      manifestUrl,
      "-c",
      "copy",
      "-bsf:a",
      "aac_adtstoasc",
      "-movflags",
      "frag_keyframe+empty_moov+faststart",
      "-f",
      "mp4",
      "pipe:1",
    ];

    const ffmpeg = spawn(FFMPEG_PATH, args, { stdio: ["ignore", "pipe", "pipe"] });

    ffmpeg.stdout.pipe(res);

    let stderr = "";
    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg error: ${stderr.slice(-500)}`));
    });

    ffmpeg.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(new Error("Không thể khởi động ffmpeg: " + err.message));
      } else {
        reject(err);
      }
    });

    res.on("close", () => {
      ffmpeg.kill("SIGTERM");
    });
  });
}

// Download with yt-dlp (fallback for social platforms)
async function downloadWithYtDlp(url, res, filename = "video", quality = "best") {
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${sanitizeFilename(filename)}.mp4"`,
  );
  res.setHeader("Content-Type", "video/mp4");

  // Choose format based on quality preference
  let format;
  switch (quality) {
    case "best":
      format = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
      break;
    case "1080p":
      format = "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]";
      break;
    case "720p":
      format = "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]";
      break;
    case "480p":
      format = "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]";
      break;
    case "360p":
      format = "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360]";
      break;
    default:
      format = "best[ext=mp4]/best";
  }

  const args = [
    url,
    "-f",
    format,
    "--merge-output-format",
    "mp4",
    "-o",
    "-", // output to stdout
    "--no-playlist",
    "--user-agent",
    HEADERS["User-Agent"],
    "--no-warnings",
  ];

  const ytDlpStream = ytDlpWrap.execStream(args);

  await new Promise((resolve, reject) => {
    ytDlpStream.pipe(res);
    ytDlpStream.on("error", (err) => reject(new Error(`yt-dlp error: ${err.message}`)));
    ytDlpStream.on("close", resolve);
    res.on("close", () => ytDlpStream.destroy());
  });
}

// Get video info with yt-dlp
async function getInfoWithYtDlp(url) {
  const args = [
    url,
    "--dump-json",
    "--no-playlist",
    "--no-warnings",
    "--user-agent",
    HEADERS["User-Agent"],
  ];

  const info = await ytDlpWrap.getVideoInfo(args);

  const formats = (info.formats || [])
    .filter((f) => f.vcodec !== "none")
    .map((f) => ({
      format_id: f.format_id,
      ext: f.ext,
      quality: f.format_note || f.height ? `${f.height}p` : "unknown",
      height: f.height,
      filesize: f.filesize,
      url: f.url,
    }))
    .sort((a, b) => (b.height || 0) - (a.height || 0));

  return {
    title: info.title,
    thumbnail: info.thumbnail,
    duration: info.duration,
    uploader: info.uploader,
    formats: formats.slice(0, 10),
  };
}

// Proxy stream (for CORS-blocked videos)
async function proxyStream(videoUrl, referer, res) {
  const response = await axios.get(videoUrl, {
    headers: {
      ...HEADERS,
      Referer: referer || videoUrl,
      Origin: new URL(videoUrl).origin,
    },
    responseType: "stream",
    timeout: 30000,
  });

  const ext = getExtFromUrl(videoUrl) || "mp4";
  res.setHeader("Content-Type", response.headers["content-type"] || "video/mp4");
  res.setHeader("Content-Disposition", `attachment; filename="video.${ext}"`);
  if (response.headers["content-length"]) {
    res.setHeader("Content-Length", response.headers["content-length"]);
  }

  response.data.pipe(res);

  return new Promise((resolve, reject) => {
    response.data.on("end", resolve);
    response.data.on("error", reject);
  });
}

function getExtFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).replace(".", "");
    return ext || null;
  } catch {
    return null;
  }
}

function getExtFromContentType(ct) {
  const map = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/ogg": "ogv",
    "video/quicktime": "mov",
    "video/x-matroska": "mkv",
    "application/x-mpegURL": "m3u8",
    "application/dash+xml": "mpd",
  };
  return Object.entries(map).find(([k]) => ct.includes(k))?.[1] || null;
}

function sanitizeFilename(name) {
  return (
    name
      .replace(/[^\w\s\-_.]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 100) || "video"
  );
}

module.exports = {
  streamDirect,
  downloadWithFFmpeg,
  downloadWithYtDlp,
  getInfoWithYtDlp,
  proxyStream,
};
