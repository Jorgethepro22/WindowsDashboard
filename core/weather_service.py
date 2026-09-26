import time
import threading
import requests

WMO_CODES = {
    0: ("Despejado", "sun"),
    1: ("Mayormente despejado", "cloud-sun"),
    2: ("Parcialmente nublado", "cloud-sun"),
    3: ("Nublado", "cloud"),
    45: ("Niebla", "fog"),
    48: ("Niebla con escarcha", "fog"),
    51: ("Llovizna ligera", "rain-light"),
    53: ("Llovizna moderada", "rain-light"),
    55: ("Llovizna densa", "rain"),
    61: ("Lluvia débil", "rain-light"),
    63: ("Lluvia moderada", "rain"),
    65: ("Lluvia fuerte", "rain-heavy"),
    71: ("Nieve ligera", "snow"),
    73: ("Nieve moderada", "snow"),
    75: ("Nieve fuerte", "snow"),
    80: ("Chubascos leves", "rain-light"),
    81: ("Chubascos", "rain"),
    82: ("Chubascos violentos", "rain-heavy"),
    95: ("Tormenta eléctrica", "thunder"),
    96: ("Tormenta con granizo leve", "thunder"),
    99: ("Tormenta con granizo fuerte", "thunder")
}

class WeatherService:
    def __init__(self, config_manager):
        self.config_manager = config_manager
        self._cached_data = None
        self._last_fetch_time = 0
        self._lock = threading.Lock()

        # Start non-blocking background updater thread
        self._thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._thread.start()

    def _worker_loop(self):
        while True:
            success = self._fetch_weather()
            weather_cfg = self.config_manager.get("weather", {})
            interval_min = weather_cfg.get("update_interval_minutes", 10)

            # If request succeeded, sleep for full interval (e.g. 10 min)
            # If failed, retry sooner (e.g. 60 sec)
            sleep_sec = (interval_min * 60) if success else 60
            time.sleep(sleep_sec)

    def _fetch_weather(self):
        weather_cfg = self.config_manager.get("weather", {})
        city = weather_cfg.get("city", "Sevilla")
        lat = weather_cfg.get("latitude", 37.3891)
        lon = weather_cfg.get("longitude", -5.9845)

        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}&"
            f"current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&"
            f"timezone=auto"
        )

        try:
            resp = requests.get(url, timeout=6)
            if resp.status_code == 200:
                data = resp.json()
                current = data.get("current", {})
                code = current.get("weather_code", 0)
                is_day = current.get("is_day", 1)

                desc, icon = WMO_CODES.get(code, ("Despejado", "sun"))
                if not is_day and icon == "sun":
                    icon = "moon"
                elif not is_day and icon == "cloud-sun":
                    icon = "cloud-moon"

                with self._lock:
                    self._cached_data = {
                        "city": city,
                        "temp": round(current.get("temperature_2m", 0), 1),
                        "apparent_temp": round(current.get("apparent_temperature", 0), 1),
                        "humidity": current.get("relative_humidity_2m", 0),
                        "wind_speed": round(current.get("wind_speed_10m", 0), 1),
                        "description": desc,
                        "icon": icon,
                        "is_day": bool(is_day),
                        "status": "ok",
                        "last_update": time.strftime("%H:%M")
                    }
                    self._last_fetch_time = time.time()
                return True
        except Exception as e:
            print(f"[WeatherService] Error fetching weather: {e}")
        return False

    def get_weather(self):
        with self._lock:
            if self._cached_data:
                return self._cached_data

        weather_cfg = self.config_manager.get("weather", {})
        city = weather_cfg.get("city", "Sevilla")
        return {
            "city": city,
            "temp": "--",
            "apparent_temp": "--",
            "humidity": "--",
            "wind_speed": "--",
            "description": "Cargando clima...",
            "icon": "cloud",
            "is_day": True,
            "status": "loading"
        }
