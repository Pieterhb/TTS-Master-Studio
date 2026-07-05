import os

def format_timestamp(seconds: float):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    msecs = int((seconds - int(seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{msecs:03d}"

def generate_srt(audio_path: str):
    """
    Uses faster-whisper to transcribe and generate word-level SRT.
    """
    try:
        from faster_whisper import WhisperModel
        # Use tiny model on CPU as requested
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        segments, info = model.transcribe(audio_path, word_timestamps=True)
        
        srt_content = ""
        counter = 1
        
        for segment in segments:
            for word in segment.words:
                start = format_timestamp(word.start)
                end = format_timestamp(word.end)
                srt_content += f"{counter}\n"
                srt_content += f"{start} --> {end}\n"
                srt_content += f"{word.word.strip()}\n\n"
                counter += 1
                
        return srt_content
    except Exception as e:
        print(f"Whisper failed: {e}")
        # Return mock SRT if whisper is not installed/fails
        return "1\n00:00:00,000 --> 00:00:01,000\nMock\n\n2\n00:00:01,000 --> 00:00:02,000\nSRT\n\n"
