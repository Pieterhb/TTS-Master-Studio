import os
import re
import asyncio
from services.tts_service import generate_tts_chunk
from services.whisper_service import generate_srt

def split_into_chunks(text: str, max_words=500):
    sentences = re.split(r'(?<=[.!?]) +', text)
    chunks = []
    current_chunk = []
    current_words = 0
    
    for sentence in sentences:
        words = len(sentence.split())
        if current_words + words <= max_words:
            current_chunk.append(sentence)
            current_words += words
        else:
            if current_chunk:
                chunks.append(" ".join(current_chunk))
            current_chunk = [sentence]
            current_words = words
            
    if current_chunk:
        chunks.append(" ".join(current_chunk))
        
    return chunks

async def process_tts_job(text: str, model: str, voice: str, speed: float, volume: float = 1.0, pitch: float = 1.0):
    chunks = split_into_chunks(text, max_words=500)
    
    # Calculate absolute paths
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    cache_dir = os.path.join(base_dir, "backend", "cache")
    exports_dir = os.path.join(base_dir, "frontend", "exports")
    
    os.makedirs(cache_dir, exist_ok=True)
    os.makedirs(exports_dir, exist_ok=True)
    
    chunk_files = []
    
    # Process chunks with rate limiting simulation
    for i, chunk in enumerate(chunks):
        # In a real scenario, use asyncio.gather for parallelism with semaphore
        filepath = await generate_tts_chunk(chunk, model, voice, speed, volume, pitch, i, cache_dir)
        chunk_files.append(filepath)
    # Output format handling
    is_mp3 = (model == "edge_tts")
    extension = "mp3" if is_mp3 else "wav"
    output_audio_path = os.path.join(exports_dir, f"output.{extension}")
    
    if chunk_files:
        if is_mp3:
            # MP3 files can simply be concatenated by appending raw bytes
            with open(output_audio_path, 'wb') as outfile:
                for file in chunk_files:
                    try:
                        with open(file, 'rb') as infile:
                            outfile.write(infile.read())
                    except Exception as e:
                        print(f"Error appending MP3 chunk {file}: {e}")
        else:
            # WAV files require parsing the wave headers to stitch
            import wave
            data = []
            params = None
            for i, file in enumerate(chunk_files):
                try:
                    with wave.open(file, 'rb') as w:
                        if i == 0:
                            params = w.getparams()
                        data.append(w.readframes(w.getnframes()))
                except Exception as e:
                    print(f"Error reading WAV chunk {file}: {e}")
                
            if params and data:
                with wave.open(output_audio_path, 'wb') as output:
                    output.setparams(params)
                    for frames in data:
                        output.writeframes(frames)
                    
    # Cleanup chunks
    for file in chunk_files:
        if os.path.exists(file):
            try:
                os.remove(file)
            except:
                pass
            
    # Generate SRT
    srt_content = generate_srt(output_audio_path)
    srt_path = os.path.join(exports_dir, "output.srt")
    with open(srt_path, "w") as f:
        f.write(srt_content)
        
    return {
        "audio_url": f"/exports/output.{extension}",
        "srt_url": f"/exports/output.srt",
        "srt_content": srt_content
    }

async def process_directed_tts_job(segments: list, speaker_mapping: dict):
    speed_mappings = {
        "Very Slow": 0.75,
        "Slow": 0.85,
        "Normal": 1.00,
        "Fast": 1.15,
        "Very Fast": 1.30
    }
    
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    cache_dir = os.path.join(base_dir, "backend", "cache")
    exports_dir = os.path.join(base_dir, "frontend", "exports")
    
    os.makedirs(cache_dir, exist_ok=True)
    os.makedirs(exports_dir, exist_ok=True)
    
    chunk_files = []
    pauses = []
    
    for i, segment in enumerate(segments):
        speaker = segment.get("speaker", "Narrator")
        text = segment.get("text", "")
        pace = segment.get("pace", "Normal")
        pause_ms = segment.get("pause_after_ms", 0)
        
        voice_id = speaker_mapping.get(speaker, "f5_builtin_female")
        
        emphasis_words = segment.get("emphasis_words", [])
        # NOTE: Do NOT mutate the text for emphasis.
        # F5-TTS treats ALL_CAPS as acronyms (spells letter-by-letter)
        # and mid-sentence '!' as shouting — both degrade quality.
        # The vocal_delivery + pace fields already guide the tone.
        # emphasis_words is kept as LLM metadata only (unused at synthesis time).
            
        speed = speed_mappings.get(pace, 1.0)

        
        # Scale down LLM pauses — LLMs tend to output 800-1500ms which sounds robotic.
        # Cap at 500ms and apply a 0.6× multiplier for natural rhythm.
        scaled_pause = int(min(pause_ms * 0.6, 500))
        
        filepath = await generate_tts_chunk(text, "f5_tts", voice_id, speed, 1.0, 1.0, f"dir_{i}", cache_dir)
        chunk_files.append(filepath)
        pauses.append(scaled_pause)

    output_audio_path = os.path.join(exports_dir, "output_directed.wav")

    # Use soundfile + numpy for stitching.
    # Python's built-in wave module silently fails on float32 WAV (IEEE format type 3),
    # which is what soundfile writes by default. soundfile handles it correctly.
    import soundfile as sf
    import numpy as np

    all_audio = []
    sample_rate = None

    for i, file in enumerate(chunk_files):
        try:
            audio, sr = sf.read(file, dtype='float32', always_2d=True)  # always (N, channels)
            if sample_rate is None:
                sample_rate = sr
            all_audio.append(audio)

            # Insert precise silence after this segment
            pause_ms = pauses[i]
            if pause_ms > 0:
                silence_frames = int(sr * (pause_ms / 1000.0))
                silence = np.zeros((silence_frames, audio.shape[1]), dtype='float32')
                all_audio.append(silence)
        except Exception as e:
            print(f"[Directed Stitcher] Error reading chunk {file}: {e}")

    if all_audio and sample_rate:
        combined = np.concatenate(all_audio, axis=0)
        sf.write(output_audio_path, combined, sample_rate)
        print(f"[Directed Stitcher] Wrote {len(combined)/sample_rate:.1f}s of audio.")
    else:
        print("[Directed Stitcher] ERROR: No audio data collected — file not created.")

    for file in chunk_files:
        if os.path.exists(file):
            try:
                os.remove(file)
            except:
                pass

    return {
        "audio_url": "/exports/output_directed.wav"
    }
