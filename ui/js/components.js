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
  }
};
