const express = require('express');
const router = express.Router();
const { analyzeUrl, isHLSUrl, isDirectVideoUrl } = require('../utils/analyzer');
const { streamDirect, downloadWithFFmpeg, downloadWithYtDlp, proxyStream } = require('../utils/downloader');

router.post('/', async (req, res) => {
  const { url, sourceUrl, method, quality = 'best', filename = 'video' } = req.body;

  if (!url) return res.status(400).json({ error: 'Thiếu URL' });

  // If sourceUrl is provided directly (user picked a source), use it
  if (sourceUrl) {
    return handleDirectSource(sourceUrl, url, method, filename, res);
  }

  try {
    // Auto-detect and download
    const analysis = await analyzeUrl(url);
    const title = filename !== 'video' ? filename : (analysis.title || 'video');

    switch (analysis.method) {
      case 'direct': {
        const src = analysis.sources[0];
        return handleDirectSource(src.url, url, 'direct', title, res);
      }
      case 'hls_ffmpeg':
      case 'dash_ffmpeg': {
        const src = analysis.sources[0];
        return handleDirectSource(src.url, url, 'ffmpeg', title, res);
      }
      case 'ytdlp':
      case 'ytdlp_fallback': {
        return await downloadWithYtDlp(url, res, title, quality);
      }
      default: {
        // Try sources one by one
        if (analysis.sources.length > 0) {
          return handleDirectSource(analysis.sources[0].url, url, 'auto', title, res);
        }
        return res.status(404).json({ error: 'Không tìm thấy video trên trang này' });
      }
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

async function handleDirectSource(sourceUrl, referer, method, filename, res) {
  try {
    if (method === 'ffmpeg' || isHLSUrl(sourceUrl) || sourceUrl.includes('.mpd')) {
      await downloadWithFFmpeg(sourceUrl, referer, res, filename);
    } else if (method === 'ytdlp') {
      await downloadWithYtDlp(sourceUrl, res, filename);
    } else {
      // Direct stream or proxy
      try {
        await streamDirect(sourceUrl, referer, res, filename);
      } catch (e) {
        // If direct fails, try proxy with different headers
        if (!res.headersSent) {
          await proxyStream(sourceUrl, referer, res);
        }
      }
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: `Lỗi tải video: ${err.message}` });
    }
  }
}

// Download a specific source URL
router.post('/source', async (req, res) => {
  const { sourceUrl, referer, method = 'auto', filename = 'video' } = req.body;
  
  if (!sourceUrl) return res.status(400).json({ error: 'Thiếu sourceUrl' });
  
  await handleDirectSource(sourceUrl, referer || sourceUrl, method, filename, res);
});

// Stream proxy endpoint (for frontend players)
router.get('/proxy', async (req, res) => {
  const { url, referer } = req.query;
  if (!url) return res.status(400).json({ error: 'Thiếu url' });

  try {
    const axios = require('axios');
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': referer || url,
      },
      responseType: 'stream',
      timeout: 20000,
    });

    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    response.data.pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
