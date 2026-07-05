@echo off
echo Starting TTS Master Studio Pro...
cd backend
python -m pip install -r requirements.txt
start http://127.0.0.1:8000
python main.py
pause
