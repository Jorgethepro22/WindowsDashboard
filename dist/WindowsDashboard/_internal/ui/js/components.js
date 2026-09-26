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
