/*
  player.js
  - Contains channel list
  - Fetches MPD via API (POST)
  - Loads into Shaka Player
  - Auto-refresh logic
  - Debug logging
*/

/* ---------------- CONFIG ---------------- */
const API_URL = "https://app.swaxnet.xyz/api/mpd-url";
const API_BEARER = "Bearer 51b969b5ddee963de6c75686eb75adfd5709f31fd04335ee0a2654498868";

/* refresh interval in ms (default 5 minutes) */
let refreshInterval = 300000;

/* ---------------- CHANNEL LIST (edit here only) ----------------
   Only keep channel metadata here (id, name, optional logo).
   No MPD / tokens / DRM keys in HTML.
*/
const CHANNELS = [
  {
    id: "CH-3974c2cd-9ec4-4d03-82b1-9c993973e487",
    slug: "AzamSport1",
    name: "Azam Sport 1",
    logoText: "AS1"
  },
  {
    id: "CH-11111111-2222-3333-4444-555555555555",
    slug: "AzamSport2",
    name: "Azam Sport 2",
    logoText: "AS2"
  },
  {
    id: "CH-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    slug: "AzamMovies",
    name: "Azam Movies",
    logoText: "MOV"
  }
];

/* ---------------- STATE ---------------- */
let player = null;
let currentChannelId = null;
let refreshTimer = null;
let debugMode = false;

/* ---------------- DOM helpers ---------------- */
function $(id){ return document.getElementById(id); }
function debugLog(msg, type = "info") {
  if (!debugMode) return;
  const log = $("debugLog");
  if (!log) return;
  const d = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = `log-entry log-${type}`;
  entry.textContent = `${d} - ${msg}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

/* status dot helper */
function updateStatus(indicator, on) {
  const dot = $("status" + indicator);
  if (!dot) return;
  dot.classList.toggle("active", !!on);
}

/* ---------------- UI: Channels grid ---------------- */
function buildChannelsGrid() {
  const grid = $("channelsGrid");
  grid.innerHTML = "";
  CHANNELS.forEach(ch => {
    const card = document.createElement("div");
    card.className = "channel-card";
    card.title = ch.name;
    card.onclick = () => loadChannel(ch.id);

    const thumb = document.createElement("div");
    thumb.className = "channel-thumb";
    thumb.textContent = ch.logoText || ch.slug || ch.name.slice(0,3);
    thumb.style.fontSize = "14px";
    thumb.style.color = "#ddd";

    const name = document.createElement("div");
    name.className = "channel-name";
    name.textContent = ch.name;

    card.appendChild(thumb);
    card.appendChild(name);
    grid.appendChild(card);
  });
}

/* ---------------- API: fetch MPD for a channel ----------------
   Expects API to return JSON like: { mpd_url: "https://...." }
   Adjust if your API differs (e.g. nested fields).
*/
async function fetchChannelMpd(channelId) {
  updateStatus('Api', false);
  try {
    debugLog(`Requesting MPD for ${channelId}`, 'info');
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": API_BEARER,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ channel_id: channelId })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status} - ${text}`);
    }

    const json = await res.json();
    // Common key names: mpd_url or data.mpd_url — adapt as needed
    const mpd = json.mpd_url || (json.data && json.data.mpd_url) || null;
    if (!mpd) throw new Error("API returned no mpd_url");

    updateStatus('Api', true);
    debugLog("MPD received", 'success');
    return mpd;
  } catch (err) {
    debugLog(`fetchChannelMpd error: ${err.message}`, 'error');
    updateStatus('Api', false);
    throw err;
  }
}

/* ---------------- Shaka player helpers ---------------- */
async function initShaka() {
  const video = $("videoPlayer");
  if (!video) throw new Error("Video element missing");

  if (!shaka.Player.isBrowserSupported()) {
    updateStatus('Player', false);
    throw new Error("Shaka Player not supported in this browser");
  }

  player = new shaka.Player(video);

  // Optional: log Shaka errors to debug
  player.addEventListener('error', e => {
    debugLog("Shaka error: " + (e.detail && e.detail.message ? e.detail.message : JSON.stringify(e)), 'error');
    updateStatus('Player', false);
    showLoading(`Player error`);
  });

  setupPlayerEvents();
  updateStatus('Player', true);
}

function setupPlayerEvents() {
  if (!player) return;
  player.addEventListener('loading', () => { showLoading('Loading stream...'); debugLog('Shaka: loading', 'info'); });
  player.addEventListener('loaded', () => { hideLoading(); debugLog('Shaka: loaded', 'success'); updateStatus('Stream', true); });
  player.addEventListener('buffering', e => {
    if (e.buffering) { showLoading('Buffering...'); debugLog('Buffering', 'warning'); } else hideLoading();
  });
}

/* Minimal DRM support if ClearKey (optional)
   If your API provides clearKey info you can configure it here.
   For now we do nothing visibly — keep status Drm=false until configured.
*/
async function configureDRMFromApiData(drmData) {
  // drmData can contain clearKeys mapping { keyId: key } or license server info.
  // This function is a placeholder if your API returns DRM metadata.
  if (!player) return;
  if (drmData && drmData.clearKeys) {
    try {
      player.configure({ drm: { clearKeys: drmData.clearKeys } });
      updateStatus('Drm', true);
      debugLog("Configured ClearKey DRM", 'success');
    } catch (err) {
      updateStatus('Drm', false);
      debugLog("DRM config failed: " + err.message, 'error');
    }
  } else {
    updateStatus('Drm', false);
  }
}

