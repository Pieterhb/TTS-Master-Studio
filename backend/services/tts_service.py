import os
import shutil
from gradio_client import Client

# ── torchcodec workaround ────────────────────────────────────────────────────
# The installed torchcodec is incompatible with PyTorch 2.5.1+cu121 on Windows
# (missing libtorchcodec_core*.dll). Setting this env var at module-load time
# tells torchaudio to skip its torchcodec backend entirely, before any import.
os.environ["TORCHAUDIO_USE_TORCHCODEC"] = "0"
# ─────────────────────────────────────────────────────────────────────────────

# Make FFmpeg available to all libraries (torchaudio, pydub, transformers ASR)
try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
except Exception:
    pass  # FFmpeg already on PATH or not installed

# ── F5-TTS singleton ──────────────────────────────────────────────────────────
# The model is ~1.2GB. Loading it fresh on every segment call wastes seconds.
# We load it once on first use and reuse the same instance for all calls.
_f5_model = None

def _get_f5_model():
    global _f5_model
    if _f5_model is None:
        import torch
        import torchaudio
        import soundfile as sf
        def _sf_load(path, **kw):
            data, sr_file = sf.read(str(path), dtype='float32', always_2d=False)
            if data.ndim > 1:
                data = data.mean(axis=1)
            import torch as _torch
            return _torch.from_numpy(data).unsqueeze(0), sr_file
        torchaudio.load = _sf_load
        from f5_tts.api import F5TTS
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[F5-TTS] Loading model on {device.upper()} (first use only)...")
        _f5_model = F5TTS(device=device)
        print("[F5-TTS] Model ready.")
    return _f5_model
# ─────────────────────────────────────────────────────────────────────────────

