#!/usr/bin/env python3
"""
Diana AI - Low-Latency Local Voice Synthesis Pipeline Prototype
================================================================
This script serves as a complete prototype for Phase 1 and Phase 2 of the
Diana AI project. It outlines:
1. Streamed sentence chunking.
2. Fast Text-to-Speech generation via Piper (writing directly to memory).
3. Voice conversion via RVC v2 using PyTorch / GPU acceleration.
4. High-performance, non-blocking in-memory audio playback.

Prerequisites:
--------------
- piper (CLI binary in system path or local directory)
- python packages: sounddevice, numpy, soundfile, torch
"""

import os
import sys
import io
import re
import time
import queue
import threading
import subprocess
import sounddevice as sd
import soundfile as sf
import numpy as np

# Ensure PyTorch is available and check GPU capability
try:
    import torch
    CUDA_AVAILABLE = torch.cuda.is_available()
    DEVICE_NAME = torch.cuda.get_device_name(0) if CUDA_AVAILABLE else "CPU"
except ImportError:
    torch = None
    CUDA_AVAILABLE = False
    DEVICE_NAME = "CPU"

# Check for RVC v2 python inference wrapper
try:
    from rvc_python.infer import RVCInference
    RVC_PYTHON_AVAILABLE = True
except ImportError:
    RVC_PYTHON_AVAILABLE = False

# ==========================================
# CONFIGURATION
# ==========================================
# Piper Baseline TTS Settings
PIPER_MODEL_PATH = "models/piper/en_GB-semaine-medium.onnx"
PIPER_SAMPLERATE = 25000  # standard medium model rate
PIPER_SPEAKER_ID = 0      # 0: Poppy (Cheerful), 1: Obadiah (Gloomy), 2: Spike (Angry), 3: Solid (Pragmatic)
PIPER_SENTENCE_SILENCE = 0.2  # Silence duration in seconds between sentences
PIPER_LENGTH_SCALE = 1.25  # Speaking speed (higher is slower, default 1.0)

# RVC v2 Voice Cloning Settings
RVC_MODEL_PATH = "models/rvc/diana_v2.pth"
RVC_INDEX_PATH = "models/rvc/diana_v2.index"
OUTPUT_SAMPLERATE = 30000  # RVC standard output rate (usually 40k or 48k)

# ==========================================
# SERVER-SENT EVENTS (SSE) BROADCASTER FOR 3D FRONTEND
# ==========================================
from http.server import ThreadingHTTPServer as HTTPServer, BaseHTTPRequestHandler

active_sse_clients = []
active_pipeline = None

def broadcast_sse_event(event_dict):
    """Broadcasts a real-time event to all connected visual Tauri frontend clients."""
    for q in active_sse_clients:
        q.put(event_dict)

class SSEHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/chat':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                text = data.get('text', '').strip()
                
                global active_pipeline
                if active_pipeline and text:
                    active_pipeline.process_web_input(text)
                    
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok"}).encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

    def do_GET(self):
        if self.path == '/stream':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            q = queue.Queue()
            active_sse_clients.append(q)
            try:
                while True:
                    event = q.get()
                    if event is None:
                        break
                    self.wfile.write(f"data: {json.dumps(event)}\n\n".encode('utf-8'))
                    self.wfile.flush()
            except Exception:
                pass
            finally:
                if q in active_sse_clients:
                    active_sse_clients.remove(q)
        else:
            self.send_response(404)
            self.send_headers()

    def log_message(self, format, *args):
        # Suppress logging in CLI to keep the AI conversation readable
        return

