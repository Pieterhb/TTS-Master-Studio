import os
import glob
import numpy as np
import soundfile as sf
import whisper

ref_dir = r"models\f5_tts\references"

print("Loading Whisper tiny model...")
model = whisper.load_model("tiny")

wavs = sorted(glob.glob(os.path.join(ref_dir, "*.wav")))
print(f"Transcribing {len(wavs)} WAV files...\n")

for wav_path in wavs:
    base = os.path.splitext(os.path.basename(wav_path))[0]
    txt_path = os.path.join(ref_dir, f"{base}.txt")

    try:
        # Read WAV directly with soundfile (no ffmpeg needed)
        audio_data, sr = sf.read(wav_path, dtype="float32")
        if len(audio_data.shape) > 1:
            audio_data = audio_data.mean(axis=1)  # stereo -> mono
        # Whisper expects 16kHz
        if sr != 16000:
            import librosa
            audio_data = librosa.resample(audio_data, orig_sr=sr, target_sr=16000)
        
        # Transcribe using raw audio array (bypasses ffmpeg entirely)
        audio_data = whisper.pad_or_trim(audio_data)
        mel = whisper.log_mel_spectrogram(audio_data).to(model.device)
        _, probs = model.detect_language(mel)
        options = whisper.DecodingOptions(language="en", fp16=False)
        result = whisper.decode(model, mel, options)
        ref_text = result.text.strip()

        if ref_text:
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(ref_text)
            print(f"  [OK] {base}: \"{ref_text[:80]}\"")
        else:
            print(f"  [--] {base}: empty result")
    except Exception as e:
        print(f"  [!] {base}: {e}")

print("\nAll done!")
