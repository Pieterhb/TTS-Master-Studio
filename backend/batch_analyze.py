import os
import librosa
import numpy as np
import soundfile as sf
import torch
import static_ffmpeg
static_ffmpeg.add_paths()
from f5_tts.api import F5TTS

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

gen_text = "The quick brown fox jumps over the lazy dog. We are testing the voice speed and pitch variations."

def analyze_audio(path):
    y, sr = librosa.load(path, sr=24000)
    f0, voiced_flag, _ = librosa.pyin(y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'))
    f0 = f0[voiced_flag]
    pitch_mean = np.mean(f0) if len(f0) > 0 else 0
    
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
    rate = len(onsets) / (len(y)/sr)
    return pitch_mean, rate

voices_to_test = ["Brian 1", "Carter", "Darian", "David 4", "Adam 1"]

pitch_ratios = []
speed_ratios = []

for v in voices_to_test:
    print(f"\nAnalyzing {v}...")
    ref_mp3 = f"models/f5_tts/references/{v}.mp3"
    ref_wav = f"models/f5_tts/references/{v.lower().replace(' ', '_')}.wav"
    out_wav = f"{v.lower().replace(' ', '_')}_test.wav"
    
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
    
    orig_pitch, orig_pace = analyze_audio(ref_mp3)
    clone_pitch, clone_pace = analyze_audio(out_wav)
    
    # Ratios
    # If clone pace is 5.5 and orig is 4.4, we need to slow clone down. 
    # F5 speed param: lower is slower. So speed_target = orig_pace / clone_pace
    speed_ratio = orig_pace / clone_pace
    
    # Pitch ratio: orig / clone. e.g. 94 / 82 = 1.14 (multiply clone pitch by 1.14)
    pitch_ratio = orig_pitch / clone_pitch
    
    pitch_ratios.append(pitch_ratio)
    speed_ratios.append(speed_ratio)
    
    print(f"  Pace: Orig={orig_pace:.2f}, Clone={clone_pace:.2f}  => Offset={speed_ratio:.2f}x")
    print(f"  Pitch: Orig={orig_pitch:.2f}, Clone={clone_pitch:.2f} => Offset={pitch_ratio:.2f}x")

avg_speed = np.mean(speed_ratios)
avg_pitch = np.mean(pitch_ratios)

print("\n=== FINAL AVERAGES FOR F5-TTS INTERNAL CALIBRATION ===")
print(f"Average Speed Offset required: {avg_speed:.3f}x")
print(f"Average Pitch Offset required: {avg_pitch:.3f}x")
