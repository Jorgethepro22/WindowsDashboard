// UI Components & Gauges Helper

const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 58; // approx 364.42

function setCircularGauge(circleElement, percent) {
  if (!circleElement) return;
  const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  if (circleElement._lastPct === pct) return;
  circleElement._lastPct = pct;
  const offset = GAUGE_CIRCUMFERENCE - (pct / 100) * GAUGE_CIRCUMFERENCE;
  circleElement.style.strokeDashoffset = offset;
}

function updateTempBadge(badgeElement, temp) {
  if (!badgeElement) return;
  if (temp === null || temp === undefined || isNaN(temp)) {
    if (badgeElement._lastTemp !== "--") {
      badgeElement._lastTemp = "--";
      badgeElement.innerHTML = `<span class="temp-indicator">-- °C</span>`;
    }
    return;
  }
  const t = Math.round(temp);
  let statusClass = "temp-safe";
  if (t >= 75) {
    statusClass = "temp-hot";
  } else if (t >= 65) {
    statusClass = "temp-warm";
  }
  const key = `${t}_${statusClass}`;
  if (badgeElement._lastKey === key) return;
  badgeElement._lastKey = key;
  badgeElement.innerHTML = `<span class="temp-indicator ${statusClass}">${t} °C</span>`;
}

const WEATHER_SVGS = {
  "sun": `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5c.55 0 1 .45 1 1v2c0 .55-.45 1-1 1s-1-.45-1-1V3c0-.55.45-1 1-1zm0 18c.55 0 1 .45 1 1v2c0 .55-.45 1-1 1s-1-.45-1-1v-2c0-.55.45-1 1-1zm10-8c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1s.45-1 1-1h2c.55 0 1 .45 1 1zM5 12c0 .55-.45 1-1 1H2c-.55 0-1-.45-1-1s.45-1 1-1h2c.55 0 1 .45 1 1z"/></svg>`,
  "moon": `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12.3 2a10 10 0 0 0-.19 20 10 10 0 0 0 8.35-4.52 1 1 0 0 0-.9-1.5 8 8 0 1 1-8.76-13.88 1 1 0 0 0 .5-1.1A1 1 0 0 0 12.3 2z"/></svg>`,
  "cloud-sun": `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8.25 11.25a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0zm11.08 3.25A5.5 5.5 0 0 0 12 9.5a5.45 5.45 0 0 0-3.32 1.13A6 6 0 1 0 6 22h13.33a4 4 0 0 0 0-7.5z"/></svg>`,
  "cloud-moon": `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.33 14.5a4 4 0 0 0-4-3.5 4 4 0 0 0-.7.06A6 6 0 1 0 6 22h13.33a4 4 0 0 0 0-7.5z"/></svg>`,
  "cloud": `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>`,
  "rain": `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM10 21l-2 3h2l2-3zm4 0l-2 3h2l2-3z"/></svg>`,
  "rain-light": `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM9 22l-1 2h2l1-2zm6 0l-1 2h2l1-2z"/></svg>`,
  "rain-heavy": `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM7 21l-2 3h2l2-3zm5 0l-2 3h2l2-3zm5 0l-2 3h2l2-3z"/></svg>`,
  "thunder": `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM11 15v3H9l4 6v-5h2l-4-4z"/></svg>`,
  "fog": `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM3 21h18v1.5H3zm0-3h18v1.5H3z"/></svg>`,
  "snow": `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM11 20h2v2h-2zm-4 0h2v2H7zm8 0h2v2h-2z"/></svg>`
};

function getWeatherSvg(iconKey) {
  return WEATHER_SVGS[iconKey] || WEATHER_SVGS["sun"];
}

