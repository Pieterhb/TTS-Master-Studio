import os
import librosa
import numpy as np
import soundfile as sf
from f5_tts.api import F5TTS
import torch
import static_ffmpeg
static_ffmpeg.add_paths()

# Paths
ref_mp3 = r"models/f5_tts/references/Brian 1.mp3"
ref_wav = r"models/f5_tts/references/brian_1.wav"
out_wav = r"brian_1_test.wav"

print("1. Generating fresh test sample for Brian 1 F...")

# Monkey-patch torchaudio.load
import torchaudio
def _sf_load(path, **kw):
    data, sr_file = sf.read(str(path), dtype='float32', always_2d=False)
    if data.ndim > 1:
        data = data.mean(axis=1)
    tensor = torch.from_numpy(data).unsqueeze(0)
    return tensor, sr_file
torchaudio.load = _sf_load

device = "cuda" if torch.cuda.is_available() else "cpu"
f5 = F5TTS(device=device)

gen_text = "This is a test of the Brian one voice. I am analyzing the emotional range and the acoustic properties to see why it sounds unnatural."

wav_data, sr_gen, _ = f5.infer(
    ref_file=ref_wav,
    ref_text="",
    gen_text=gen_text,
    speed=1.0,
    nfe_step=32,
    cfg_strength=2.0,
    remove_silence=True,
)

sf.write(out_wav, wav_data, sr_gen)
print("Generation complete.")

print("\n2. Analyzing Acoustic Properties...")

def analyze_audio(path):
    y, sr = librosa.load(path, sr=24000)
    # Extract pitch (F0)
    f0, voiced_flag, voiced_probs = librosa.pyin(y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'))
    f0 = f0[voiced_flag]
    
    # Pitch variance (Emotion/Prosody)
    pitch_mean = np.mean(f0) if len(f0) > 0 else 0
    pitch_std = np.std(f0) if len(f0) > 0 else 0
    
    # Spectral Centroid (Brightness/Dullness)
    cent = librosa.feature.spectral_centroid(y=y, sr=sr)
    cent_mean = np.mean(cent)
    
    # Speaking Rate proxy (onset rate)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
    rate = len(onsets) / (len(y)/sr)
    
    return {
        "Pitch Mean (Hz)": pitch_mean,
        "Pitch StdDev (Expressiveness)": pitch_std,
        "Brightness (Centroid)": cent_mean,
        "Pace (events/sec)": rate
    }

metrics_ref = analyze_audio(ref_mp3)
metrics_gen = analyze_audio(out_wav)

print("\n--- COMPARISON ---")
print(f"{'Metric':<35} | {'Original (Brian 1.mp3)':<25} | {'Clone (F5-TTS)':<25}")
print("-" * 90)
for k in metrics_ref.keys():
    print(f"{k:<35} | {metrics_ref[k]:<25.2f} | {metrics_gen[k]:<25.2f}")

print("\nDone.")