/* ---------------- Loading a channel ---------------- */
async function loadChannel(channelId) {
  const channel = CHANNELS.find(c => c.id === channelId);
  if (!channel) return;
  currentChannelId = channelId;

  // update header title/logo/technical tab
  $('headerTitle').textContent = channel.name;
  $('headerLogo').textContent = (channel.logoText || channel.name.slice(0,3)).toUpperCase();
  $('technicalChannel').textContent = channel.name;

  debugLog(`Loading channel ${channel.name}`, 'info');

  try {
    showLoading('Fetching stream info...');
    const mpd = await fetchChannelMpd(channelId);

    // optional: if API returns DRM info as well, configure it:
    // await configureDRMFromApiData(maybeJson.drm);

    // load with Shaka
    if (!player) {
      await initShaka();
    }

    debugLog('Loading MPD into player', 'info');
    await player.load(mpd); // shaka will throw on error
    hideLoading();
    updateStatus('Stream', true);
    debugLog(`Channel ${channel.name} playing`, 'success');

    // update last update timestamp & set refresh timer
    $('lastUpdate').textContent = new Date().toLocaleTimeString();
    startRefreshTimer();

    // store mpd for manual refresh if needed
    return mpd;
  } catch (err) {
    debugLog(`loadChannel failed: ${err.message}`, 'error');
    hideLoading();
    updateStatus('Stream', false);
    throw err;
  }
}

/* ---------------- Refresh logic ---------------- */
async function refreshStream() {
  if (!currentChannelId) {
    debugLog("No channel selected to refresh", 'warning');
    return;
  }

  debugLog("Manual refresh triggered", 'info');
  showLoading('Refreshing stream...');
  try {
    const mpd = await fetchChannelMpd(currentChannelId);
    if (player) {
      await player.load(mpd);
      debugLog("Stream reloaded after refresh", 'success');
    }
    $('lastUpdate').textContent = new Date().toLocaleTimeString();
  } catch (err) {
    debugLog("Refresh failed: " + err.message, 'error');
  } finally {
    hideLoading();
    startRefreshTimer();
  }
}

function startRefreshTimer() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    debugLog("Auto-refresh triggered", 'info');
    refreshStream();
  }, refreshInterval);

  const next = new Date(Date.now() + refreshInterval);
  $('nextRefresh').textContent = next.toLocaleTimeString();
  $('refreshIntervalLabel').textContent = `${Math.round(refreshInterval/1000)} seconds (${Math.round(refreshInterval/60)} minutes)`;
  updateStatus('Refresh', true);
}

/* ---------------- Loading UI helpers ---------------- */
function showLoading(message = "Loading...") {
  const overlay = $("playerLoading");
  const text = $("loadingText");
  if (overlay) overlay.style.display = 'flex';
  if (text) text.textContent = message;
}
function hideLoading() {
  const overlay = $("playerLoading");
  if (overlay) overlay.style.display = 'none';
}

/* ---------------- Player controls (wired to HTML) ---------------- */
function playVideo() {
  const v = $('videoPlayer');
  if (!v) return;
  v.play().catch(() => debugLog('Play prevented (user gesture required)', 'warning'));
  debugLog('Play command', 'info');
}
function pauseVideo() {
  const v = $('videoPlayer');
  if (!v) return;
  v.pause();
  debugLog('Pause command', 'info');
}
async function resetPlayer() {
  debugLog('Resetting player', 'info');
  try {
    if (player) { await player.destroy(); player = null; }
  } catch (e) { debugLog('Error destroying player: ' + e, 'warning'); }
  if (refreshTimer) clearTimeout(refreshTimer);
  if (currentChannelId) await loadChannel(currentChannelId);
}
function toggleFullscreen() {
  const v = $('videoPlayer');
  if (!v) return;
  if (!document.fullscreenElement) {
    if (v.requestFullscreen) v.requestFullscreen();
    else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
    else if (v.mozRequestFullScreen) v.mozRequestFullScreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
}

/* ---------------- Debug UI ---------------- */
function toggleDebug() {
  const panel = $('debugPanel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
  debugMode = panel.style.display === 'block';
  debugLog('Debug ' + (debugMode ? 'enabled' : 'disabled'), 'info');
}
function clearLog() {
  const log = $('debugLog');
  if (log) log.innerHTML = '';
  debugLog('Log cleared', 'info');
}

/* ---------------- Tabs ---------------- */
function switchTab(tabId, ev) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  const tab = document.getElementById(tabId);
  if (tab) tab.classList.add('active');
  if (ev && ev.currentTarget) ev.currentTarget.classList.add('active');
}

/* ---------------- Init on DOM ready ---------------- */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    buildChannelsGrid();
    updateStatus('Api', false);
    updateStatus('Player', false);
    updateStatus('Drm', false);
    updateStatus('Refresh', false);
    updateStatus('Stream', false);
    $('apiStatus').textContent = 'Connecting...';

    // Attempt to init shaka early to detect support
    try {
      await initShaka();
      $('apiStatus').textContent = 'Ready';
    } catch (e) {
      $('apiStatus').textContent = 'Shaka unsupported';
      debugLog('Shaka init failed: ' + e.message, 'error');
    }

    // Optionally auto-select first channel
    if (CHANNELS.length) {
      // auto-load the first channel
      loadChannel(CHANNELS[0].id).catch(err => debugLog('Auto-load failed: ' + err.message, 'error'));
    }

    startRefreshTimer();
    debugLog('Player script initialized', 'success');
  } catch (err) {
    debugLog('Initialization error: ' + err.message, 'error');
  }
});

/* expose some functions globally so HTML onClick works */
window.playVideo = playVideo;
window.pauseVideo = pauseVideo;
window.refreshStream = refreshStream;
window.resetPlayer = resetPlayer;
window.toggleDebug = toggleDebug;
window.toggleFullscreen = toggleFullscreen;
window.switchTab = switchTab;
window.clearLog = clearLog;
