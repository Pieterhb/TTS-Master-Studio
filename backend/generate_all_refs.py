import asyncio
import os
import shutil
import soundfile as sf
import edge_tts
from kokoro_onnx import Kokoro

ref_dir = "models/f5_tts/references"

# 1. Delete all existing voices
if os.path.exists(ref_dir):
    shutil.rmtree(ref_dir)
os.makedirs(ref_dir, exist_ok=True)

text = "We are standing on the edge of a new frontier. There is no turning back now, only forward into the great unknown."

kokoro_voices = [
    ("bm_fable", "Fable F", "Male", "en-gb"),
    ("am_onyx", "Onyx F", "Male", "en-us"),
    ("bm_george", "George F", "Male", "en-gb"),
    ("am_fenrir", "Fenrir F", "Male", "en-us"),
    ("am_adam", "Adam F", "Male", "en-us"),
    ("am_michael", "Michael F", "Male", "en-us"),
    ("am_puck", "Puck F", "Male", "en-us"),
    ("af_bella", "Bella F", "Female", "en-us"),
    ("bf_emma", "Emma F", "Female", "en-gb"),
    ("af_heart", "Heart F", "Female", "en-us"),
    ("af_nicole", "Nicole F", "Female", "en-us"),
    ("af_sarah", "Sarah F", "Female", "en-us"),
    ("af_sky", "Sky F", "Female", "en-us"),
    ("af", "Default Female F", "Female", "en-us"),
    ("bm_lewis", "Lewis F", "Male", "en-gb"),
    ("bf_isabella", "Isabella F", "Female", "en-gb")
]

edge_voices = [
    ("en-US-GuyNeural", "Guy F", "Male"),
    ("en-US-ChristopherNeural", "Christopher F", "Male"),
    ("en-US-SteffanNeural", "Steffan F", "Male"),
    ("en-US-AriaNeural", "Aria F", "Female")
]

async def main():
    kokoro = Kokoro("models/kokoro/kokoro-v1.0.onnx", "models/kokoro/voices-v1.0.bin")
    
    for v_id, v_name, v_gender, lang in kokoro_voices:
        print(f"Generating Kokoro: {v_name}")
        try:
            samples, sr = kokoro.create(text, voice=v_id, speed=1.0, lang=lang)
            f5_id = f"f5_{v_id}"
            sf.write(os.path.join(ref_dir, f"{f5_id}.wav"), samples, sr)
            with open(os.path.join(ref_dir, f"{f5_id}.txt"), "w", encoding="utf-8") as f:
                f.write(text)
        except Exception as e:
            print(f"Failed {v_name}: {e}")
            
    for v_id, v_name, v_gender in edge_voices:
        print(f"Generating Edge: {v_name}")
        try:
            comm = edge_tts.Communicate(text, v_id)
            f5_id = f"f5_{v_id.lower().replace('-', '_')}"
            await comm.save(os.path.join(ref_dir, f"{f5_id}.wav"))
            with open(os.path.join(ref_dir, f"{f5_id}.txt"), "w", encoding="utf-8") as f:
                f.write(text)
        except Exception as e:
            print(f"Failed {v_name}: {e}")

asyncio.run(main())
print("Finished generating 20 reference voices for F5-TTS!")
