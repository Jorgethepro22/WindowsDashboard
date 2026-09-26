// High-precision clock & date in Spanish
const DAYS_ES = [
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"
];

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function initClock() {
  const elHours = document.getElementById("clock-hours");
  const elMinutes = document.getElementById("clock-minutes");
  const elSeconds = document.getElementById("clock-seconds");
  const elDate = document.getElementById("date-display");

  function update() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");

    if (elHours && elMinutes && elSeconds) {
      elHours.textContent = h;
      elMinutes.textContent = m;
      elSeconds.textContent = s;
    }

    if (elDate) {
      const dayName = DAYS_ES[now.getDay()];
      const dayNum = now.getDate();
      const monthName = MONTHS_ES[now.getMonth()];
      const year = now.getFullYear();
      elDate.textContent = `${dayName}, ${dayNum} de ${monthName} de ${year}`;
    }
  }

  update();
  setInterval(update, 1000);
}

document.addEventListener("DOMContentLoaded", initClock);
