import comtypes

class AudioController:
    def __init__(self):
        self._last_device_name = "Altavoces de Windows"

    def _get_speakers(self):
        try:
            comtypes.CoInitialize()
            from pycaw.pycaw import AudioUtilities
            sp = AudioUtilities.GetSpeakers()
            if sp and hasattr(sp, "FriendlyName"):
                self._last_device_name = sp.FriendlyName
            return sp
        except Exception as e:
            print(f"[AudioController] Error getting speakers: {e}")
            return None

    def get_audio_info(self):
        sp = self._get_speakers()
        if not sp:
            return {
                "volume": 50,
                "is_muted": False,
                "device_name": self._last_device_name,
                "available": False
            }

        try:
            ep = sp.EndpointVolume
            vol = int(round(sp.volume_percent))
            muted = bool(ep.GetMute())
            dev_name = self._last_device_name or "Altavoces de Windows"

            return {
                "volume": vol,
                "is_muted": muted,
                "device_name": dev_name,
                "available": True
            }
        except Exception as e:
            print(f"[AudioController] Error reading audio stats: {e}")
            return {
                "volume": 50,
                "is_muted": False,
                "device_name": self._last_device_name,
                "available": False
            }

    def set_volume(self, percent):
        sp = self._get_speakers()
        if not sp:
            return False
        try:
            percent = max(0, min(100, int(percent)))
            ep = sp.EndpointVolume
            scalar = percent / 100.0
            ep.SetMasterVolumeLevelScalar(scalar, None)
            if percent > 0 and ep.GetMute():
                ep.SetMute(0, None)
            return True
        except Exception as e:
            print(f"[AudioController] Error setting volume: {e}")
            return False

    def toggle_mute(self):
        sp = self._get_speakers()
        if not sp:
            return False
        try:
            ep = sp.EndpointVolume
            muted = ep.GetMute()
            ep.SetMute(not muted, None)
            return True
        except Exception as e:
            print(f"[AudioController] Error toggling mute: {e}")
            return False
