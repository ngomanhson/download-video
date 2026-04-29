const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

// Detect platform by URL
function detectPlatform(url) {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube';
  if (hostname.includes('tiktok.com')) return 'tiktok';
  if (hostname.includes('instagram.com')) return 'instagram';
  if (hostname.includes('facebook.com') || hostname.includes('fb.watch')) return 'facebook';
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'twitter';
  if (hostname.includes('vimeo.com')) return 'vimeo';
  if (hostname.includes('dailymotion.com')) return 'dailymotion';
  if (hostname.includes('twitch.tv')) return 'twitch';
  return 'generic';
}

// Check if URL is a direct video file
function isDirectVideoUrl(url) {
  const videoExts = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.3gp', '.ogv'];
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return videoExts.some(ext => pathname.endsWith(ext));
  } catch { return false; }
}

// Check if URL is HLS/M3U8
function isHLSUrl(url) {
  return url.includes('.m3u8') || url.includes('manifest') || url.includes('playlist');
}

// Check if URL is DASH/MPD
function isDASHUrl(url) {
  return url.includes('.mpd') || url.includes('manifest');
}

// Extract video sources from HTML content
function extractVideoSources(html, baseUrl) {
  const $ = cheerio.load(html);
  const sources = [];

  // <video> tags
  $('video').each((_, el) => {
    const src = $(el).attr('src');
    if (src) sources.push({ url: resolveUrl(src, baseUrl), type: 'video_tag', quality: 'unknown' });
    
    $(el).find('source').each((_, s) => {
      const ssrc = $(s).attr('src');
      const stype = $(s).attr('type') || '';
      const label = $(s).attr('label') || $(s).attr('size') || 'unknown';
      if (ssrc) sources.push({ 
        url: resolveUrl(ssrc, baseUrl), 
        type: stype || 'video_source',
        quality: label
      });
    });
  });

  // OG video meta
  $('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]').each((_, el) => {
    const content = $(el).attr('content');
    if (content) sources.push({ url: content, type: 'og_meta', quality: 'unknown' });
  });

  // JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      if (data.contentUrl) sources.push({ url: data.contentUrl, type: 'json_ld', quality: 'unknown' });
      if (data.embedUrl) sources.push({ url: data.embedUrl, type: 'json_ld_embed', quality: 'unknown' });
    } catch {}
  });

  return sources;
}

// Extract video info from inline JavaScript
function extractFromJavaScript(html, baseUrl) {
  const sources = [];
  
  // Patterns for common video players
  const patterns = [
    // JWPlayer
    /file:\s*["']([^"']+\.(?:mp4|m3u8|mpd|webm)[^"']*)/gi,
    // VideoJS
    /src:\s*["']([^"']+\.(?:mp4|m3u8|mpd|webm)[^"']*)/gi,
    // Generic mp4/m3u8 URLs in JS
    /["'](https?:\/\/[^"']+\.(?:mp4|m3u8|mpd|webm)[^"']*)/gi,
    // HLS manifests
    /["'](https?:\/\/[^"']*(?:manifest|playlist|index)[^"']*\.m3u8[^"']*)/gi,
    // DASH manifests
    /["'](https?:\/\/[^"']*\.mpd[^"']*)/gi,
    // Blob storage patterns
    /["'](https?:\/\/[^"']*(?:blob\.core|cloudfront|amazonaws|fastly|akamaized)[^"']+\.(?:mp4|m3u8)[^"']*)/gi,
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const url = match[1];
      if (url && url.startsWith('http')) {
        sources.push({
          url: url.replace(/\\/g, ''),
          type: isHLSUrl(url) ? 'hls' : isDASHUrl(url) ? 'dash' : 'direct',
          quality: 'unknown'
        });
      }
    }
  });

  return sources;
}

// Extract from iframes (embedded players)
async function extractFromIframes($, baseUrl) {
  const iframes = [];
  $('iframe').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src) {
      const resolved = resolveUrl(src, baseUrl);
      if (resolved.includes('youtube') || resolved.includes('vimeo') || 
          resolved.includes('dailymotion') || resolved.includes('player')) {
        iframes.push(resolved);
      }
    }
  });
  return iframes;
}

function resolveUrl(url, base) {
  try {
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return new URL(base).origin + url;
    if (!url.startsWith('http')) return new URL(url, base).href;
    return url;
  } catch { return url; }
}

function deduplicateSources(sources) {
  const seen = new Set();
  return sources.filter(s => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

async function analyzeUrl(url) {
  const platform = detectPlatform(url);
  const result = {
    url,
    platform,
    sources: [],
    iframes: [],
    method: null,
    title: null,
    thumbnail: null
  };

  // Direct video URL
  if (isDirectVideoUrl(url)) {
    result.sources.push({ url, type: 'direct', quality: 'original' });
    result.method = 'direct';
    return result;
  }

  // Direct HLS/DASH
  if (isHLSUrl(url)) {
    result.sources.push({ url, type: 'hls', quality: 'auto' });
    result.method = 'hls_ffmpeg';
    return result;
  }
  if (isDASHUrl(url)) {
    result.sources.push({ url, type: 'dash', quality: 'auto' });
    result.method = 'dash_ffmpeg';
    return result;
  }

  // Fetch the page
  let html = '';
  try {
    const response = await axios.get(url, {
      headers: { ...HEADERS, 'Referer': url },
      timeout: 15000,
      maxRedirects: 5,
    });
    html = response.data;
    if (typeof html !== 'string') html = JSON.stringify(html);
  } catch (err) {
    throw new Error(`Không thể tải trang: ${err.message}`);
  }

  const $ = cheerio.load(html);

  // Extract title & thumbnail
  result.title = $('title').text().trim() || 
                 $('meta[property="og:title"]').attr('content') || 
                 'Video';
  result.thumbnail = $('meta[property="og:image"]').attr('content') || null;

  // Extract from HTML
  const htmlSources = extractVideoSources(html, url);
  result.sources.push(...htmlSources);

  // Extract from JavaScript
  const jsSources = extractFromJavaScript(html, url);
  result.sources.push(...jsSources);

  // Extract iframes
  result.iframes = await extractFromIframes($, url);

  // Deduplicate
  result.sources = deduplicateSources(result.sources);

  // Classify method
  if (result.sources.length > 0) {
    const hasDirect = result.sources.find(s => s.type === 'direct' || isDirectVideoUrl(s.url));
    const hasHLS = result.sources.find(s => s.type === 'hls' || isHLSUrl(s.url));
    const hasDASH = result.sources.find(s => s.type === 'dash' || isDASHUrl(s.url));
    
    if (hasDirect) result.method = 'direct';
    else if (hasHLS) result.method = 'hls_ffmpeg';
    else if (hasDASH) result.method = 'dash_ffmpeg';
    else result.method = 'stream_proxy';
  } else if (['youtube', 'tiktok', 'instagram', 'facebook', 'twitter', 'vimeo', 'dailymotion'].includes(platform)) {
    result.method = 'ytdlp';
    result.sources.push({ url, type: platform, quality: 'best' });
  } else {
    result.method = 'ytdlp_fallback';
    result.sources.push({ url, type: 'unknown', quality: 'best' });
  }

  return result;
}

module.exports = { analyzeUrl, detectPlatform, isDirectVideoUrl, isHLSUrl, resolveUrl };
