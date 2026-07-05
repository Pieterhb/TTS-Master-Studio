document.addEventListener('DOMContentLoaded', () => {
    
    // WaveSurfer setup
    const wavesurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: '#4b5563',
        progressColor: '#3B82F6',
        cursorColor: '#F97316',
        barWidth: 2,
        barRadius: 3,
        cursorWidth: 1,
        height: 60,
        barGap: 3
    });

    // Elements
    const textInput = document.getElementById('textInput');
    const wordCount = document.getElementById('wordCount');
    const chunkCount = document.getElementById('chunkCount');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');
    const generateBtn = document.getElementById('generateBtn');
    const playBtn = document.getElementById('playBtn');
    const speedInput = document.getElementById('speed');
    const speedVal = document.getElementById('speedVal');
    const srtOutput = document.getElementById('srtOutput');
    const captionDisplay = document.getElementById('captionDisplay');
    const voiceSelect = document.getElementById('voiceSelect');
    const modelRadios = document.querySelectorAll('input[name="model"]');
    const exportMp3Btn = document.getElementById('exportMp3Btn');
    const exportWavBtn = document.getElementById('exportWavBtn');
    const exportSrtBtn = document.getElementById('exportSrtBtn');

    let srtData = [];
    let currentAudioUrl = null;
    let currentSrtUrl = null;

    // Export Logic
    exportMp3Btn.addEventListener('click', () => {
        if (!currentAudioUrl) return alert("Please generate audio first!");
        // We prompt download of whatever the source is, but user wants MP3 so we name it mp3
        // Note: Unless converted by backend, this might just be a wav with mp3 extension.
        // For edge-tts, it is natively MP3.
        const a = document.createElement('a');
        a.href = currentAudioUrl;
        a.download = 'tts_master_output.mp3';
        a.click();
    });

    exportWavBtn.addEventListener('click', () => {
        if (!currentAudioUrl) return alert("Please generate audio first!");
        const a = document.createElement('a');
        a.href = currentAudioUrl;
        a.download = 'tts_master_output.wav';
        a.click();
    });

    exportSrtBtn.addEventListener('click', () => {
        if (!currentSrtUrl) return alert("Please generate audio first!");
        const a = document.createElement('a');
        a.href = currentSrtUrl;
        a.download = 'tts_master_output.srt';
        a.click();
    });

    // Voice options configuration
    const config = {
      "models": {
        "kokoro": {
          "default_voice": "am_adam",
          "voices": [
            {"id": "am_adam", "name": "Adam (Deep Male)", "gender": "Male", "lang": "English (US)", "tags": ["Deep", "Narrator"]},
            {"id": "af_bella", "name": "Bella (Warm Female)", "gender": "Female", "lang": "English (US)", "tags": ["Warm", "Storyteller"]},
            {"id": "af_sarah", "name": "Sarah (Energetic Female)", "gender": "Female", "lang": "English (US)", "tags": ["Upbeat", "Shorts"]},
            {"id": "am_michael", "name": "Michael (Clear Male)", "gender": "Male", "lang": "English (US)", "tags": ["Professional"]},
            {"id": "bf_emma", "name": "Emma (Classy British)", "gender": "Female", "lang": "English (UK)", "tags": ["Smooth", "British"]}
          ]
        },
        "edge_tts": {
          "default_voice": "en-US-GuyNeural",
          "voices": [
            {"id": "en-US-GuyNeural", "name": "Guy (Classic Male)", "gender": "Male", "lang": "English (US)", "tags": ["Rich", "Famous"]},
            {"id": "en-US-JennyNeural", "name": "Jenny (Conversational)", "gender": "Female", "lang": "English (US)", "tags": ["Expressive", "Famous"]},
            {"id": "en-US-ChristopherNeural", "name": "Christopher (Storyteller)", "gender": "Male", "lang": "English (US)", "tags": ["Dramatic"]},
            {"id": "en-US-AnaNeural", "name": "Ana (Young Female)", "gender": "Female", "lang": "English (US)", "tags": ["Friendly"]}
          ]
        },
        "piper": {
          "default_voice": "en_US-ryan-high",
          "voices": [
            {"id": "en_US-lessac-high", "name": "Lessac (Audiobook)", "gender": "Female", "lang": "English (US)", "tags": ["Consistent"]},
            {"id": "en_US-ryan-high", "name": "Ryan (Clear Male)", "gender": "Male", "lang": "English (US)", "tags": ["Fast", "Stable"]},
            {"id": "en_US-joe-medium", "name": "Joe (Friendly)", "gender": "Male", "lang": "English (US)", "tags": ["Casual"]}
          ]
        },
        "styletts2": {
          "default_voice": "default",
          "voices": [
            {"id": "default", "name": "StyleTTS 2 Default", "gender": "Neutral", "lang": "English", "tags": ["Emotional", "Human-like"]}
          ]
        },
        "chattts": {
          "default_voice": "casual",
          "voices": [
            {"id": "casual", "name": "Casual Chat", "gender": "Neutral", "lang": "English", "tags": ["Podcast", "Natural"]}
          ]
        },
        "f5-tts": {
          "default_voice": "f5_default",
          "voices": [
            {"id": "f5_default", "name": "F5-TTS Voice", "gender": "Neutral", "lang": "Multi", "tags": ["Robust", "Clone"]}
          ]
        }
      }
    };

    function updateVoices() {
        const selectedModel = document.querySelector('input[name="model"]:checked').value;
        const modelData = config.models[selectedModel];
        
        voiceSelect.innerHTML = '';
        if (modelData && modelData.voices) {
            modelData.voices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.id;
                option.textContent = voice.name;
                
                if (voice.id === modelData.default_voice) {
                    option.selected = true;
                }
                
                voiceSelect.appendChild(option);
            });
        }
    }

    // Listen for model change
    modelRadios.forEach(radio => radio.addEventListener('change', updateVoices));
    // Initial population
    updateVoices();

    // Text Input logic
    textInput.addEventListener('input', () => {
        const text = textInput.value.trim();
        const words = text ? text.split(/\s+/).length : 0;
        wordCount.textContent = words.toLocaleString();
        
        // Assuming ~500 words per chunk
        chunkCount.textContent = Math.ceil(words / 500);
    });

    // Speed range
    speedInput.addEventListener('input', (e) => {
        speedVal.textContent = parseFloat(e.target.value).toFixed(1) + 'x';
    });

    // File Upload logic
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                textInput.value = e.target.result;
                textInput.dispatchEvent(new Event('input'));
            };
            reader.readAsText(file);
        }
    });

    // Play/Pause button
    playBtn.addEventListener('click', () => {
        wavesurfer.playPause();
    });

    wavesurfer.on('play', () => {
        playBtn.innerHTML = '<i class="fas fa-pause"></i>';
    });
    
    wavesurfer.on('pause', () => {
        playBtn.innerHTML = '<i class="fas fa-play ml-1"></i>';
    });

    wavesurfer.on('timeupdate', (currentTime) => {
        // Sync caption
        const currentCaption = srtData.find(sub => currentTime >= sub.start && currentTime <= sub.end);
        if (currentCaption) {
            captionDisplay.textContent = currentCaption.text;
        } else {
            captionDisplay.textContent = '';
        }
    });

    function parseSRT(srtString) {
        const regex = /(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n([\s\S]*?)(?=\n{2}|$)/g;
        let match;
        const result = [];
        
        function timeToSeconds(t) {
            const parts = t.split(':');
            const secParts = parts[2].split(',');
            return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(secParts[0]) + parseInt(secParts[1])/1000;
        }

        while ((match = regex.exec(srtString)) !== null) {
            result.push({
                index: match[1],
                start: timeToSeconds(match[2]),
                end: timeToSeconds(match[3]),
                text: match[4].trim()
            });
        }
        return result;
    }

    // Generate Request
    generateBtn.addEventListener('click', async () => {
        const text = textInput.value.trim();
        if (!text) return alert('Please enter some text');

        const originalBtnText = generateBtn.innerHTML;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> GENERATING...';
        generateBtn.disabled = true;

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    model: document.querySelector('input[name="model"]:checked').value,
                    voice: voiceSelect.value,
                    speed: parseFloat(speedInput.value)
                })
            });

            if (response.ok) {
                const data = await response.json();
                
                currentAudioUrl = data.audio_url;
                currentSrtUrl = data.srt_url;
                
                // Load Audio
                wavesurfer.load(data.audio_url);
                
                // Load SRT
                srtData = parseSRT(data.srt_content);
                srtOutput.innerHTML = '';
                
                srtData.forEach(sub => {
                    const div = document.createElement('div');
                    div.className = 'mb-3 p-2 hover:bg-gray-800 rounded cursor-pointer transition-colors';
                    div.innerHTML = `
                        <div class="text-xs text-highlight mb-1">[${formatTime(sub.start)} - ${formatTime(sub.end)}]</div>
                        <div class="text-white">${sub.text}</div>
                    `;
                    div.addEventListener('click', () => {
                        wavesurfer.seekTo(sub.start / wavesurfer.getDuration());
                        wavesurfer.play();
                    });
                    srtOutput.appendChild(div);
                });
            } else {
                alert('Generation failed.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred.');
        } finally {
            generateBtn.innerHTML = originalBtnText;
            generateBtn.disabled = false;
        }
    });

    function formatTime(seconds) {
        const date = new Date(seconds * 1000);
        return date.toISOString().substr(14, 5);
    }
});
