import asyncio
import os
import soundfile as sf

text = "We are standing on the edge of a new frontier. There is no turning back now, only forward into the great unknown."

os.makedirs("models/f5_tts/references", exist_ok=True)

async def main():
    # 1. Edge TTS - Christopher
    print("Generating Christopher...")
    import edge_tts
    comm = edge_tts.Communicate(text, "en-US-ChristopherNeural")
    await comm.save("models/f5_tts/references/f5_christopher.wav")
    with open("models/f5_tts/references/f5_christopher.txt", "w", encoding="utf-8") as f:
        f.write(text)

    # 2. Kokoro - Adam and George
    print("Generating Kokoro...")
    from kokoro_onnx import Kokoro
    kokoro = Kokoro("models/kokoro/kokoro-v1.0.onnx", "models/kokoro/voices-v1.0.bin")
    
    samples_adam, sr = kokoro.create(text, voice="am_adam", speed=1.0, lang="en-us")
    sf.write("models/f5_tts/references/f5_adam.wav", samples_adam, sr)
    with open("models/f5_tts/references/f5_adam.txt", "w", encoding="utf-8") as f:
        f.write(text)
        
    # George is a British voice usually, so en-gb
    samples_george, sr = kokoro.create(text, voice="bm_george", speed=1.0, lang="en-gb")
    sf.write("models/f5_tts/references/f5_george.wav", samples_george, sr)
    with open("models/f5_tts/references/f5_george.txt", "w", encoding="utf-8") as f:
        f.write(text)

asyncio.run(main())
print("Done!")
