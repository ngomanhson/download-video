const express = require("express");
const router = express.Router();
const { analyzeUrl } = require("../utils/analyzer");
const { getInfoWithYtDlp } = require("../utils/downloader");

router.post("/", async (req, res) => {
  const { url } = req.body;

  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: "URL không hợp lệ. Phải bắt đầu bằng http hoặc https." });
  }

  try {
    // First: analyze with our custom extractor
    const analysis = await analyzeUrl(url);

    // If it's a known platform or no sources found, try yt-dlp for more info
    if (
      ["youtube", "tiktok", "instagram", "facebook", "twitter", "vimeo", "dailymotion"].includes(
        analysis.platform,
      ) ||
      analysis.method === "ytdlp" ||
      analysis.method === "ytdlp_fallback"
    ) {
      try {
        const ytInfo = await getInfoWithYtDlp(url);
        analysis.title = ytInfo.title || analysis.title;
        analysis.thumbnail = ytInfo.thumbnail || analysis.thumbnail;
        analysis.duration = ytInfo.duration;
        analysis.uploader = ytInfo.uploader;
        analysis.ytFormats = ytInfo.formats;
        analysis.method = "ytdlp";
      } catch (ytErr) {
        // yt-dlp failed, use what we have
        analysis.ytdlpError = ytErr.message;
      }
    }

    res.json({ success: true, data: analysis });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
