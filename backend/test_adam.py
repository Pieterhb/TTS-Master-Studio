import os
import librosa
import numpy as np
import soundfile as sf
import torch
import static_ffmpeg
static_ffmpeg.add_paths()
from f5_tts.api import F5TTS

import torchaudio
def _sf_load(path, **kw):
    data, sr_file = sf.read(str(path), dtype='float32', always_2d=False)
    if data.ndim > 1: data = data.mean(axis=1)
    tensor = torch.from_numpy(data).unsqueeze(0)
    return tensor, sr_file
torchaudio.load = _sf_load

device = "cuda" if torch.cuda.is_available() else "cpu"
f5 = F5TTS(device=device)

ref_wav = r"models/f5_tts/references/adam_1.wav"
gen_text = "The people who are crazy enough to think they can change the world are the ones who do."

print("Testing speed direction...")
wav_5, sr, _ = f5.infer(ref_file=ref_wav, ref_text="", gen_text=gen_text, speed=0.5, nfe_step=32, cfg_strength=2.0, remove_silence=True)
sf.write("adam_speed_0.5.wav", wav_5, sr)

wav_15, sr, _ = f5.infer(ref_file=ref_wav, ref_text="", gen_text=gen_text, speed=1.5, nfe_step=32, cfg_strength=2.0, remove_silence=True)
sf.write("adam_speed_1.5.wav", wav_15, sr)

y5, _ = librosa.load("adam_speed_0.5.wav", sr=24000)
y15, _ = librosa.load("adam_speed_1.5.wav", sr=24000)

print(f"Duration at speed=0.5: {len(y5)/24000:.2f}s")
print(f"Duration at speed=1.5: {len(y15)/24000:.2f}s")
