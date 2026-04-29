const express = require("express");
const cors = require("cors");
const path = require("path");
const { execSync } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Check tools at startup (chỉ log, không cài runtime)
function checkTools() {
  try {
    const v = execSync("yt-dlp --version", { encoding: "utf8" }).trim();
    console.log("✅ yt-dlp:", v);
  } catch {
    console.warn("⚠️  yt-dlp không tìm thấy trong PATH");
  }

  try {
    const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
    console.log("✅ ffmpeg path:", ffmpegInstaller.path);
  } catch {
    try {
      execSync("ffmpeg -version", { stdio: "ignore" });
      console.log("✅ ffmpeg: system");
    } catch {
      console.warn("⚠️  ffmpeg không tìm thấy");
    }
  }
}

checkTools();

const downloadRouter = require("./routes/download");
const analyzeRouter = require("./routes/analyze");

app.use("/api/analyze", analyzeRouter);
app.use("/api/download", downloadRouter);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🎬 Video Downloader chạy tại http://0.0.0.0:${PORT}`);
});
