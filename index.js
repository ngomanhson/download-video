const express = require("express");
const cors = require("cors");
const path = require("path");
const { execSync, exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Kiểm tra và cài yt-dlp nếu chưa có
function ensureYtDlp() {
  try {
    execSync("yt-dlp --version", { stdio: "ignore" });
    console.log("✅ yt-dlp đã sẵn sàng");
  } catch {
    console.log("⏳ Đang cài yt-dlp...");
    try {
      // Thử pip3 trước
      execSync(
        "pip3 install yt-dlp --quiet --break-system-packages 2>/dev/null || pip install yt-dlp --quiet",
        {
          stdio: "inherit",
          timeout: 60000,
        },
      );
      console.log("✅ yt-dlp đã cài xong");
    } catch (e) {
      // Fallback: tải binary trực tiếp
      try {
        execSync(
          `curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp`,
          {
            stdio: "inherit",
            timeout: 60000,
          },
        );
        console.log("✅ yt-dlp binary đã tải xong");
      } catch (e2) {
        console.warn("⚠️  Không cài được yt-dlp:", e2.message);
      }
    }
  }
}

ensureYtDlp();

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
