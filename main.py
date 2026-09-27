import os
import sys
import json
import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="pycaw")
warnings.filterwarnings("ignore", message=".*COMError attempting to get property.*")
import webview

from core.config_manager import ConfigManager, get_base_dir, get_resource_path
from core.monitor_manager import MonitorManager
from core.system_stats import SystemStats
from core.audio_controller import AudioController
from core.media_session import MediaSessionManager
from core.weather_service import WeatherService
from core.autostart import is_autostart_enabled, set_autostart
from core.cleaner_service import CleanerService
from core.assistant_service import AssistantService
import ctypes
from ctypes import wintypes
import threading

MOD_ALT = 0x0001
MOD_CONTROL = 0x0002
MOD_SHIFT = 0x0004
MOD_WIN = 0x0008
MOD_NOREPEAT = 0x4000
VK_SPACE = 0x20
VK_F8 = 0x77
WM_HOTKEY = 0x0312

HOTKEY_DEFINITIONS = {
    "ctrl_shift_space": (MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, VK_SPACE),
    "alt_v": (MOD_ALT | MOD_NOREPEAT, ord('V')),
    "ctrl_space": (MOD_CONTROL | MOD_NOREPEAT, VK_SPACE),
    "f8": (MOD_NOREPEAT, VK_F8),
    "none": None
}

def parse_hotkey_spec(spec):
    """
    Parses hotkey definition which can be:
    - Legacy preset string: 'ctrl_shift_space', 'alt_v', 'ctrl_space', 'f8', 'none'
    - Dict with custom keys: {'modifiers': ['ctrl', 'alt'], 'vk': 75, 'label': 'Ctrl + Alt + K'}
    - JSON string representation of the above
    Returns (fsModifiers, vk) or None if disabled/invalid.
    """
    if not spec or spec in ("none", "disabled"):
        return None

    if isinstance(spec, str):
        if spec in HOTKEY_DEFINITIONS:
            return HOTKEY_DEFINITIONS[spec]
        try:
            spec = json.loads(spec)
        except Exception:
            return None

    if isinstance(spec, dict):
        if spec.get("code") == "none" or spec.get("vk") in (0, None):
            return None
        vk = spec.get("vk")
        if not vk:
            return None
        modifiers_list = spec.get("modifiers") or []
        fs_modifiers = MOD_NOREPEAT
        for m in modifiers_list:
            m_lower = str(m).lower()
            if "ctrl" in m_lower or "control" in m_lower:
                fs_modifiers |= MOD_CONTROL
            elif "alt" in m_lower:
                fs_modifiers |= MOD_ALT
            elif "shift" in m_lower:
                fs_modifiers |= MOD_SHIFT
            elif "win" in m_lower or "meta" in m_lower:
                fs_modifiers |= MOD_WIN
        return (fs_modifiers, int(vk))

    return None

class GlobalHotkeyManager:
    """Registers and listens for global system hotkeys in Windows."""
    def __init__(self, callback):
        self._callback = callback
        self._hotkey_id = 9988
        self._current_hotkey_spec = "ctrl_shift_space"
        self._thread = None
        self._thread_id = None
        self._running = False

    def start(self, hotkey_spec="ctrl_shift_space"):
        self._current_hotkey_spec = hotkey_spec
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def update_hotkey(self, hotkey_spec):
        self._current_hotkey_spec = hotkey_spec
        if self._thread_id:
            ctypes.windll.user32.PostThreadMessageW(self._thread_id, 0x0400 + 1, 0, 0)

    def _run(self):
        user32 = ctypes.windll.user32
        self._thread_id = ctypes.windll.kernel32.GetCurrentThreadId()
        registered = False

        def do_register():
            nonlocal registered
            if registered:
                user32.UnregisterHotKey(None, self._hotkey_id)
                registered = False
            defn = parse_hotkey_spec(self._current_hotkey_spec)
            if defn:
                mods, vk = defn
                success = user32.RegisterHotKey(None, self._hotkey_id, mods, vk)
                if success:
                    registered = True
                    label = self._current_hotkey_spec.get("label", str(self._current_hotkey_spec)) if isinstance(self._current_hotkey_spec, dict) else str(self._current_hotkey_spec)
                    print(f"[GlobalHotkeyManager] Hotkey '{label}' registered successfully (mods={hex(mods)}, vk={hex(vk)}).")
                else:
                    err = ctypes.windll.kernel32.GetLastError()
                    print(f"[GlobalHotkeyManager] Could not register hotkey (mods={hex(mods)}, vk={hex(vk)}). WinError: {err}")
            else:
                print("[GlobalHotkeyManager] Hotkey disabled.")

        do_register()

        msg = wintypes.MSG()
        while self._running:
            res = user32.GetMessageW(ctypes.byref(msg), None, 0, 0)
            if res <= 0:
                break
            if msg.message == WM_HOTKEY:
                if msg.wParam == self._hotkey_id:
                    print("[GlobalHotkeyManager] Hotkey pressed -> Invoking voice.")
                    try:
                        self._callback()
                    except Exception as e:
                        print(f"[GlobalHotkeyManager] Error calling callback: {e}")
            elif msg.message == (0x0400 + 1):
                do_register()

        if registered:
            user32.UnregisterHotKey(None, self._hotkey_id)


