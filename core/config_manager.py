import json
import os
import sys

DEFAULT_CONFIG = {
    "target_monitor_index": 1,
    "fullscreen": True,
    "theme": "dark_crimson",
    "refresh_interval_ms": 1000,
    "weather": {
        "city": "Sevilla",
        "latitude": 37.3891,
        "longitude": -5.9845,
        "update_interval_minutes": 20
    }
}

def get_base_dir():
    """Returns directory where executable or script is located."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_resource_path(relative_path):
    """Returns absolute path to bundled resource (handles PyInstaller _MEIPASS)."""
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(get_base_dir(), relative_path)

def get_config_path():
    return os.path.join(get_base_dir(), "config.json")

class ConfigManager:
    def __init__(self):
        self.config_path = get_config_path()
        self.config = self.load_config()

    def load_config(self):
        # 1. Try reading from working directory next to executable/script
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    config = DEFAULT_CONFIG.copy()
                    config.update(loaded)
                    return config
            except Exception as e:
                print(f"[ConfigManager] Error reading config: {e}. Using defaults.")

        # 2. Check bundled resource config if packaged
        bundled_config = get_resource_path("config.json")
        if os.path.exists(bundled_config):
            try:
                with open(bundled_config, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    config = DEFAULT_CONFIG.copy()
                    config.update(loaded)
                    # Save a copy in base_dir for user editing
                    self.config = config
                    self.save_config()
                    return config
            except Exception:
                pass

        return DEFAULT_CONFIG.copy()

    def save_config(self):
        try:
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"[ConfigManager] Error saving config: {e}")
            return False

    def get(self, key, default=None):
        return self.config.get(key, default)

    def set(self, key, value):
        self.config[key] = value
        self.save_config()
