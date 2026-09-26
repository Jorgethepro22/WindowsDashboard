// Main Application Controller & pywebview API Bridge

let isUpdatingVolumeManually = false;
let volumeDebounceTimer = null;

// Wait for pywebview to inject window.pywebview.api
function waitForApi() {
  return new Promise((resolve) => {
    if (window.pywebview && window.pywebview.api) {
      resolve(window.pywebview.api);
    } else {
      window.addEventListener("pywebviewready", () => {
        resolve(window.pywebview.api);
      });
    }
  });
}

async function initApp() {
  const api = await waitForApi();

  // Setup Monitors dropdown
  setupMonitors(api);

  // Setup Event Handlers
  setupAudioHandlers(api);
  setupMediaHandlers(api);
  setupWindowControls(api);

  // Initial fetch and start polling loop
  pollData(api);
  setInterval(() => pollData(api), 1000);
}

async function setupMonitors(api) {
  try {
    const monitors = await api.get_monitors();
    const currentMonIdx = await api.get_current_monitor_index();
    const select = document.getElementById("monitor-select");
    if (!select || !monitors) return;

    select.innerHTML = "";
    monitors.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.index;
      opt.textContent = m.name;
      if (m.index === currentMonIdx) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    select.addEventListener("change", async (e) => {
      const idx = parseInt(e.target.value, 10);
      await api.switch_monitor(idx);
    });
  } catch (err) {
    console.warn("Could not load monitors:", err);
  }
}

function setupAudioHandlers(api) {
  const volSlider = document.getElementById("volume-range");
  const volText = document.getElementById("volume-val-text");
  const btnMute = document.getElementById("btn-mute");

  if (volSlider) {
    volSlider.addEventListener("input", (e) => {
      isUpdatingVolumeManually = true;
      const val = e.target.value;
      if (volText) volText.textContent = `${val}%`;

      clearTimeout(volumeDebounceTimer);
      volumeDebounceTimer = setTimeout(async () => {
        await api.set_volume(val);
        setTimeout(() => {
          isUpdatingVolumeManually = false;
        }, 500);
      }, 50);
    });
  }

  if (btnMute) {
    btnMute.addEventListener("click", async () => {
      await api.toggle_mute();
    });
  }
}

function setupMediaHandlers(api) {
  const btnPrev = document.getElementById("btn-prev");
  const btnPlayPause = document.getElementById("btn-play-pause");
  const btnNext = document.getElementById("btn-next");

  if (btnPrev) {
    btnPrev.addEventListener("click", async () => {
      await api.media_previous();
    });
  }

  if (btnPlayPause) {
    btnPlayPause.addEventListener("click", async () => {
      await api.media_play_pause();
    });
  }

  if (btnNext) {
    btnNext.addEventListener("click", async () => {
      await api.media_next();
    });
  }
}

function setupWindowControls(api) {
  const btnFullscreen = document.getElementById("btn-fullscreen");
  if (btnFullscreen) {
    btnFullscreen.addEventListener("click", async () => {
      await api.toggle_fullscreen();
    });
  }
}

// Main Polling Loop
async function pollData(api) {
  try {
    const data = await api.get_dashboard_data();
    if (!data) return;

    updateCpuUi(data.system.cpu);
    updateGpuUi(data.system.gpu);
    updateRamUi(data.system.ram);
    updateDisksUi(data.system.disks);
    updateNetworkUi(data.system.network);
    updateAudioUi(data.audio);
    updateMediaUi(data.media);
    updateWeatherUi(data.weather);
  } catch (err) {
    console.error("Dashboard poll error:", err);
  }
}

function setText(el, val) {
  if (el && el._lastVal !== val) {
    el._lastVal = val;
    el.textContent = val;
  }
}

function setWidth(el, pctStr) {
  if (el && el._lastWidth !== pctStr) {
    el._lastWidth = pctStr;
    el.style.width = pctStr;
  }
}

