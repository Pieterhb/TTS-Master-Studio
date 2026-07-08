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
