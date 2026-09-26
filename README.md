# WindowsDashboard - Monitor Secundario para PC

Dashboard de escritorio moderno, minimalista y ultra-ligero para Windows, optimizado para ejecutarse en pantalla completa en un monitor secundario con métricas en tiempo real de tu PC mientras juegas.

---

## 🚀 Características (V1)

1. **Reloj Digital & Calendario**:
   - Hora digital grande (`HH:MM:SS`) con segundero carmesí de alta precisión.
   - Fecha completa en español (`Día, DD de Mes de AAAA`).
2. **Telemetría de Hardware (Gaming HUD)**:
   - **CPU**: Carga %, frecuencia actual en GHz, núcleos e hilos.
   - **GPU NVIDIA RTX 4060 Ti**: Uso %, memoria VRAM utilizada / total en GB (con barra de progreso) y temperatura en tiempo real (°C) mediante NVML oficial.
   - **Memoria RAM**: % utilizado y consumo en GB utilizados / totales.
   - **Almacenamiento**: Estado y porcentaje de la unidad principal (`C:`).
   - **Red**: Velocidades de subida y descarga en tiempo real (KB/s o MB/s) con iconos indicadores.
3. **Audio de Windows**:
   - Nivel de volumen maestro en tiempo real y botón de silencio (*Mute*).
   - Control deslizante interactivo: ajusta el volumen de Windows directamente desde el dashboard.
   - Detección y visualización del dispositivo de audio activo (ej. *Auriculares G435 Wireless*).
4. **Reproductor Multimedia de Windows (SMTC)**:
   - Detección del reproductor multimedia activo (Spotify, Google Chrome, YouTube, Firefox, VLC, etc.).
   - Información del tema en reproducción: título de la canción, artista y carátula del álbum en tiempo real.
   - Controles interactivos: Anterior, Reproducir/Pausar y Siguiente.
5. **Widget del Clima (Sevilla)**:
   - Integración con Open-Meteo REST API (100% libre, sin registros ni claves API).
   - Muestra temperatura actual (°C), sensación térmica, humedad, viento y condiciones con iconos climáticos.
   - Caché de bajo consumo de red.
6. **Soporte Multimonitor**:
   - Detección automática de todas las pantallas conectadas.
   - Selector en la barra superior para alternar entre monitores en cualquier momento.
   - Persistencia de monitor y modo pantalla completa en `config.json`.

---

## 🛠️ Cómo ejecutar en desarrollo

Para ejecutar la aplicación directamente con Python:

```cmd
python main.py
```

---

## 📦 Cómo compilar y empaquetar como `.exe`

> **REGLA IMPORTANTE**: Se debe compilar desde **CMD** (el símbolo del sistema de Windows), no desde PowerShell.

Puedes compilar de dos formas:

### Opción 1: Con el script automático
Haz doble clic en `build.cmd` o ejecútalo desde CMD:
```cmd
build.cmd
```

### Opción 2: Manualmente desde CMD
```cmd
python -m PyInstaller --noconsole --clean --noconfirm --name "WindowsDashboard" --add-data "ui;ui" --add-data "config.json;." main.py
copy /y config.json dist\WindowsDashboard\
```

El ejecutable listo para usar se generará en:
```
dist\WindowsDashboard\WindowsDashboard.exe
```

---

## ⚙️ Configuración (`config.json`)

Puedes editar `config.json` tanto en la raíz del proyecto como junto al archivo `.exe`:

```json
{
  "target_monitor_index": 1,
  "fullscreen": true,
  "theme": "dark_crimson",
  "refresh_interval_ms": 1000,
  "weather": {
    "city": "Sevilla",
    "latitude": 37.3891,
    "longitude": -5.9845,
    "update_interval_minutes": 20
  }
}
```