function updateCpuUi(cpu) {
  if (!cpu) return;
  const elTitle = document.getElementById("cpu-name-title");
  const pct = Math.round(cpu.percent);
  const elPct = document.getElementById("cpu-percent");
  const circle = document.getElementById("cpu-gauge-circle");
  const elFreq = document.getElementById("cpu-freq");
  const elPower = document.getElementById("cpu-power");
  const elCores = document.getElementById("cpu-cores");
  const elTempBadge = document.getElementById("cpu-temp-badge");

  if (elTitle && cpu.name) {
    const displayName = cpu.name.replace("Intel ", "").replace("AMD ", "").trim();
    setText(elTitle, displayName);
    elTitle.title = cpu.name;
  }

  setText(elPct, pct);
  setCircularGauge(circle, pct);
  setText(elCores, `${cpu.cores} / ${cpu.threads}`);
  setText(elFreq, `${cpu.freq_ghz} GHz`);
  if (elPower) {
    const powerStr = cpu.power_w !== undefined ? `${cpu.power_w} W` : "-- W";
    setText(elPower, powerStr);
  }
  updateTempBadge(elTempBadge, cpu.temp_c);
}

function updateGpuUi(gpu) {
  if (!gpu) return;
  const elTitle = document.getElementById("gpu-name-title");
  const elPct = document.getElementById("gpu-percent");
  const circle = document.getElementById("gpu-gauge-circle");
  const elTempBadge = document.getElementById("gpu-temp-badge");
  const elVramText = document.getElementById("vram-text");
  const elVramBar = document.getElementById("vram-bar-fill");
  const elClock = document.getElementById("gpu-clock");
  const elPower = document.getElementById("gpu-power");

  if (elTitle && gpu.name) {
    setText(elTitle, gpu.name.replace("NVIDIA GeForce ", ""));
  }

  const pct = Math.round(gpu.usage_percent || 0);
  setText(elPct, pct);
  setCircularGauge(circle, pct);

  if (elTempBadge) {
    updateTempBadge(elTempBadge, gpu.temp_c);
  }

  setText(elVramText, `${gpu.vram_used_gb} / ${gpu.vram_total_gb} GB (${gpu.vram_percent}%)`);
  setWidth(elVramBar, `${gpu.vram_percent}%`);

  if (elClock) {
    const clockStr = gpu.clock_mhz ? `${gpu.clock_mhz} MHz` : "-- MHz";
    setText(elClock, clockStr);
  }
  if (elPower) {
    const powerStr = gpu.power_w !== undefined ? `${gpu.power_w} W` : "-- W";
    setText(elPower, powerStr);
  }
}

function updateRamUi(ram) {
  if (!ram) return;
  const elPill = document.getElementById("ram-pct-pill");
  const elDetails = document.getElementById("ram-details");
  const elBar = document.getElementById("ram-bar-fill");

  const pct = Math.round(ram.percent);
  setText(elPill, `${pct}%`);
  setText(elDetails, `${ram.used_gb} GB / ${ram.total_gb} GB`);
  setWidth(elBar, `${pct}%`);
}

function updateDisksUi(disks) {
  if (!disks || disks.length === 0) return;
  const container = document.getElementById("disks-container");
  if (!container) return;

  if (!container._diskElements) {
    container._diskElements = {};
    container.innerHTML = "";
  }

  disks.forEach((disk) => {
    let el = container._diskElements[disk.id];
    if (!el) {
      el = document.createElement("div");
      el.className = "disk-row";

      const parts = disk.label.split(" ");
      const tag = parts.length > 1 ? parts[0] : "DISCO";
      const name = parts.length > 1 ? parts.slice(1).join(" ") : disk.label;

      el.innerHTML = `
        <div class="disk-header">
          <div class="disk-label-group">
            <span class="disk-tag">${tag}</span>
            <span class="disk-name">${name}</span>
          </div>
          <div class="disk-speeds">
            <span class="disk-speed-item read" title="Lectura">
              <span class="disk-arrow">↓</span><span class="d-read">${disk.read_speed}</span>
            </span>
            <span class="disk-speed-item write" title="Escritura">
              <span class="disk-arrow">↑</span><span class="d-write">${disk.write_speed}</span>
            </span>
          </div>
          <span class="disk-pct">${disk.usage_percent}%</span>
        </div>
        <div class="disk-bar-track">
          <div class="disk-bar-fill" style="width: ${disk.usage_percent}%"></div>
        </div>
      `;
      container.appendChild(el);
      container._diskElements[disk.id] = el;
      el._readEl = el.querySelector(".d-read");
      el._writeEl = el.querySelector(".d-write");
      el._pctEl = el.querySelector(".disk-pct");
      el._fillEl = el.querySelector(".disk-bar-fill");
    } else {
      setText(el._readEl, disk.read_speed);
      setText(el._writeEl, disk.write_speed);
      setText(el._pctEl, `${disk.usage_percent}%`);
      setWidth(el._fillEl, `${disk.usage_percent}%`);
    }
  });
}