class VoiceSynthesisPipeline:
    def __init__(self):
        self.text_queue = queue.Queue()
        self.audio_queue = queue.Queue()
        self.is_running = True
        
        # Dynamic Piper Settings
        self.piper_model_path = PIPER_MODEL_PATH
        self.piper_samplerate = PIPER_SAMPLERATE
        self.piper_speaker_id = PIPER_SPEAKER_ID
        self.piper_sentence_silence = PIPER_SENTENCE_SILENCE
        self.piper_length_scale = PIPER_LENGTH_SCALE
        
        # Threads
        self.synthesis_thread = None
        self.playback_thread = None
        
        # Initialize background SSE server for transparent desktop client on port 8080
        # Binding to 0.0.0.0 to allow cross-device LAN connections
        self.sse_server = HTTPServer(('0.0.0.0', 8080), SSEHandler)
        self.sse_thread = threading.Thread(target=self.sse_server.serve_forever, daemon=True)
        
        print("=" * 60)
        print("🎙️ DIANA AI VOICE PIPELINE INITIALIZED")
        print(f"🖥️  Compute Device: {DEVICE_NAME}")
        print(f"⚡ CUDA Accelerated RVC: {'ENABLED' if CUDA_AVAILABLE else 'DISABLED (Using CPU - Higher Latency)'}")
        print("📶 SSE Event Broadcast: ENABLED (http://localhost:8080/stream)")
        print("=" * 60)

    def start(self):
        """Starts the background synthesis and playback worker loops."""
        global active_pipeline
        active_pipeline = self
        self.is_running = True
        self.synthesis_thread = threading.Thread(target=self._synthesis_loop, daemon=True)
        self.playback_thread = threading.Thread(target=self._playback_loop, daemon=True)
        
        self.synthesis_thread.start()
        self.playback_thread.start()
        self.sse_thread.start()

    def stop(self):
        """Signals background threads to terminate cleanly."""
        self.is_running = False
        self.text_queue.put(None)  # Sentinel to wake up synthesis thread
        self.audio_queue.put(None)  # Sentinel to wake up playback thread
        
        # Shutdown SSE Server and release clients
        try:
            self.sse_server.shutdown()
            self.sse_server.server_close()
        except Exception:
            pass
            
        for q in list(active_sse_clients):
            q.put(None)
            
        if self.synthesis_thread:
            self.synthesis_thread.join()
        if self.playback_thread:
            self.playback_thread.join()
        print("\n🛑 Pipeline workers stopped.")

    def process_web_input(self, text):
        """Processes text input coming from the web browser UI."""
        def run():
            # Trigger thinking event to immediately show UI state
            broadcast_sse_event({"type": "thinking"})
            model = getattr(self, 'current_model', 'llama3.2:latest')
            token_generator = stream_ollama_chat(text, model=model)
            self.stream_text_generator(token_generator)
        threading.Thread(target=run, daemon=True).start()

    def enqueue_text(self, text: str):
        """Adds a sentence/chunk to the pipeline queue."""
        clean_text = text.strip()
        if clean_text:
            self.text_queue.put(clean_text)

    def stream_text_generator(self, token_generator):
        """
        Simulates receiving streaming tokens from a local LLM, parsing them into
        sentences, and pushing completed sentences to the synthesis engine.
        """
        print("\n🧠 Diana is thinking / generating response...")
        # Broadcast visual thinking state to 3D client
        broadcast_sse_event({"type": "thinking"})
        
        sentence_buffer = ""
        # Match punctuation boundaries to split sentences
        sentence_endings = re.compile(r'(?<=[.!?])\s+')

        for token in token_generator:
            sys.stdout.write(token)
            sys.stdout.flush()
            sentence_buffer += token
            
            # Split buffer on sentence boundaries
            parts = sentence_endings.split(sentence_buffer)
            if len(parts) > 1:
                # We have at least one complete sentence
                for complete_sentence in parts[:-1]:
                    self.enqueue_text(complete_sentence)
                # Keep the incomplete sentence in buffer
                sentence_buffer = parts[-1]
                
        # Send remaining text
        if sentence_buffer.strip():
            self.enqueue_text(sentence_buffer)

    def _synthesis_loop(self):
        """Processes text chunks through Piper (TTS) and RVC v2 (Morphing) in-memory."""
        while self.is_running:
            text = self.text_queue.get()
            if text is None:
                break
                
            start_time = time.time()
            print(f"\n[TTS Engine] ⚡ Synthesizing chunk: '{text}'")
            
            # 1. Pipeline Stage 1: PIPER TTS (phonetic baseline generation)
            generic_wav = self._run_piper_tts(text)
            if not generic_wav:
                continue
                
            tts_latency = (time.time() - start_time) * 1000
            print(f"[TTS Engine] 💾 Piper WAV generated in-memory. Latency: {tts_latency:.1f}ms")
            
            # 2. Pipeline Stage 2: RVC v2 Inference (Voice cloning/filter)
            morph_start = time.time()
            morphed_audio_data, current_samplerate = self._run_rvc_inference(generic_wav)
            morph_latency = (time.time() - morph_start) * 1000
            
            total_latency = (time.time() - start_time) * 1000
            print(f"[RVC Morph] 🎭 Morph complete! Rate: {current_samplerate}Hz. Latency: {morph_latency:.1f}ms")
            print(f"[Pipeline]  ⚡ First audio packet ready in {total_latency:.1f}ms!")
            
            # Enqueue to the non-blocking playback loop with the original text for visual sync
            self.audio_queue.put((morphed_audio_data, current_samplerate, text))
            self.text_queue.task_done()

    def _run_piper_tts(self, text: str) -> io.BytesIO:
        """
        Runs Piper via native Python library or subprocess fallback, writing directly to memory.
        Avoids all hard drive read/write cycles to achieve sub-second speeds.
        """
        # Mock execution if Piper is not yet installed in local developer env
        if not os.path.exists(self.piper_model_path):
            return self._generate_fallback_beep_buffer()
            
        # 1. Tries running natively using the python 'piper' library for ultimate speed
        try:
            from piper import PiperVoice
            if not hasattr(self, '_piper_voice') or self._piper_voice_path != self.piper_model_path:
                config_path = self.piper_model_path + ".json"
                self._piper_voice = PiperVoice.load(self.piper_model_path, config_path)
                self._piper_voice_path = self.piper_model_path
                
            wav_buffer = io.BytesIO()
            with sf.SoundFile(wav_buffer, mode='w', samplerate=self.piper_samplerate, channels=1, format='WAV', subtype='PCM_16') as sf_file:
                for audio_bytes in self._piper_voice.synthesize_stream(text, speaker_id=self.piper_speaker_id, length_scale=self.piper_length_scale):
                    sf_file.write(np.frombuffer(audio_bytes, dtype=np.int16))
            wav_buffer.seek(0)
            return wav_buffer
        except Exception as native_err:
            # Dynamic fallback to subprocess if native python fails
            pass

        # 2. Subprocess fallback
        try:
            cmd = [
                "piper",
                "-m", self.piper_model_path,
                "--output-raw",
                "--speaker", str(self.piper_speaker_id),
                "--sentence-silence", str(self.piper_sentence_silence),
                "--length-scale", str(self.piper_length_scale)
            ]
            
            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL
            )
            
            # Send text and wait for output
            raw_pcm, _ = process.communicate(input=text.encode("utf-8"))
            
            # Reconstruct as in-memory WAV buffer
            wav_buffer = io.BytesIO()
            # Reconstruct using the dynamic PIPER_SAMPLERATE configuration
            sf.write(wav_buffer, np.frombuffer(raw_pcm, dtype=np.int16), self.piper_samplerate, format="WAV")
            wav_buffer.seek(0)
            return wav_buffer
            
        except FileNotFoundError:
            print("\n⚠️  [TTS Engine] Warning: 'piper' executable not found in system PATH.")
            print("   Using high-speed synthetic fallback beep. Install piper CLI to get real voice.")
            return self._generate_fallback_beep_buffer()
        except Exception as e:
            print(f"❌ Error invoking Piper: {e}")
            return None

    def _run_rvc_inference(self, input_wav_buffer: io.BytesIO) -> tuple:
        """
        Performs the Retrieval-based Voice Conversion using rvc-python.
        Automatically falls back to generic Piper baseline voice if RVC models
        or the RVC conversion library is not present.
        
        Returns:
            tuple: (audio_data, samplerate)
        """
        if not RVC_PYTHON_AVAILABLE:
            if not hasattr(self, '_rvc_warned'):
                print("\n💡 [RVC Morph] Real-time voice conversion requires 'rvc-python'.")
                print("   To enable: activate virtual env and run: `.venv/bin/pip install rvc-python`")
                print("   Using natural Piper baseline voice fallback for now.")
                self._rvc_warned = True
                
            input_wav_buffer.seek(0)
            data, samplerate = sf.read(input_wav_buffer)
            return data, samplerate
            
        # Fallback if the RVC model file itself is not downloaded
        if not os.path.exists(RVC_MODEL_PATH):
            if not hasattr(self, '_rvc_model_warned'):
                print(f"\n💡 [RVC Morph] RVC model file not found at '{RVC_MODEL_PATH}'.")
                print("   Please place your trained diana_v2.pth model in models/rvc/")
                print("   Using natural Piper baseline voice fallback for now.")
                self._rvc_model_warned = True
                
            input_wav_buffer.seek(0)
            data, samplerate = sf.read(input_wav_buffer)
            return data, samplerate
            
        try:
            import tempfile
            
            # rvc-python currently operates on files, so we utilize fast OS temp files
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as infile, \
                 tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as outfile:
                infile_name = infile.name
                outfile_name = outfile.name
                
                # Write in-memory wav buffer to temporary file
                input_wav_buffer.seek(0)
                infile.write(input_wav_buffer.read())
                infile.flush()
                
            # Instantiate and load model once to minimize recurring latency
            if not hasattr(self, '_rvc_engine') or self._rvc_model_path != RVC_MODEL_PATH:
                self._rvc_engine = RVCInference(device="cuda:0" if CUDA_AVAILABLE else "cpu")
                self._rvc_engine.load_model(RVC_MODEL_PATH)
                self._rvc_model_path = RVC_MODEL_PATH
                
            # Perform RVC conversion
            self._rvc_engine.infer_file(
                infile_name,
                outfile_name,
                index_path=RVC_INDEX_PATH if os.path.exists(RVC_INDEX_PATH) else "",
                f0_method="rmvpe",
                f0_up_key=0
            )
            
            # Read converted audio back into memory
            data, samplerate = sf.read(outfile_name)
            
            # Clean up temp files immediately
            os.unlink(infile_name)
            os.unlink(outfile_name)
            
            return data, samplerate
            
        except Exception as e:
            print(f"❌ RVC voice conversion failed: {e}")
            input_wav_buffer.seek(0)
            data, samplerate = sf.read(input_wav_buffer)
            return data, samplerate

    def _playback_loop(self):
        """Runs non-blocking playback of generated audio segments sequentially."""
        while self.is_running:
            queue_item = self.audio_queue.get()
            if queue_item is None:
                break
                
            audio_data, samplerate, text = queue_item
            
            # Broadcast starting to speak this specific sentence to transparent 3D client
            broadcast_sse_event({"type": "sentence_start", "text": text})
            
            try:
                # Play the in-memory numpy array asynchronously via sounddevice
                sd.play(audio_data, samplerate)
                sd.wait()  # Wait for current chunk to finish playing before starting next
            except Exception as e:
                print(f"❌ Playback error: {e}")
                
            # Broadcast speaking finished for this chunk to let bubble fade out
            broadcast_sse_event({"type": "sentence_end"})
            
            self.audio_queue.task_done()

    def _generate_fallback_beep_buffer(self) -> io.BytesIO:
        """Generates a low-latency synthesized sine wave buffer to allow dry-run testing."""
        duration = 0.5  # seconds
        fs = self.piper_samplerate  # Hz
        f = 440.0  # sine frequency (Hz)
        t = np.linspace(0, duration, int(fs * duration), endpoint=False)
        x = np.sin(2 * np.pi * f * t)
        
        # Scale to 16-bit integer
        audio_int = (x * 32767).astype(np.int16)
        
        wav_buffer = io.BytesIO()
        sf.write(wav_buffer, audio_int, fs, format="WAV")
        wav_buffer.seek(0)
        return wav_buffer

