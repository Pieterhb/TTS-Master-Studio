import os
import uvicorn
from fastapi import FastAPI, BackgroundTasks, UploadFile, Form
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
from dotenv import load_dotenv

from services.stitcher import process_tts_job, process_directed_tts_job

load_dotenv()

app = FastAPI(title="TTS Master Studio Pro (Free Edition)")

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    text: str
    model: str = "kokoro"
    voice: str = "default"
    speed: float = 1.0
    volume: float = 1.0
    pitch: float = 1.0
    emotion: str = "Storyteller"

class DirectedSegment(BaseModel):
    segment_id: int
    speaker: str
    text: str
    pace: str
    vocal_delivery: str
    pause_after_ms: int
    emphasis_words: Optional[List[str]] = []

class GenerateDirectedRequest(BaseModel):
    segments: List[DirectedSegment]
    speaker_mapping: Dict[str, str]
    speed: float = 1.0
    volume: float = 1.0
    pitch: float = 1.0

@app.post("/api/generate")
async def generate_audio(request: GenerateRequest, background_tasks: BackgroundTasks):
    # This is a synchronous endpoint that kicks off the process
    # In a real production app we would use WebSockets or Polling for long tasks
    # For now we'll do it sequentially and return the result
    
    result = await process_tts_job(
        text=request.text, 
        model=request.model, 
        voice=request.voice, 
        speed=request.speed,
        volume=request.volume,
        pitch=request.pitch
    )
    
    return result

@app.post("/api/generate_directed")
async def generate_directed_audio(request: GenerateDirectedRequest, background_tasks: BackgroundTasks):
    result = await process_directed_tts_job(
        segments=[s.model_dump() if hasattr(s, 'model_dump') else s.dict() for s in request.segments],
        speaker_mapping=request.speaker_mapping,
        global_speed=request.speed,
        global_volume=request.volume,
        global_pitch=request.pitch
    )
    return result

# Serve static files for the frontend
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
