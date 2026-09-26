import os
import sys
import webview

from core.config_manager import ConfigManager, get_base_dir, get_resource_path
from core.monitor_manager import MonitorManager
from core.system_stats import SystemStats
from core.audio_controller import AudioController
from core.media_session import MediaSessionManager
from core.weather_service import WeatherService

class DashboardApi:
    def __init__(self, config_mgr, monitor_mgr, system_stats, audio_ctrl, media_session, weather_svc):
        self._config_mgr = config_mgr
        self._monitor_mgr = monitor_mgr
        self._system_stats = system_stats
        self._audio_ctrl = audio_ctrl
        self._media_session = media_session
        self._weather_svc = weather_svc
        self._window = None

    def set_window(self, window):
        self._window = window

    def get_dashboard_data(self):
        return {
            "system": self._system_stats.get_stats(),
            "audio": self._audio_ctrl.get_audio_info(),
            "media": self._media_session.get_current_media(),
            "weather": self._weather_svc.get_weather()
        }

    def set_volume(self, percent):
        return self._audio_ctrl.set_output_volume(percent)

    def set_output_volume(self, percent):
        return self._audio_ctrl.set_output_volume(percent)

    def set_input_volume(self, percent):
        return self._audio_ctrl.set_input_volume(percent)

    def set_default_audio_device(self, device_id):
        return self._audio_ctrl.set_default_device(device_id)

    def toggle_mute(self):
        return self._audio_ctrl.toggle_output_mute()

    def toggle_output_mute(self):
        return self._audio_ctrl.toggle_output_mute()

    def toggle_input_mute(self):
        return self._audio_ctrl.toggle_input_mute()

    def media_play_pause(self):
        return self._media_session.play_pause()

    def media_next(self):
        return self._media_session.next_track()

    def media_previous(self):
        return self._media_session.previous_track()

    def get_monitors(self):
        return self._monitor_mgr.refresh_monitors()

    def get_current_monitor_index(self):
        sel = self._monitor_mgr.get_selected_monitor()
        return sel.index if sel else 0

    def switch_monitor(self, index):
        if not self._window:
            return False
        if not self._monitor_mgr.set_target_monitor(index):
            return False

        monitors = self._monitor_mgr.monitors
        if 0 <= index < len(monitors):
            target = monitors[index]
            try:
                was_fullscreen = self._window.fullscreen
                if was_fullscreen:
                    self._window.toggle_fullscreen()

                self._window.move(target.x, target.y)
                self._window.resize(target.width, target.height)

                if was_fullscreen:
                    self._window.toggle_fullscreen()
                return True
            except Exception as e:
                print(f"[DashboardApi] Error moving window to monitor {index}: {e}")
        return False

    def toggle_fullscreen(self):
        if self._window:
            self._window.toggle_fullscreen()
            self._config_mgr.set("fullscreen", self._window.fullscreen)
            return self._window.fullscreen
        return False

    def get_designs(self):
        return self._config_mgr.get_designs()

    def save_design(self, name, layout_items, grid_size=None):
        return self._config_mgr.save_design(name, layout_items, grid_size)

    def rename_design(self, old_name, new_name):
        return self._config_mgr.rename_design(old_name, new_name)

    def delete_design(self, name):
        return self._config_mgr.delete_design(name)

    def set_active_design(self, name):
        return self._config_mgr.set_active_design(name)

    def launch_shortcut(self, target):
        if not target or not target.strip():
            return False
        target = target.strip()
        # Prepend https:// if it looks like a web domain without protocol
        if target.startswith("www.") or (("." in target and "\\" not in target and "/" not in target and not target.endswith((".exe", ".lnk", ".bat", ".cmd", ".py", ".txt", ".pdf", ".docx", ".xlsx", ".msi"))) and ":" not in target):
            target = "https://" + target
        try:
            os.startfile(target)
            return True
        except Exception as e:
            print(f"[DashboardApi] Error launching shortcut '{target}': {e}")
            return False

    def select_file_dialog(self):
        if not self._window:
            return None
        try:
            file_types = (
                "Ejecutables y Accesos Directos (*.exe;*.lnk;*.bat;*.cmd;*.url)",
                "Todos los archivos (*.*)"
            )
            result = self._window.create_file_dialog(
                webview.FileDialog.OPEN,
                allow_multiple=False,
                file_types=file_types
            )
            if result and len(result) > 0:
                return result[0]
        except Exception as e:
            print(f"[DashboardApi] Error in select_file_dialog: {e}")
        return None

    def select_image_dialog(self):
        if not self._window:
            return None
        try:
            file_types = (
                "Archivos de Imagen (*.png;*.jpg;*.jpeg;*.webp;*.ico;*.svg;*.gif)",
                "Todos los archivos (*.*)"
            )
            result = self._window.create_file_dialog(
                webview.FileDialog.OPEN,
                allow_multiple=False,
                file_types=file_types
            )
            if result and len(result) > 0:
                return result[0]
        except Exception as e:
            print(f"[DashboardApi] Error in select_image_dialog: {e}")
        return None

    def read_image_data(self, file_path):
        import base64
        import mimetypes
        if not file_path or not os.path.exists(file_path):
            return None
        try:
            mime, _ = mimetypes.guess_type(file_path)
            if not mime:
                mime = "image/png"
            with open(file_path, "rb") as f:
                encoded = base64.b64encode(f.read()).decode("utf-8")
            return f"data:{mime};base64,{encoded}"
        except Exception as e:
            print(f"[DashboardApi] Error reading image '{file_path}': {e}")
            return None


def main():
    html_path = get_resource_path(os.path.join("ui", "index.html"))

    config_mgr = ConfigManager()
    monitor_mgr = MonitorManager(config_mgr)
    system_stats = SystemStats()
    audio_ctrl = AudioController()
    media_session = MediaSessionManager()
    weather_svc = WeatherService(config_mgr)

    api = DashboardApi(
        config_mgr,
        monitor_mgr,
        system_stats,
        audio_ctrl,
        media_session,
        weather_svc
    )

    # Determine initial monitor positioning
    chosen_monitor = monitor_mgr.get_selected_monitor()
    is_fullscreen = config_mgr.get("fullscreen", True)

    print(f"[*] Iniciando WindowsDashboard en '{chosen_monitor.name}' (Pos: {chosen_monitor.x},{chosen_monitor.y}, Res: {chosen_monitor.width}x{chosen_monitor.height})...")

    # Create pywebview window
    window = webview.create_window(
        title="Windows Dashboard",
        url=html_path,
        js_api=api,
        x=chosen_monitor.x,
        y=chosen_monitor.y,
        width=chosen_monitor.width,
        height=chosen_monitor.height,
        fullscreen=is_fullscreen,
        frameless=is_fullscreen,
        easy_drag=False,
        background_color="#07080a"
    )

    api.set_window(window)

    # Start Edge Chromium WebView2
    webview.start(gui="edgechromium", debug=False)


if __name__ == "__main__":
    main()
