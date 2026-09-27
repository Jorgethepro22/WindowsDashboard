"""
Voice and Natural Language Command Assistant Service for WindowsDashboard.
Uses faster-whisper for speech-to-text, edge-tts for Spanish neural text-to-speech,
and Fuzzy Matching for natural language action execution and information queries.
"""
import os
import re
import sys
import time
import glob
import math
import ast
import random
import asyncio
import base64
import threading
import difflib
import webbrowser
import ctypes
from datetime import datetime
import numpy as np

try:
    import sounddevice as sd
    _SD_AVAILABLE = True
except Exception:
    _SD_AVAILABLE = False

try:
    from faster_whisper import WhisperModel
    _WHISPER_AVAILABLE = True
except Exception:
    _WHISPER_AVAILABLE = False

try:
    import edge_tts
    _EDGE_TTS_AVAILABLE = True
except Exception:
    _EDGE_TTS_AVAILABLE = False

from core.llm_service import LlmService


class AssistantService:
    def __init__(self, audio_ctrl=None, media_session=None, cleaner_svc=None, weather_svc=None, config_mgr=None, system_stats=None, llm_svc=None):
        self._audio_ctrl = audio_ctrl
        self._media_session = media_session
        self._cleaner_svc = cleaner_svc
        self._weather_svc = weather_svc
        self._config_mgr = config_mgr
        self._system_stats = system_stats
        self._llm_svc = llm_svc or LlmService(self._config_mgr)
        self._settings_cache = {
            "mode": "fast",
            "voice_enabled": True,
            "voice": "es-ES-AlvaroNeural",
            "volume": 100
        }
        
        self._whisper_model = None
        self._model_loading = False
        self._model_loaded = False
        
        # Audio recording state
        self._recording = False
        self._audio_chunks = []
        self._record_stream = None
        self._sample_rate = 16000
        
        # Silence & auto-stop state
        self._speech_detected = False
        self._silence_start_time = None
        self._auto_stop_triggered = False
        self._speech_threshold = 0.012   # RMS energy threshold for speech
        self._silence_threshold = 0.008  # RMS energy threshold for silence
        self._silence_duration = 1.25    # seconds of silence after speech to trigger auto-stop
        
        # App catalog for fuzzy matching
        self._apps_cache = {}
        self._apps_loaded = False
        
        # Scan installed apps immediately so fuzzy matching is instantly available
        self._scan_installed_apps()
        
        # Pre-warm model in background thread
        threading.Thread(target=self._init_model, daemon=True).start()

    def _init_model(self):
        """Loads faster-whisper base model in background."""
        if not _WHISPER_AVAILABLE:
            print("[AssistantService] faster-whisper not available.")
            return
        try:
            self._model_loading = True
            print("[AssistantService] Loading faster-whisper model (small INT8)...")
            try:
                self._whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
            except Exception as e_small:
                print(f"[AssistantService] Could not load 'small', falling back to 'base': {e_small}")
                self._whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
            self._model_loaded = True
            self._model_loading = False
            print("[AssistantService] faster-whisper model ready.")
        except Exception as e:
            print(f"[AssistantService] Error loading Whisper model: {e}")
            self._model_loading = False

    def _scan_installed_apps(self):
        """Scans shortcuts from Desktop, Start Menu and common system tools."""
        apps = {
            "calculadora": "calc.exe",
            "bloc de notas": "notepad.exe",
            "notas": "notepad.exe",
            "administrador de tareas": "taskmgr.exe",
            "explorador de archivos": "explorer.exe",
            "explorador": "explorer.exe",
            "configuracion": "ms-settings:",
            "ajustes": "ms-settings:",
            "paint": "mspaint.exe",
            "consola": "cmd.exe",
            "terminal": "wt.exe",
            "control panel": "control.exe",
            "panel de control": "control.exe",
            "spotify": "spotify.exe",
            "roblox": "roblox-player:"
        }

        try:
            import win32com.client
            shell = win32com.client.Dispatch("WScript.Shell")
        except Exception:
            shell = None

        user_home = os.path.expanduser("~")
        # Desktop shortcuts scanned first so active desktop apps take precedence
        search_dirs = [
            os.path.join(user_home, "Desktop"),
            r"C:\Users\Public\Desktop",
            os.path.join(os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs"),
            r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs"
        ]

        for s_dir in search_dirs:
            if not os.path.exists(s_dir):
                continue
            for root, dirs, files in os.walk(s_dir):
                for f in files:
                    if f.lower().endswith((".lnk", ".url")):
                        name_without_ext = os.path.splitext(f)[0].lower()
                        clean_name = re.sub(r"\s*\(.*?\)", "", name_without_ext).strip()
                        full_path = os.path.join(root, f)

                        # If .lnk, verify that its target executable exists (skip dead shortcuts from uninstalled/updated apps)
                        if f.lower().endswith(".lnk") and shell:
                            try:
                                sc = shell.CreateShortCut(full_path)
                                target = sc.TargetPath
                                if target and not os.path.exists(target):
                                    continue
                            except Exception:
                                pass

                        if clean_name and clean_name not in apps:
                            apps[clean_name] = full_path

                        # Common launcher/game aliases
                        for suffix in [" player", " launcher", " desktop", " app"]:
                            if clean_name.endswith(suffix):
                                base_name = clean_name[:-len(suffix)].strip()
                                if base_name and base_name not in apps:
                                    apps[base_name] = full_path

        self._apps_cache = apps
        self._apps_loaded = True
        print(f"[AssistantService] Scanned {len(apps)} valid applications/shortcuts for quick launch.")

    # =========================================================================
    # SETTINGS & CONFIGURATION
    @property
    def llm_service(self):
        return self._llm_svc

    # =========================================================================
    def get_settings(self) -> dict:
        """Returns assistant configuration from config manager."""
        cfg = dict(self._settings_cache)
        if self._config_mgr:
            disk_cfg = self._config_mgr.get("assistant", {}) or {}
            cfg.update(disk_cfg)
        return {
            "mode": cfg.get("mode", "fast"),  # "fast" or "smart"
            "voice_enabled": cfg.get("voice_enabled", True),
            "voice": cfg.get("voice", "es-ES-AlvaroNeural"),
            "volume": int(cfg.get("volume", 100))
        }

    def save_settings(self, settings: dict) -> dict:
        """Saves assistant mode, voice and volume configuration."""
        if not settings:
            return self.get_settings()
        cur = self.get_settings()
        if "mode" in settings and str(settings["mode"]) in ["fast", "smart"]:
            cur["mode"] = str(settings["mode"])
        if "voice_enabled" in settings:
            cur["voice_enabled"] = bool(settings["voice_enabled"])
        if "voice" in settings and str(settings["voice"]) in ["es-ES-AlvaroNeural", "es-ES-ElviraNeural"]:
            cur["voice"] = str(settings["voice"])
        if "volume" in settings:
            try:
                cur["volume"] = max(0, min(100, int(settings["volume"])))
            except Exception:
                pass
        self._settings_cache.update(cur)
        if self._config_mgr:
            self._config_mgr.set("assistant", cur)
        return cur

    # =========================================================================
    # SPEECH SYNTHESIS (EDGE-TTS)
    # =========================================================================
    def synthesize_speech(self, text: str, voice: str = None) -> str:
        """Synthesizes text to speech using edge-tts and returns base64-encoded MP3 data."""
        if not _EDGE_TTS_AVAILABLE or not text or not text.strip():
            return ""

        # Strip emojis and markdown formatting for clean natural speech
        clean_text = re.sub(r"[^\w\sÁÉÍÓÚáéíóúñÑüÜ,.:;¿?¡!%\-]", "", text)
        clean_text = re.sub(r"\s+", " ", clean_text).strip()
        if not clean_text:
            return ""

        chosen_voice = voice or self.get_settings().get("voice", "es-ES-AlvaroNeural")

        async def _run_tts():
            communicate = edge_tts.Communicate(clean_text, chosen_voice)
            audio_bytes = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_bytes += chunk["data"]
            return audio_bytes

        try:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    import concurrent.futures
                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                        audio_data = pool.submit(asyncio.run, _run_tts()).result(timeout=10)
                else:
                    audio_data = loop.run_until_complete(_run_tts())
            except RuntimeError:
                audio_data = asyncio.run(_run_tts())

            if audio_data:
                return base64.b64encode(audio_data).decode("ascii")
        except Exception as e:
            print(f"[AssistantService] Error synthesizing speech: {e}")
        return ""

    def test_voice(self, voice: str = None, volume: int = 100) -> dict:
        """Generates a test voice sample."""
        sample_text = "Hola, esta es una prueba de la voz del asistente de Windows Dashboard."
        b64 = self.synthesize_speech(sample_text, voice)
        return {
            "success": bool(b64),
            "audio_b64": b64
        }

    # =========================================================================
    # AUDIO RECORDING & WHISPER TRANSCRIPTION
    # =========================================================================
    def start_recording(self) -> dict:
        """Starts capturing microphone audio with real-time speech and silence detection."""
        if not _SD_AVAILABLE:
            return {"success": False, "error": "sounddevice no está disponible."}
        if self._recording:
            return {"success": True, "status": "already_recording"}

        try:
            self._audio_chunks = []
            self._recording = True
            self._speech_detected = False
            self._silence_start_time = None
            self._auto_stop_triggered = False

            def audio_callback(indata, frames, time_info, status):
                if self._recording:
                    self._audio_chunks.append(indata.copy())
                    try:
                        # Compute root-mean-square (RMS) energy to detect speech and silence
                        rms = float(np.sqrt(np.mean(indata**2)))
                        now = time.time()
                        if rms >= self._speech_threshold:
                            self._speech_detected = True
                            self._silence_start_time = None
                        elif self._speech_detected and rms < self._silence_threshold:
                            if self._silence_start_time is None:
                                self._silence_start_time = now
                            elif (now - self._silence_start_time) >= self._silence_duration:
                                self._auto_stop_triggered = True
                    except Exception:
                        pass

            self._record_stream = sd.InputStream(
                samplerate=self._sample_rate,
                channels=1,
                dtype="float32",
                callback=audio_callback
            )
            self._record_stream.start()
            return {"success": True, "status": "recording"}
        except Exception as e:
            self._recording = False
            print(f"[AssistantService] Error starting audio recording: {e}")
            return {"success": False, "error": str(e)}

    def check_recording_status(self) -> dict:
        """Returns current recording state, whether speech was detected, and if silence auto-stop triggered."""
        return {
            "recording": self._recording,
            "speech_detected": self._speech_detected,
            "auto_stop": self._auto_stop_triggered
        }

    def _copy_to_clipboard(self, text: str) -> bool:
        """Copies given text string to the Windows Clipboard."""
        try:
            import win32clipboard
            win32clipboard.OpenClipboard()
            win32clipboard.EmptyClipboard()
            win32clipboard.SetClipboardText(text, win32clipboard.CF_UNICODETEXT)
            win32clipboard.CloseClipboard()
            return True
        except Exception as e:
            print(f"[AssistantService] Error copying to clipboard: {e}")
            return False

    def stop_recording_and_transcribe(self) -> dict:
        """Stops microphone recording and runs faster-whisper speech-to-text."""
        if not self._recording:
            return {"success": False, "error": "No se estaba grabando."}

        try:
            self._recording = False
            self._auto_stop_triggered = False
            if self._record_stream:
                self._record_stream.stop()
                self._record_stream.close()
                self._record_stream = None

            if not self._audio_chunks:
                return {"success": False, "text": "", "error": "No se capturó audio."}

            audio_data = np.concatenate(self._audio_chunks, axis=0).flatten()

            if len(audio_data) < self._sample_rate * 0.3:
                return {"success": False, "text": "", "error": "Grabación demasiado corta."}

            if not self._whisper_model:
                if self._model_loading:
                    return {"success": False, "text": "", "error": "El modelo Whisper se está descargando/cargando..."}
                return {"success": False, "text": "", "error": "Modelo Whisper no disponible."}

            t0 = time.time()
            segments, info = self._whisper_model.transcribe(
                audio_data,
                language="es",
                beam_size=3,
                vad_filter=True,
                vad_parameters=dict(
                    min_silence_duration_ms=400,
                    speech_pad_ms=200
                ),
                initial_prompt="Comandos de voz del asistente de Windows en español.",
                condition_on_previous_text=False
            )
            transcribed_text = " ".join([s.text for s in segments]).strip()
            elapsed = time.time() - t0
            print(f"[AssistantService] Transcribed in {elapsed:.2f}s: '{transcribed_text}'")

            if not transcribed_text:
                return {
                    "success": False,
                    "text": "",
                    "error": "No se detectó voz clara. Intenta hablar más cerca del micrófono."
                }

            return {
                "success": True,
                "text": transcribed_text,
                "duration": round(elapsed, 2)
            }
        except Exception as e:
            print(f"[AssistantService] Error transcribing audio: {e}")
            return {"success": False, "text": "", "error": str(e)}

    # =========================================================================
    # INFORMATION HELPERS (TIME, DATE, WEATHER, SYSTEM)
    # =========================================================================
    def _get_time_info(self) -> tuple[str, str]:
        """Returns formatted time string and natural spoken Spanish phrase."""
        now = datetime.now()
        h = now.hour
        m = now.minute
        period = "de la mañana" if 6 <= h < 12 else ("de la tarde" if 12 <= h < 20 else "de la noche" if 20 <= h or h < 6 else "de la madrugada")
        
        h12 = h % 12
        if h12 == 0:
            h12 = 12

        hour_words = {
            1: "la una", 2: "las dos", 3: "las tres", 4: "las cuatro", 5: "las cinco",
            6: "las seis", 7: "las siete", 8: "las ocho", 9: "las nueve", 10: "las diez",
            11: "las once", 12: "las doce"
        }
        hour_str = hour_words.get(h12, f"las {h12}")
        verb = "Es" if h12 == 1 else "Son"

        if m == 0:
            spoken = f"{verb} {hour_str} en punto {period}."
        elif m == 15:
            spoken = f"{verb} {hour_str} y cuarto {period}."
        elif m == 30:
            spoken = f"{verb} {hour_str} y media {period}."
        elif m == 45:
            next_h = (h12 % 12) + 1
            next_verb = "Es" if next_h == 1 else "Son"
            next_hour_str = hour_words.get(next_h, f"las {next_h}")
            spoken = f"{next_verb} {next_hour_str} menos cuarto {period}."
        else:
            spoken = f"{verb} {hour_str} y {m} {period}."

        display = f"🕒 {now.strftime('%H:%M')} — {spoken}"
        return display, spoken

    def _get_date_info(self) -> tuple[str, str]:
        """Returns formatted date string and natural spoken Spanish phrase."""
        days = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
        months = [
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
        ]
        now = datetime.now()
        day_name = days[now.weekday()]
        month_name = months[now.month - 1]
        spoken = f"Hoy es {day_name} {now.day} de {month_name} de {now.year}."
        display = f"📅 {spoken}"
        return display, spoken

    def _get_weather_info(self) -> tuple[str, str]:
        """Queries weather service and returns display and spoken weather phrase."""
        if not self._weather_svc:
            return "El servicio meteorológico no está disponible.", "El servicio meteorológico no está disponible."
        w = self._weather_svc.get_weather()
        if not w or w.get("temp") == "--":
            return "Cargando información meteorológica...", "La información meteorológica aún se está cargando."
        
        city = w.get("city", "tu ubicación")
        temp = w.get("temp")
        desc = w.get("description", "despejado")
        display = f"🌤 En {city}: {temp}°C, {desc}"
        spoken = f"En {city} la temperatura actual es de {temp} grados con {desc.lower()}."
        return display, spoken

    def _get_system_info(self) -> tuple[str, str]:
        """Returns CPU, RAM and GPU telemetry."""
        if not self._system_stats:
            return "Métricas del sistema no disponibles.", "No pude consultar las métricas del sistema."
        stats = self._system_stats.get_stats()
        cpu = round(stats.get("cpu", {}).get("percent", 0))
        ram = round(stats.get("ram", {}).get("percent", 0))
        gpu = round(stats.get("gpu", {}).get("usage_percent", 0))
        display = f"💻 CPU: {cpu}% | RAM: {ram}% | GPU: {gpu}%"
        spoken = f"El uso de CPU está al {cpu} por ciento y la memoria RAM al {ram} por ciento."
        return display, spoken

    def _get_battery_info(self) -> tuple[str, str]:
        """Returns battery status and percentage."""
        if not self._system_stats:
            return "Información de batería no disponible.", "No se detectó información de batería."
        stats = self._system_stats.get_stats()
        bat = stats.get("battery")
        if not bat or bat.get("percent") is None:
            return "⚡ Conectado a la corriente directa (sin batería).", "El equipo está conectado a la corriente directa y no usa batería."
        pct = round(bat.get("percent", 100))
        plugged = bat.get("power_plugged", True)
        state_str = "conectada a la corriente" if plugged else "en uso con batería"
        display = f"🔋 Batería: {pct}% ({state_str})"
        spoken = f"La batería está al {pct} por ciento y {state_str}."
        return display, spoken

    @staticmethod
    def _normalize_text(s: str) -> str:
        if not s:
            return ""
        s = s.strip().lower()
        # Keep commas and semicolons as clause/list delimiters, remove other punctuation
        s = re.sub(r"[¿?¡!:\"'#_~`]", "", s)
        s = re.sub(r"\.+$", "", s)
        s = re.sub(r"\.(?=\s|$)", "", s)
        s = re.sub(r"\s*,\s*", ", ", s)
        s = re.sub(r"\s*;\s*", "; ", s)
        trans = str.maketrans("áéíóúÁÉÍÓÚ", "aeiouaeiou")
        return s.translate(trans)

    @staticmethod
    def _evaluate_math(phrase: str) -> dict:
        """Parses and safely evaluates mathematical operations in natural language."""
        if not phrase:
            return None
        p = phrase.lower().strip()
        p = re.sub(r"^(?:dime\s+)?(?:cuanto\s+es|cuanto\s+da|calcula|calcular|resuelve|resolver)\s+", "", p).strip()
        p = re.sub(r"[¿?¡!]", "", p).strip()

        # Percentage: "20 por ciento de 150" or "20% de 150"
        pct_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:%|por\s+ciento)\s+de\s+(\d+(?:\.\d+)?)", p)
        if pct_match:
            pct = float(pct_match.group(1))
            val = float(pct_match.group(2))
            res = (pct * val) / 100.0
            res_str = f"{int(res)}" if res.is_integer() else f"{res:.2f}"
            pct_str = f"{int(pct)}" if pct.is_integer() else f"{pct}"
            val_str = f"{int(val)}" if val.is_integer() else f"{val}"
            return {
                "display": f"🔢 {pct_str}% de {val_str} = {res_str}",
                "spoken": f"El {pct_str} por ciento de {val_str} es {res_str}."
            }

        # Square root: "raiz cuadrada de 64" or "raiz de 64"
        sqrt_match = re.search(r"raiz\s+(?:cuadrada\s+)?(?:de\s+)?(\d+(?:\.\d+)?)", p)
        if sqrt_match:
            val = float(sqrt_match.group(1))
            if val >= 0:
                res = math.sqrt(val)
                res_str = f"{int(res)}" if res.is_integer() else f"{res:.2f}"
                val_str = f"{int(val)}" if val.is_integer() else f"{val}"
                return {
                    "display": f"🔢 √{val_str} = {res_str}",
                    "spoken": f"La raíz cuadrada de {val_str} es {res_str}."
                }

        # Word substitutions
        calc_str = p
        calc_str = re.sub(r"\bmedio\s+mill[oó]n\b", "500000", calc_str)
        calc_str = re.sub(r"\bmillones\b", "* 1000000", calc_str)
        calc_str = re.sub(r"\bmill[oó]n\b", "* 1000000", calc_str)
        calc_str = re.sub(r"\bmil\b", "* 1000", calc_str)
        calc_str = re.sub(r"\bmultiplicado\s+por\b", "*", calc_str)
        calc_str = re.sub(r"\bdividido\s+(?:por|entre)\b", "/", calc_str)
        calc_str = re.sub(r"\belevado\s+a\b", "**", calc_str)
        calc_str = re.sub(r"\bpor\b", "*", calc_str)
        calc_str = re.sub(r"\bx\b", "*", calc_str)
        calc_str = re.sub(r"\bentre\b", "/", calc_str)
        calc_str = re.sub(r"\bm[aá]s\b", "+", calc_str)
        calc_str = re.sub(r"\bmenos\b", "-", calc_str)

        if not re.search(r"\d", calc_str):
            return None

        cleaned_expr = re.sub(r"[^\d\.\+\-\*\/\(\)\s]", "", calc_str).strip()
        cleaned_expr = re.sub(r"\s+", " ", cleaned_expr)
        if not cleaned_expr or not any(op in cleaned_expr for op in ["+", "-", "*", "/"]):
            return None

        try:
            node = ast.parse(cleaned_expr, mode='eval')
            def eval_node(n):
                if isinstance(n, ast.Expression):
                    return eval_node(n.body)
                elif isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
                    return n.value
                elif isinstance(n, ast.BinOp):
                    left = eval_node(n.left)
                    right = eval_node(n.right)
                    if isinstance(n.op, ast.Add): return left + right
                    if isinstance(n.op, ast.Sub): return left - right
                    if isinstance(n.op, ast.Mult): return left * right
                    if isinstance(n.op, ast.Div): return left / right if right != 0 else float('nan')
                    if isinstance(n.op, ast.Pow): return left ** right if abs(right) <= 100 else float('nan')
                elif isinstance(n, ast.UnaryOp):
                    operand = eval_node(n.operand)
                    if isinstance(n.op, ast.UAdd): return +operand
                    if isinstance(n.op, ast.USub): return -operand
                raise ValueError("Unsupported operation")

            ans = eval_node(node)
            if math.isnan(ans) or math.isinf(ans):
                return {
                    "display": "⚠️ Error: división por cero",
                    "spoken": "No es posible dividir entre cero."
                }
            if isinstance(ans, float) and ans.is_integer():
                ans = int(ans)
            if isinstance(ans, int):
                if abs(ans) >= 10000:
                    ans_str = f"{ans:,}".replace(",", ".")
                else:
                    ans_str = str(ans)
            else:
                ans_str = f"{ans:.4f}".rstrip("0").rstrip(".")

            pretty_expr = cleaned_expr.replace("* 1000000", "× 1M").replace("* 1000", "× 1K").replace("*", " × ").replace("/", " ÷ ")
            return {
                "display": f"🔢 {pretty_expr} = {ans_str}",
                "spoken": f"El resultado es {ans_str}."
            }
        except Exception:
            return None

    def _match_fast_conversational_intents(self, text: str, raw_text: str):
        """Rule-based conversational intents for Fast Mode."""
        # 0. MATH CALCULATION (instant AST evaluation)
        math_res = self._evaluate_math(text)
        if math_res:
            return {"success": True, "intent": "CALCULATION", "reply": math_res["display"], "voice_text": math_res["spoken"]}

        # 1. GREETINGS & SOCIAL CONVERSATION
        if any(w in text for w in ["hola", "buenas", "buenos dias", "buenas tardes", "buenas noches", "hey", "saludos"]) or text in ["que tal", "como estas", "que pasa", "como te va"]:
            greetings = [
                "¡Hola! ¿En qué puedo ayudarte?",
                "¡Hola! Todo listo en tu panel. Dime qué necesitas.",
                "¡Muy buenas! ¿Qué puedo hacer por ti hoy?"
            ]
            spoken = random.choice(greetings)
            return {"success": True, "intent": "GREETING", "reply": f"👋 {spoken}", "voice_text": spoken}

        # 2. FAREWELLS
        if any(w in text for w in ["adios", "hasta luego", "nos vemos", "chao", "hasta pronto"]):
            return {"success": True, "intent": "FAREWELL", "reply": "👋 ¡Hasta luego! Aquí estaré cuando me necesites.", "voice_text": "Hasta luego. Aquí estaré cuando me necesites."}

        # 3. GRATITUDE
        if any(w in text for w in ["gracias", "muchas gracias", "te lo agradezco", "mil gracias"]):
            return {"success": True, "intent": "GRATITUDE", "reply": "😊 ¡De nada! Es un placer ayudarte.", "voice_text": "De nada, es un placer ayudarte."}

        # 4. IDENTITY
        if any(w in text for w in ["quien eres", "como te llamas", "que eres", "tu nombre"]):
            spoken = "Soy tu asistente de Windows Dashboard. Puedo abrir o cerrar aplicaciones, controlar el volumen y música, decirte la hora, la fecha, el clima, resolver cálculos matemáticos o limpiar el sistema."
            return {"success": True, "intent": "IDENTITY", "reply": f"🤖 {spoken}", "voice_text": spoken}

        # 5. HELP & CAPABILITIES
        if any(w in text for w in ["que puedes hacer", "que sabes hacer", "ayuda", "comandos", "que funciones tienes"]):
            spoken = "Puedo abrir o cerrar programas como Spotify, silenciar el micro, regular volumen, decirte la hora o el tiempo, calcular matemáticas como 40 por 82, o limpiar la RAM y el disco."
            return {"success": True, "intent": "HELP", "reply": f"💡 {spoken}", "voice_text": spoken}

        # 6. JOKES
        if any(w in text for w in ["chiste", "cuentame un chiste", "dime un chiste", "hazme reir"]):
            jokes = [
                "¿Por qué los programadores confunden Halloween con Navidad? Porque OCT 31 es igual a DEC 25.",
                "¿Qué le dice un bit a otro? Nos vemos en el bus.",
                "Hay 10 tipos de personas en el mundo: las que entienden binario y las que no.",
                "¿Qué hace una computadora cuando tiene frío? Se pone un Windows."
            ]
            joke = random.choice(jokes)
            return {"success": True, "intent": "JOKE", "reply": f"😄 {joke}", "voice_text": joke}

        # 7. COIN FLIP
        if any(w in text for w in ["cara o cruz", "tira una moneda", "lanza una moneda", "moneda"]):
            coin = random.choice(["cara", "cruz"])
            return {"success": True, "intent": "COIN_FLIP", "reply": f"🪙 ¡Ha salido {coin}!", "voice_text": f"Ha salido {coin}."}

        # 8. DICE ROLL
        if any(w in text for w in ["tira un dado", "lanza un dado", "tirar dado", "dado"]):
            d = random.randint(1, 6)
            return {"success": True, "intent": "DICE_ROLL", "reply": f"🎲 ¡Ha salido un {d}!", "voice_text": f"Ha salido un {d}."}

        # 9. RANDOM NUMBER
        if any(w in text for w in ["numero aleatorio", "numero al azar"]):
            num = random.randint(1, 100)
            return {"success": True, "intent": "RANDOM_NUM", "reply": f"🎲 Número aleatorio: {num}", "voice_text": f"Tu número aleatorio es el {num}."}

        return None

    def _parse_timer_duration(self, text: str) -> tuple[int, str]:
        """Parses duration in natural Spanish into total seconds and human string."""
        text = text.lower()
        hours = 0
        mins = 0
        secs = 0

        h_match = re.search(r"(\d+)\s*(?:hora|horas|h)\b", text)
        if h_match:
            hours = int(h_match.group(1))

        m_match = re.search(r"(\d+)\s*(?:minuto|minutos|min|mins|m)\b", text)
        if m_match:
            mins = int(m_match.group(1))

        s_match = re.search(r"(\d+)\s*(?:segundo|segundos|seg|segs|s)\b", text)
        if s_match:
            secs = int(s_match.group(1))

        if "media hora" in text or "media horita" in text:
            mins += 30
        if "un minuto" in text and mins == 0 and hours == 0 and secs == 0:
            mins = 1
        if "una hora" in text and hours == 0:
            hours = 1

        total = hours * 3600 + mins * 60 + secs
        spoken_parts = []
        if hours > 0:
            spoken_parts.append(f"{hours} hora{'s' if hours > 1 else ''}")
        if mins > 0:
            spoken_parts.append(f"{mins} minuto{'s' if mins > 1 else ''}")
        if secs > 0:
            spoken_parts.append(f"{secs} segundo{'s' if secs > 1 else ''}")

        spoken = " y ".join(spoken_parts) if spoken_parts else "5 minutos"
        return total if total > 0 else 300, spoken

    def _read_notes_summary(self) -> tuple[str, str]:
        """Returns summary of existing notes and pending tasks."""
        notes = self._config_mgr.get("notes", []) if self._config_mgr else []
        if not notes:
            return "📝 No tienes ninguna nota guardada.", "No tienes ninguna nota ni tarea guardada en tu panel."

        tasks_pending = []
        regular_notes = []
        for n in notes:
            if n.get("mode") == "tasks":
                for t in n.get("tasks", []):
                    if not t.get("done", False):
                        tasks_pending.append(t.get("text", ""))
            else:
                title = n.get("title") or "Sin título"
                body = (n.get("body") or "").strip()
                regular_notes.append(f"{title}: {body[:25]}" if body else title)

        parts = []
        if tasks_pending:
            parts.append(f"Tienes {len(tasks_pending)} tarea(s) pendiente(s): {', '.join(tasks_pending[:3])}{'...' if len(tasks_pending) > 3 else ''}.")
        if regular_notes:
            parts.append(f"Y {len(regular_notes)} nota(s): {', '.join(regular_notes[:2])}.")
        if not parts:
            return "📝 Todas tus tareas están al día.", "No tienes tareas pendientes, ¡todo al día!"
        summary = " ".join(parts)
        return f"📝 {summary}", summary

    def _add_note(self, content: str) -> dict:
        """Adds a new text note and saves it."""
        notes = self._config_mgr.get("notes", []) if self._config_mgr else []
        content = content.strip()
        if not content:
            return {"success": False, "reply": "No especificaste qué texto guardar en la nota."}
        title = content[:22] + "..." if len(content) > 22 else content
        new_note = {
            "id": f"note_{int(time.time()*1000)}",
            "title": title.capitalize(),
            "mode": "text",
            "body": content,
            "tasks": []
        }
        notes.insert(0, new_note)
        if self._config_mgr:
            self._config_mgr.set("notes", notes)
        return {
            "success": True,
            "intent": "NOTES_UPDATE",
            "notes": notes,
            "reply": f"📝 Nota guardada: '{title}'",
            "voice_text": f"Nota guardada: {title}."
        }

    def _add_task(self, task_text: str) -> dict:
        """Adds a new task to the active tasks list."""
        notes = self._config_mgr.get("notes", []) if self._config_mgr else []
        task_text = task_text.strip()
        if not task_text:
            return {"success": False, "reply": "No especificaste qué tarea agregar."}

        tasks_note = None
        for n in notes:
            if n.get("mode") == "tasks":
                tasks_note = n
                break
        if not tasks_note:
            tasks_note = {
                "id": f"note_{int(time.time()*1000)}",
                "title": "Mis Tareas",
                "mode": "tasks",
                "body": "",
                "tasks": []
            }
            notes.insert(0, tasks_note)

        task_id = int(time.time() * 1000)
        tasks_note.setdefault("tasks", []).append({
            "id": task_id,
            "text": task_text.capitalize(),
            "done": False
        })
        if self._config_mgr:
            self._config_mgr.set("notes", notes)
        return {
            "success": True,
            "intent": "NOTES_UPDATE",
            "notes": notes,
            "reply": f"✅ Tarea añadida: '{task_text}'",
            "voice_text": f"Tarea añadida: {task_text}."
        }

    def _complete_task(self, query: str) -> dict:
        """Finds task matching query and marks it as completed."""
        notes = self._config_mgr.get("notes", []) if self._config_mgr else []
        query_l = query.strip().lower()
        if not query_l:
            return {"success": False, "reply": "No especificaste qué tarea completar."}

        target_task = None
        for n in notes:
            for t in n.get("tasks", []):
                t_text = t.get("text", "").lower()
                if query_l in t_text or t_text in query_l:
                    t["done"] = True
                    target_task = t
                    break
            if target_task:
                break

        if target_task:
            if self._config_mgr:
                self._config_mgr.set("notes", notes)
            return {
                "success": True,
                "intent": "NOTES_UPDATE",
                "notes": notes,
                "reply": f"✓ Tarea completada: '{target_task.get('text')}'",
                "voice_text": f"Tarea {target_task.get('text')} marcada como completada."
            }
        else:
            return {
                "success": False,
                "intent": "NOTES_UPDATE",
                "reply": f"No encontré ninguna tarea que coincida con '{query}'.",
                "voice_text": f"No encontré la tarea {query}."
            }

    def _handle_translation(self, text: str) -> dict | None:
        """Detects translation requests, translates with LLM, and copies result to Windows clipboard."""
        text_l = text.lower()
        target_lang = None
        phrase = None

        m1 = re.search(r"traduce\s+al\s+([a-záéíóúñ]+)[:\s]+(.+)", text_l)
        if m1:
            target_lang = m1.group(1).strip()
            phrase = m1.group(2).strip()
        else:
            m2 = re.search(r"traduce\s+(.+?)\s+al\s+([a-záéíóúñ]+)", text_l)
            if m2:
                phrase = m2.group(1).strip()
                target_lang = m2.group(2).strip()
            else:
                m3 = re.search(r"c[oó]mo\s+se\s+dice\s+(.+?)\s+en\s+([a-záéíóúñ]+)", text_l)
                if m3:
                    phrase = m3.group(1).strip()
                    target_lang = m3.group(2).strip()

        if not target_lang or not phrase:
            return None

        # Clean "y copialo / guardalo"
        phrase = re.sub(r"\s+y\s+(?:c[oó]pialo|gu[aá]rdalo|p[eé]galo).*$", "", phrase).strip()

        lang_names = {
            "ingles": "inglés", "english": "inglés",
            "frances": "francés", "french": "francés",
            "aleman": "alemán", "german": "alemán",
            "italiano": "italiano", "italian": "italiano",
            "portugues": "portugués", "portuguese": "portugués",
            "japones": "japonés", "ruso": "ruso", "chino": "chino"
        }
        dest_lang = lang_names.get(target_lang, target_lang)

        translation = ""
        if self._llm_svc and self._llm_svc.is_model_downloaded():
            prompt = f"Traduce al {dest_lang} la siguiente frase. Responde únicamente con la traducción directa sin comillas:\n{phrase}"
            translation = self._llm_svc.generate_response(prompt).strip().strip('"').strip("'")

        if not translation or "Cargando" in translation or "Error" in translation:
            translation = phrase

        self._copy_to_clipboard(translation)

        return {
            "success": True,
            "intent": "TRANSLATE_CLIPBOARD",
            "clipboard_text": translation,
            "reply": f"📋 {dest_lang.title()}: \"{translation}\" (Copiado)",
            "voice_text": f"Traducido al {dest_lang} y copiado al portapapeles: {translation}."
        }

    # =========================================================================
    # NATURAL LANGUAGE INTENT PARSING & FUZZY MATCHING
    # =========================================================================
    def _split_compound_commands(self, text: str) -> list[str]:
        """Splits compound or chained voice commands into individual actions."""
        if not text or not text.strip():
            return []

        # Exclusions: do not split mathematical expressions
        if self._evaluate_math(text) is not None:
            return [text]

        # Exclusions: do not split web searches or video searches
        if re.search(r"^(?:busca|buscar|encuentra)\b", text) or re.search(r"\ben\s+(?:google|youtube|wikipedia|internet)\b", text):
            return [text]

        # Exclusions: do not split translation commands
        if re.search(r"^(?:traduce|c[oó]mo\s+se\s+dice)\b", text):
            return [text]

        # Exclusions: do not split note or task creation
        if re.search(r"^(?:guarda|crea|a[ñn]ade|apunta)\s+(?:una\s+)?(?:nota|tarea)\s+(?:que\s+diga|con|de)\b", text):
            return [text]

        # Exclusions: do not split direct YouTube playback
        if re.search(r"^(?:reproduce|ponte)\b", text) and "en youtube" in text:
            return [text]

        # 1. Split by explicit sequencers (luego, después, también, ;)
        seq_parts = re.split(r"\s+(?:luego|despu[eé]s|tambi[eé]n)\s+|;\s*", text)
        if len(seq_parts) > 1:
            result_cmds = []
            for sp in seq_parts:
                sp = sp.strip()
                if sp:
                    result_cmds.extend(self._split_compound_commands(sp))
            if result_cmds:
                return result_cmds

        # 2. Split by ' y ' or ' e ' between independent commands
        cmd_verb_pattern = re.compile(
            r"^(?:abre|abrir|ábreme|abreme|cierra|cerrar|quita|quitar|inicia|iniciar|pon|ponme|arranca|arrancar|"
            r"ejecuta|ejecutar|lanza|lanzar|limpia|limpiar|optimiza|optimizar|libera|liberar|silencia|silenciar|"
            r"mutea|mutear|desmutea|sube|subir|baja|bajar|pausa|pausar|reanuda|reanudar|deten|detén|detener|"
            r"reinicia|reiniciar|resetea|resetear|bloquea|bloquear|apaga|apagar|cuenta|temporizador|cron[oó]metro|"
            r"alarma|dime|cu[aá]nto|qu[eé])\b",
            re.IGNORECASE
        )

        y_parts = re.split(r"\s+(?:y|e)\s+", text)
        if len(y_parts) > 1:
            if all(cmd_verb_pattern.search(p.strip()) for p in y_parts[1:]):
                result_cmds = []
                for yp in y_parts:
                    yp = yp.strip()
                    if yp:
                        result_cmds.extend(self._split_compound_commands(yp))
                if result_cmds:
                    return result_cmds

        # 3. Verb distribution over multiple apps/targets (e.g. "abre spotify y discord", "cierra chrome y edge")
        dist_verbs = [
            "abre", "abrir", "ábreme", "abreme", "inicia", "iniciar", "arranca", "arrancar",
            "ejecuta", "ejecutar", "lanza", "lanzar", "cierra", "cerrar", "quitar", "quita",
            "apaga", "finaliza"
        ]
        for dv in dist_verbs:
            if text.startswith(dv + " "):
                remainder = text[len(dv):].strip()
                # Split by commas or ' y ' / ' e '
                raw_segments = [x.strip() for x in re.split(r",|\s+(?:y|e)\s+", remainder) if x.strip()]
                items = []
                known_names = sorted(self._apps_cache.keys(), key=len, reverse=True) if self._apps_cache else []

                for seg in raw_segments:
                    clean_seg = re.sub(r"^(el|la|los|las|un|una)\s+", "", seg).strip()
                    if clean_seg in self._apps_cache:
                        items.append(clean_seg)
                        continue

                    # Check if multiple known apps are embedded in this segment (e.g. without commas)
                    embedded = []
                    occupied = [False] * len(clean_seg)
                    for app in known_names:
                        if len(app) < 3 and app not in ["ea", "ai"]:
                            continue
                        pattern = r"\b" + re.escape(app) + r"\b"
                        for m in re.finditer(pattern, clean_seg, re.IGNORECASE):
                            s_idx, e_idx = m.span()
                            if not any(occupied[s_idx:e_idx]):
                                for i in range(s_idx, e_idx):
                                    occupied[i] = True
                                embedded.append((s_idx, e_idx, app))

                    if len(embedded) >= 2:
                        embedded.sort(key=lambda x: x[0])
                        for em in embedded:
                            items.append(em[2])
                    else:
                        items.append(seg)

                if len(items) >= 2:
                    matches = []
                    for it in items:
                        clean_it = re.sub(r"^(el|la|los|las|un|una)\s+", "", it).strip()
                        matched_app, _ = self._fuzzy_find_app(clean_it, require_high_confidence=False)
                        if matched_app:
                            matches.append(clean_it)
                    if len(matches) >= 1:
                        return [f"{dv} {it}" for it in items]

        return [text]

    def _execute_single_command(self, raw_text: str) -> dict:
        """Parses a single natural language command string without voice synthesis."""
        if not raw_text or not raw_text.strip():
            return {"success": False, "reply": "No escuché ningún comando."}

        text = self._normalize_text(raw_text)
        
        # Remove politeness & filler words
        courtesy = [
            r"\bpor favor\b", r"\bporfa\b", r"\boye\b", r"\bme puedes\b", r"\bpuedes\b",
            r"\bquiero que\b", r"\bhaz el favor de\b", r"\bhazme el favor de\b",
            r"\ba ver si puedes\b", r"\bdime\b", r"\bun momento\b", r"\bvamos a\b",
            r"\bpuedes poner\b", r"\bponte\b"
        ]
        for c in courtesy:
            text = re.sub(c, "", text).strip()

        result = None

        # 0. MATH CALCULATION (Instant exact mathematical evaluation)
        math_res = self._evaluate_math(text)
        if math_res:
            result = {"success": True, "intent": "CALCULATION", "reply": math_res["display"], "voice_text": math_res["spoken"]}

        # 0.1 TRANSLATION & CLIPBOARD
        if not result:
            trans_res = self._handle_translation(text)
            if trans_res:
                result = trans_res

        # 1. TIME QUERY
        if any(w in text for w in ["que hora es", "dime la hora", "la hora", "hora es", "horas son", "que hora"]) or text == "hora":
            disp, spoken = self._get_time_info()
            result = {"success": True, "intent": "QUERY_TIME", "reply": disp, "voice_text": spoken}

        # 2. DATE QUERY
        elif any(w in text for w in ["que dia es", "cual es la fecha", "que fecha es", "dia de hoy", "en que dia estamos", "que dia"]) or text in ["fecha", "dia"]:
            disp, spoken = self._get_date_info()
            result = {"success": True, "intent": "QUERY_DATE", "reply": disp, "voice_text": spoken}

        # 3. WEATHER QUERY
        elif any(w in text for w in ["que tiempo hace", "como esta el tiempo", "que clima hace", "como esta el clima", "el clima", "el tiempo", "va a llover", "temperatura"]):
            disp, spoken = self._get_weather_info()
            result = {"success": True, "intent": "QUERY_WEATHER", "reply": disp, "voice_text": spoken}

        # 4. BATTERY QUERY
        elif any(w in text for w in ["cuanta bateria", "nivel de bateria", "como esta la bateria", "estado de la bateria", "bateria", "pila"]):
            disp, spoken = self._get_battery_info()
            result = {"success": True, "intent": "QUERY_BATTERY", "reply": disp, "voice_text": spoken}

        # 5. SYSTEM / PC STATUS
        elif any(w in text for w in ["como esta el pc", "estado del pc", "como esta el ordenador", "rendimiento", "estado del sistema", "como va el pc"]):
            disp, spoken = self._get_system_info()
            result = {"success": True, "intent": "QUERY_SYSTEM", "reply": disp, "voice_text": spoken}

        # 6. MEDIA CONTROLS
        elif any(w in text for w in ["siguiente cancion", "pasa cancion", "salta cancion", "siguiente tema", "pasa de cancion", "cancion siguiente"]) or text in ["siguiente", "pasa", "salta"]:
            if self._media_session:
                self._media_session.next_track()
            result = {"success": True, "intent": "MEDIA_NEXT", "reply": "▶ Siguiente canción", "voice_text": "Siguiente canción."}

        elif any(w in text for w in ["cancion anterior", "vuelve cancion", "tema anterior"]) or text in ["anterior", "vuelve"]:
            if self._media_session:
                self._media_session.previous_track()
            result = {"success": True, "intent": "MEDIA_PREV", "reply": "◀ Canción anterior", "voice_text": "Canción anterior."}

        elif (any(w in text for w in ["para la musica", "para cancion", "play", "reproduce", "reproducir", "reanuda", "despausa"]) or text in ["pausa", "pausar", "play", "stop"]) and not any(k in text for k in ["cronometro", "temporizador", "alarma", "tarea", "nota"]):
            if self._media_session:
                self._media_session.play_pause()
            result = {"success": True, "intent": "MEDIA_PLAY_PAUSE", "reply": "⏯ Play / Pausa", "voice_text": "Música pausada o reanudada."}

        # 7. AUDIO / VOLUME CONTROLS
        elif (any(w in text for w in ["micro", "microfono", "micrófono"]) and any(a in text for a in ["silencia", "mutea", "apaga", "desmutea", "activa", "reactiva", "quitar"])) or text in ["silencia micro", "mutea micro", "microfono", "silenciar microfono", "silencia el microfono"]:
            state_str = "silenciado"
            if self._audio_ctrl:
                try:
                    is_muted = self._audio_ctrl.toggle_input_mute()
                    state_str = "silenciado" if is_muted else "activado"
                except Exception:
                    pass
            result = {"success": True, "intent": "MUTE_MIC", "reply": f"🎙 Micrófono {state_str}", "voice_text": f"Micrófono {state_str}."}

        elif (any(w in text for w in ["audio", "sonido", "altavoz", "altavoces"]) and any(a in text for a in ["silencia", "mutea", "apaga", "desmutea", "quitar", "activa"])) or text in ["silencia", "mutea", "silencio", "mutear", "silencia audio", "silencia el audio", "mutea audio"]:
            state_str = "silenciado"
            if self._audio_ctrl:
                try:
                    is_muted = self._audio_ctrl.toggle_output_mute()
                    state_str = "silenciado" if is_muted else "activado"
                except Exception:
                    pass
            result = {"success": True, "intent": "MUTE_AUDIO", "reply": f"🔊 Audio {state_str}", "voice_text": f"Audio {state_str}."}

        elif re.search(r"volumen\s*(?:al)?\s*(\d+)", text):
            vol_match = re.search(r"volumen\s*(?:al)?\s*(\d+)", text)
            target_vol = max(0, min(100, int(vol_match.group(1))))
            if self._audio_ctrl:
                try:
                    self._audio_ctrl.set_output_volume(target_vol)
                except Exception:
                    pass
            result = {"success": True, "intent": "SET_VOLUME", "reply": f"🔊 Volumen al {target_vol}%", "voice_text": f"Volumen ajustado al {target_vol} por ciento."}

        elif any(w in text for w in ["sube volumen", "subir volumen", "mas volumen", "sube el volumen"]):
            new_v = 60
            if self._audio_ctrl:
                try:
                    info = self._audio_ctrl.get_audio_info()
                    cur = info.get("output_volume", 50)
                    new_v = min(100, cur + 10)
                    self._audio_ctrl.set_output_volume(new_v)
                except Exception:
                    pass
            result = {"success": True, "intent": "VOL_UP", "reply": f"🔊 Volumen al {new_v}%", "voice_text": f"Volumen al {new_v} por ciento."}

        elif any(w in text for w in ["baja volumen", "bajar volumen", "menos volumen", "baja el volumen"]):
            new_v = 40
            if self._audio_ctrl:
                try:
                    info = self._audio_ctrl.get_audio_info()
                    cur = info.get("output_volume", 50)
                    new_v = max(0, cur - 10)
                    self._audio_ctrl.set_output_volume(new_v)
                except Exception:
                    pass
            result = {"success": True, "intent": "VOL_DOWN", "reply": f"🔉 Volumen al {new_v}%", "voice_text": f"Volumen al {new_v} por ciento."}

        # 8. CLEANERS / OPTIMIZERS
        elif (any(r in text for r in ["ram", "memoria"]) and any(a in text for a in ["limpia", "optimiza", "libera", "acelera", "vaciar", "limpiar", "optimizar", "liberar"])) or text in ["clean ram", "optimiza ram", "limpia ram"]:
            freed_str = "1 GB"
            if self._cleaner_svc:
                try:
                    res = self._cleaner_svc.clean_ram()
                    freed_str = res.get("freed_str", "1 GB")
                except Exception:
                    pass
            result = {
                "success": True,
                "intent": "CLEAN_RAM",
                "reply": f"⚡ RAM optimizada: ¡Liberados {freed_str}!",
                "voice_text": f"Memoria RAM optimizada. Se han liberado {freed_str}."
            }

        elif (any(d in text for d in ["disco", "papelera", "temporales", "basura", "archivos temporales"]) and any(a in text for a in ["limpia", "libera", "vacia", "borra", "limpiar", "liberar", "vaciar", "borrar"])) or text in ["clean disk", "limpia disco", "vacia papelera"]:
            freed_str = "archivos temporales"
            if self._cleaner_svc:
                try:
                    res = self._cleaner_svc.clean_disk()
                    freed_str = res.get("freed_str", "archivos temporales")
                except Exception:
                    pass
            result = {
                "success": True,
                "intent": "CLEAN_DISK",
                "reply": f"🧹 Disco limpio: ¡Liberados {freed_str}!",
                "voice_text": f"Disco limpio. Se han eliminado {freed_str}."
            }

        elif any(w in text for w in ["optimiza todo", "limpia todo", "limpieza general", "limpiar todo", "optimizar todo"]):
            msg = []
            if self._cleaner_svc:
                try:
                    r_ram = self._cleaner_svc.clean_ram()
                    r_disk = self._cleaner_svc.clean_disk()
                    msg.append(f"RAM: {r_ram.get('freed_str', '')}")
                    msg.append(f"Disco: {r_disk.get('freed_str', '')}")
                except Exception:
                    pass
            result = {
                "success": True,
                "intent": "CLEAN_ALL",
                "reply": f"🚀 Optimización completa: {', '.join(msg)}",
                "voice_text": "Optimización del sistema completada exitosamente."
            }

        # 8.1 STOPWATCH / CRONOMETRO
        elif any(w in text for w in ["reinicia cronometro", "reiniciar cronometro", "resetea cronometro", "resetear cronometro", "pon a cero el cronometro", "reinicia el cronometro", "resetea el cronometro"]):
            result = {"success": True, "intent": "STOPWATCH_RESET", "reply": "🔄 Cronómetro reiniciado a cero", "voice_text": "Cronómetro reiniciado a cero."}
        elif any(w in text for w in ["pausa cronometro", "pausa el cronometro", "pausar cronometro", "para cronometro", "para el cronometro", "deten cronometro", "detén cronometro"]):
            result = {"success": True, "intent": "STOPWATCH_PAUSE", "reply": "⏸ Cronómetro pausado", "voice_text": "Cronómetro pausado."}
        elif any(w in text for w in ["inicia cronometro", "iniciar cronometro", "activa cronometro", "arranca cronometro", "pon el cronometro", "inicia el cronometro", "activa el cronometro", "arranca el cronometro"]) and not any(r in text for r in ["reinicia", "resetea"]):
            result = {"success": True, "intent": "STOPWATCH_START", "reply": "⏱ Cronómetro iniciado", "voice_text": "Cronómetro iniciado."}

        # 8.2 TIMER / TEMPORIZADOR
        elif any(w in text for w in ["temporizador", "cuenta atras", "alarma en"]):
            if any(w in text for w in ["pausa", "pausar", "para", "deten", "detén"]):
                result = {"success": True, "intent": "TIMER_PAUSE", "reply": "⏸ Temporizador pausado", "voice_text": "Temporizador pausado."}
            elif any(w in text for w in ["reinicia", "reiniciar", "cancela", "cancelar", "apaga", "apagar", "resetea"]):
                result = {"success": True, "intent": "TIMER_RESET", "reply": "🔄 Temporizador reiniciado", "voice_text": "Temporizador reiniciado."}
            else:
                total_secs, spoken_dur = self._parse_timer_duration(text)
                result = {
                    "success": True,
                    "intent": "TIMER_START",
                    "timer_secs": total_secs,
                    "reply": f"⏳ Temporizador de {spoken_dur} iniciado",
                    "voice_text": f"Temporizador de {spoken_dur} iniciado."
                }

        # 8.3 NOTAS Y TAREAS / NOTES & TASKS
        elif any(w in text for w in ["que notas tengo", "leeme las notas", "que tareas tengo", "cuales son mis tareas", "tareas pendientes", "que tareas me faltan", "leeme las tareas"]):
            disp, spoken = self._read_notes_summary()
            result = {"success": True, "intent": "NOTES_READ", "reply": disp, "voice_text": spoken}
        elif re.search(r"(?:a[ñn]ade|agrega|nueva|apunta|crea)\s+(?:una\s+)?tarea\b", text):
            m_task = re.search(r"(?:a[ñn]ade|agrega|nueva|apunta|crea)\s+(?:una\s+)?tarea\s+(?:que\s+diga\s+|de\s+|:\s*)?(.+)", text)
            if m_task:
                result = self._add_task(m_task.group(1))
        elif re.search(r"(?:completa|completar|marca\s+como\s+hecha|he\s+terminado|termina|terminar)\s+(?:la\s+)?tarea\b", text):
            m_done = re.search(r"(?:completa|completar|marca\s+como\s+hecha|he\s+terminado|termina|terminar)\s+(?:la\s+)?tarea\s+(?:de\s+|:\s*)?(.+)", text)
            if m_done:
                result = self._complete_task(m_done.group(1))
        elif re.search(r"(?:guarda|crea|a[ñn]ade|agrega)\s+(?:una\s+)?nota\b", text):
            m_note = re.search(r"(?:guarda|crea|a[ñn]ade|agrega)\s+(?:una\s+)?nota\s+(?:que\s+diga\s+|con\s+el\s+texto\s+|:\s*)?(.+)", text)
            if m_note:
                result = self._add_note(m_note.group(1))

        # 9. WEB SEARCH & YOUTUBE
        elif "youtube" in text and any(b in text for b in ["busca", "buscar"]):
            yt_search = re.search(r"(?:busca|buscar)\s+en\s+youtube\s+(.*)", text)
            q = yt_search.group(1).strip() if yt_search else text.replace("youtube", "").strip()
            webbrowser.open(f"https://www.youtube.com/results?search_query={q}")
            result = {"success": True, "intent": "YOUTUBE_SEARCH", "reply": f"📺 Buscando en YouTube: {q}", "voice_text": f"Buscando {q} en YouTube."}

        elif text in ["abre youtube", "abrir youtube", "pon youtube", "youtube"]:
            webbrowser.open("https://www.youtube.com")
            result = {"success": True, "intent": "OPEN_YOUTUBE", "reply": "📺 Abriendo YouTube...", "voice_text": "Abriendo YouTube."}

        elif ("google" in text or text.startswith("busca ") or text.startswith("buscar ")) and not text.startswith("abre"):
            google_search = re.search(r"(?:busca|buscar)\s+(?:en\s+google\s+)?(.*)", text)
            q = google_search.group(1).strip() if google_search else text
            if q:
                webbrowser.open(f"https://www.google.com/search?q={q}")
                result = {"success": True, "intent": "GOOGLE_SEARCH", "reply": f"🌐 Buscando en Google: {q}", "voice_text": f"Buscando {q} en Google."}

        # 10. SYSTEM COMMANDS
        elif any(w in text for w in ["bloquea el pc", "bloquear pc", "bloquea ordenador", "bloquear equipo", "bloquear"]):
            ctypes.windll.user32.LockWorkStation()
            result = {"success": True, "intent": "SYS_LOCK", "reply": "🔒 Bloqueando equipo...", "voice_text": "Bloqueando equipo."}

        # 11. CLOSE APPLICATION
        if not result:
            close_verbs = ["cierra", "cerrar", "quitar", "quita", "apaga", "finaliza"]
            for cv in close_verbs:
                if text.startswith(cv + " "):
                    target = text[len(cv):].strip()
                    target = re.sub(r"^(el|la|los|las)\s+", "", target)
                    matched_app, matched_path = self._fuzzy_find_app(target, require_high_confidence=False)
                    if matched_app:
                        proc_name = os.path.splitext(os.path.basename(matched_path))[0]
                        os.system(f"taskkill /F /IM {proc_name}.exe > nul 2>&1")
                        title_app = matched_app.capitalize()
                        result = {
                            "success": True,
                            "intent": "CLOSE_APP",
                            "reply": f"❌ {title_app} cerrado",
                            "voice_text": f"{title_app} cerrado."
                        }
                        break

        # 12. OPEN APPLICATION (WITH FUZZY MATCHING)
        if not result:
            open_verbs = [
                "abre", "abrir", "ábreme", "abreme", "inicia", "iniciar", "pon", "ponme", "arranca",
                "arrancar", "ejecuta", "ejecutar", "lanza", "lanzar", "entra en", "metete en", "entra a"
            ]
            has_open_verb = False
            target_app_query = text
            for ov in open_verbs:
                if text.startswith(ov + " "):
                    target_app_query = text[len(ov):].strip()
                    has_open_verb = True
                    break

            target_app_query = re.sub(r"^(el|la|los|las|un|una)\s+", "", target_app_query).strip()
            matched_app, matched_path = self._fuzzy_find_app(target_app_query, require_high_confidence=not has_open_verb)
            if matched_app and matched_path:
                try:
                    os.startfile(matched_path)
                    title_app = matched_app.title()
                    result = {
                        "success": True,
                        "intent": "OPEN_APP",
                        "reply": f"🚀 Abriendo {title_app}...",
                        "voice_text": f"Abriendo {title_app}."
                    }
                except Exception as e:
                    fallback_success = False
                    # Fallback 1: specific Roblox handling (protocol or find latest version)
                    if "roblox" in matched_app.lower() or "roblox" in target_app_query:
                        try:
                            os.startfile("roblox-player:")
                            fallback_success = True
                        except Exception:
                            try:
                                r_dir = os.path.join(os.path.expanduser("~"), r"AppData\Local\Roblox\Versions")
                                if os.path.exists(r_dir):
                                    for v_folder in sorted(os.listdir(r_dir), reverse=True):
                                        p_exe = os.path.join(r_dir, v_folder, "RobloxPlayerBeta.exe")
                                        if os.path.exists(p_exe):
                                            os.startfile(p_exe)
                                            fallback_success = True
                                            break
                            except Exception:
                                pass

                    # Fallback 2: shell execute via cmd start
                    if not fallback_success and matched_path.lower().endswith((".lnk", ".url")):
                        try:
                            import subprocess
                            subprocess.Popen(f'start "" "{matched_path}"', shell=True)
                            fallback_success = True
                        except Exception:
                            pass

                    if fallback_success:
                        title_app = matched_app.title()
                        result = {
                            "success": True,
                            "intent": "OPEN_APP",
                            "reply": f"🚀 Abriendo {title_app}...",
                            "voice_text": f"Abriendo {title_app}."
                        }
                    else:
                        result = {
                            "success": False,
                            "intent": "OPEN_APP_ERROR",
                            "reply": f"Error abriendo {matched_app}: {e}",
                            "voice_text": f"No pude abrir {matched_app}."
                        }

        if not result:
            mode = self.get_settings().get("mode", "fast")
            if mode == "smart" and self._llm_svc:
                llm_reply = self._llm_svc.generate_response(raw_text)
                result = {
                    "success": True,
                    "intent": "LLM_RESPONSE",
                    "reply": f"🧠 {llm_reply}",
                    "voice_text": llm_reply
                }
            else:
                fast_res = self._match_fast_conversational_intents(text, raw_text)
                if fast_res:
                    result = fast_res
                else:
                    result = {
                        "success": False,
                        "intent": "UNKNOWN",
                        "reply": f"No reconocí la acción para '{raw_text}'. Puedes decir 'abre spotify', 'qué hora es', 'qué tiempo hace' o 'limpia ram'.",
                        "voice_text": "No reconocí la acción. Puedes pedirme abrir un programa, decir la hora o el tiempo."
                    }

        return result

    def execute_command(self, raw_text: str) -> dict:
        """Parses natural language command string and executes single or compound system actions."""
        if not raw_text or not raw_text.strip():
            return {"success": False, "reply": "No escuché ningún comando."}

        norm_text = self._normalize_text(raw_text)
        sub_commands = self._split_compound_commands(norm_text)

        if not sub_commands or len(sub_commands) <= 1:
            result = self._execute_single_command(raw_text)
        else:
            sub_results = []
            replies = []
            voice_parts = []
            intents = []
            all_success = True

            for sub_cmd in sub_commands:
                sub_res = self._execute_single_command(sub_cmd)
                sub_results.append(sub_res)
                if not sub_res.get("success", False):
                    all_success = False
                if sub_res.get("reply"):
                    replies.append(sub_res["reply"])
                if sub_res.get("voice_text"):
                    vt = sub_res["voice_text"].strip().rstrip(".")
                    if vt:
                        voice_parts.append(vt)
                if sub_res.get("intent"):
                    intents.append(sub_res["intent"])

            joined_reply = "\n".join(replies) if replies else "Comandos ejecutados."

            if len(voice_parts) == 1:
                joined_voice = voice_parts[0] + "."
            elif len(voice_parts) == 2:
                second = voice_parts[1]
                if second and second[0].isupper() and not second.startswith("WhatsApp"):
                    second = second[0].lower() + second[1:]
                joined_voice = f"{voice_parts[0]} y {second}."
            elif len(voice_parts) > 2:
                init_parts = ", ".join(voice_parts[:-1])
                last = voice_parts[-1]
                if last and last[0].isupper() and not last.startswith("WhatsApp"):
                    last = last[0].lower() + last[1:]
                joined_voice = f"{init_parts} y {last}."
            else:
                joined_voice = "Acciones realizadas."

            result = {
                "success": all_success,
                "intent": intents[0] if intents else "COMPOUND",
                "intents": intents,
                "sub_results": sub_results,
                "reply": joined_reply,
                "voice_text": joined_voice
            }

        # TTS SYNTHESIS IF VOICE IS ENABLED
        cfg = self.get_settings()
        if cfg.get("voice_enabled", True) and result.get("voice_text"):
            try:
                audio_b64 = self.synthesize_speech(result["voice_text"], cfg.get("voice"))
                result["audio_b64"] = audio_b64
            except Exception as e:
                print(f"[AssistantService] Speech synthesis failed: {e}")
                result["audio_b64"] = ""
        else:
            result["audio_b64"] = ""

        return result

    def _fuzzy_find_app(self, query: str, require_high_confidence: bool = False) -> tuple[str, str]:
        """Finds closest matching application name using Levenshtein / difflib."""
        if not query or not self._apps_cache:
            return "", ""

        query = query.lower().strip()
        names = list(self._apps_cache.keys())

        # 1. Direct exact match
        if query in self._apps_cache:
            return query, self._apps_cache[query]

        # 2. Substring & word boundary match, sorted by length descending
        # so specific apps like "rockstar games launcher" or "epic games launcher" match before shorter terms
        for k in sorted(names, key=len, reverse=True):
            if query == k:
                return k, self._apps_cache[k]
            # If query is inside k (e.g. query "rockstar games" inside "rockstar games launcher", or "spotify" in "spotify music")
            if len(query) >= 3 and query in k:
                return k, self._apps_cache[k]
            # If k is inside query, ONLY allow whole word boundary match (e.g. "ea" only if "ea" is a standalone word, not in "steam"!)
            if re.search(r"\b" + re.escape(k) + r"\b", query, re.IGNORECASE):
                return k, self._apps_cache[k]

        # 3. Fuzzy close matches
        cutoff = 0.70 if require_high_confidence else 0.55
        matches = difflib.get_close_matches(query, names, n=1, cutoff=cutoff)
        if matches:
            best_name = matches[0]
            return best_name, self._apps_cache[best_name]

        return "", ""
