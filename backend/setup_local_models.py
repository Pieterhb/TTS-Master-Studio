import os
import shutil
import urllib.request
from huggingface_hub import hf_hub_download

def download_kokoro():
    print("--- Downloading Kokoro Local Models ---")
    os.makedirs("models/kokoro", exist_ok=True)
    
    print("1/2: Downloading Kokoro ONNX Model (approx 80MB)...")
    url_model = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/kokoro-v0_19.onnx"
    urllib.request.urlretrieve(url_model, "models/kokoro/kokoro-v0_19.onnx")
    
    print("2/2: Downloading Kokoro Voices...")
    url_voices = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/voices.json"
    urllib.request.urlretrieve(url_voices, "models/kokoro/voices.json")
    print("Kokoro downloaded successfully!\n")

def download_piper():
    print("--- Downloading Piper Local Models ---")
    os.makedirs("models/piper", exist_ok=True)
    
    print("1/3: Downloading Piper Executable for Windows...")
    import zipfile
    piper_exe_path = "models/piper/piper.exe"
    if not os.path.exists(piper_exe_path):
        url_exe = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip"
        urllib.request.urlretrieve(url_exe, "models/piper/piper_windows_amd64.zip")
        with zipfile.ZipFile("models/piper/piper_windows_amd64.zip", 'r') as zip_ref:
            zip_ref.extractall("models/piper/temp")
        # Move all contents of models/piper/temp/piper/ to models/piper/
        for item in os.listdir("models/piper/temp/piper"):
            s = os.path.join("models/piper/temp/piper", item)
            d = os.path.join("models/piper", item)
            if os.path.isdir(s):
                shutil.copytree(s, d, dirs_exist_ok=True)
            else:
                shutil.copy2(s, d)
        shutil.rmtree("models/piper/temp")
        os.remove("models/piper/piper_windows_amd64.zip")

    print("2/3: Downloading Piper ONNX Voice (Lessac Medium)...")
    url_onnx = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
    urllib.request.urlretrieve(url_onnx, "models/piper/en_US-lessac-medium.onnx")
    
    print("3/3: Downloading Piper Config...")
    url_json = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
    urllib.request.urlretrieve(url_json, "models/piper/en_US-lessac-medium.onnx.json")
    print("Piper downloaded successfully!\n")

if __name__ == "__main__":
    print("Starting local model downloads...\n")
    download_kokoro()
    download_piper()
    print("All local models downloaded to the 'models' folder!")
    print("You can now tell the AI to update the backend to use them.")
