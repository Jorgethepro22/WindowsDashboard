import asyncio
import base64
import threading
import time

def _send_media_key(vk):
    try:
        import win32api
        import win32con
        win32api.keybd_event(vk, 0, win32con.KEYEVENTF_EXTENDEDKEY, 0)
        time.sleep(0.02)
        win32api.keybd_event(vk, 0, win32con.KEYEVENTF_EXTENDEDKEY | win32con.KEYEVENTF_KEYUP, 0)
        return True
    except Exception:
        try:
            import ctypes
            KEYEVENTF_EXTENDEDKEY = 0x0001
            KEYEVENTF_KEYUP = 0x0002
            ctypes.windll.user32.keybd_event(vk, 0, KEYEVENTF_EXTENDEDKEY, 0)
            time.sleep(0.02)
            ctypes.windll.user32.keybd_event(vk, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0)
            return True
        except Exception:
            return False

VK_MEDIA_NEXT_TRACK = 0xB0
VK_MEDIA_PREV_TRACK = 0xB1
VK_MEDIA_PLAY_PAUSE = 0xB3


class MediaSessionManager:
    def __init__(self):
        self._last_state = {
            "title": "Sin reproducción activa",
            "artist": "Ninguna pista detectada",
            "album": "",
            "app_name": "Windows SMTC",
            "is_playing": False,
            "thumbnail_base64": None
        }
        self._lock = threading.Lock()
        self._cached_thumb_key = None
        self._cached_thumb_b64 = None
        self._cooldown_until = 0
        self._cooldown_state = None
        self._check_winsdk()

        # Fast background thread to keep media state updated every 250ms with zero UI blocking
        self._running = True
        self._worker_thread = threading.Thread(target=self._background_poll_loop, daemon=True)
        self._worker_thread.start()

    def _check_winsdk(self):
        try:
            import winsdk.windows.media.control
            import winsdk.windows.storage.streams
            self._winsdk_available = True
        except Exception:
            self._winsdk_available = False

    def _background_poll_loop(self):
        while self._running:
            try:
                if not self._winsdk_available:
                    self._check_winsdk()
                if self._winsdk_available:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    state = loop.run_until_complete(self._fetch_winsdk_media())
                    loop.close()
                    if state:
                        with self._lock:
                            now = time.time()
                            if now < self._cooldown_until and self._cooldown_state is not None:
                                if state.get("is_playing") == self._cooldown_state:
                                    self._cooldown_until = 0
                                    self._cooldown_state = None
                                    self._last_state = state
                                else:
                                    # Enforce optimistic state during transition
                                    state["is_playing"] = self._cooldown_state
                                    self._last_state = state
                            else:
                                self._last_state = state
            except Exception:
                pass
            time.sleep(0.25)

    def get_current_media(self):
        with self._lock:
            return dict(self._last_state)

    async def _fetch_winsdk_media(self):
        import winsdk.windows.media.control as wmc
        import winsdk.windows.storage.streams as wss

        try:
            mgr = await asyncio.wait_for(wmc.GlobalSystemMediaTransportControlsSessionManager.request_async(), timeout=1.0)
            session = mgr.get_current_session()
            
            # If current session is None (e.g. paused YouTube in Chrome), inspect all active sessions
            if not session:
                sessions = mgr.get_sessions()
                if sessions:
                    for s in sessions:
                        info = s.get_playback_info()
                        if info and info.playback_status == wmc.GlobalSystemMediaTransportControlsSessionPlaybackStatus.PLAYING:
                            session = s
                            break
                    if not session:
                        session = sessions[0]

            if not session:
                return {
                    "title": "Sin reproducción activa",
                    "artist": "Ninguna pista detectada",
                    "album": "",
                    "app_name": "Windows SMTC",
                    "is_playing": False,
                    "thumbnail_base64": None
                }

            app_id = session.source_app_user_model_id or "Reproductor"
            app_name = app_id.split("!")[-1].replace(".exe", "").capitalize()
            app_id_lower = app_id.lower()
            if "spotify" in app_id_lower:
                app_name = "Spotify"
            elif "chrome" in app_id_lower:
                app_name = "Google Chrome"
            elif "firefox" in app_id_lower:
                app_name = "Firefox"
            elif "msedge" in app_id_lower:
                app_name = "Microsoft Edge"
            elif "vlc" in app_id_lower:
                app_name = "VLC Media Player"

            info = session.get_playback_info()
            is_playing = False
            if info:
                status = info.playback_status
                is_playing = (status == wmc.GlobalSystemMediaTransportControlsSessionPlaybackStatus.PLAYING)

            props = await asyncio.wait_for(session.try_get_media_properties_async(), timeout=1.0)
            title = props.title if props and props.title else "Pista desconocida"
            artist = props.artist if props and props.artist else "Artista desconocido"
            album = props.album_title if props and props.album_title else ""

            track_key = f"{title}_{artist}"
            thumb_b64 = None
            if track_key == self._cached_thumb_key and self._cached_thumb_b64 is not None:
                thumb_b64 = self._cached_thumb_b64
            elif props and props.thumbnail:
                try:
                    stream = await asyncio.wait_for(props.thumbnail.open_read_async(), timeout=1.0)
                    size = stream.size
                    if 0 < size < 5 * 1024 * 1024:
                        reader = wss.DataReader(stream.get_input_stream_at(0))
                        await asyncio.wait_for(reader.load_async(size), timeout=1.0)
                        buf = bytearray(size)
                        reader.read_bytes(buf)
                        thumb_b64 = base64.b64encode(buf).decode("utf-8")
                        self._cached_thumb_key = track_key
                        self._cached_thumb_b64 = thumb_b64
                except Exception:
                    thumb_b64 = None

            return {
                "title": title,
                "artist": artist,
                "album": album,
                "app_name": app_name,
                "is_playing": is_playing,
                "thumbnail_base64": thumb_b64
            }
        except Exception:
            return None

    def play_pause(self):
        with self._lock:
            target_playing = not self._last_state.get("is_playing", False)
            self._last_state["is_playing"] = target_playing
            self._cooldown_until = time.time() + 0.8
            self._cooldown_state = target_playing

        if not self._winsdk_available:
            return _send_media_key(VK_MEDIA_PLAY_PAUSE)
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            res = loop.run_until_complete(self._control_action("play_pause"))
            loop.close()
            return res
        except Exception:
            return _send_media_key(VK_MEDIA_PLAY_PAUSE)

    def next_track(self):
        if not self._winsdk_available:
            return _send_media_key(VK_MEDIA_NEXT_TRACK)
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            res = loop.run_until_complete(self._control_action("next"))
            loop.close()
            return res
        except Exception:
            return _send_media_key(VK_MEDIA_NEXT_TRACK)

    def previous_track(self):
        if not self._winsdk_available:
            return _send_media_key(VK_MEDIA_PREV_TRACK)
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            res = loop.run_until_complete(self._control_action("prev"))
            loop.close()
            return res
        except Exception:
            return _send_media_key(VK_MEDIA_PREV_TRACK)

    async def _control_action(self, action):
        import winsdk.windows.media.control as wmc
        try:
            mgr = await asyncio.wait_for(wmc.GlobalSystemMediaTransportControlsSessionManager.request_async(), timeout=1.0)
            session = mgr.get_current_session()

            # If no current session, check all sessions
            if not session:
                sessions = mgr.get_sessions()
                if sessions:
                    for s in sessions:
                        info = s.get_playback_info()
                        if info and info.playback_status == wmc.GlobalSystemMediaTransportControlsSessionPlaybackStatus.PLAYING:
                            session = s
                            break
                    if not session:
                        session = sessions[0]

            if session:
                success = False
                if action == "play_pause":
                    try:
                        info = session.get_playback_info()
                        if info and info.controls and info.controls.is_play_pause_toggle_enabled:
                            success = await asyncio.wait_for(session.try_toggle_play_pause_async(), timeout=1.0)
                        elif info and info.playback_status == wmc.GlobalSystemMediaTransportControlsSessionPlaybackStatus.PLAYING:
                            success = await asyncio.wait_for(session.try_pause_async(), timeout=1.0)
                        else:
                            success = await asyncio.wait_for(session.try_play_async(), timeout=1.0)
                    except Exception:
                        success = False
                    if not success:
                        _send_media_key(VK_MEDIA_PLAY_PAUSE)
                        success = True
                    return success
                elif action == "next":
                    try:
                        success = await asyncio.wait_for(session.try_skip_next_async(), timeout=1.0)
                    except Exception:
                        success = False
                    if not success:
                        _send_media_key(VK_MEDIA_NEXT_TRACK)
                        success = True
                    return success
                elif action == "prev":
                    try:
                        success = await asyncio.wait_for(session.try_skip_previous_async(), timeout=1.0)
                    except Exception:
                        success = False
                    if not success:
                        _send_media_key(VK_MEDIA_PREV_TRACK)
                        success = True
                    return success
        except Exception:
            pass

        # Fallback to hardware multimedia key
        if action == "play_pause":
            return _send_media_key(VK_MEDIA_PLAY_PAUSE)
        elif action == "next":
            return _send_media_key(VK_MEDIA_NEXT_TRACK)
        elif action == "prev":
            return _send_media_key(VK_MEDIA_PREV_TRACK)
        return False
