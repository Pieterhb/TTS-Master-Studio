import os
import uvicorn
from fastapi import FastAPI, BackgroundTasks, UploadFile, Form
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from services.stitcher import process_tts_job

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
    pitch: float = 1.0
    emotion: str = "Storyteller"

@app.post("/api/generate")
async def generate_audio(request: GenerateRequest, background_tasks: BackgroundTasks):
    # This is a synchronous endpoint that kicks off the process
    # In a real production app we would use WebSockets or Polling for long tasks
    # For now we'll do it sequentially and return the result
    
    result = await process_tts_job(
        text=request.text, 
        model=request.model, 
        voice=request.voice, 
        speed=request.speed
    )
    
    return result

# Serve static files for the frontend
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