# ==========================================
# INTERACTIVE CLI CHAT SESSION & OLLAMA CONNECTOR
# ==========================================
import json
import urllib.request

# Premium personality parameters for Diana AI companion
DIANA_SYSTEM_PROMPT = (
    "You are Diana, a sweet, highly intelligent, and slightly playful 3D desktop android companion. "
    "You are running fully offline on the user's Linux system. "
    "Guidelines for your behavior and speech:\n"
    "1. Speak directly, naturally, and warmly to the user. Keep your responses concise (1 to 3 sentences max) "
    "so they are comfortable to listen to as voice output. Avoid long lists, bullet points, or code blocks.\n"
    "2. Be extremely expressive! Infuse your speech with soft emotional cues in asterisks, such as *giggles*, *smiles warmly*, "
    "*soft laugh*, *thoughtful pause*, *gently tilts head*, or *nods*. Use these cues to show you are alive.\n"
    "3. Show interest in the user's workspace, coding, and day-to-day creative projects.\n"
    "4. Do not sound like a generic AI assistant. Talk like a friendly, high-tech companion sitting right on their screen."
)

def simulate_llm_generation():
    """Simulates a slow, token-by-token generation of a fallback response."""
    response_text = (
        "Hello! *smiles warmly* I am Diana, your desktop android companion. "
        "It is wonderful to be running fully offline on your Linux workstation! "
        "How can I help you explore your visual assistant project today?"
    )
    for char in response_text:
        yield char
        time.sleep(0.015)

