"""
Local LLM Service for WindowsDashboard using Qwen3.5-2B (GGUF via llama-cpp-python).
Manages model downloading, caching in %APPDATA%/WindowsDashboard/models,
conversation history, and high-reasoning conversational inference.
"""
import os
import sys
import time
import threading
import requests

try:
    from llama_cpp import Llama
    _LLAMA_AVAILABLE = True
except Exception:
    _LLAMA_AVAILABLE = False

MODEL_FILENAME = "Qwen3.5-2B-Q4_K_M.gguf"
MODEL_DOWNLOAD_URL = "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf"
EXPECTED_SIZE_BYTES = 1280794624  # ~1221.5 MB

SYSTEM_PROMPT = (
    "Eres el Asistente IA de WindowsDashboard. Eres simpático, ingenioso y conversacional.\n"
    "REGLAS:\n"
    "1. Responde siempre en español natural, directo y amable.\n"
    "2. Brevedad para voz: 1 o 2 frases concisas (máximo 40 palabras). "
    "Tu respuesta será leída por un sintetizador de voz (TTS).\n"
    "3. NUNCA repitas la frase del usuario ni devuelvas su pregunta.\n"
    "4. No uses listas largas, código extenso, markdown ni introducciones vacías.\n"
    "5. Si te piden un chiste, cuenta uno gracioso de verdad con remate."
)

# Maximum number of conversation history turns to keep (user+assistant pairs)
MAX_HISTORY_TURNS = 6