const WIDGET_DEFINITIONS = {
  cpu: {
    type: "cpu",
    name: "CPU Telemetría",
    defaultW: 2,
    defaultH: 2,
    render: (id) => `
      <div class="card hw-card cpu-card widget-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget">
          <span class="delete-x">×</span>
        </div>
        <div class="card-header">
          <div class="card-title-group">
            <span class="card-badge">PROCESADOR</span>
            <h2 class="card-title" id="${id}_title">Core Ultra 5 250K Plus</h2>
          </div>
          <div class="card-extra" id="${id}_temp">
            <span class="temp-indicator">-- °C</span>
          </div>
        </div>
        <div class="gauge-container compact-gauge">
          <div class="circular-gauge">
            <svg viewBox="0 0 140 140" class="gauge-svg">
              <circle class="gauge-bg" cx="70" cy="70" r="58"></circle>
              <circle class="gauge-fill cpu-fill" cx="70" cy="70" r="58" id="${id}_circle"></circle>
            </svg>
            <div class="gauge-value-overlay">
              <span class="gauge-number" id="${id}_percent">0</span>
              <span class="gauge-unit">%</span>
            </div>
          </div>
        </div>
        <div class="hw-details-list">
          <div class="detail-row">
            <span class="detail-label">Núcleos / Hilos</span>
            <span class="detail-value" id="${id}_cores">-- / --</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Frecuencia</span>
            <span class="detail-value" id="${id}_freq">0.0 GHz</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Consumo</span>
            <span class="detail-value" id="${id}_power">0 W</span>
          </div>
        </div>
      </div>
    `
  },
  gpu: {
    type: "gpu",
    name: "GPU Telemetría",
    defaultW: 2,
    defaultH: 2,
    render: (id) => `
      <div class="card hw-card gpu-card widget-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget">
          <span class="delete-x">×</span>
        </div>
        <div class="card-header">
          <div class="card-title-group">
            <span class="card-badge">GRÁFICA</span>
            <h2 class="card-title" id="${id}_title">RTX 4060 Ti</h2>
          </div>
          <div class="card-extra" id="${id}_temp">
            <span class="temp-indicator">-- °C</span>
          </div>
        </div>
        <div class="gauge-container compact-gauge">
          <div class="circular-gauge">
            <svg viewBox="0 0 140 140" class="gauge-svg">
              <circle class="gauge-bg" cx="70" cy="70" r="58"></circle>
              <circle class="gauge-fill gpu-fill" cx="70" cy="70" r="58" id="${id}_circle"></circle>
            </svg>
            <div class="gauge-value-overlay">
              <span class="gauge-number" id="${id}_percent">0</span>
              <span class="gauge-unit">%</span>
            </div>
          </div>
        </div>
        <div class="vram-section compact-vram">
          <div class="bar-header">
            <span class="bar-title">VRAM</span>
            <span class="bar-stats" id="${id}_vram_text">0 / 0 GB (0%)</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill vram-fill" id="${id}_vram_bar" style="width: 0%"></div>
          </div>
        </div>
        <div class="hw-details-list">
          <div class="detail-row">
            <span class="detail-label">Frecuencia Reloj</span>
            <span class="detail-value" id="${id}_clock">0 MHz</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Consumo</span>
            <span class="detail-value" id="${id}_power">0 W</span>
          </div>
        </div>
      </div>
    `
  },
  disks: {
    type: "disks",
    name: "Discos & RAM",
    defaultW: 2,
    defaultH: 2,
    render: (id) => `
      <div class="card hw-card ram-storage-card widget-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget">
          <span class="delete-x">×</span>
        </div>
        <div class="card-header">
          <div class="card-title-group">
            <span class="card-badge">MEMORIA & DISCOS</span>
            <h2 class="card-title">RAM & ACTIVIDAD</h2>
          </div>
          <span class="status-pill-small" id="${id}_ram_pill">0%</span>
        </div>
        
        <div class="resource-block compact-block">
          <div class="bar-header">
            <span class="bar-title">RAM</span>
            <span class="bar-stats" id="${id}_ram_details">0.0 / 0.0 GB</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill ram-fill" id="${id}_ram_bar" style="width: 0%"></div>
          </div>
        </div>

        <div class="disks-container compact-disks" id="${id}_disks_container">
          <!-- Disks rows populated dynamically -->
        </div>

        <div class="network-telemetry compact-net">
          <div class="net-row">
            <div class="net-info">
              <svg class="net-icon down" viewBox="0 0 24 24"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              <span class="net-label">Descarga</span>
            </div>
            <span class="net-speed" id="${id}_net_down">0.0 KB/s</span>
          </div>
          <div class="net-row">
            <div class="net-info">
              <svg class="net-icon up" viewBox="0 0 24 24"><path fill="currentColor" d="M5 15h4v6h6v-6h4l-7-7-7 7zm14-10V3H5v2h14z"/></svg>
              <span class="net-label">Subida</span>
            </div>
            <span class="net-speed" id="${id}_net_up">0.0 KB/s</span>
          </div>
        </div>
      </div>
    `
  },
  summary: {
    type: "summary",
    name: "Recursos Simplificados",
    defaultW: 2,
    defaultH: 2,
    render: (id) => `
      <div class="card summary-card widget-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget">
          <span class="delete-x">×</span>
        </div>
        <div class="card-header">
          <div class="card-title-group">
            <span class="card-badge">VISTA RÁPIDA</span>
            <h2 class="card-title">RECURSOS</h2>
          </div>
          <span class="summary-chip" id="${id}_chip">EN LÍNEA</span>
        </div>

        <div class="summary-list">
          <div class="summary-row">
            <span class="sm-label">CPU</span>
            <div class="sm-bar-track"><div class="sm-bar-fill cpu-sm" id="${id}_cpu_bar" style="width: 0%"></div></div>
            <span class="sm-val" id="${id}_cpu_val">0%</span>
          </div>
          <div class="summary-row">
            <span class="sm-label">GPU</span>
            <div class="sm-bar-track"><div class="sm-bar-fill gpu-sm" id="${id}_gpu_bar" style="width: 0%"></div></div>
            <span class="sm-val" id="${id}_gpu_val">0%</span>
          </div>
          <div class="summary-row">
            <span class="sm-label">RAM</span>
            <div class="sm-bar-track"><div class="sm-bar-fill ram-sm" id="${id}_ram_bar" style="width: 0%"></div></div>
            <span class="sm-val" id="${id}_ram_val">0%</span>
          </div>
          <div class="summary-row">
            <span class="sm-label">VRAM</span>
            <div class="sm-bar-track"><div class="sm-bar-fill vram-sm" id="${id}_vram_bar" style="width: 0%"></div></div>
            <span class="sm-val" id="${id}_vram_val">0%</span>
          </div>
          <div class="summary-row">
            <span class="sm-label">DISCOS</span>
            <div class="sm-bar-track"><div class="sm-bar-fill disk-sm" id="${id}_disk_bar" style="width: 0%"></div></div>
            <span class="sm-val" id="${id}_disk_val">0%</span>
          </div>
          <div class="summary-row net-summary-row">
            <span class="sm-label">RED</span>
            <span class="sm-net-speeds" id="${id}_net_val">↓ 0 KB/s  ↑ 0 KB/s</span>
          </div>
        </div>
      </div>
    `
  },
  media: {
    type: "media",
    name: "Reproductor Multimedia",
    defaultW: 3,
    defaultH: 1,
    render: (id) => `
      <div class="card hw-card media-compact-card widget-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget">
          <span class="delete-x">×</span>
        </div>
        <div class="card-header">
          <div class="card-title-group">
            <span class="card-badge">CENTRO MULTIMEDIA</span>
            <h2 class="card-title">AUDIO & REPRODUCCIÓN</h2>
          </div>
          <div class="media-app-badge" id="${id}_app_badge">
            <span id="${id}_source_app">Windows SMTC</span>
          </div>
        </div>
        <div class="media-compact-body">
          <div class="media-compact-thumb-box">
            <img id="${id}_cover" class="media-compact-cover" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%231f232d'><rect width='100' height='100'/><path fill='%23565d68' d='M50 35a15 15 0 100 30 15 15 0 000-30zm0 25a10 10 0 110-20 10 10 0 010 20z'/></svg>" alt="Cover">
          </div>
          <div class="media-compact-info">
            <div class="media-compact-title" id="${id}_track_title">Sin reproducción activa</div>
            <div class="media-compact-artist" id="${id}_track_artist">Esperando reproductor...</div>
          </div>
          <div class="media-compact-controls">
            <button class="btn-compact-ctrl btn-prev" title="Anterior">
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <button class="btn-compact-ctrl btn-play btn-play-pause" title="Reproducir / Pausa">
              <svg class="icon-play-state" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
            </button>
            <button class="btn-compact-ctrl btn-next" title="Siguiente">
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    `
  },
  audio: {
    type: "audio",
    name: "Audio E/S",
    defaultW: 2,
    defaultH: 2,
    render: (id) => `
      <div class="card hw-card audio-io-card widget-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget">
          <span class="delete-x">×</span>
        </div>
        <div class="card-header">
          <div class="card-title-group">
            <span class="card-badge">DISPOSITIVOS DE AUDIO</span>
            <h2 class="card-title">ENTRADA / SALIDA</h2>
          </div>
        </div>

        <div class="audio-io-sections">
          <!-- SALIDA DE AUDIO -->
          <div class="audio-io-channel">
            <div class="audio-channel-header">
              <span class="audio-channel-tag"><span class="tag-icon">🔊</span> SALIDA</span>
            </div>
            <div class="audio-select-wrapper">
              <select class="custom-audio-select output-device-select" id="${id}_output_select" title="Dispositivo de salida">
                <option value="">Cargando dispositivos...</option>
              </select>
            </div>
            <div class="audio-slider-row">
              <button class="btn-audio-mute btn-output-mute" id="${id}_output_mute_btn" title="Silenciar / Activar salida">
                <svg class="audio-mute-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
              </button>
              <div class="audio-range-track">
                <input type="range" min="0" max="100" value="50" class="custom-slider output-volume-range" id="${id}_output_vol_range">
                <div class="audio-range-fill output-range-fill" id="${id}_output_range_fill" style="width: 50%"></div>
              </div>
              <span class="audio-val-number output-volume-val-text" id="${id}_output_vol_text">50%</span>
            </div>
          </div>

          <!-- ENTRADA DE AUDIO -->
          <div class="audio-io-channel">
            <div class="audio-channel-header">
              <span class="audio-channel-tag input-tag"><span class="tag-icon">🎙️</span> ENTRADA</span>
            </div>
            <div class="audio-select-wrapper">
              <select class="custom-audio-select input-device-select" id="${id}_input_select" title="Dispositivo de entrada">
                <option value="">Cargando micrófonos...</option>
              </select>
            </div>
            <div class="audio-slider-row">
              <button class="btn-audio-mute btn-input-mute" id="${id}_input_mute_btn" title="Silenciar / Activar micrófono">
                <svg class="audio-mute-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
              </button>
              <div class="audio-range-track">
                <input type="range" min="0" max="100" value="70" class="custom-slider input-volume-range" id="${id}_input_vol_range">
                <div class="audio-range-fill input-range-fill" id="${id}_input_range_fill" style="width: 70%"></div>
              </div>
              <span class="audio-val-number input-volume-val-text" id="${id}_input_vol_text">70%</span>
            </div>
          </div>
        </div>
      </div>
    `
  },
  shortcut: {
    type: "shortcut",
    name: "Acceso Directo",
    defaultW: 1,
    defaultH: 1,
    render: (id, widgetData) => {
      const mode = (widgetData && widgetData.mode) || "image";
      const image = (widgetData && widgetData.image) || "";
      const text = (widgetData && widgetData.title) || "";
      const target = (widgetData && widgetData.target) || "";

      let contentHtml = "";
      if (mode === "image" && image) {
        contentHtml = `
          <div class="shortcut-img-fill" style="background-image: url('${image}');"></div>
          ${text ? `<div class="shortcut-caption-overlay">${text}</div>` : ""}
        `;
      } else if (mode === "text" || text) {
        contentHtml = `
          <div class="shortcut-text-fill">
            <span class="shortcut-text-label">${text || "Acceso Directo"}</span>
          </div>
        `;
      } else {
        contentHtml = `
          <div class="shortcut-placeholder">
            <svg class="shortcut-ph-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
            <span class="shortcut-ph-text">Configurar</span>
          </div>
        `;
      }

      return `
        <div class="card widget-card shortcut-card ${mode === 'image' && image ? 'has-image' : ''}" id="${id}" data-target="${target}">
          <div class="widget-edit-corner" title="Configurar acceso directo">
            <span class="edit-pencil-icon">✏</span>
          </div>
          <div class="widget-delete-corner" title="Eliminar widget">
            <span class="delete-x">×</span>
          </div>
          <div class="shortcut-inner-content">
            ${contentHtml}
          </div>
        </div>
      `;
    }
  },
  audio_meter: {
    type: "audio_meter",
    name: "Vúmetro de Audio",
    defaultW: 2,
    defaultH: 1,
    render: (id) => `
      <div class="card widget-card audio-meter-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget">
          <span class="delete-x">×</span>
        </div>
        <div class="card-header">
          <div class="card-title-group">
            <span class="card-badge">VÚMETRO</span>
            <h2 class="card-title">NIVEL DE AUDIO</h2>
          </div>
          <div class="audio-meter-live-indicator">
            <span class="live-dot"></span>
            <span class="live-text">EN VIVO</span>
          </div>
        </div>
        <div class="audio-meter-channels">
          <!-- OUTPUT CHANNEL (LO QUE SE ESCUCHA) -->
          <div class="meter-channel-row">
            <div class="meter-channel-info">
              <svg class="meter-channel-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
              <span class="meter-channel-label">Salida</span>
            </div>
            <div class="meter-track-container">
              <div class="meter-track">
                <div class="meter-fill meter-fill-output" id="${id}_output_fill" style="clip-path: inset(0 100% 0 0 round 4px);"></div>
                <div class="meter-peak-marker" id="${id}_output_marker" style="left: 0%; opacity: 0;"></div>
              </div>
            </div>
            <div class="meter-values-box">
              <span class="meter-value-text" id="${id}_output_val">0%</span>
              <span class="meter-db-text" id="${id}_output_db">-inf dB</span>
            </div>
          </div>

          <!-- INPUT CHANNEL (MICRÓFONO) -->
          <div class="meter-channel-row">
            <div class="meter-channel-info">
              <svg class="meter-channel-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
              <span class="meter-channel-label">Micro</span>
            </div>
            <div class="meter-track-container">
              <div class="meter-track">
                <div class="meter-fill meter-fill-input" id="${id}_input_fill" style="clip-path: inset(0 100% 0 0 round 4px);"></div>
                <div class="meter-peak-marker" id="${id}_input_marker" style="left: 0%; opacity: 0;"></div>
              </div>
            </div>
            <div class="meter-values-box">
              <span class="meter-value-text" id="${id}_input_val">0%</span>
              <span class="meter-db-text" id="${id}_input_db">-inf dB</span>
            </div>
          </div>
        </div>
      </div>
    `
  },
  stopwatch: {
    type: "stopwatch",
    name: "Cronómetro",
    defaultW: 1,
    defaultH: 1,
    render: (id) => `
      <div class="card widget-card stopwatch-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget"><span class="delete-x">×</span></div>
        <div class="card-header mini-header">
          <div class="card-title-group">
            <span class="card-badge">CRONO</span>
            <h2 class="card-title">CRONÓMETRO</h2>
          </div>
        </div>
        <div class="stopwatch-display-container">
          <div class="stopwatch-time" id="${id}_display">00:00<span class="stopwatch-millis">.0</span></div>
        </div>
        <div class="stopwatch-actions">
          <button type="button" class="btn-tool-action btn-sw-start" id="${id}_btn_start" title="Iniciar / Pausar">
            <svg class="sw-icon-play" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
            <svg class="sw-icon-pause" viewBox="0 0 24 24" style="display:none;"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <button type="button" class="btn-tool-action btn-sw-reset" id="${id}_btn_reset" title="Reiniciar">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
          </button>
        </div>
      </div>
    `
  },
  timer: {
    type: "timer",
    name: "Temporizador",
    defaultW: 1,
    defaultH: 1,
    render: (id) => `
      <div class="card widget-card timer-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget"><span class="delete-x">×</span></div>
        <div class="card-header mini-header">
          <div class="card-title-group">
            <span class="card-badge">TIEMPO</span>
            <h2 class="card-title">TEMPORIZADOR</h2>
          </div>
          <button type="button" class="btn-timer-settings" id="${id}_btn_cfg" title="Ajustar tiempo (Días, Horas, Minutos, Segundos)">⚙</button>
        </div>
        <div class="timer-display-container" id="${id}_display_box" title="Haz clic para ajustar el tiempo">
          <div class="timer-time" id="${id}_display">05:00</div>
        </div>
        <div class="timer-actions">
          <button type="button" class="btn-tool-action btn-tm-start" id="${id}_btn_start" title="Iniciar / Pausar">
            <svg class="tm-icon-play" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
            <svg class="tm-icon-pause" viewBox="0 0 24 24" style="display:none;"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <button type="button" class="btn-tool-action btn-tm-reset" id="${id}_btn_reset" title="Reiniciar">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
          </button>
        </div>
      </div>
    `
  },
  notes: {
    type: "notes",
    name: "Notas & Tareas",
    defaultW: 3,
    defaultH: 3,
    render: (id) => `
      <div class="card widget-card notes-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget"><span class="delete-x">×</span></div>
        <div class="card-header">
          <div class="card-title-group">
            <span class="card-badge">PRODUCTIVIDAD</span>
            <h2 class="card-title">NOTAS & TAREAS</h2>
          </div>
          <button type="button" class="btn-notes-new" id="${id}_btn_new" title="Crear nueva nota">+ Nueva Nota</button>
        </div>
        <div class="notes-body-split">
          <!-- LEFT: NOTES LIST -->
          <div class="notes-sidebar">
            <div class="notes-list-scrollable" id="${id}_notes_list">
              <!-- Dynamically rendered note item items -->
            </div>
          </div>
          <!-- RIGHT: ACTIVE NOTE EDITOR -->
          <div class="notes-editor-panel" id="${id}_editor_panel">
            <div class="notes-editor-header">
              <input type="text" class="notes-title-input" id="${id}_note_title" placeholder="Título de la nota..." />
              <div class="notes-mode-pills">
                <button type="button" class="notes-mode-pill active" id="${id}_mode_text" data-mode="text">Texto</button>
                <button type="button" class="notes-mode-pill" id="${id}_mode_tasks" data-mode="tasks">Tareas</button>
                <button type="button" class="notes-btn-delete-note" id="${id}_btn_delete_note" title="Eliminar esta nota">🗑</button>
              </div>
            </div>
            <!-- TEXT AREA VIEW -->
            <div class="notes-view-text" id="${id}_view_text">
              <textarea class="notes-textarea" id="${id}_note_body" placeholder="Escribe aquí tu nota o apuntes..."></textarea>
            </div>
            <!-- TASKS CHECKLIST VIEW -->
            <div class="notes-view-tasks" id="${id}_view_tasks" style="display:none;">
              <div class="tasks-add-row">
                <input type="text" class="tasks-new-input" id="${id}_task_input" placeholder="Nueva tarea y presiona Enter..." />
                <button type="button" class="btn-task-add" id="${id}_btn_add_task">Añadir</button>
              </div>
              <div class="tasks-list-scrollable" id="${id}_tasks_list">
                <!-- Checkbox task items -->
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  },
  photo_2x2: {
    type: "photo_2x2",
    name: "Marco de Foto 2x2",
    defaultW: 2,
    defaultH: 2,
    render: (id, customData) => {
      const img = customData?.image || "";
      return `
        <div class="card widget-card photo-card ${img ? 'has-photo' : ''}" id="${id}" data-photo-size="2x2">
          <div class="widget-edit-corner btn-photo-change" title="Elegir foto de tu PC">
            <span class="edit-pencil-icon">📷</span>
          </div>
          <div class="widget-delete-corner" title="Eliminar widget"><span class="delete-x">×</span></div>
          <div class="photo-container" id="${id}_container">
            ${img ? `<div class="photo-img-fill" style="background-image: url('${img}');"></div>` : `
              <div class="photo-placeholder">
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                <span>Haz clic en 📷 para elegir una foto</span>
              </div>
            `}
          </div>
        </div>
      `;
    }
  },
  photo_2x3: {
    type: "photo_2x3",
    name: "Marco de Foto 2x3",
    defaultW: 2,
    defaultH: 3,
    render: (id, customData) => {
      const img = customData?.image || "";
      return `
        <div class="card widget-card photo-card photo-vertical ${img ? 'has-photo' : ''}" id="${id}" data-photo-size="2x3">
          <div class="widget-edit-corner btn-photo-change" title="Elegir foto de tu PC">
            <span class="edit-pencil-icon">📷</span>
          </div>
          <div class="widget-delete-corner" title="Eliminar widget"><span class="delete-x">×</span></div>
          <div class="photo-container" id="${id}_container">
            ${img ? `<div class="photo-img-fill" style="background-image: url('${img}');"></div>` : `
              <div class="photo-placeholder">
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                <span>Haz clic en 📷 para elegir una foto</span>
              </div>
            `}
          </div>
        </div>
      `;
    }
  },
  photo_3x2: {
    type: "photo_3x2",
    name: "Marco de Foto 3x2",
    defaultW: 3,
    defaultH: 2,
    render: (id, customData) => {
      const img = customData?.image || "";
      return `
        <div class="card widget-card photo-card photo-horizontal ${img ? 'has-photo' : ''}" id="${id}" data-photo-size="3x2">
          <div class="widget-edit-corner btn-photo-change" title="Elegir foto de tu PC">
            <span class="edit-pencil-icon">📷</span>
          </div>
          <div class="widget-delete-corner" title="Eliminar widget"><span class="delete-x">×</span></div>
          <div class="photo-container" id="${id}_container">
            ${img ? `<div class="photo-img-fill" style="background-image: url('${img}');"></div>` : `
              <div class="photo-placeholder">
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                <span>Haz clic en 📷 para elegir una foto</span>
              </div>
            `}
          </div>
        </div>
      `;
    }
  },
  slideshow: {
    type: "slideshow",
    name: "Slideshow de Fotos",
    defaultW: 3,
    defaultH: 2,
    render: (id) => `
      <div class="card widget-card slideshow-card" id="${id}">
        <div class="widget-edit-corner btn-slideshow-config" title="Añadir fotos al álbum">
          <span class="edit-pencil-icon">🖼</span>
        </div>
        <div class="widget-delete-corner" title="Eliminar widget"><span class="delete-x">×</span></div>
        <div class="slideshow-container" id="${id}_container">
          <div class="slideshow-slide" id="${id}_slide"></div>
          <div class="slideshow-placeholder" id="${id}_empty_hint">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/></svg>
            <span>Haz clic para configurar el álbum de fotos</span>
          </div>
        </div>
        <!-- FLOATING BOTTOM CONTROLS -->
        <div class="slideshow-controls-overlay">
          <button type="button" class="btn-ss-ctrl btn-ss-prev" id="${id}_btn_prev" title="Anterior">◀</button>
          <button type="button" class="btn-ss-ctrl btn-ss-toggle" id="${id}_btn_toggle" title="Pausar / Reanudar">⏸</button>
          <button type="button" class="btn-ss-ctrl btn-ss-next" id="${id}_btn_next" title="Siguiente">▶</button>
          <span class="ss-counter" id="${id}_counter">0 / 0</span>
          <button type="button" class="btn-ss-ctrl btn-ss-interval" id="${id}_btn_interval" title="Frecuencia de rotación (clic para alternar)">10s</button>
          <button type="button" class="btn-ss-ctrl btn-ss-album" id="${id}_btn_album" title="Gestionar Álbum de Fotos">⚙</button>
        </div>
      </div>
    `
  },
  calculator: {
    type: "calculator",
    name: "Calculadora",
    defaultW: 2,
    defaultH: 2,
    render: (id) => `
      <div class="card widget-card calculator-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget"><span class="delete-x">×</span></div>
        <div class="calc-screen">
          <div class="calc-history" id="${id}_calc_history">&nbsp;</div>
          <div class="calc-main-row">
            <button type="button" class="btn-calc-copy" id="${id}_calc_copy" title="Copiar resultado">📋</button>
            <div class="calc-result" id="${id}_calc_result">0</div>
          </div>
        </div>
        <div class="calc-keypad">
          <button type="button" class="calc-key calc-op-clear" data-action="clear">C</button>
          <button type="button" class="calc-key calc-op-fn" data-action="sign">±</button>
          <button type="button" class="calc-key calc-op-fn" data-action="percent">%</button>
          <button type="button" class="calc-key calc-op-math" data-action="div">÷</button>

          <button type="button" class="calc-key calc-num" data-num="7">7</button>
          <button type="button" class="calc-key calc-num" data-num="8">8</button>
          <button type="button" class="calc-key calc-num" data-num="9">9</button>
          <button type="button" class="calc-key calc-op-math" data-action="mul">×</button>

          <button type="button" class="calc-key calc-num" data-num="4">4</button>
          <button type="button" class="calc-key calc-num" data-num="5">5</button>
          <button type="button" class="calc-key calc-num" data-num="6">6</button>
          <button type="button" class="calc-key calc-op-math" data-action="sub">−</button>

          <button type="button" class="calc-key calc-num" data-num="1">1</button>
          <button type="button" class="calc-key calc-num" data-num="2">2</button>
          <button type="button" class="calc-key calc-num" data-num="3">3</button>
          <button type="button" class="calc-key calc-op-math" data-action="add">+</button>

          <button type="button" class="calc-key calc-num calc-zero" data-num="0">0</button>
          <button type="button" class="calc-key calc-num" data-action="dot">.</button>
          <button type="button" class="calc-key calc-op-equals" data-action="equals">=</button>
        </div>
      </div>
    `
  },
  currency: {
    type: "currency",
    name: "Conversor de Divisas",
    defaultW: 2,
    defaultH: 2,
    render: (id) => `
      <div class="card widget-card currency-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget"><span class="delete-x">×</span></div>
        <div class="card-header mini-header">
          <div class="card-title-group">
            <span class="card-badge">FINANZAS</span>
            <h2 class="card-title">DIVISAS</h2>
          </div>
          <span class="currency-status" id="${id}_cur_status">En vivo</span>
        </div>
        <div class="currency-converter-body">
          <div class="currency-input-row">
            <input type="number" class="currency-val-input" id="${id}_cur_amount" value="1" step="any" />
            <select class="currency-select" id="${id}_cur_from">
              <option value="EUR" selected>EUR (€)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option>
              <option value="MXN">MXN ($)</option>
              <option value="CAD">CAD ($)</option>
              <option value="CHF">CHF (Fr)</option>
              <option value="CNY">CNY (¥)</option>
              <option value="AUD">AUD ($)</option>
              <option value="BRL">BRL (R$)</option>
            </select>
          </div>
          <div class="currency-swap-row">
            <div class="currency-divider-line"></div>
            <button type="button" class="btn-currency-swap" id="${id}_cur_swap" title="Invertir divisas">⇄</button>
            <div class="currency-divider-line"></div>
          </div>
          <div class="currency-output-row">
            <div class="currency-res-display" id="${id}_cur_result">--</div>
            <select class="currency-select" id="${id}_cur_to">
              <option value="EUR">EUR (€)</option>
              <option value="USD" selected>USD ($)</option>
              <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option>
              <option value="MXN">MXN ($)</option>
              <option value="CAD">CAD ($)</option>
              <option value="CHF">CHF (Fr)</option>
              <option value="CNY">CNY (¥)</option>
              <option value="AUD">AUD ($)</option>
              <option value="BRL">BRL (R$)</option>
            </select>
          </div>
          <div class="currency-rate-sub" id="${id}_cur_rate_label">1 EUR ≈ -- USD</div>
        </div>
      </div>
    `
  },
  calendar: {
    type: "calendar",
    name: "Calendario Mensual",
    defaultW: 2,
    defaultH: 2,
    render: (id) => `
      <div class="card widget-card calendar-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget"><span class="delete-x">×</span></div>
        <div class="calendar-header-bar">
          <button type="button" class="btn-cal-nav" id="${id}_cal_prev" title="Mes anterior">◀</button>
          <span class="cal-month-title" id="${id}_cal_title">Enero 2026</span>
          <button type="button" class="btn-cal-today" id="${id}_cal_today" title="Volver a hoy">Hoy</button>
          <button type="button" class="btn-cal-nav" id="${id}_cal_next" title="Mes siguiente">▶</button>
        </div>
        <div class="calendar-weekdays-row">
          <span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span>
        </div>
        <div class="calendar-grid-days" id="${id}_cal_grid">
          <!-- Dynamically populated 35 or 42 day cells -->
        </div>
      </div>
    `
  },
  unit_converter: {
    type: "unit_converter",
    name: "Conversor de Unidades",
    defaultW: 2,
    defaultH: 2,
    render: (id) => `
      <div class="card widget-card unit-conv-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget"><span class="delete-x">×</span></div>
        <div class="card-header mini-header">
          <div class="card-title-group">
            <span class="card-badge">UTILIDADES</span>
            <h2 class="card-title">UNIDADES</h2>
          </div>
          <select class="unit-type-select" id="${id}_unit_cat">
            <option value="length" selected>Longitud</option>
            <option value="mass">Masa / Peso</option>
            <option value="temp">Temperatura</option>
            <option value="speed">Velocidad</option>
            <option value="storage">Datos / Almacenamiento</option>
          </select>
        </div>
        <div class="unit-conv-body">
          <div class="unit-row">
            <input type="number" class="unit-input-val" id="${id}_unit_val_from" value="1" step="any" />
            <select class="unit-select" id="${id}_unit_from"></select>
          </div>
          <div class="unit-equals-icon">=</div>
          <div class="unit-row">
            <input type="number" class="unit-input-val unit-input-readonly" id="${id}_unit_val_to" readonly />
            <select class="unit-select" id="${id}_unit_to"></select>
          </div>
        </div>
      </div>
    `
  },
  translator: {
    type: "translator",
    name: "Traductor de Texto",
    defaultW: 3,
    defaultH: 2,
    render: (id) => `
      <div class="card widget-card translator-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget"><span class="delete-x">×</span></div>
        <div class="card-header mini-header">
          <div class="card-title-group">
            <span class="card-badge">TRADUCTOR</span>
            <h2 class="card-title">TRADUCCIÓN RÁPIDA</h2>
          </div>
          <div class="translator-lang-selector">
            <select class="tr-select-lang" id="${id}_tr_from">
              <option value="auto">Auto (Detectar)</option>
              <option value="es" selected>Español</option>
              <option value="en">Inglés</option>
              <option value="fr">Francés</option>
              <option value="de">Alemán</option>
              <option value="it">Italiano</option>
              <option value="pt">Portugués</option>
              <option value="ja">Japonés</option>
              <option value="ru">Ruso</option>
              <option value="zh-CN">Chino</option>
            </select>
            <button type="button" class="btn-tr-swap" id="${id}_tr_swap" title="Intercambiar idiomas">⇄</button>
            <select class="tr-select-lang" id="${id}_tr_to">
              <option value="es">Español</option>
              <option value="en" selected>Inglés</option>
              <option value="fr">Francés</option>
              <option value="de">Alemán</option>
              <option value="it">Italiano</option>
              <option value="pt">Portugués</option>
              <option value="ja">Japonés</option>
              <option value="ru">Ruso</option>
              <option value="zh-CN">Chino</option>
            </select>
          </div>
        </div>
        <div class="translator-panels-split">
          <div class="tr-box">
            <div class="tr-box-tools">
              <span class="tr-box-label">Texto original</span>
              <button type="button" class="btn-tr-tool" id="${id}_tr_paste" title="Pegar del portapapeles">📋 Pegar</button>
            </div>
            <textarea class="tr-textarea" id="${id}_tr_input" placeholder="Escribe o pega texto aquí..."></textarea>
          </div>
          <div class="tr-box">
            <div class="tr-box-tools">
              <span class="tr-box-label">Traducción</span>
              <div class="tr-actions-right">
                <button type="button" class="btn-tr-tool btn-tr-submit" id="${id}_tr_btn_do">Traducir</button>
                <button type="button" class="btn-tr-tool" id="${id}_tr_copy" title="Copiar traducción">📋 Copiar</button>
              </div>
            </div>
            <textarea class="tr-textarea tr-output" id="${id}_tr_output" placeholder="La traducción aparecerá aquí..." readonly></textarea>
          </div>
        </div>
      </div>
    `
  },
  ram_cleaner: {
    type: "ram_cleaner",
    name: "Limpiador de RAM",
    defaultW: 1,
    defaultH: 2,
    render: (id) => `
      <div class="card widget-card cleaner-card ram-cleaner-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget"><span class="delete-x">×</span></div>
        <div class="card-header mini-header">
          <div class="card-title-group">
            <span class="card-badge">RAM</span>
            <h2 class="card-title">OPTIMIZADOR</h2>
          </div>
        </div>
        <div class="cleaner-top-info">
          <div class="cleaner-bar-meta">
            <span class="cleaner-bar-label">EN USO</span>
            <div class="cleaner-bar-right-group">
              <span class="cleaner-bar-value" id="${id}_ram_used">-- GB</span>
              <span class="cleaner-bar-pct" id="${id}_ram_pct">(0%)</span>
            </div>
          </div>
          <div class="cleaner-split-bar" title="Verde: Memoria activa | Rojo: Memoria optimizable">
            <div class="cleaner-bar-seg-green" id="${id}_bar_green" style="width: 85%;"></div>
            <div class="cleaner-bar-seg-red" id="${id}_bar_red" style="width: 15%;"></div>
          </div>
        </div>
        <div class="cleaner-gauge-box">
          <div class="cleaner-gauge-wrap">
            <svg viewBox="0 0 200 120" class="cleaner-gauge-svg">
              <defs>
                <linearGradient id="${id}_grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#00f2fe" />
                  <stop offset="50%" stop-color="#4facfe" />
                  <stop offset="100%" stop-color="#ff2a3b" />
                </linearGradient>
              </defs>
              <path class="cleaner-gauge-bg" d="M 15 105 A 85 85 0 0 1 185 105" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="13" stroke-linecap="round"/>
              <path class="cleaner-gauge-arc" id="${id}_arc" d="M 15 105 A 85 85 0 0 1 185 105" fill="none" stroke="url(#${id}_grad)" stroke-width="13" stroke-linecap="round" stroke-dasharray="267.04" stroke-dashoffset="267.04"/>
            </svg>
            <div class="cleaner-center-val">
              <span class="cleaner-amount" id="${id}_amount">--</span>
              <span class="cleaner-sub">OPTIMIZABLE</span>
            </div>
          </div>
          <button type="button" class="btn-cleaner-action btn-clean-ram" id="${id}_btn_clean" title="Optimizar memoria RAM liberando working sets inactivos">
            <span class="btn-clean-icon">⚡</span>
            <span class="btn-clean-text">Optimizar</span>
          </button>
        </div>
      </div>
    `
  },
  disk_cleaner: {
    type: "disk_cleaner",
    name: "Limpiador de Disco",
    defaultW: 1,
    defaultH: 2,
    render: (id) => `
      <div class="card widget-card cleaner-card disk-cleaner-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget"><span class="delete-x">×</span></div>
        <div class="card-header mini-header">
          <div class="card-title-group">
            <span class="card-badge">DISCO</span>
            <h2 class="card-title">LIMPIADOR</h2>
          </div>
        </div>
        <div class="cleaner-top-info">
          <div class="cleaner-bar-meta">
            <span class="cleaner-bar-label">C:</span>
            <span class="cleaner-bar-value disk-usage-text" id="${id}_c_used">-- / -- GB en uso</span>
          </div>
          <div class="cleaner-split-bar" title="Verde: Archivos útiles | Rojo: Basura y temporales">
            <div class="cleaner-bar-seg-green" id="${id}_bar_green" style="width: 90%;"></div>
            <div class="cleaner-bar-seg-red" id="${id}_bar_red" style="width: 10%;"></div>
          </div>
        </div>
        <div class="cleaner-gauge-box">
          <div class="cleaner-gauge-wrap">
            <svg viewBox="0 0 200 120" class="cleaner-gauge-svg">
              <defs>
                <linearGradient id="${id}_grad_disk" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#38ef7d" />
                  <stop offset="60%" stop-color="#11998e" />
                  <stop offset="100%" stop-color="#ff0844" />
                </linearGradient>
              </defs>
              <path class="cleaner-gauge-bg" d="M 15 105 A 85 85 0 0 1 185 105" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="13" stroke-linecap="round"/>
              <path class="cleaner-gauge-arc" id="${id}_arc" d="M 15 105 A 85 85 0 0 1 185 105" fill="none" stroke="url(#${id}_grad_disk)" stroke-width="13" stroke-linecap="round" stroke-dasharray="267.04" stroke-dashoffset="267.04"/>
            </svg>
            <div class="cleaner-center-val">
              <span class="cleaner-amount" id="${id}_amount">--</span>
              <span class="cleaner-sub">BASURA</span>
            </div>
          </div>
          <button type="button" class="btn-cleaner-action btn-clean-disk" id="${id}_btn_clean" title="Limpiar archivos temporales y vaciar papelera">
            <span class="btn-clean-icon">🧹</span>
            <span class="btn-clean-text">Limpiar</span>
          </button>
        </div>
      </div>
    `
  },
  command_bar: {
    type: "command_bar",
    name: "Barra de Comandos & Voz",
    defaultW: 2,
    defaultH: 1,
    render: (id) => `
      <div class="card widget-card command-bar-card" id="${id}">
        <div class="widget-delete-corner" title="Eliminar widget"><span class="delete-x">×</span></div>
        <div class="card-header mini-header">
          <div class="card-title-group">
            <span class="card-badge">ASISTENTE IA</span>
            <h2 class="card-title">COMANDOS & VOZ</h2>
          </div>
          <button type="button" class="btn-assistant-settings" id="${id}_btn_settings" title="Configurar voz y volumen del Asistente">
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
          </button>
        </div>
        <div class="cmd-body-container">
          <div class="cmd-input-container">
            <button type="button" class="btn-cmd-mic" id="${id}_btn_mic" title="Haz clic para grabar tu voz con Whisper">
              <svg class="mic-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/></svg>
              <span class="mic-pulse-ring"></span>
            </button>
            <input type="text" class="cmd-input" id="${id}_input" placeholder="Escribe o pulsa el micro (ej. 'ponme spotify', 'silencia micro')..." autocomplete="off" />
            <button type="button" class="btn-cmd-send" id="${id}_btn_send" title="Ejecutar comando">
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
          <div class="cmd-status-row">
            <span class="cmd-status-text" id="${id}_status">Escribe o dicta una acción para tu ordenador</span>
          </div>
        </div>
      </div>
    `
  }
};

function setSemicircleGauge(arcElement, percent) {
  if (!arcElement) return;
  const SEMI_CIRCUMFERENCE = 267.04; // Math.PI * 85
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const offset = SEMI_CIRCUMFERENCE - (pct / 100) * SEMI_CIRCUMFERENCE;
  arcElement.style.strokeDasharray = SEMI_CIRCUMFERENCE;
  arcElement.style.strokeDashoffset = offset;
}

