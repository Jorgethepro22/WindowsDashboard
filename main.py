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
        return self._audio_ctrl.set_volume(percent)

    def toggle_mute(self):
        return self._audio_ctrl.toggle_mute()

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
