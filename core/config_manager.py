import json
import os
import sys

DEFAULT_DESIGNS = {
    "Predeterminado": {
        "grid_size": "8x5",
        "layout": [
            {"id": "w_cpu", "type": "cpu", "x": 1, "y": 1, "w": 2, "h": 2},
            {"id": "w_gpu", "type": "gpu", "x": 3, "y": 1, "w": 2, "h": 2},
            {"id": "w_disks", "type": "disks", "x": 5, "y": 1, "w": 2, "h": 2},
            {"id": "w_audio", "type": "audio", "x": 7, "y": 1, "w": 2, "h": 2},
            {"id": "w_media", "type": "media", "x": 1, "y": 3, "w": 3, "h": 1},
            {"id": "w_summary", "type": "summary", "x": 4, "y": 3, "w": 2, "h": 2}
        ]
    },
    "Hardware Focus": {
        "grid_size": "8x5",
        "layout": [
            {"id": "w_cpu", "type": "cpu", "x": 1, "y": 1, "w": 2, "h": 2},
            {"id": "w_gpu", "type": "gpu", "x": 3, "y": 1, "w": 2, "h": 2},
            {"id": "w_disks", "type": "disks", "x": 5, "y": 1, "w": 2, "h": 2},
            {"id": "w_audio", "type": "audio", "x": 7, "y": 1, "w": 2, "h": 2},
            {"id": "w_summary", "type": "summary", "x": 1, "y": 3, "w": 2, "h": 2}
        ]
    },
    "Compacto / Gaming": {
        "grid_size": "6x4",
        "layout": [
            {"id": "w_summary", "type": "summary", "x": 1, "y": 1, "w": 2, "h": 2},
            {"id": "w_audio", "type": "audio", "x": 3, "y": 1, "w": 2, "h": 2},
            {"id": "w_media", "type": "media", "x": 1, "y": 3, "w": 3, "h": 1}
        ]
    }
}

DEFAULT_CONFIG = {
    "target_monitor_index": 1,
    "fullscreen": True,
    "theme": "dark_crimson",
    "refresh_interval_ms": 1000,
    "active_design": "Predeterminado",
    "designs": DEFAULT_DESIGNS,
    "weather": {
        "city": "Sevilla",
        "latitude": 37.3891,
        "longitude": -5.9845,
        "update_interval_minutes": 10
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

def get_appdata_dir() -> str:
    """Returns the persistent directory for WindowsDashboard in %APPDATA%."""
    appdata = os.environ.get("APPDATA")
    if not appdata:
        appdata = os.path.expanduser("~")
    path = os.path.join(appdata, "WindowsDashboard")
    try:
        os.makedirs(path, exist_ok=True)
    except Exception:
        pass
    return path

def get_config_path() -> str:
    """
    Returns the canonical configuration file path in %APPDATA%/WindowsDashboard/config.json.
    Ensures that both development mode (python main.py) and compiled mode (WindowsDashboard.exe)
    share the exact same configuration, and that recompiling or rebooting never loses user designs.
    """
    return os.path.join(get_appdata_dir(), "config.json")

class ConfigManager:
    def __init__(self):
        self.config_path = get_config_path()
        self.config = self.load_config()

    def load_config(self):
        # 1. Primary location: %APPDATA%/WindowsDashboard/config.json
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    config = DEFAULT_CONFIG.copy()
                    config.update(loaded)
                    if "designs" not in config or not config["designs"]:
                        config["designs"] = DEFAULT_DESIGNS.copy()
                    return config
            except Exception as e:
                print(f"[ConfigManager] Error reading config from AppData: {e}. Using defaults.")

        # 2. Migration candidates: Check project root, dist directory, or bundled resources
        candidate_paths = [
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.json"),
            os.path.join(get_base_dir(), "config.json"),
            get_resource_path("config.json")
        ]

        best_config = None
        for path in candidate_paths:
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        loaded = json.load(f)
                        designs = loaded.get("designs", {})
                        if "Gaming" in designs or "Productividad" in designs:
                            best_config = loaded
                            break
                        elif best_config is None and designs:
                            best_config = loaded
                except Exception:
                    pass

        if best_config:
            config = DEFAULT_CONFIG.copy()
            config.update(best_config)
            if "designs" not in config or not config["designs"]:
                config["designs"] = DEFAULT_DESIGNS.copy()
            self.config = config
            self.save_config()
            return config

        return DEFAULT_CONFIG.copy()

    def save_config(self):
        try:
            # 1. Save to primary canonical location in %APPDATA%
            os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)

            # 2. Mirror to workspace root if running from source (for dev convenience)
            try:
                base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                workspace_config = os.path.join(base_dir, "config.json")
                if os.path.exists(base_dir) and not getattr(sys, 'frozen', False):
                    with open(workspace_config, "w", encoding="utf-8") as f:
                        json.dump(self.config, f, indent=2, ensure_ascii=False)
            except Exception:
                pass

            return True
        except Exception as e:
            print(f"[ConfigManager] Error saving config: {e}")
            return False

    def save(self):
        return self.save_config()

    def get(self, key, default=None):
        return self.config.get(key, default)

    def set(self, key, value):
        self.config[key] = value
        self.save_config()

    def get_designs(self):
        raw_designs = self.config.get("designs", {})
        if not raw_designs:
            raw_designs = DEFAULT_DESIGNS.copy()
            self.config["designs"] = raw_designs
            self.save_config()

        normalized = {}
        for k, v in raw_designs.items():
            if isinstance(v, dict) and "layout" in v:
                normalized[k] = {
                    "grid_size": v.get("grid_size", "8x5"),
                    "layout": v.get("layout", [])
                }
            elif isinstance(v, list):
                normalized[k] = {
                    "grid_size": "8x5",
                    "layout": v
                }
            else:
                normalized[k] = {
                    "grid_size": "8x5",
                    "layout": []
                }

        return {
            "active_design": self.config.get("active_design", "Predeterminado"),
            "designs": normalized
        }

    def save_design(self, name, layout_items, grid_size=None):
        if not name:
            return False
        if "designs" not in self.config:
            self.config["designs"] = DEFAULT_DESIGNS.copy()

        if isinstance(layout_items, dict) and "layout" in layout_items:
            g_size = layout_items.get("grid_size", grid_size or "8x5")
            items = layout_items.get("layout", [])
        else:
            g_size = grid_size or "8x5"
            items = layout_items if isinstance(layout_items, list) else []

        self.config["designs"][name] = {
            "grid_size": g_size,
            "layout": items
        }
        self.config["active_design"] = name
        self.save_config()
        return True

    def rename_design(self, old_name, new_name):
        if not old_name or not new_name or old_name == new_name:
            return False
        designs = self.config.get("designs", {})
        if old_name in designs:
            designs[new_name] = designs.pop(old_name)
            if self.config.get("active_design") == old_name:
                self.config["active_design"] = new_name
            self.save_config()
            return True
        return False

    def delete_design(self, name):
        designs = self.config.get("designs", {})
        if name in designs and len(designs) > 1:
            del designs[name]
            if self.config.get("active_design") == name:
                self.config["active_design"] = list(designs.keys())[0]
            self.save_config()
            return True
        return False

    def set_active_design(self, name):
        designs = self.config.get("designs", {})
        if name in designs:
            self.config["active_design"] = name
            self.save_config()
            return True
        return False