function updateNetworkUi(net) {
  if (!net) return;
  const elDown = document.getElementById("net-down-speed");
  const elUp = document.getElementById("net-up-speed");

  setText(elDown, net.download);
  setText(elUp, net.upload);
}

function updateAudioUi(audio) {
  if (!audio) return;
  const elDevice = document.getElementById("audio-device-name");
  const volSlider = document.getElementById("volume-range");
  const volText = document.getElementById("volume-val-text");
  const iconVol = document.getElementById("icon-volume");

  if (elDevice && audio.device_name) {
    elDevice.textContent = audio.device_name;
  }

  if (!isUpdatingVolumeManually) {
    if (volSlider) volSlider.value = audio.volume;
    if (volText) volText.textContent = `${audio.volume}%`;
  }

  if (iconVol) {
    if (audio.is_muted || audio.volume === 0) {
      // Muted SVG
      iconVol.innerHTML = `<path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27l4.73 4.73H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
      iconVol.style.color = "var(--accent-red)";
    } else {
      // Normal Volume SVG
      iconVol.innerHTML = `<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
      iconVol.style.color = "var(--text-dim)";
    }
  }
}

function updateMediaUi(media) {
  if (!media) return;
  const elCover = document.getElementById("album-cover");
  const elTitle = document.getElementById("track-title");
  const elArtist = document.getElementById("track-artist");
  const elPlayIcon = document.getElementById("icon-play-state");
  const elAppBadge = document.getElementById("media-app-badge");

  const titleText = media.title || "Sin reproducción activa";
  if (elTitle && elTitle._lastText !== titleText) {
    elTitle._lastText = titleText;
    elTitle.textContent = titleText;
  }

  const artistText = media.artist || "Esperando reproductor de Windows...";
  if (elArtist && elArtist._lastText !== artistText) {
    elArtist._lastText = artistText;
    elArtist.textContent = artistText;
  }

  if (elCover) {
    if (media.thumbnail_base64) {
      if (elCover._lastThumb !== media.thumbnail_base64) {
        elCover._lastThumb = media.thumbnail_base64;
        elCover.src = `data:image/jpeg;base64,${media.thumbnail_base64}`;
      }
    } else if (!media.title || media.title === "Sin reproducción activa") {
      if (elCover._lastThumb !== "empty") {
        elCover._lastThumb = "empty";
        elCover.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%231f232d'><rect width='100' height='100'/><path fill='%23565d68' d='M50 35a15 15 0 100 30 15 15 0 000-30zm0 25a10 10 0 110-20 10 10 0 010 20z'/></svg>";
      }
    }
  }

  if (elAppBadge && media.app_name) {
    const badgeSpan = elAppBadge.querySelector("span");
    if (badgeSpan && badgeSpan._lastText !== media.app_name) {
      badgeSpan._lastText = media.app_name;
      badgeSpan.textContent = media.app_name;
    }
  }

  if (elPlayIcon && elPlayIcon._lastState !== media.is_playing) {
    elPlayIcon._lastState = media.is_playing;
    if (media.is_playing) {
      elPlayIcon.innerHTML = `<path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;
    } else {
      elPlayIcon.innerHTML = `<path fill="currentColor" d="M8 5v14l11-7z"/>`;
    }
  }
}

function updateWeatherUi(w) {
  if (!w) return;
  const elTemp = document.getElementById("weather-temp");
  const elCity = document.getElementById("weather-city");
  const elDesc = document.getElementById("weather-desc");
  const elIcon = document.getElementById("weather-icon");

  if (elTemp && w.temp !== undefined) setText(elTemp, `${w.temp}°C`);
  if (elCity && w.city) setText(elCity, w.city);
  if (elDesc && w.description) {
    const descText = w.last_update ? `${w.description} • ${w.last_update}` : w.description;
    setText(elDesc, descText);
  }
  if (elIcon && w.icon) {
    if (elIcon._lastIcon !== w.icon) {
      elIcon._lastIcon = w.icon;
      elIcon.innerHTML = getWeatherSvg(w.icon);
    }
  }
}

document.addEventListener("DOMContentLoaded", initApp);
