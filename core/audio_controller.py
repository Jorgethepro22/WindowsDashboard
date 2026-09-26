import time
import math
import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="pycaw")
warnings.filterwarnings("ignore", message=".*COMError attempting to get property.*")
import comtypes

class AudioController:
    def __init__(self):
        self._last_speakers_name = "Altavoces de Windows"
        self._last_mic_name = "Micrófono de Windows"
        self._cached_devices_time = 0
        self._cached_output_devices = []
        self._cached_input_devices = []

        # Cached endpoints for sub-millisecond volume changes
        self._cached_sp = None
        self._cached_sp_ep = None
        self._cached_mic = None
        self._cached_mic_ep = None

        # Cached meter interfaces for real-time peak volume
        self._cached_sp_meter = None
        self._cached_mic_meter = None

    def _init_com(self):
        try:
            comtypes.CoInitialize()
        except Exception:
            pass

    def _get_speakers(self, force=False):
        if not force and self._cached_sp and self._cached_sp_ep:
            return self._cached_sp
        try:
            self._init_com()
            from pycaw.pycaw import AudioUtilities
            sp = AudioUtilities.GetSpeakers()
            if sp:
                if hasattr(sp, "FriendlyName"):
                    self._last_speakers_name = sp.FriendlyName
                self._cached_sp = sp
                self._cached_sp_ep = sp.EndpointVolume
                self._cached_sp_meter = None
                return sp
        except Exception as e:
            print(f"[AudioController] Error getting speakers: {e}")
            self._cached_sp = None
            self._cached_sp_ep = None
        return None

    def _get_microphone(self, force=False):
        if not force and self._cached_mic and self._cached_mic_ep:
            return self._cached_mic
        try:
            self._init_com()
            from pycaw.pycaw import AudioUtilities
            mic_imm = AudioUtilities.GetMicrophone()
            if not mic_imm:
                self._cached_mic = None
                self._cached_mic_ep = None
                return None
            mic = AudioUtilities.CreateDevice(mic_imm)
            if mic:
                if hasattr(mic, "FriendlyName"):
                    self._last_mic_name = mic.FriendlyName
                self._cached_mic = mic
                self._cached_mic_ep = mic.EndpointVolume
                self._cached_mic_meter = None
                return mic
        except Exception as e:
            print(f"[AudioController] Error getting microphone: {e}")
            self._cached_mic = None
            self._cached_mic_ep = None
        return None

    def _get_speakers_meter(self):
        if self._cached_sp_meter:
            return self._cached_sp_meter
        sp = self._get_speakers()
        if sp and hasattr(sp, "_dev"):
            try:
                self._init_com()
                from pycaw.pycaw import IAudioMeterInformation
                meter = sp._dev.Activate(IAudioMeterInformation._iid_, comtypes.CLSCTX_ALL, None)
                self._cached_sp_meter = meter.QueryInterface(IAudioMeterInformation)
                return self._cached_sp_meter
            except Exception as e:
                self._cached_sp_meter = None
        return None

    def _get_microphone_meter(self):
        if self._cached_mic_meter:
            return self._cached_mic_meter
        mic = self._get_microphone()
        if mic and hasattr(mic, "_dev"):
            try:
                self._init_com()
                from pycaw.pycaw import IAudioMeterInformation
                meter = mic._dev.Activate(IAudioMeterInformation._iid_, comtypes.CLSCTX_ALL, None)
                self._cached_mic_meter = meter.QueryInterface(IAudioMeterInformation)
                return self._cached_mic_meter
            except Exception as e:
                self._cached_mic_meter = None
        return None

    def _linear_to_obs_db_percent(self, val):
        """Converts linear audio amplitude (0.0 to 1.0) into OBS Studio perceptual logarithmic percentage (0-100%)."""
        if val <= 0.0005:  # Below -66 dB (digital noise floor / silence)
            return 0.0
        try:
            db = 20.0 * math.log10(val)
        except Exception:
            return 0.0

        if db <= -60.0:
            return 0.0
        elif db <= -40.0:
            # -60 to -40 dB -> 0% to 20%
            return round((db + 60.0) / 20.0 * 20.0, 1)
        elif db <= -20.0:
            # -40 to -20 dB -> 20% to 60% (speech entry to normal conversation)
            return round(20.0 + (db + 40.0) / 20.0 * 40.0, 1)
        elif db <= -9.0:
            # -20 to -9 dB -> 60% to 82% (punchy voice / normal music, yellow zone)
            return round(60.0 + (db + 20.0) / 11.0 * 22.0, 1)
        elif db <= 0.0:
            # -9 to 0 dB -> 82% to 100% (high energy / clipping warning zone)
            return round(82.0 + (db + 9.0) / 9.0 * 18.0, 1)
        else:
            return 100.0

    def get_audio_levels(self):
        """Returns real-time audio peak levels calibrated to OBS Studio logarithmic dB scale."""
        out_peak = 0.0
        in_peak = 0.0

        try:
            sp_meter = self._get_speakers_meter()
            if sp_meter:
                out_peak = max(0.0, min(1.0, float(sp_meter.GetPeakValue())))
        except Exception:
            self._cached_sp_meter = None

        try:
            mic_meter = self._get_microphone_meter()
            if mic_meter:
                in_peak = max(0.0, min(1.0, float(mic_meter.GetPeakValue())))
        except Exception:
            self._cached_mic_meter = None

        out_db = round(20.0 * math.log10(max(1e-5, out_peak)), 1)
        in_db = round(20.0 * math.log10(max(1e-5, in_peak)), 1)

        return {
            "output_peak": self._linear_to_obs_db_percent(out_peak),
            "input_peak": self._linear_to_obs_db_percent(in_peak),
            "output_db": out_db,
            "input_db": in_db
        }

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
        if sp and self._cached_sp_ep:
            try:
                ep = self._cached_sp_ep
                output_info["volume"] = int(round(sp.volume_percent))
                output_info["is_muted"] = bool(ep.GetMute())
                output_info["device_name"] = self._last_speakers_name or "Altavoces"
                output_info["device_id"] = getattr(sp, "id", "")
                output_info["available"] = True
            except Exception as e:
                # Invalidate cache on failure
                self._cached_sp = None
                self._cached_sp_ep = None
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
        if mic and self._cached_mic_ep:
            try:
                ep_mic = self._cached_mic_ep
                input_info["volume"] = int(round(mic.volume_percent))
                input_info["is_muted"] = bool(ep_mic.GetMute())
                input_info["device_name"] = self._last_mic_name or "Micrófono"
                input_info["device_id"] = getattr(mic, "id", "")
                input_info["available"] = True
            except Exception as e:
                # Invalidate cache on failure
                self._cached_mic = None
                self._cached_mic_ep = None
                print(f"[AudioController] Error reading input audio: {e}")

        levels = self.get_audio_levels()
        output_info["peak"] = levels["output_peak"]
        input_info["peak"] = levels["input_peak"]

        return {
            "output": output_info,
            "input": input_info,
            "levels": levels,
            # Legacy fields for backwards compatibility
            "volume": output_info["volume"],
            "is_muted": output_info["is_muted"],
            "device_name": output_info["device_name"],
            "available": output_info["available"]
        }

    def set_output_volume(self, percent):
        sp = self._get_speakers()
        if not sp or not self._cached_sp_ep:
            return False
        try:
            percent = max(0, min(100, int(percent)))
            ep = self._cached_sp_ep
            scalar = percent / 100.0
            ep.SetMasterVolumeLevelScalar(scalar, None)
            if percent > 0 and ep.GetMute():
                ep.SetMute(0, None)
            return True
        except Exception:
            # Retry once with refreshed endpoint
            try:
                sp = self._get_speakers(force=True)
                if sp and self._cached_sp_ep:
                    ep = self._cached_sp_ep
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
        if not mic or not self._cached_mic_ep:
            return False
        try:
            percent = max(0, min(100, int(percent)))
            ep = self._cached_mic_ep
            scalar = percent / 100.0
            ep.SetMasterVolumeLevelScalar(scalar, None)
            if percent > 0 and ep.GetMute():
                ep.SetMute(0, None)
            return True
        except Exception:
            # Retry once with refreshed endpoint
            try:
                mic = self._get_microphone(force=True)
                if mic and self._cached_mic_ep:
                    ep = self._cached_mic_ep
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
        if not sp or not self._cached_sp_ep:
            return False
        try:
            ep = self._cached_sp_ep
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
        if not mic or not self._cached_mic_ep:
            return False
        try:
            ep = self._cached_mic_ep
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
            # Invalidate cached endpoints
            self._cached_sp = None
            self._cached_sp_ep = None
            self._cached_sp_meter = None
            self._cached_mic = None
            self._cached_mic_ep = None
            self._cached_mic_meter = None
            self._refresh_devices_cache(force=True)
            return True
        except Exception as e:
            print(f"[AudioController] Error setting default device {device_id}: {e}")
            return False