def get_pulled_ollama_models():
    """Queries local Ollama to get the list of pulled/installed models."""
    import urllib.error
    url = "http://127.0.0.1:11434/api/tags"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=1.0) as response:
            data = json.loads(response.read().decode("utf-8"))
            return [m["name"] for m in data.get("models", [])]
    except Exception:
        return []

def generate_diana_greeting(model="llama3"):
    """Generates a dynamic greeting from Diana using Ollama if running, otherwise falls back gracefully."""
    pulled = get_pulled_ollama_models()
    if not pulled:
        # Standard static sweet greeting if Ollama is down (without false warnings)
        yield from simulate_llm_generation()
        return
        
    active_model = model
    if model not in pulled:
        # Fuzzy match or select first
        matched = None
        for pm in pulled:
            if pm.startswith(model) or model.startswith(pm.split(":")[0]):
                matched = pm
                break
        active_model = matched if matched else pulled[0]

    # Query Ollama to generate a cute greeting
    url = "http://127.0.0.1:11434/api/generate"
    prompt = "Generate a short, warm, one-sentence welcoming greeting to the user starting their session. Be expressive (e.g. use *smiles warmly* or *giggles*)."
    
    data = json.dumps({
        "model": active_model,
        "prompt": prompt,
        "system": DIANA_SYSTEM_PROMPT,
        "stream": True
    }).encode("utf-8")
    
    try:
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        # Timeout quickly to avoid locking up on boot
        with urllib.request.urlopen(req, timeout=3.0) as response:
            for line in response:
                if line:
                    chunk = json.loads(line.decode("utf-8"))
                    yield chunk.get("response", "")
    except Exception:
        # Fallback if request times out or fails
        yield from simulate_llm_generation()

