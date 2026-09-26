import asyncio
import base64
import threading

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
        self._check_winsdk()

    def _check_winsdk(self):
        try:
            import winsdk.windows.media.control
            import winsdk.windows.storage.streams
            self._winsdk_available = True
        except Exception:
            self._winsdk_available = False

    def get_current_media(self):
        if not self._winsdk_available:
            self._check_winsdk()

        if self._winsdk_available:
            try:
                state = asyncio.run(self._fetch_winsdk_media())
                if state:
                    with self._lock:
                        self._last_state = state
                    return state
            except Exception as e:
                pass

        with self._lock:
            return self._last_state

    async def _fetch_winsdk_media(self):
        import winsdk.windows.media.control as wmc
        import winsdk.windows.storage.streams as wss

        try:
            mgr = await asyncio.wait_for(wmc.GlobalSystemMediaTransportControlsSessionManager.request_async(), timeout=1.5)
            session = mgr.get_current_session()
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
            if "spotify" in app_id.lower():
                app_name = "Spotify"
            elif "chrome" in app_id.lower():
                app_name = "Google Chrome"
            elif "firefox" in app_id.lower():
                app_name = "Firefox"
            elif "msedge" in app_id.lower():
                app_name = "Microsoft Edge"

            info = session.get_playback_info()
            is_playing = False
            if info:
                status = info.playback_status
                is_playing = (status == wmc.GlobalSystemMediaTransportControlsSessionPlaybackStatus.PLAYING)

            props = await asyncio.wait_for(session.try_get_media_properties_async(), timeout=1.5)
            title = props.title if props and props.title else "Pista desconocida"
            artist = props.artist if props and props.artist else "Artista desconocido"
            album = props.album_title if props and props.album_title else ""

            track_key = f"{title}_{artist}"
            thumb_b64 = None
            if track_key == self._cached_thumb_key and self._cached_thumb_b64 is not None:
                thumb_b64 = self._cached_thumb_b64
            elif props and props.thumbnail:
                try:
                    stream = await asyncio.wait_for(props.thumbnail.open_read_async(), timeout=1.5)
                    size = stream.size
                    if 0 < size < 5 * 1024 * 1024:
                        reader = wss.DataReader(stream.get_input_stream_at(0))
                        await asyncio.wait_for(reader.load_async(size), timeout=1.5)
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
        if not self._winsdk_available:
            return False
        try:
            return asyncio.run(self._control_action("play_pause"))
        except Exception:
            return False

    def next_track(self):
        if not self._winsdk_available:
            return False
        try:
            return asyncio.run(self._control_action("next"))
        except Exception:
            return False

    def previous_track(self):
        if not self._winsdk_available:
            return False
        try:
            return asyncio.run(self._control_action("prev"))
        except Exception:
            return False

    async def _control_action(self, action):
        import winsdk.windows.media.control as wmc
        mgr = await asyncio.wait_for(wmc.GlobalSystemMediaTransportControlsSessionManager.request_async(), timeout=1.5)
        session = mgr.get_current_session()
        if not session:
            return False

        if action == "play_pause":
            return await asyncio.wait_for(session.try_toggle_play_pause_async(), timeout=1.5)
        elif action == "next":
            return await asyncio.wait_for(session.try_skip_next_async(), timeout=1.5)
        elif action == "prev":
            return await asyncio.wait_for(session.try_skip_previous_async(), timeout=1.5)
        return False
