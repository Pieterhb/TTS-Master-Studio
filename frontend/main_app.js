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
    const volumeInput = document.getElementById('volume');
    const volumeVal = document.getElementById('volumeVal');
    const speedInput = document.getElementById('speed');
    const speedVal = document.getElementById('speedVal');
    const pitchInput = document.getElementById('pitch');
    const pitchVal = document.getElementById('pitchVal');
    const srtOutput = document.getElementById('srtOutput');
    const captionDisplay = document.getElementById('captionDisplay');
    const voiceSelect = document.getElementById('voiceSelect');
    const addFavBtn = document.getElementById('addFavBtn');
    const favoritesList = document.getElementById('favoritesList');
    const filterMaleBtn = document.getElementById('filterMaleBtn');
    const filterFemaleBtn = document.getElementById('filterFemaleBtn');
    const modelRadios = document.querySelectorAll('input[name="model"]');
    const exportMp3Btn = document.getElementById('exportMp3Btn');
    const exportWavBtn = document.getElementById('exportWavBtn');
    const exportSrtBtn = document.getElementById('exportSrtBtn');

    let srtData = [];
    let currentAudioUrl = null;
    let currentSrtUrl = null;

    // WAV Encoding function (32-bit IEEE Float for Lossless Studio Quality)
    function audioBufferToWav(buffer) {
        let numOfChan = buffer.numberOfChannels;
        let length = buffer.length * numOfChan * 4 + 46; // 4 bytes per sample, 46 byte header
        let bufferArr = new ArrayBuffer(length);
        let view = new DataView(bufferArr);
        let channels = [], i, offset = 0, pos = 0;

        function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
        function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }

        setUint32(0x46464952); // "RIFF"
        setUint32(length - 8); // file length - 8
        setUint32(0x45564157); // "WAVE"
        setUint32(0x20746d66); // "fmt " chunk
        setUint32(18); // length = 18 for IEEE Float
        setUint16(3); // IEEE Float (3)
        setUint16(numOfChan);
        setUint32(buffer.sampleRate);
        setUint32(buffer.sampleRate * 4 * numOfChan); // avg. bytes/sec
        setUint16(numOfChan * 4); // block-align
        setUint16(32); // 32-bit
        setUint16(0); // cbSize = 0
        
        setUint32(0x61746164); // "data" - chunk
        setUint32(length - pos - 4); // chunk length

        for(i = 0; i < numOfChan; i++) channels.push(buffer.getChannelData(i));

        while(pos < length) {
            for(i = 0; i < numOfChan; i++) {
                view.setFloat32(pos, channels[i][offset], true); 
                pos += 4;
            }
            offset++;
        }
        return new Blob([bufferArr], {type: "audio/wav"});
    }

    // MP3 Encoding function using lamejs
    function audioBufferToMp3(buffer) {
        let numOfChan = 2; // Force Stereo
        let sampleRate = buffer.sampleRate;
        let mp3encoder = new lamejs.Mp3Encoder(numOfChan, sampleRate, 128);
        let mp3Data = [];
        
        let channels = [];
        for(let i = 0; i < buffer.numberOfChannels; i++) {
            channels.push(buffer.getChannelData(i));
        }

        let sampleBlockSize = 1152;
        let left = new Int16Array(sampleBlockSize);
        let right = new Int16Array(sampleBlockSize);

        for (let i = 0; i < channels[0].length; i += sampleBlockSize) {
            let leftChunk = channels[0].subarray(i, i + sampleBlockSize);
            let rightChunk = (channels.length > 1) ? channels[1].subarray(i, i + sampleBlockSize) : leftChunk;
            
            for (let j = 0; j < leftChunk.length; j++) {
                let ls = Math.max(-1, Math.min(1, leftChunk[j]));
                let rs = Math.max(-1, Math.min(1, rightChunk[j]));
                left[j] = (0.5 + ls < 0 ? ls * 32768 : ls * 32767)|0;
                right[j] = (0.5 + rs < 0 ? rs * 32768 : rs * 32767)|0;
            }

            let mp3buf = mp3encoder.encodeBuffer(left.subarray(0, leftChunk.length), right.subarray(0, rightChunk.length));
            if (mp3buf.length > 0) mp3Data.push(new Int8Array(mp3buf));
        }
        
        let mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) mp3Data.push(new Int8Array(mp3buf));

        return new Blob(mp3Data, {type: 'audio/mp3'});
    }

    // Export Logic
    // Helper: direct download of a URL with a given filename
    function directDownload(url, filename, btn, originalHtml) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Downloading...';
        const a = document.createElement('a');
        // Add cache-buster so the browser fetches fresh and prompts download
        a.href = url + '?dl=' + Date.now();
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => { btn.innerHTML = originalHtml; }, 1500);
    }

    exportMp3Btn.addEventListener('click', () => {
        if (!currentAudioUrl) return alert("Please generate audio first!");
        const originalHtml = '<i class="fas fa-download mr-1"></i> MP3';
        // If the server produced an MP3 (edge_tts), download it directly — zero re-encoding loss.
        // If the server produced a WAV (piper/kokoro), fall back to re-encoding via lamejs.
        if (currentAudioUrl.endsWith('.mp3')) {
            directDownload(currentAudioUrl, 'tts_master_output.mp3', exportMp3Btn, originalHtml);
        } else {
            if (!wavesurfer.getDecodedData()) return alert("Please generate audio first!");
            exportMp3Btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Encoding...';
            setTimeout(() => {
                let blob = audioBufferToMp3(wavesurfer.getDecodedData());
                let url = URL.createObjectURL(blob);
                let a = document.createElement('a');
                a.href = url;
                a.download = 'tts_master_output.mp3';
                a.click();
                URL.revokeObjectURL(url);
                exportMp3Btn.innerHTML = originalHtml;
            }, 100);
        }
    });

    exportWavBtn.addEventListener('click', () => {
        if (!currentAudioUrl) return alert("Please generate audio first!");
        const originalHtml = '<i class="fas fa-download mr-1"></i> WAV';
        // If the server produced a WAV (piper/kokoro), download it directly — clean original.
        // If the server produced an MP3 (edge_tts), fall back to re-encoding from decoded buffer.
        if (currentAudioUrl.endsWith('.wav')) {
            directDownload(currentAudioUrl, 'tts_master_output.wav', exportWavBtn, originalHtml);
        } else {
            exportWavBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Decoding...';
            fetch(currentAudioUrl)
                .then(res => res.arrayBuffer())
                .then(buffer => {
                    // Force decoding at 24000Hz to bypass aggressive resampling low-pass filters in browser
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    const ctx = new AudioContext({ sampleRate: 24000 });
                    return ctx.decodeAudioData(buffer);
                })
                .then(decodedBuffer => {
                    exportWavBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Encoding...';
                    // Do not force stereo if mono is fine, but audioBufferToWav does it.
                    let blob = audioBufferToWav(decodedBuffer);
                    let url = URL.createObjectURL(blob);
                    let a = document.createElement('a');
                    a.href = url;
                    a.download = 'tts_master_output.wav';
                    a.click();
                    URL.revokeObjectURL(url);
                    exportWavBtn.innerHTML = originalHtml;
                })
                .catch(err => {
                    console.error("Error exporting WAV:", err);
                    alert("Error exporting WAV. See console.");
                    exportWavBtn.innerHTML = originalHtml;
                });
        }
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
          "default_voice": "bm_fable",
          "voices": [
            {"id": "bm_fable", "name": "Fable (British Explorer)", "gender": "Male", "lang": "English", "tags": ["Pulp Action", "Deep"]},
            {"id": "am_onyx", "name": "Onyx (Gritty Mercenary)", "gender": "Male", "lang": "English", "tags": ["Movie Trailer", "Action"]},
            {"id": "bm_george", "name": "George (Veteran Scholar)", "gender": "Male", "lang": "English", "tags": ["Campfire Legend", "Deep"]},
            {"id": "am_fenrir", "name": "Fenrir (The Beast Hunter)", "gender": "Male", "lang": "English", "tags": ["Intense", "Jungle"]},
            {"id": "am_adam", "name": "Adam (Classic Storyteller)", "gender": "Male", "lang": "English", "tags": ["Classic"]},
            {"id": "am_michael", "name": "Michael (1940s Radio Announcer)", "gender": "Male", "lang": "English", "tags": ["Punchy"]},
            {"id": "am_puck", "name": "Puck (Theatrical Rogue)", "gender": "Male", "lang": "English", "tags": ["Expressive", "Dialogue"]},
            {"id": "af_bella", "name": "Bella (Sultry Femme Fatale)", "gender": "Female", "lang": "English", "tags": ["Warm", "Mystery"]},
            {"id": "bf_emma", "name": "Emma (Classy Archeologist)", "gender": "Female", "lang": "English", "tags": ["British", "Explorer"]},
            {"id": "af_heart", "name": "Heart (Dramatic Female Lead)", "gender": "Female", "lang": "English", "tags": ["Cinematic", "Intense"]},
            {"id": "af_nicole", "name": "Nicole (Clear Female, US)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "af_sarah", "name": "Sarah (Energetic Female, US)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "af_sky", "name": "Sky (Casual Female, US)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "af", "name": "Default Female (US)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "bm_lewis", "name": "Lewis (Casual Male, UK)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "bf_isabella", "name": "Isabella (Smooth Female, UK)", "gender": "Female", "lang": "English", "tags": []}
          ]
        },
        "edge_tts": {
          "default_voice": "en-US-GuyNeural",
          "voices": [
            {"id": "en-US-GuyNeural", "name": "Guy (Passionate Narrator)", "gender": "Male", "lang": "English", "tags": ["Action", "Pulp"]},
            {"id": "en-US-ChristopherNeural", "name": "Christopher (Authoritative)", "gender": "Male", "lang": "English", "tags": ["Deep", "Noir"]},
            {"id": "en-US-SteffanNeural", "name": "Steffan (Gritty Detective)", "gender": "Male", "lang": "English", "tags": ["Rational", "Mystery"]},
            {"id": "en-US-AriaNeural", "name": "Aria (Confident Lead)", "gender": "Female", "lang": "English", "tags": ["Protagonist", "Strong"]},
            {"id": "en-AU-WilliamMultilingualNeural", "name": "William (AU)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-AU-NatashaNeural", "name": "Natasha (AU)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-CA-ClaraNeural", "name": "Clara (CA)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-CA-LiamNeural", "name": "Liam (CA)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-HK-YanNeural", "name": "Yan (HK)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-HK-SamNeural", "name": "Sam (HK)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-IN-NeerjaExpressiveNeural", "name": "NeerjaExpressive (IN)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-IN-NeerjaNeural", "name": "Neerja (IN)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-IN-PrabhatNeural", "name": "Prabhat (IN)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-IE-ConnorNeural", "name": "Connor (IE)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-IE-EmilyNeural", "name": "Emily (IE)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-KE-AsiliaNeural", "name": "Asilia (KE)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-KE-ChilembaNeural", "name": "Chilemba (KE)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-NZ-MitchellNeural", "name": "Mitchell (NZ)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-NZ-MollyNeural", "name": "Molly (NZ)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-NG-AbeoNeural", "name": "Abeo (NG)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-NG-EzinneNeural", "name": "Ezinne (NG)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-PH-JamesNeural", "name": "James (PH)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-PH-RosaNeural", "name": "Rosa (PH)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-US-AvaNeural", "name": "Ava (US)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-US-AndrewNeural", "name": "Andrew (US)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-US-EmmaNeural", "name": "Emma (US)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-US-BrianNeural", "name": "Brian (US)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-SG-LunaNeural", "name": "Luna (SG)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-SG-WayneNeural", "name": "Wayne (SG)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-ZA-LeahNeural", "name": "Leah (ZA)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-ZA-LukeNeural", "name": "Luke (ZA)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-TZ-ElimuNeural", "name": "Elimu (TZ)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-TZ-ImaniNeural", "name": "Imani (TZ)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-GB-LibbyNeural", "name": "Libby (GB)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-GB-MaisieNeural", "name": "Maisie (GB)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-GB-RyanNeural", "name": "Ryan (GB)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-GB-SoniaNeural", "name": "Sonia (GB)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-GB-ThomasNeural", "name": "Thomas (GB)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-US-AnaNeural", "name": "Ana (US)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-US-AndrewMultilingualNeural", "name": "Andrew (US)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-US-AriaNeural", "name": "Aria (US)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-US-AvaMultilingualNeural", "name": "Ava (US)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-US-BrianMultilingualNeural", "name": "Brian (US)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-US-ChristopherNeural", "name": "Christopher (US)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-US-EmmaMultilingualNeural", "name": "Emma (US)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-US-EricNeural", "name": "Eric (US)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-US-GuyNeural", "name": "Guy (US)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-US-JennyNeural", "name": "Jenny (US)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-US-MichelleNeural", "name": "Michelle (US)", "gender": "Female", "lang": "English", "tags": []},
            {"id": "en-US-RogerNeural", "name": "Roger (US)", "gender": "Male", "lang": "English", "tags": []},
            {"id": "en-US-SteffanNeural", "name": "Steffan (US)", "gender": "Male", "lang": "English", "tags": []}
          ]
        },
        "piper": {
          "default_voice": "en_US-ryan-high",
          "voices": [
            {"id": "en_US-lessac-high", "name": "Lessac (Audiobook)", "gender": "Female", "lang": "English (US)", "tags": ["Consistent"]},
            {"id": "en_US-ryan-high", "name": "Ryan (Clear Male)", "gender": "Male", "lang": "English (US)", "tags": ["Fast", "Stable"]},
            {"id": "en_US-joe-medium", "name": "Joe (Friendly)", "gender": "Male", "lang": "English (US)", "tags": ["Casual"]}
          ]
        }
      }
    };

    let currentGenderFilter = null;

    function updateVoices() {
        const selectedModel = document.querySelector('input[name="model"]:checked').value;
        const modelData = config.models[selectedModel];
        
        // Buttons are always visible now since we can encode both MP3 and WAV locally
        if (exportMp3Btn) exportMp3Btn.style.display = 'block';
        if (exportWavBtn) exportWavBtn.classList.remove('col-span-2');
        
        voiceSelect.innerHTML = '';
        if (modelData && modelData.voices) {
            let filteredVoices = modelData.voices;
            if (currentGenderFilter) {
                filteredVoices = filteredVoices.filter(v => v.gender === currentGenderFilter);
            }
            
            filteredVoices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.id;
                option.textContent = voice.name;
                
                if (voice.id === modelData.default_voice || (filteredVoices.length > 0 && voice.id === filteredVoices[0].id)) {
                    option.selected = true;
                }
                
                voiceSelect.appendChild(option);
            });
        }
        
        // Update button styles
        if (filterMaleBtn && filterFemaleBtn) {
            if (currentGenderFilter === 'Male') {
                filterMaleBtn.classList.add('bg-accent', 'text-white');
                filterFemaleBtn.classList.remove('bg-accent', 'text-white');
            } else if (currentGenderFilter === 'Female') {
                filterFemaleBtn.classList.add('bg-accent', 'text-white');
                filterMaleBtn.classList.remove('bg-accent', 'text-white');
            } else {
                filterMaleBtn.classList.remove('bg-accent', 'text-white');
                filterFemaleBtn.classList.remove('bg-accent', 'text-white');
            }
        }
    }

    if (filterMaleBtn && filterFemaleBtn) {
        filterMaleBtn.addEventListener('click', () => {
            currentGenderFilter = currentGenderFilter === 'Male' ? null : 'Male';
            updateVoices();
        });
        filterFemaleBtn.addEventListener('click', () => {
            currentGenderFilter = currentGenderFilter === 'Female' ? null : 'Female';
            updateVoices();
        });
    }

    // Listen for model change
    modelRadios.forEach(radio => radio.addEventListener('change', () => {
        currentGenderFilter = null; // Reset filter on model change
        updateVoices();
    }));
    // Initial population
    updateVoices();

    // Favorites Logic
    let favorites = JSON.parse(localStorage.getItem('tts_favorites')) || [];

    function renderFavorites() {
        if (!favoritesList) return;
        favoritesList.innerHTML = '';
        if (favorites.length === 0) {
            favoritesList.innerHTML = '<span class="text-gray-500 italic text-xs">No favorites yet. Click the star icon to add one!</span>';
            return;
        }
        
        favorites.forEach((fav, index) => {
            const span = document.createElement('span');
            span.className = 'bg-gray-800 px-2 py-1 rounded text-xs text-textSub cursor-pointer flex items-center gap-1 hover:bg-gray-700 transition-colors border border-gray-700 shadow-sm';
            
            const nameDiv = document.createElement('div');
            nameDiv.innerHTML = `<i class="fas fa-star text-yellow-500"></i> ${fav.name}`;
            nameDiv.onclick = () => {
                const radio = document.querySelector(`input[name="model"][value="${fav.model}"]`);
                if(radio) {
                    radio.checked = true;
                    updateVoices();
                    voiceSelect.value = fav.id;
                }
            };
            
            const removeIcon = document.createElement('i');
            removeIcon.className = 'fas fa-times ml-1 text-gray-500 hover:text-red-400';
            removeIcon.onclick = (e) => {
                e.stopPropagation();
                favorites.splice(index, 1);
                localStorage.setItem('tts_favorites', JSON.stringify(favorites));
                renderFavorites();
            };
            
            span.appendChild(nameDiv);
            span.appendChild(removeIcon);
            favoritesList.appendChild(span);
        });
    }

    renderFavorites();

    if(addFavBtn) {
        addFavBtn.addEventListener('click', () => {
            const selectedModel = document.querySelector('input[name="model"]:checked').value;
            const selectedVoiceId = voiceSelect.value;
            
            const voiceData = config.models[selectedModel].voices.find(v => v.id === selectedVoiceId);
            if(!voiceData) return;
            
            const shortName = voiceData.name.split(' (')[0];
            
            if (!favorites.find(f => f.id === selectedVoiceId && f.model === selectedModel)) {
                favorites.push({
                    model: selectedModel,
                    id: selectedVoiceId,
                    name: shortName
                });
                localStorage.setItem('tts_favorites', JSON.stringify(favorites));
                renderFavorites();
            }
        });
    }

    // Text Input logic
    textInput.addEventListener('input', () => {
        const text = textInput.value.trim();
        const words = text ? text.split(/\s+/).length : 0;
        wordCount.textContent = words.toLocaleString();
        
        // Assuming ~500 words per chunk
        chunkCount.textContent = Math.ceil(words / 500);
    });

    // Speed & Volume range
    if (speedInput) {
        speedInput.addEventListener('input', (e) => {
            speedVal.textContent = parseFloat(e.target.value).toFixed(1) + 'x';
        });
    }

    if (volumeInput) {
        volumeInput.addEventListener('input', (e) => {
            volumeVal.textContent = parseFloat(e.target.value).toFixed(1) + 'x';
        });
    }

    if (pitchInput) {
        pitchInput.addEventListener('input', (e) => {
            pitchVal.textContent = parseFloat(e.target.value).toFixed(1) + 'x';
        });
    }

    // File Upload logic
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => {
            fileInput.value = ''; // Reset to ensure 'change' fires even for the same file
            fileInput.click();
        });
        
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                textInput.value = text;
                textInput.dispatchEvent(new Event('input'));
            } catch (error) {
                console.error("Error reading file:", error);
                alert("Could not read the text file. Please try a different .txt file.");
            }
        });
    }

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

    wavesurfer.on('ready', () => {
        const duration = wavesurfer.getDuration();
        const h = Math.floor(duration / 3600);
        const m = Math.floor((duration % 3600) / 60);
        const s = Math.floor(duration % 60);
        const t = Math.floor((duration % 1) * 10);
        const audioLengthEl = document.getElementById('audioLength');
        if (audioLengthEl) {
            audioLengthEl.textContent = `(${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${t.toString().padStart(2, '0')})`;
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
                    speed: parseFloat(speedInput.value),
                    volume: parseFloat(volumeInput ? volumeInput.value : 1.0),
                    pitch: parseFloat(pitchInput ? pitchInput.value : 1.0)
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
