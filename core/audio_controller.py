import time
import warnings
import comtypes

class AudioController:
    def __init__(self):
        self._last_speakers_name = "Altavoces de Windows"
        self._last_mic_name = "Micrófono de Windows"
        self._cached_devices_time = 0
        self._cached_output_devices = []
        self._cached_input_devices = []

    def _init_com(self):
        try:
            comtypes.CoInitialize()
        except Exception:
            pass

    def _get_speakers(self):
        try:
            self._init_com()
            from pycaw.pycaw import AudioUtilities
            sp = AudioUtilities.GetSpeakers()
            if sp and hasattr(sp, "FriendlyName"):
                self._last_speakers_name = sp.FriendlyName
            return sp
        except Exception as e:
            print(f"[AudioController] Error getting speakers: {e}")
            return None

    def _get_microphone(self):
        try:
            self._init_com()
            from pycaw.pycaw import AudioUtilities
            mic_imm = AudioUtilities.GetMicrophone()
            if not mic_imm:
                return None
            mic = AudioUtilities.CreateDevice(mic_imm)
            if mic and hasattr(mic, "FriendlyName"):
                self._last_mic_name = mic.FriendlyName
            return mic
        except Exception as e:
            print(f"[AudioController] Error getting microphone: {e}")
            return None

    def _refresh_devices_cache(self, force=False):
        now = time.time()
        if not force and (now - self._cached_devices_time < 5.0) and self._cached_output_devices:
            return

        try:
            self._init_com()
            from pycaw.pycaw import AudioUtilities
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                all_devs = AudioUtilities.GetAllDevices()

            outputs = []
            inputs = []
            for d in all_devs:
                state = getattr(d, "state", None)
                if not state or state.name != "Active":
                    continue
                dev_id = getattr(d, "id", "")
                name = getattr(d, "FriendlyName", "Dispositivo de audio")
                if dev_id.startswith("{0.0.0."):
                    outputs.append({"id": dev_id, "name": name})
                elif dev_id.startswith("{0.0.1."):
                    inputs.append({"id": dev_id, "name": name})

            self._cached_output_devices = outputs
            self._cached_input_devices = inputs
            self._cached_devices_time = now
        except Exception as e:
            print(f"[AudioController] Error enumerating devices: {e}")

    def get_audio_info(self):
        self._refresh_devices_cache()

        # Output info
        output_info = {
            "volume": 50,
            "is_muted": False,
            "device_name": self._last_speakers_name,
            "device_id": "",
            "devices": self._cached_output_devices,
            "available": False
        }
        sp = self._get_speakers()
        if sp:
            try:
                ep = sp.EndpointVolume
                output_info["volume"] = int(round(sp.volume_percent))
                output_info["is_muted"] = bool(ep.GetMute())
                output_info["device_name"] = self._last_speakers_name or "Altavoces"
                output_info["device_id"] = getattr(sp, "id", "")
                output_info["available"] = True
            except Exception as e:
                print(f"[AudioController] Error reading output audio: {e}")

        # Input info (Microphone)
        input_info = {
            "volume": 70,
            "is_muted": False,
            "device_name": self._last_mic_name,
            "device_id": "",
            "devices": self._cached_input_devices,
            "available": False
        }
        mic = self._get_microphone()
        if mic:
            try:
                ep_mic = mic.EndpointVolume
                input_info["volume"] = int(round(mic.volume_percent))
                input_info["is_muted"] = bool(ep_mic.GetMute())
                input_info["device_name"] = self._last_mic_name or "Micrófono"
                input_info["device_id"] = getattr(mic, "id", "")
                input_info["available"] = True
            except Exception as e:
                print(f"[AudioController] Error reading input audio: {e}")

        return {
            "output": output_info,
            "input": input_info,
            # Legacy fields for backwards compatibility
            "volume": output_info["volume"],
            "is_muted": output_info["is_muted"],
            "device_name": output_info["device_name"],
            "available": output_info["available"]
        }

    def set_output_volume(self, percent):
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
            print(f"[AudioController] Error setting output volume: {e}")
            return False

    def set_volume(self, percent):
        return self.set_output_volume(percent)

    def set_input_volume(self, percent):
        mic = self._get_microphone()
        if not mic:
            return False
        try:
            percent = max(0, min(100, int(percent)))
            ep = mic.EndpointVolume
            scalar = percent / 100.0
            ep.SetMasterVolumeLevelScalar(scalar, None)
            if percent > 0 and ep.GetMute():
                ep.SetMute(0, None)
            return True
        except Exception as e:
            print(f"[AudioController] Error setting input volume: {e}")
            return False

    def toggle_output_mute(self):
        sp = self._get_speakers()
        if not sp:
            return False
        try:
            ep = sp.EndpointVolume
            muted = ep.GetMute()
            ep.SetMute(not muted, None)
            return True
        except Exception as e:
            print(f"[AudioController] Error toggling output mute: {e}")
            return False

    def toggle_mute(self):
        return self.toggle_output_mute()

    def toggle_input_mute(self):
        mic = self._get_microphone()
        if not mic:
            return False
        try:
            ep = mic.EndpointVolume
            muted = ep.GetMute()
            ep.SetMute(not muted, None)
            return True
        except Exception as e:
            print(f"[AudioController] Error toggling input mute: {e}")
            return False

    def set_default_device(self, device_id):
        if not device_id:
            return False
        try:
            self._init_com()
            from pycaw.pycaw import AudioUtilities
            from pycaw.constants import ERole
            AudioUtilities.SetDefaultDevice(device_id, [ERole.eConsole, ERole.eMultimedia, ERole.eCommunications])
            self._refresh_devices_cache(force=True)
            return True
        except Exception as e:
            print(f"[AudioController] Error setting default device {device_id}: {e}")
            return False