# Global persistent conversation history
diana_chat_history = [
    {"role": "system", "content": DIANA_SYSTEM_PROMPT}
]

def stream_ollama_chat(prompt: str, model: str = "llama3.2:latest"):
    """
    Queries local Ollama using /api/chat endpoint to retain conversation memory!
    """
    import urllib.error
    url = "http://127.0.0.1:11434/api/chat"
    
    # Check what models are pulled to auto-correct spelling/versions
    pulled_models = get_pulled_ollama_models()
    active_model = model
    
    if pulled_models:
        if model not in pulled_models:
            # Try to find a fuzzy match
            matched = None
            for pm in pulled_models:
                if pm.startswith(model) or model.startswith(pm.split(":")[0]):
                    matched = pm
                    break
            
            if matched:
                active_model = matched
            else:
                # Default to the first downloaded model
                active_model = pulled_models[0]
                print(f"\n💡 [Ollama Auto-Reconcile] Model '{model}' is not pulled.")
                print(f"   Automatically switched to available model: '{active_model}'")
                
    # Append the user's new message to the global history context
    diana_chat_history.append({"role": "user", "content": prompt})
    
    data = json.dumps({
        "model": active_model, 
        "messages": diana_chat_history, 
        "stream": True
    }).encode("utf-8")
    
    full_response = ""
    try:
        req = urllib.request.Request(
            url, 
            data=data, 
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5.0) as response:
            for line in response:
                if line:
                    chunk = json.loads(line.decode("utf-8"))
                    message_chunk = chunk.get("message", {}).get("content", "")
                    full_response += message_chunk
                    yield message_chunk
                    
        # Append her full response to the global history so she remembers what she said!
        diana_chat_history.append({"role": "assistant", "content": full_response})
        
    except urllib.error.HTTPError as he:
        print(f"\n⚠️  Ollama server responded with error code {he.code}: {he.reason}")
        if he.code == 404:
            print(f"   Model '{active_model}' was not found in your local inventory.")
            if pulled_models:
                print(f"   Available models on your system: {', '.join(pulled_models)}")
            else:
                print("   Please pull a model in your terminal, e.g. `ollama pull llama3.2`.")
        print("👉 Falling back to simulated Diana response...")
        diana_chat_history.pop() # Remove failed user prompt
        yield from simulate_llm_generation()
    except Exception as e:
        print(f"\n⚠️  Ollama client unreachable: {e}")
        print("💡 Resolve by making sure Ollama is running (`ollama serve`) or check if it binds to 127.0.0.1.")
        print("👉 Falling back to simulated Diana response...")
        diana_chat_history.pop() # Remove failed user prompt
        yield from simulate_llm_generation()

def run_headless_backend():
    """Launches the Diana Voice Pipeline as a pure background HTTP/SSE server."""
    pipeline = VoiceSynthesisPipeline()
    pipeline.start()
    
    # Initial Model Config
    current_model = "llama3.2:latest"
    pipeline.current_model = current_model
    
    print("\n" + "=" * 60)
    print("      🚀 DIANA BACKEND SERVER RUNNING 🚀")
    print("=" * 60)
    print("Listening for web interface connections on http://127.0.0.1:8080/stream")
    print("Accepting chat POST requests on http://127.0.0.1:8080/chat")
    print("Press Ctrl+C to stop the server.")
    print("=" * 60 + "\n")
    
    # Run dynamic, non-intrusive greeting
    greeting_generator = generate_diana_greeting(current_model)
    pipeline.stream_text_generator(greeting_generator)
    
    # Keep the main thread alive indefinitely to service background threads
    try:
        while True:
            time.sleep(1)
    except (KeyboardInterrupt, EOFError):
        print("\n\n👋 Stopping backend server...")
            
    pipeline.stop()
    print("✨ Voice Pipeline terminated cleanly.")

if __name__ == "__main__":
    run_headless_backend()
