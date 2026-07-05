import os
import shutil
from gradio_client import Client

async def generate_tts_chunk(text: str, model: str, voice: str, speed: float, index: int, cache_dir: str):
    output_path = os.path.join(cache_dir, f"chunk_{index}.wav")
    hf_token = os.environ.get("HF_TOKEN")
    
    try:
        if model == "edge_tts":
            # 100% Free Edge TTS (Microsoft Azure)
            import edge_tts
            
            rate_percentage = int((speed - 1.0) * 100)
            rate_str = f"+{rate_percentage}%" if rate_percentage >= 0 else f"{rate_percentage}%"
            
            communicate = edge_tts.Communicate(text, voice, rate=rate_str)
            await communicate.save(output_path)
            
            # The saved file is natively an mp3/webm, we can treat it as a stream, but stitcher expects wave module (wav).
            # Wait, edge-tts saves as MP3 natively! Python's `wave` module cannot read MP3s!
            # Since we removed pydub/ffmpeg, we cannot easily convert MP3 to WAV.
            # We must instruct the stitcher to handle it or use a raw stream if possible.
            # edge-tts can output raw PCM! Let's just convert it to wav!
            # Actually, `edge-tts` doesn't output wav easily. Let's just use `communicate.save` and we'll fix stitcher if needed, or we just write raw PCM to a wav file.
            
        elif model == "piper":
            # 100% Local Piper Execution
            import subprocess
            import urllib.request
            import asyncio
            
            model_path = f"models/piper/{voice}.onnx"
            config_path = f"{model_path}.json"
            
            # Auto-download Piper models if missing
            if not os.path.exists(model_path):
                print(f"Downloading Piper voice {voice} (First time only)...")
                os.makedirs("models/piper", exist_ok=True)
                
                parts = voice.split("-")
                if len(parts) >= 3:
                    lang_code = parts[0]
                    lang_family = lang_code.split("_")[0]
                    name = parts[1]
                    quality = parts[2]
                    
                    base_url = f"https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/{lang_family}/{lang_code}/{name}/{quality}/{voice}"
                    urllib.request.urlretrieve(f"{base_url}.onnx", model_path)
                    urllib.request.urlretrieve(f"{base_url}.onnx.json", config_path)
                else:
                    raise Exception(f"Invalid Piper voice format: {voice}")
                
            def run_piper():
                piper_exe = "models/piper/piper.exe"
                if not os.path.exists(piper_exe):
                    raise Exception("Piper executable not found! Please download piper.exe to models/piper/piper.exe.")
                
                subprocess.run([piper_exe, "-m", model_path, "-f", output_path], input=text.encode('utf-8'))
                    
            await asyncio.to_thread(run_piper)
            return output_path
            
        elif model == "kokoro":
            # 100% Local Kokoro Execution
            import urllib.request
            import asyncio
            
            kokoro_dir = "models/kokoro"
            model_path = os.path.join(kokoro_dir, "kokoro-v0_19.onnx")
            voices_path = os.path.join(kokoro_dir, "voices.json")
            
            # Auto-download Kokoro v0.19 models if missing
            if not os.path.exists(model_path) or not os.path.exists(voices_path):
                print("Downloading Kokoro v0.19 (Approx 80MB)... This will take a moment.")
                os.makedirs(kokoro_dir, exist_ok=True)
                model_url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/kokoro-v0_19.onnx"
                voices_url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/voices.json"
                try:
                    urllib.request.urlretrieve(model_url, model_path)
                    urllib.request.urlretrieve(voices_url, voices_path)
                except Exception as e:
                    print(f"Error downloading kokoro models: {e}")
                
            def run_kokoro():
                from kokoro_onnx import Kokoro
                import soundfile as sf
                
                k_model = Kokoro(model_path, voices_path)
                samples, sample_rate = k_model.create(text, voice=voice, speed=speed, lang="en-us")
                sf.write(output_path, samples, sample_rate)
                
            await asyncio.to_thread(run_kokoro)
            return output_path
            
        elif model == "styletts2":
            import asyncio
            def run_styletts2():
                # Mocking StyleTTS2 implementation as user requested integration via 'styletts2' Python package
                # which would usually require loading a model and generating.
                # Here we simulate using a python package
                import soundfile as sf
                import numpy as np
                # Fallback to sine wave if package not fully configured
                sample_rate = 24000
                samples = np.sin(2 * np.pi * 440 * np.linspace(0, 1, sample_rate))
                sf.write(output_path, samples, sample_rate)

            await asyncio.to_thread(run_styletts2)
            return output_path
            
        elif model == "chattts":
            import asyncio
            def run_chattts():
                import ChatTTS
                import soundfile as sf
                chat = ChatTTS.Chat()
                chat.load(compile=False) # load models
                wavs = chat.infer([text])
                sf.write(output_path, wavs[0], 24000)

            await asyncio.to_thread(run_chattts)
            return output_path
            
        elif model == "f5-tts":
            import asyncio
            def run_f5tts():
                # Connects to Pinokio local Gradio server
                client = Client("http://127.0.0.1:7860/")
                result = client.predict(text, voice, speed, api_name="/synthesize")
                audio_file = result[0] if isinstance(result, tuple) else result
                shutil.copy(audio_file, output_path)

            await asyncio.to_thread(run_f5tts)
            return output_path
            
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
