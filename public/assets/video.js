// Video links pasted in the admin panel: Cloudflare Stream (link, embed code or bare ID) or YouTube.
(() => {
  // Player options set in the Stream dashboard and carried in the pasted link / embed code: the cover
  // (poster), start time, captions. Colours and letterbox stay ours.
  const KEEP = ['poster', 'startTime', 'defaultTextTrack'];
  function streamOptions(s) {
    const m = s.match(/https?:\/\/[^\s"'<>]*?(?:cloudflarestream\.com|videodelivery\.net)\/[a-f0-9]{32}[^\s"'<>]*/i);
    if (!m) return {};
    let q;
    try { q = new URL(m[0].replace(/&amp;/g, '&')).searchParams; } catch (_) { return {}; }
    const out = {};
    for (const k of KEEP) { const v = q.get(k); if (v) out[k] = v; }
    // A cover taken from the video itself is requested sharp enough for a large player.
    if (out.poster && /cloudflarestream\.com\/[a-f0-9]{32}\/thumbnails\//i.test(out.poster)) {
      try { const u = new URL(out.poster); u.searchParams.set('height', '1080'); u.searchParams.delete('width'); out.poster = u.toString(); } catch (_) {}
    }
    return out;
  }

  function parseVideo(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    let m;
    // Cloudflare Stream: customer-xxx.cloudflarestream.com/<uid>/..., iframe.videodelivery.net/<uid>, watch.cloudflarestream.com/<uid>
    if ((m = s.match(/(customer-[a-z0-9]+\.cloudflarestream\.com)\/([a-f0-9]{32})/i))) return { type: 'stream', host: m[1].toLowerCase(), id: m[2].toLowerCase(), opts: streamOptions(s) };
    if ((m = s.match(/(?:videodelivery\.net|cloudflarestream\.com)\/([a-f0-9]{32})/i))) return { type: 'stream', host: '', id: m[1].toLowerCase(), opts: streamOptions(s) };
    if ((m = s.match(/^([a-f0-9]{32})$/i))) return { type: 'stream', host: '', id: m[1].toLowerCase() };
    // YouTube
    if ((m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/))) return { type: 'youtube', id: m[1] };
    return null;
  }

  function describe(v) {
    if (!v) return '';
    if (v.type !== 'stream') return `YouTube, ID ${v.id}`;
    const extra = [v.opts && v.opts.poster ? 'с обложкой' : '', v.opts && v.opts.startTime ? `старт с ${v.opts.startTime}` : ''].filter(Boolean).join(', ');
    return `Cloudflare Stream, ID ${v.id}${extra ? ' — ' + extra : ''}`;
  }

  let ytReady = null;
  function loadYouTubeApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (!ytReady) ytReady = new Promise((res, rej) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev && prev(); res(); };
      const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { ytReady = null; rej(new Error('youtube api')); };
      document.head.appendChild(s);
    });
    return ytReady;
  }
  let streamSdk = null;
  function loadStreamSdk() {
    if (window.Stream) return Promise.resolve();
    if (!streamSdk) streamSdk = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'https://embed.cloudflarestream.com/embed/sdk.latest.js';
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
    return streamSdk;
  }

  // Mounts a player into `box`. Calls onEnded when the video finishes, or onUnavailable when
  // the end of the video can't be detected (player API blocked); returns { replay }.
  function mountPlayer(box, raw, { emptyText, onEnded, onUnavailable } = {}) {
    const v = parseVideo(raw);
    box.querySelectorAll('iframe, .yt, .player-empty').forEach(n => n.remove());
    if (!v) {
      const p = document.createElement('div'); p.className = 'player-empty'; p.textContent = emptyText || '';
      box.appendChild(p);
      return { replay() {} };
    }
    if (v.type === 'stream') {
      const base = v.host ? `https://${v.host}/${v.id}/iframe` : `https://iframe.videodelivery.net/${v.id}`;
      const f = document.createElement('iframe');
      const q = new URLSearchParams({ ...(v.opts || {}), primaryColor: '#ffffff', letterboxColor: '#000000', preload: 'metadata' });   // black letterbox, never the page's light background
      f.src = `${base}?${q}`;
      f.allow = 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true; f.title = 'Видео';
      box.appendChild(f);
      let player = null;
      loadStreamSdk().then(() => {
        player = window.Stream(f);
        player.addEventListener('ended', () => onEnded && onEnded());
      }).catch(() => onUnavailable && onUnavailable());
      return { replay() { if (player) { player.currentTime = 0; player.play(); } } };
    }
    const holder = document.createElement('div'); holder.className = 'yt'; box.appendChild(holder);
    let player = null;
    loadYouTubeApi().then(() => {
      player = new window.YT.Player(holder, {
        host: 'https://www.youtube-nocookie.com', videoId: v.id, width: '100%', height: '100%',
        playerVars: { rel: 0, playsinline: 1, modestbranding: 1 },
        events: { onStateChange: e => { if (e.data === 0 && onEnded) onEnded(); } },
      });
    }).catch(() => {
      // API blocked: fall back to a plain embed so the video still plays.
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${v.id}?rel=0&playsinline=1`;
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true; f.title = 'Видео';
      holder.replaceWith(f);
      onUnavailable && onUnavailable();
    });
    return { replay() { if (player) { player.seekTo(0); player.playVideo(); } } };
  }

  window.BirVideo = { parseVideo, describe, mountPlayer };
})();