class DashboardApi:
    def __init__(self, config_mgr, monitor_mgr, system_stats, audio_ctrl, media_session, weather_svc, cleaner_svc=None, assistant_svc=None):
        self._config_mgr = config_mgr
        self._monitor_mgr = monitor_mgr
        self._system_stats = system_stats
        self._audio_ctrl = audio_ctrl
        self._media_session = media_session
        self._weather_svc = weather_svc
        self._cleaner_svc = cleaner_svc or CleanerService()
        self._assistant_svc = assistant_svc or AssistantService(
            self._audio_ctrl,
            self._media_session,
            self._cleaner_svc,
            self._weather_svc,
            self._config_mgr,
            self._system_stats
        )
        self._window = None

    def set_window(self, window):
        self._window = window

    def set_hotkey_manager(self, hotkey_mgr):
        self._hotkey_mgr = hotkey_mgr

    def on_hotkey_triggered(self):
        """Called when global voice hotkey is pressed in Windows."""
        try:
            if self._window:
                self._window.evaluate_js("window.triggerAssistantHotkey && window.triggerAssistantHotkey()")
        except Exception as e:
            print(f"[DashboardApi] Error dispatching hotkey to UI: {e}")

    def get_dashboard_data(self):
        return {
            "system": self._system_stats.get_stats(),
            "audio": self._audio_ctrl.get_audio_info(),
            "media": self._media_session.get_current_media(),
            "weather": self._weather_svc.get_weather()
        }

    def get_audio_levels(self):
        return self._audio_ctrl.get_audio_levels()

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

    def get_media_info(self):
        return self._media_session.get_current_media()

    def get_weather(self):
        return self._weather_svc.get_weather()

    def search_cities(self, query):
        return self._weather_svc.search_cities(query)

    def get_app_settings(self):
        settings = self._weather_svc.get_settings() or {}
        try:
            settings["start_with_windows"] = is_autostart_enabled()
        except Exception as e:
            print(f"[DashboardApi] Error checking autostart: {e}")
            settings["start_with_windows"] = False
        return settings

    def save_app_settings(self, settings):
        if settings and "start_with_windows" in settings:
            try:
                set_autostart(bool(settings["start_with_windows"]))
            except Exception as e:
                print(f"[DashboardApi] Error setting autostart: {e}")
        res = self._weather_svc.save_settings(settings)
        if isinstance(res, dict) and "settings" in res:
            try:
                res["settings"]["start_with_windows"] = is_autostart_enabled()
            except Exception:
                pass
        return res

    def get_start_with_windows(self):
        return is_autostart_enabled()

    def set_start_with_windows(self, enabled):
        return set_autostart(bool(enabled))

    # =========================================================================
    # CLEANERS API
    # =========================================================================
    def get_ram_cleaner_info(self):
        return self._cleaner_svc.get_ram_info()

    def clean_ram(self):
        return self._cleaner_svc.clean_ram()

    def get_disk_cleaner_info(self):
        return self._cleaner_svc.get_disk_info()

    def clean_disk(self):
        return self._cleaner_svc.clean_disk()

    # =========================================================================
    # ASSISTANT / VOICE COMMANDS API
    # =========================================================================
    def assistant_start_recording(self):
        return self._assistant_svc.start_recording()

    def assistant_stop_recording(self):
        return self._assistant_svc.stop_recording_and_transcribe()

    def assistant_execute_command(self, text):
        return self._assistant_svc.execute_command(text)

    def assistant_check_recording_status(self):
        return self._assistant_svc.check_recording_status()

    def assistant_get_hotkey(self):
        return self._config_mgr.get("assistant_hotkey", "ctrl_shift_space")

    def assistant_set_hotkey(self, hotkey_id):
        self._config_mgr.set("assistant_hotkey", hotkey_id)
        if hasattr(self, "_hotkey_mgr") and self._hotkey_mgr:
            self._hotkey_mgr.update_hotkey(hotkey_id)
        return True

    def get_assistant_settings(self):
        return self._assistant_svc.get_settings()

    def save_assistant_settings(self, settings):
        return self._assistant_svc.save_settings(settings)

    def test_assistant_voice(self, voice=None, volume=100):
        return self._assistant_svc.test_voice(voice, volume)

    def get_llm_status(self):
        return self._assistant_svc.llm_service.get_status()

    def start_llm_download(self):
        return self._assistant_svc.llm_service.start_download()

    def cancel_llm_download(self):
        return self._assistant_svc.llm_service.cancel_download()

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

    def resolve_shortcut_target(self, target):
        if not target or not target.strip():
            return {"is_local": False, "icon": None, "default_name": ""}
        t = target.strip()
        if (t.startswith('"') and t.endswith('"')) or (t.startswith("'") and t.endswith("'")):
            t = t[1:-1].strip()

        if os.path.exists(t):
            icon_uri, name = extract_file_icon_base64(t)
            return {
                "is_local": True,
                "icon": icon_uri,
                "default_name": name,
                "target": t
            }

        is_web = t.startswith("http://") or t.startswith("https://") or t.startswith("www.") or ("." in t and not os.path.isabs(t))
        name = ""
        if is_web:
            clean = t.replace("https://", "").replace("http://", "").replace("www.", "")
            domain = clean.split("/")[0].split("?")[0]
            name = domain.split(".")[0].capitalize() if domain else ""
        return {
            "is_local": False,
            "icon": None,
            "default_name": name,
            "target": t
        }

    def select_multiple_images_dialog(self):
        if not self._window:
            return []
        try:
            file_types = (
                "Archivos de Imagen (*.png;*.jpg;*.jpeg;*.webp;*.ico;*.svg;*.gif)",
                "Todos los archivos (*.*)"
            )
            result = self._window.create_file_dialog(
                webview.FileDialog.OPEN,
                allow_multiple=True,
                file_types=file_types
            )
            if result:
                return list(result)
        except Exception as e:
            print(f"[DashboardApi] Error in select_multiple_images_dialog: {e}")
        return []

    def get_notes(self):
        return self._config_mgr.get("notes", [])

    def save_notes(self, notes):
        self._config_mgr.set("notes", notes)
        return True

    def get_slideshow_config(self, widget_id):
        key = f"slideshow_{widget_id}"
        return self._config_mgr.get(key, {"images": [], "interval": 10})

    def save_slideshow_config(self, widget_id, config):
        key = f"slideshow_{widget_id}"
        self._config_mgr.set(key, config)
        return True

    def beep_timer(self):
        try:
            import winsound
            winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
            return True
        except Exception as e:
            print(f"[DashboardApi] Error in beep_timer: {e}")
            return False

    def get_exchange_rates(self):
        import time
        import requests
        cache = self._config_mgr.get("_exchange_cache", {})
        now = time.time()
        if cache and (now - cache.get("timestamp", 0) < 21600) and "rates" in cache:
            return cache["rates"]
        try:
            resp = requests.get("https://open.er-api.com/v6/latest/EUR", timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                if "rates" in data:
                    self._config_mgr.set("_exchange_cache", {"timestamp": now, "rates": data["rates"]})
                    return data["rates"]
        except Exception as e:
            print(f"[DashboardApi] Error fetching exchange rates: {e}")
        if cache and "rates" in cache:
            return cache["rates"]
        return {
            "EUR": 1.0,
            "USD": 1.09,
            "GBP": 0.86,
            "JPY": 162.5,
            "CAD": 1.48,
            "CHF": 0.96,
            "CNY": 7.85,
            "AUD": 1.65,
            "MXN": 18.5,
            "BRL": 5.4,
            "INR": 90.2
        }

    def translate_text(self, text, source_lang="es", target_lang="en"):
        import urllib.request
        import urllib.parse
        import json
        import html
        if not text or not text.strip():
            return {"translatedText": ""}
        
        # 1. Google Translate (alta precisión y naturalidad neuronal)
        try:
            encoded_text = urllib.parse.quote(text.strip())
            url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={source_lang}&tl={target_lang}&dt=t&q={encoded_text}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=6) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data and isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
                    translated = "".join(seg[0] for seg in data[0] if seg and len(seg) > 0 and seg[0])
                    if translated:
                        return {"translatedText": translated}
        except Exception as e:
            print(f"[DashboardApi] Google Translate error: {e}")

        # 2. Respaldo MyMemory si falla la conexión directa
        try:
            import requests
            pair = f"{source_lang}|{target_lang}"
            url = f"https://api.mymemory.translated.net/get?q={encoded_text}&langpair={pair}"
            resp = requests.get(url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                translated = data.get("responseData", {}).get("translatedText", "")
                if translated:
                    return {"translatedText": html.unescape(translated)}
        except Exception as e:
            print(f"[DashboardApi] Fallback translation error: {e}")

        return {"error": "No se pudo traducir en este momento"}


def extract_file_icon_base64(file_path):

    if not file_path or not os.path.exists(file_path):
        return None, ""

    resolved_path = file_path
    name = os.path.splitext(os.path.basename(file_path))[0]

    icon_source = file_path
    icon_index = 0
    if file_path.lower().endswith(".lnk"):
        try:
            import win32com.client
            shell = win32com.client.Dispatch("WScript.Shell")
            sc = shell.CreateShortcut(file_path)

            target_path = sc.TargetPath.strip() if sc.TargetPath else ""
            if target_path and os.path.exists(target_path):
                resolved_path = target_path

            found_icon = False
            icon_loc = sc.IconLocation.strip() if sc.IconLocation else ""
            if icon_loc:
                parts = [p.strip() for p in icon_loc.split(",") if p.strip()]
                if parts and os.path.exists(parts[0]):
                    icon_source = parts[0]
                    found_icon = True
                    if len(parts) > 1:
                        try:
                            icon_index = int(parts[1])
                        except Exception:
                            icon_index = 0

            if not found_icon:
                icon_source = resolved_path
        except Exception as e:
            print(f"[DashboardApi] Error reading shortcut: {e}")
            icon_source = resolved_path

    import io
    import base64
    import ctypes
    from ctypes import wintypes
    import win32gui
    import win32ui
    from PIL import Image

    user32 = ctypes.windll.user32
    hicon = wintypes.HICON()
    icon_id = wintypes.UINT()

    # Prioritize 256x256 down to 32x32 from icon_source, then resolved_path
    sources_to_try = [icon_source]
    if resolved_path not in sources_to_try and os.path.exists(resolved_path):
        sources_to_try.append(resolved_path)

    extracted_hicon = None

    for src in sources_to_try:
        if not os.path.exists(src):
            continue
        for size in (256, 128, 64, 48, 32):
            try:
                res = user32.PrivateExtractIconsW(
                    src,
                    icon_index,
                    size,
                    size,
                    ctypes.byref(hicon),
                    ctypes.byref(icon_id),
                    1,
                    0
                )
                if res > 0 and hicon.value:
                    extracted_hicon = hicon.value
                    break
            except Exception:
                pass
        if extracted_hicon:
            break

    # If still not found, try SHGetImageList JUMBO (256x256) on target (clean, no shortcut arrow)
    if not extracted_hicon:
        try:
            class GUID(ctypes.Structure):
                _fields_ = [
                    ("Data1", wintypes.DWORD),
                    ("Data2", wintypes.WORD),
                    ("Data3", wintypes.WORD),
                    ("Data4", wintypes.BYTE * 8)
                ]

            IID_IImageList = GUID(
                0x46EB5926,
                0x582E,
                0x4017,
                (wintypes.BYTE * 8)(0x9F, 0xDF, 0xE8, 0x99, 0x8D, 0xAA, 0x09, 0x50)
            )

            class SHFILEINFO(ctypes.Structure):
                _fields_ = [
                    ('hIcon', wintypes.HICON),
                    ('iIcon', ctypes.c_int),
                    ('dwAttributes', wintypes.DWORD),
                    ('szDisplayName', wintypes.WCHAR * 260),
                    ('szTypeName', wintypes.WCHAR * 80)
                ]

            target_for_shell = resolved_path if os.path.exists(resolved_path) else file_path
            sfi = SHFILEINFO()
            SHGFI_SYSICONINDEX = 0x00004000
            ret = ctypes.windll.shell32.SHGetFileInfoW(
                target_for_shell,
                0,
                ctypes.byref(sfi),
                ctypes.sizeof(sfi),
                SHGFI_SYSICONINDEX
            )
            if ret:
                image_list = ctypes.c_void_p()
                hr = ctypes.windll.shell32.SHGetImageList(
                    4,  # SHIL_JUMBO (256x256)
                    ctypes.byref(IID_IImageList),
                    ctypes.byref(image_list)
                )
                if hr == 0 and image_list:
                    h_jumbo = ctypes.windll.comctl32.ImageList_GetIcon(image_list, sfi.iIcon, 0)
                    if h_jumbo:
                        extracted_hicon = h_jumbo
        except Exception as e:
            print(f"[DashboardApi] Jumbo icon fallback error: {e}")

    if not extracted_hicon:
        return None, name

    try:
        icon_info = win32gui.GetIconInfo(extracted_hicon)
        hbm_color = icon_info[4]
        hbm_mask = icon_info[3]

        hdc = win32ui.CreateDCFromHandle(win32gui.GetDC(0))
        hbmp = win32ui.CreateBitmap()

        bmp_info = win32gui.GetObject(hbm_color if hbm_color else hbm_mask)
        width = bmp_info.bmWidth
        height = bmp_info.bmHeight
        if not hbm_color:
            height = height // 2

        mem_dc = hdc.CreateCompatibleDC()
        hbmp.CreateCompatibleBitmap(hdc, width, height)
        prev_bmp = mem_dc.SelectObject(hbmp)

        win32gui.DrawIconEx(mem_dc.GetSafeHdc(), 0, 0, extracted_hicon, width, height, 0, None, 3)

        bmp_str = hbmp.GetBitmapBits(True)
        img = Image.frombuffer('RGBA', (width, height), bmp_str, 'raw', 'BGRA', 0, 1)

        mem_dc.SelectObject(prev_bmp)
        win32gui.DeleteObject(hbmp.GetHandle())
        mem_dc.DeleteDC()
        hdc.DeleteDC()
        win32gui.DestroyIcon(extracted_hicon)
        if hbm_color:
            win32gui.DeleteObject(hbm_color)
        if hbm_mask:
            win32gui.DeleteObject(hbm_mask)

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/png;base64,{b64}", name
    except Exception as e:
        print(f"[DashboardApi] Error converting icon: {e}")
        try:
            win32gui.DestroyIcon(extracted_hicon)
        except Exception:
            pass
        return None, name


def main():
    html_path = get_resource_path(os.path.join("ui", "index.html"))

    config_mgr = ConfigManager()
    monitor_mgr = MonitorManager(config_mgr)
    system_stats = SystemStats()
    audio_ctrl = AudioController()
    media_session = MediaSessionManager()
    weather_svc = WeatherService(config_mgr)
    cleaner_svc = CleanerService()
    assistant_svc = AssistantService(
        audio_ctrl,
        media_session,
        cleaner_svc,
        weather_svc,
        config_mgr,
        system_stats
    )

    api = DashboardApi(
        config_mgr,
        monitor_mgr,
        system_stats,
        audio_ctrl,
        media_session,
        weather_svc,
        cleaner_svc,
        assistant_svc
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

    # Start Global System Voice Hotkey
    saved_hotkey = config_mgr.get("assistant_hotkey", "ctrl_shift_space")
    hotkey_mgr = GlobalHotkeyManager(api.on_hotkey_triggered)
    api.set_hotkey_manager(hotkey_mgr)
    hotkey_mgr.start(saved_hotkey)

    # Start Edge Chromium WebView2
    webview.start(gui="edgechromium", debug=False)


if __name__ == "__main__":
    main()