class LlmService:
    def __init__(self, config_manager=None):
        self._config_manager = config_manager
        self._model = None
        self._model_loading = False
        self._model_loaded = False
        self._lock = threading.Lock()

        # Conversation history (list of {"role": ..., "content": ...} dicts)
        self._conversation_history = []

        # Download tracking state
        self._download_state = {
            "status": "idle",       # "idle", "downloading", "ready", "error"
            "progress_pct": 0,
            "downloaded_mb": 0.0,
            "total_mb": 1221.5,
            "error_msg": ""
        }
        self._cancel_download = False
        self._download_thread = None

        # Check existing model
        self.models_dir = self._get_models_dir()
        self.model_path = os.path.join(self.models_dir, MODEL_FILENAME)
        if self.is_model_downloaded():
            self._download_state["status"] = "ready"
            self._download_state["progress_pct"] = 100
            # Pre-warm model in background so it is instantly available
            threading.Thread(target=self._load_model, daemon=True).start()

    def _get_models_dir(self) -> str:
        """Returns directory where GGUF models are stored."""
        appdata = os.environ.get("APPDATA")
        if appdata:
            path = os.path.join(appdata, "WindowsDashboard", "models")
        else:
            path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
        os.makedirs(path, exist_ok=True)
        return path

    def is_model_downloaded(self) -> bool:
        """Returns True if the GGUF model exists and has valid size (> 1000 MB)."""
        if os.path.exists(self.model_path):
            size = os.path.getsize(self.model_path)
            return size > 1000 * 1024 * 1024
        return False

    def get_status(self) -> dict:
        """Returns current model and download status."""
        is_ready = self.is_model_downloaded()
        if is_ready and self._download_state["status"] != "downloading":
            self._download_state["status"] = "ready"
            self._download_state["progress_pct"] = 100

        return {
            "available": _LLAMA_AVAILABLE,
            "download_status": self._download_state["status"],
            "progress_pct": self._download_state["progress_pct"],
            "downloaded_mb": self._download_state["downloaded_mb"],
            "total_mb": self._download_state["total_mb"],
            "error_msg": self._download_state["error_msg"],
            "model_loaded": self._model_loaded,
            "model_path": self.model_path if is_ready else "",
            "model_name": "Qwen3.5 2B (Q4_K_M)"
        }

    # =========================================================================
    # DOWNLOAD MANAGEMENT
    # =========================================================================
    def start_download(self) -> dict:
        """Starts background download of the GGUF model."""
        if self.is_model_downloaded():
            self._download_state["status"] = "ready"
            self._download_state["progress_pct"] = 100
            print("[LlmService] start_download rejected: Model is already downloaded.")
            return {
                "success": False,
                "status": "already_downloaded",
                "message": "El modelo ya está descargado y listo para usar."
            }

        if self._download_state["status"] == "downloading":
            return {"success": True, "status": "already_downloading"}

        self._cancel_download = False
        self._download_state["status"] = "downloading"
        self._download_state["progress_pct"] = 0
        self._download_state["downloaded_mb"] = 0.0
        self._download_state["error_msg"] = ""

        self._download_thread = threading.Thread(target=self._download_worker, daemon=True)
        self._download_thread.start()
        return {"success": True, "status": "started"}

    def _download_worker(self):
        """Streams the GGUF file from Hugging Face with progress tracking."""
        temp_path = self.model_path + ".part"
        try:
            print(f"[LlmService] Starting download of {MODEL_FILENAME} from {MODEL_DOWNLOAD_URL}...")
            resp = requests.get(MODEL_DOWNLOAD_URL, stream=True, timeout=30)
            if resp.status_code != 200:
                raise RuntimeError(f"HTTP {resp.status_code} al descargar el modelo.")

            total_bytes = int(resp.headers.get("content-length", EXPECTED_SIZE_BYTES))
            self._download_state["total_mb"] = round(total_bytes / (1024 * 1024), 1)

            downloaded = 0
            with open(temp_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=1024 * 256):
                    if self._cancel_download:
                        f.close()
                        if os.path.exists(temp_path):
                            os.remove(temp_path)
                        self._download_state["status"] = "idle"
                        print("[LlmService] Download cancelled.")
                        return

                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        self._download_state["downloaded_mb"] = round(downloaded / (1024 * 1024), 1)
                        self._download_state["progress_pct"] = min(99, int((downloaded / total_bytes) * 100))

            if os.path.exists(self.model_path):
                try:
                    os.remove(self.model_path)
                except Exception:
                    pass

            os.rename(temp_path, self.model_path)
            self._download_state["status"] = "ready"
            self._download_state["progress_pct"] = 100
            print(f"[LlmService] Model downloaded successfully to {self.model_path}")

            # Pre-warm model in background
            threading.Thread(target=self._load_model, daemon=True).start()

        except Exception as e:
            print(f"[LlmService] Download error: {e}")
            self._download_state["status"] = "error"
            self._download_state["error_msg"] = str(e)
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

    def cancel_download(self) -> dict:
        """Cancels active download."""
        self._cancel_download = True
        return {"success": True}

    # =========================================================================
    # MODEL LOADING & INFERENCE
    # =========================================================================
    def _load_model(self):
        """Loads Llama instance into memory with optimized context."""
        if not _LLAMA_AVAILABLE or not self.is_model_downloaded():
            return
        with self._lock:
            if self._model:
                return
            try:
                self._model_loading = True
                print(f"[LlmService] Loading {MODEL_FILENAME} into llama_cpp...")
                self._model = Llama(
                    model_path=self.model_path,
                    n_ctx=2048,
                    n_threads=max(2, (os.cpu_count() or 4) - 1),
                    verbose=False
                )
                self._model_loaded = True
                self._model_loading = False
                print("[LlmService] Model loaded and ready.")
            except Exception as e:
                print(f"[LlmService] Error loading model: {e}")
                self._model_loading = False
                self._model_loaded = False

    def clear_history(self):
        """Clears conversation history."""
        self._conversation_history.clear()

    def generate_response(self, user_query: str) -> str:
        """Generates a concise, high-reasoning response with conversation history."""
        if not _LLAMA_AVAILABLE:
            return "El motor llama_cpp no está instalado en este equipo."

        if not self.is_model_downloaded():
            return "El cerebro inteligente aún no está descargado. Puedes descargarlo en la configuración (⚙️)."

        if not self._model:
            self._load_model()
            if not self._model:
                return "Cargando el cerebro de IA... Inténtalo de nuevo en unos segundos."

        try:
            # Add user message to history
            self._conversation_history.append({"role": "user", "content": user_query.strip()})

            # Trim history to last N turns (keep it lightweight for small model)
            if len(self._conversation_history) > MAX_HISTORY_TURNS * 2:
                self._conversation_history = self._conversation_history[-(MAX_HISTORY_TURNS * 2):]

            # Build messages: system + conversation history
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            messages.extend(self._conversation_history)

            output = self._model.create_chat_completion(
                messages=messages,
                max_tokens=100,
                temperature=0.7,
                top_p=0.9,
                repeat_penalty=1.2
            )
            text = output["choices"][0]["message"]["content"].strip()
            # Clean any artifact tags
            text = text.replace("<|im_end|>", "").replace("<|im_start|>", "").strip()
            if not text:
                text = "Entendido. ¿En qué más puedo ayudarte?"

            # Add assistant response to history
            self._conversation_history.append({"role": "assistant", "content": text})

            return text
        except Exception as e:
            print(f"[LlmService] Generation error: {e}")
            return f"Hubo un problema al procesar la respuesta: {e}"
