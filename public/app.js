(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    connect: $("connectBtn"),
    overlay: $("connectOverlay"),
    select: $("channelSelect"),
    play: $("playBtn"),
    stop: $("stopBtn"),
    status: $("statusPill"),
    log: $("log"),
    nowPlaying: $("nowPlaying"),
    audio: $("radioAudio"),
    vol: $("vol"),
    volVal: $("volVal"),
  };

  const audio = els.audio;
  audio.preload = "none";
  audio.playsInline = true;

  const CONNECT_KEY = "enclave_connected_v1";
  const VOLUME_KEY = "enclave_volume_v1";

  let channels = [];
  let library = {};
  let audioArmed = false;
  let audioState = "LOCKED"; // LOCKED | ARMED | PLAYING

  function log(msg) {
    if (!els.log) return;
    els.log.textContent += (els.log.textContent ? "\n" : "") + msg;
    els.log.scrollTop = els.log.scrollHeight;
  }

  function setStatus(txt) {
    if (els.status) els.status.textContent = txt;
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function setVolumeFromUI(v) {
    const pct = clamp(parseInt(v, 10) || 0, 0, 100);
    audio.volume = pct / 100;
    if (els.volVal) els.volVal.textContent = `${pct}%`;
    try { localStorage.setItem(VOLUME_KEY, String(pct)); } catch {}
  }

  function loadSavedVolume() {
    let pct = 75;
    try {
      const saved = localStorage.getItem(VOLUME_KEY);
      if (saved !== null) pct = clamp(parseInt(saved, 10), 0, 100);
    } catch {}
    if (els.vol) els.vol.value = String(pct);
    setVolumeFromUI(pct);
  }

  function updateAudioUIState() {
    const locked = audioState === "LOCKED";
    if (els.vol) {
      els.vol.disabled = locked;
      els.vol.style.opacity = locked ? "0.45" : "1";
      els.vol.style.pointerEvents = locked ? "none" : "auto";
    }

  // --- STATIC BURST + TUNING FX ---
  let _fxCtx = null;
  function _getFxCtx() {
    if (_fxCtx) return _fxCtx;
    _fxCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _fxCtx;
  }

  async function playStaticBurst(ms = 180) {
    try {
      const ctx = _getFxCtx();
      if (ctx.state === "suspended") await ctx.resume();

      const dur = Math.max(60, Math.min(400, ms)) / 1000;
      const sr = ctx.sampleRate;
      const frameCount = Math.floor(sr * dur);

      // white noise buffer
      const buffer = ctx.createBuffer(1, frameCount, sr);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frameCount; i++) data[i] = (Math.random() * 2 - 1);

      const src = ctx.createBufferSource();
      src.buffer = buffer;

      // bandpass to feel like radio static
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1400;
      bp.Q.value = 0.9;

      // envelope (fade in/out) so it doesn't click
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
      gain.gain.linearRampToValueAtTime(0.0, now + dur);

      src.connect(bp);
      bp.connect(gain);
      gain.connect(ctx.destination);

      src.start();
      src.stop(now + dur + 0.01);
    } catch (_) {
      // ignore if blocked
    }
  }

  async function tuneThenPlay() {
    setStatus("AUDIO: TUNING…");
    updateAudioUIState();
    await playStaticBurst(180);
    setTimeout(() => { playSelected(); }, 500);
  }
  }

  function cleanTitle(filename) {
    let name = filename || "";
    name = name.replace(/\.(mp3|wav|m4a)$/i, "");
    if (name.includes(" - ")) name = name.split(" - ").pop();
    return name.trim();
  }

  function updateNowPlaying() {
    if (!els.nowPlaying) return;

    const src = audio.currentSrc || audio.src || "";
    const raw = decodeURIComponent(src.split("/").pop() || "");
    const title = cleanTitle(raw);

    els.nowPlaying.classList.remove("ticker");
    els.nowPlaying.innerHTML =
      `<span class="npLabel">CURRENTLY PLAYING — </span>` +
      `<span class="npText">${title || ""}</span>`;

    requestAnimationFrame(() => {
      const textEl = els.nowPlaying.querySelector(".npText");
      if (!textEl) return;

      if (textEl.scrollWidth > els.nowPlaying.clientWidth) {
        const seconds = Math.max(8, Math.min(18, Math.ceil(textEl.scrollWidth / 40)));
        textEl.style.animationDuration = `${seconds}s`;
        els.nowPlaying.classList.add("ticker");
      } else {
        textEl.style.animationDuration = "";
      }
    });
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${url} -> ${r.status}`);
    return r.json();
  }

  function keyFromFolder(folder) {
    return folder.split("/").filter(Boolean).pop();
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  async function refreshLibrary() {
    library = await fetchJSON("/api/library");
  }

  function populateChannels() {
    els.select.innerHTML = "";
    channels.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      els.select.appendChild(opt);
    });
  }

  function getSelectedChannel() {
    const id = els.select.value;
    return channels.find((c) => c.id === id) || channels[0];
  }

  function hideOverlayAnimated() {
    if (!els.overlay) return;
    els.overlay.classList.add("vault-exit");
    setTimeout(() => {
      try { els.overlay.remove(); } catch {}
    }, 420);
  }

  async function armAudioOnce() {
    if (audioArmed) return;

    audio.muted = true;
    audio.src = "data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAA==";
    try { await audio.play(); } catch {}
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;

    audioArmed = true;
    audioState = "ARMED";
    setStatus("AUDIO: ARMED");
    updateAudioUIState();
  }

  async function playSelected() {
    const ch = getSelectedChannel();
    if (!ch) return;

    if (ch.mode === "folder") {
      const key = keyFromFolder(ch.folder);
      const files = library[key] || [];
      if (!files.length) {
        setStatus("AUDIO: EMPTY");
        log(`> No audio files found in ${ch.folder}/`);
        return;
      }
      const file = pickRandom(files);
      audio.src = `${ch.folder}/${encodeURIComponent(file)}`;
    } else {
      audio.src = ch.src;
    }

    setStatus("AUDIO: LOADING");
    try {
      await audio.play();
      audioState = "PLAYING";
      setStatus("AUDIO: PLAYING");
      updateAudioUIState();
      updateNowPlaying();
    } catch (e) {
      setStatus("AUDIO: BLOCKED");
      log(`[ERROR] ${e.name}: ${e.message}`);
      log("> Tap CONNECT, then PLAY.");
    }
  }

  function stop() {
    audio.pause();
    audio.currentTime = 0;
    setStatus("AUDIO: STOPPED");
  }

  function alreadyConnected() {
    try { return localStorage.getItem(CONNECT_KEY) === "1"; } catch { return false; }
  }

  async function handleConnect(e) {
    e.preventDefault();
    e.stopPropagation();

    try { localStorage.setItem(CONNECT_KEY, "1"); } catch {}
    hideOverlayAnimated();

    await armAudioOnce();
    await playSelected();

    log("> CONNECTED.");
  }

  async function init() {
    audioState = "LOCKED";
    setStatus("AUDIO: LOCKED");
    updateAudioUIState();

    if (alreadyConnected() && els.overlay) {
      try { els.overlay.remove(); } catch {}
    }

    const cfg = await fetchJSON("/radio.json");
    channels = cfg.channels || [];
    populateChannels();

    await refreshLibrary();

    // Volume: change applies on release (reduces Android HUD spam)
    if (els.vol) {
      els.vol.addEventListener("input", (e) => {
        const pct = clamp(parseInt(e.target.value, 10) || 0, 0, 100);
        if (els.volVal) els.volVal.textContent = `${pct}%`;
      });
      els.vol.addEventListener("change", (e) => setVolumeFromUI(e.target.value));
    }
    loadSavedVolume();

    els.connect?.addEventListener("click", handleConnect);
    els.play?.addEventListener("click", playSelected);
    // AUTO_PLAY_ON_CHANNEL_CHANGE
    els.select?.addEventListener("change", () => {
      try { audio.pause(); audio.currentTime = 0; } catch {}
      tuneThenPlay();
    });
els.stop?.addEventListener("click", stop);
    // AUTO_PLAY_ON_CHANNEL_CHANGE (forced)
    els.select?.addEventListener("change", () => {
      // If user hasn't CONNECTed yet, don't try to play
      if (audioState === "LOCKED") {
        log("> Tap CONNECT to arm audio first.");
        setStatus("AUDIO: LOCKED");
        return;
      }
      try { audio.pause(); audio.currentTime = 0; } catch {}
      // Tuning FX then play
      if (typeof tuneThenPlay === "function") {
        tuneThenPlay();
      } else {
        // fallback: immediate play
        playSelected();
      }
    });


    audio.addEventListener("play", updateNowPlaying);
    audio.addEventListener("ended", () => playSelected());
  }

  window.addEventListener("load", () => {
    init().catch((e) => {
      console.error(e);
      log(`[ERROR] Init failed: ${e.message}`);
    });
  });
})();