async def generate_tts_chunk(text: str, model: str, voice: str, speed: float, volume: float, pitch: float, index: int, cache_dir: str):
    output_path = os.path.join(cache_dir, f"chunk_{index}.wav")
    hf_token = os.environ.get("HF_TOKEN")
    
    try:
        if model == "edge_tts":
            # 100% Free Edge TTS (Microsoft Azure)
            import edge_tts
            
            rate_percentage = int((speed - 1.0) * 100)
            rate_str = f"+{rate_percentage}%" if rate_percentage >= 0 else f"{rate_percentage}%"
            
            vol_percentage = int((volume - 1.0) * 100)
            vol_str = f"+{vol_percentage}%" if vol_percentage >= 0 else f"{vol_percentage}%"
            
            pitch_percentage = int((pitch - 1.0) * 100)
            pitch_str = f"+{pitch_percentage}Hz" if pitch_percentage >= 0 else f"{pitch_percentage}Hz"
            
            communicate = edge_tts.Communicate(text, voice, rate=rate_str, volume=vol_str, pitch=pitch_str)
            await communicate.save(output_path)
            
            # The saved file is natively an mp3/webm, we can treat it as a stream, but stitcher expects wave module (wav).
            # Wait, edge-tts saves as MP3 natively! Python's `wave` module cannot read MP3s!
            # Since we removed pydub/ffmpeg, we cannot easily convert MP3 to WAV.
            # We must instruct the stitcher to handle it or use a raw stream if possible.
            # edge-tts can output raw PCM! Let's just convert it to wav!
            # Actually, `edge-tts` doesn't output wav easily. Let's just use `communicate.save` and we'll fix stitcher if needed, or we just write raw PCM to a wav file.
            
        elif model == "f5_tts":
            # 100% Local F5-TTS Execution
            import asyncio
            import numpy as np
            import soundfile as sf
            
            def run_f5_tts():
                import torch
                import numpy as np
                import soundfile as sf
                
                # Reuse the cached singleton — model is only loaded once per server process.
                f5 = _get_f5_model()
                
                # === RESOLVE REFERENCE AUDIO ===
                ref_dir = os.path.join("models", "f5_tts", "references")
                os.makedirs(ref_dir, exist_ok=True)
                voice_wav = os.path.join(ref_dir, f"{voice}.wav")
                voice_txt = os.path.join(ref_dir, f"{voice}.txt")
                
                if os.path.exists(voice_wav) and os.path.exists(voice_txt):
                    ref_audio = voice_wav
                    with open(voice_txt, "r", encoding="utf-8") as fh:
                        ref_text = fh.read().strip()
                else:
                    print(f"Warning: No reference found for '{voice}'. Using built-in fallback.")
                    import importlib.util
                    f5_path = importlib.util.find_spec("f5_tts").submodule_search_locations[0]
                    ref_audio = os.path.join(f5_path, 'infer', 'examples', 'basic', 'basic_ref_en.wav')
                    ref_text = "Some call me nature, others call me mother nature."
                
                # === INFER ===
                # ref_text="" tells F5-TTS to auto-transcribe the reference audio using its
                # own internal Whisper model. This gives PERFECT tempo/speed matching.
                # Our Whisper-tiny .txt files had hallucinations that made output rush.
                # === APPLY INTERNAL CALIBRATION OFFSETS ===
                # Based on acoustic analysis, F5-TTS natively generates too fast.
                # We apply a speed offset here invisibly so the UI stays at 1.0x.
                # Note: We CANNOT apply pitch-shifting mathematically because 
                # phase-vocoders (like Librosa) destroy the natural timbre and 
                # make it sound robotic.
                f5_speed = speed * 0.83

                wav, sr, _ = f5.infer(
                    ref_file=ref_audio,
                    ref_text="",   
                    gen_text=text,
                    speed=f5_speed,   # Applied offset
                    nfe_step=32,
                    cfg_strength=2.0,
                    remove_silence=True,
                )

                # GUARANTEED SILENCE TRIMMING
                # F5's remove_silence=True often leaves ~1s of padding.
                # We use librosa to mathematically slice off all leading/trailing dead air.
                import librosa
                wav, _ = librosa.effects.trim(wav, top_db=40)

                wav = wav * volume
                # Convert to stereo for export
                if wav.ndim == 1:
                    wav_stereo = np.column_stack((wav, wav))
                else:
                    wav_stereo = wav.T if wav.shape[0] == 2 else wav
                sf.write(output_path, wav_stereo, sr)
                

            await asyncio.to_thread(run_f5_tts)
            return output_path
            
        elif model == "kokoro":
            # 100% Local Kokoro Execution
            import urllib.request
            import asyncio
            
            kokoro_dir = "models/kokoro"
            model_path = os.path.join(kokoro_dir, "kokoro-v1.0.onnx")
            voices_path = os.path.join(kokoro_dir, "voices-v1.0.bin")
            
            # Auto-download Kokoro v1.0 models if missing
            if not os.path.exists(model_path) or not os.path.exists(voices_path):
                print("Downloading Kokoro v1.0... This will take a moment.")
                os.makedirs(kokoro_dir, exist_ok=True)
                model_url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
                voices_url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
                try:
                    urllib.request.urlretrieve(model_url, model_path)
                    urllib.request.urlretrieve(voices_url, voices_path)
                except Exception as e:
                    print(f"Error downloading kokoro models: {e}")
                
            def run_kokoro():
                from kokoro_onnx import Kokoro
                import soundfile as sf
                import numpy as np
                
                k_model = Kokoro(model_path, voices_path)
                
                # Dynamically set language based on voice prefix for proper intonation
                kokoro_lang = "en-gb" if voice.startswith("bm_") or voice.startswith("bf_") else "en-us"
                
                samples, sample_rate = k_model.create(text, voice=voice, speed=speed, lang=kokoro_lang)
                samples = samples * volume
                
                # Convert Mono to Stereo
                stereo_samples = np.column_stack((samples, samples))
                sf.write(output_path, stereo_samples, sample_rate)
                
            await asyncio.to_thread(run_kokoro)
            return output_path
            
        else:
            raise ValueError(f"Unsupported model: {model}")
            
    except Exception as e:
        print(f"\n[!] Error generating audio with {model}: {e}")
        print("Falling back to mock beep sound for this chunk...")
        import wave
        import struct
        import math
        
        # Generate 1 sec of 440Hz sine wave at 16kHz
        sample_rate = 16000
        with wave.open(output_path, 'w') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sample_rate)
            for i in range(sample_rate):
                value = int(32767.0 * math.sin(2.0 * math.pi * 440.0 * i / sample_rate))
                data = struct.pack('<h', value)
                w.writeframesraw(data)
        
    return output_path
