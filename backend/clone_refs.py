import os
import glob
import numpy as np
import soundfile as sf
import librosa
import whisper

ref_dir = r"models\f5_tts\references"

print("Loading Whisper tiny model...")
model = whisper.load_model("tiny")

mp3s = sorted(glob.glob(os.path.join(ref_dir, "*.mp3")))
print(f"Processing {len(mp3s)} MP3 files...\n")

voices_data = []

for mp3_path in mp3s:
    base = os.path.splitext(os.path.basename(mp3_path))[0]  # e.g. "Adam 1"
    file_id = base.lower().replace(" ", "_")  # e.g. "adam_1"
    wav_path = os.path.join(ref_dir, f"{file_id}.wav")
    txt_path = os.path.join(ref_dir, f"{file_id}.txt")

    # Convert MP3 -> WAV using librosa (pure Python, no FFmpeg needed)
    try:
        # librosa loads any audio format and resamples
        audio, sr = librosa.load(mp3_path, sr=24000, mono=True)
        # Trim to max 12 seconds (F5-TTS reference sweet spot)
        max_samples = 12 * 24000
        if len(audio) > max_samples:
            audio = audio[:max_samples]
        sf.write(wav_path, audio, 24000)
    except Exception as e:
        print(f"  [!] WAV conversion failed for {base}: {e}")
        continue

    # Transcribe with Whisper
    try:
        result = model.transcribe(wav_path, language="en")
        ref_text = result["text"].strip()
        if not ref_text:
            ref_text = "The quick brown fox jumps over the lazy dog."
    except Exception as e:
        print(f"  [!] Transcription failed for {base}: {e}")
        ref_text = "The quick brown fox jumps over the lazy dog."

    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(ref_text)

    voice_name = f"{base} F"
    voices_data.append({
        "id": file_id,
        "name": voice_name,
        "base": base
    })

    print(f"  [OK] {base} F | \"{ref_text[:70]}\"")

print(f"\nDone! Processed {len(voices_data)} voices.")
print("\n--- VOICE IDs FOR UI ---")
for v in sorted(voices_data, key=lambda x: x["name"]):
    print(f'  {{\"id\": \"{v["id"]}\", \"name\": \"{v["name"]}\", \"gender\": \"Male\", \"lang\": \"English\", \"tags\": [\"Clone\"]}},')
