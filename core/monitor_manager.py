import ctypes
from ctypes import wintypes

class MonitorInfo:
    def __init__(self, index, name, x, y, width, height, is_primary):
        self.index = index
        self.name = name
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.is_primary = is_primary

    def to_dict(self):
        return {
            "index": self.index,
            "name": self.name,
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "is_primary": self.is_primary
        }

class MonitorManager:
    def __init__(self, config_manager):
        self.config_manager = config_manager
        self.monitors = []
        self.refresh_monitors()

    def refresh_monitors(self):
        monitors = []
        try:
            from screeninfo import get_monitors
            raw_monitors = get_monitors()
            for idx, m in enumerate(raw_monitors):
                label = f"Monitor {idx + 1} ({m.width}x{m.height})"
                if m.is_primary:
                    label += " [Principal]"
                monitors.append(MonitorInfo(
                    index=idx,
                    name=label,
                    x=m.x,
                    y=m.y,
                    width=m.width,
                    height=m.height,
                    is_primary=bool(m.is_primary)
                ))
        except Exception as e:
            print(f"[MonitorManager] Fallback using Windows API: {e}")
            monitors = self._get_monitors_win32()

        if not monitors:
            # Fallback default monitor
            monitors.append(MonitorInfo(0, "Monitor Principal (1920x1080)", 0, 0, 1920, 1080, True))

        self.monitors = monitors
        return [m.to_dict() for m in self.monitors]

    def _get_monitors_win32(self):
        """Fallback monitor enumeration using ctypes user32."""
        monitors = []
        user32 = ctypes.windll.user32

        def _monitor_enum_proc(hMonitor, hdcMonitor, lprcMonitor, dwData):
            r = lprcMonitor.contents
            w = r.right - r.left
            h = r.bottom - r.top
            is_pri = (r.left == 0 and r.top == 0)
            idx = len(monitors)
            name = f"Monitor {idx + 1} ({w}x{h})" + (" [Principal]" if is_pri else "")
            monitors.append(MonitorInfo(idx, name, r.left, r.top, w, h, is_pri))
            return 1

        MonitorEnumProc = ctypes.WINFUNCTYPE(ctypes.c_int, wintypes.HMONITOR, wintypes.HDC, ctypes.POINTER(wintypes.RECT), wintypes.LPARAM)
        user32.EnumDisplayMonitors(None, None, MonitorEnumProc(_monitor_enum_proc), 0)
        return monitors

    def get_selected_monitor(self):
        target_idx = self.config_manager.get("target_monitor_index", 1)
        if 0 <= target_idx < len(self.monitors):
            return self.monitors[target_idx]
        # If target monitor is not available, default to secondary if exists, else primary
        if len(self.monitors) > 1:
            return self.monitors[1]
        return self.monitors[0]

    def set_target_monitor(self, index):
        if 0 <= index < len(self.monitors):
            self.config_manager.set("target_monitor_index", index)
            return True
        return False
