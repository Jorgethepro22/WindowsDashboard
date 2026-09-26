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
        self._detected_location_str = ""
        self._detected_status = "unknown"

        # Start non-blocking background updater thread
        self._thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._thread.start()

    def _worker_loop(self):
        while True:
            success = self._fetch_weather()
            weather_cfg = self.config_manager.get("weather", {})
            interval_min = weather_cfg.get("update_interval_minutes", 10)
            sleep_sec = (interval_min * 60) if success else 60
            time.sleep(sleep_sec)

    def _detect_location_by_ip(self):
        """Attempts to detect user's global location via IP geolocation."""
        try:
            resp = requests.get("http://ip-api.com/json/", timeout=4)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "success":
                    city = data.get("city") or "Ubicación detectada"
                    country = data.get("country") or ""
                    lat = float(data.get("lat", 0))
                    lon = float(data.get("lon", 0))
                    return {
                        "success": True,
                        "city": city,
                        "country": country,
                        "latitude": lat,
                        "longitude": lon,
                        "display": f"{city}, {country}" if country else city
                    }
        except Exception:
            pass

        # Fallback to ipapi.co
        try:
            resp2 = requests.get("https://ipapi.co/json/", timeout=4)
            if resp2.status_code == 200:
                data2 = resp2.json()
                city2 = data2.get("city") or "Ubicación detectada"
                country2 = data2.get("country_name") or ""
                lat2 = float(data2.get("latitude", 0))
                lon2 = float(data2.get("longitude", 0))
                return {
                    "success": True,
                    "city": city2,
                    "country": country2,
                    "latitude": lat2,
                    "longitude": lon2,
                    "display": f"{city2}, {country2}" if country2 else city2
                }
        except Exception:
            pass

        return {"success": False}

    def _fetch_weather(self):
        weather_cfg = self.config_manager.get("weather", {})
        auto_loc = weather_cfg.get("auto_location", True)

        city = weather_cfg.get("city", "Sevilla")
        lat = weather_cfg.get("latitude", 37.3891)
        lon = weather_cfg.get("longitude", -5.9845)

        if auto_loc:
            ip_loc = self._detect_location_by_ip()
            if ip_loc.get("success"):
                city = ip_loc["city"]
                lat = ip_loc["latitude"]
                lon = ip_loc["longitude"]
                self._detected_location_str = ip_loc["display"]
                self._detected_status = "detected"
            else:
                self._detected_status = "failed"
        else:
            self._detected_status = "disabled"

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

    def search_cities(self, query):
        """Global city search with autocomplete via Open-Meteo Geocoding API."""
        if not query or len(query.strip()) < 2:
            return []
        q = query.strip()
        url = f"https://geocoding-api.open-meteo.com/v1/search?name={requests.utils.quote(q)}&count=6&language=es"
        try:
            resp = requests.get(url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                results = []
                for x in data.get("results", []):
                    name = x.get("name") or ""
                    admin = x.get("admin1") or ""
                    country = x.get("country") or ""
                    parts = [name]
                    if admin and admin != name:
                        parts.append(admin)
                    if country:
                        parts.append(country)
                    display = ", ".join(parts)
                    results.append({
                        "name": name,
                        "admin": admin,
                        "country": country,
                        "display": display,
                        "latitude": float(x.get("latitude", 0)),
                        "longitude": float(x.get("longitude", 0))
                    })
                return results
        except Exception as e:
            print(f"[WeatherService] City search error: {e}")
        return []

    def get_settings(self):
        weather_cfg = self.config_manager.get("weather", {})
        return {
            "auto_location": weather_cfg.get("auto_location", True),
            "city": weather_cfg.get("city", "Sevilla"),
            "latitude": weather_cfg.get("latitude", 37.3891),
            "longitude": weather_cfg.get("longitude", -5.9845),
            "detected_location": self._detected_location_str,
            "detected_status": self._detected_status,
            "language": self.config_manager.get("language", "es")
        }

    def save_settings(self, settings):
        """Updates weather and language settings, persists to config.json and forces refresh."""
        if not settings:
            return False
        weather_cfg = self.config_manager.get("weather", {})

        if "auto_location" in settings:
            weather_cfg["auto_location"] = bool(settings["auto_location"])
        if "city" in settings and settings["city"]:
            weather_cfg["city"] = str(settings["city"]).strip()
        if "latitude" in settings and settings["latitude"] is not None:
            weather_cfg["latitude"] = float(settings["latitude"])
        if "longitude" in settings and settings["longitude"] is not None:
            weather_cfg["longitude"] = float(settings["longitude"])

        self.config_manager.set("weather", weather_cfg)

        if "language" in settings:
            self.config_manager.set("language", str(settings["language"]).strip())

        # Trigger immediate weather refresh
        self._fetch_weather()
        return {
            "settings": self.get_settings(),
            "weather": self.get_weather()
        }

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
