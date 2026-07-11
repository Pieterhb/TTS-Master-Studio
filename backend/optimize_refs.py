"""
Re-process reference WAVs from MP3s with optimal settings for F5-TTS voice cloning.
- Target: 5-8 seconds of cleanest audio
- 24kHz mono (F5-TTS native format)
- Pick the most energy-rich segment (avoids silence/noise at start/end)
"""
import os
import glob
import numpy as np
import soundfile as sf
import librosa

ref_dir = r"models\f5_tts\references"
mp3s = sorted(glob.glob(os.path.join(ref_dir, "*.mp3")))

TARGET_SR = 24000
MIN_SEC = 5
MAX_SEC = 8

print(f"Re-processing {len(mp3s)} MP3s for optimal F5-TTS cloning...\n")

for mp3_path in mp3s:
    base = os.path.splitext(os.path.basename(mp3_path))[0]
    file_id = base.lower().replace(" ", "_")
    wav_path = os.path.join(ref_dir, f"{file_id}.wav")

    try:
        # Load at 24kHz mono
        audio, sr = librosa.load(mp3_path, sr=TARGET_SR, mono=True)
        duration = len(audio) / sr

        # Find the loudest/most energetic segment (skip silences)
        # Use RMS energy in 0.5s windows to find best start point
        win = int(0.5 * sr)
        if len(audio) > win:
            rms = np.array([
                np.sqrt(np.mean(audio[i:i+win]**2))
                for i in range(0, len(audio) - win, win // 2)
            ])
            # Find the peak energy region
            peak_idx = np.argmax(rms)
            # Center a 6-second window around the peak
            center_sample = peak_idx * (win // 2) + win // 2
            half = int(6 * sr / 2)
            start = max(0, center_sample - half)
            end = min(len(audio), start + int(MAX_SEC * sr))
            if end - start < int(MIN_SEC * sr):
                start = 0
                end = min(len(audio), int(MAX_SEC * sr))
            best_clip = audio[start:end]
        else:
            best_clip = audio

        # Normalize to prevent clipping
        peak = np.max(np.abs(best_clip))
        if peak > 0:
            best_clip = best_clip * (0.95 / peak)

        sf.write(wav_path, best_clip, TARGET_SR)
        clip_dur = len(best_clip) / TARGET_SR
        print(f"  [OK] {base} -> {file_id}.wav ({clip_dur:.1f}s from {duration:.1f}s total)")

    except Exception as e:
        print(f"  [!] {base}: {e}")

print("\nDone! All reference WAVs re-optimized for F5-TTS.")
print("Restart your run.bat and test again - voices should sound much closer to the originals now.")
