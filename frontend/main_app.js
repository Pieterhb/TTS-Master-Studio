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

    // Sandbox WaveSurfer instances — initialized lazily on first tab open
    // (WaveSurfer throws if container is display:none at creation time)
    let wavesurferDirected = null;
    let wavesurferBaseline = null;

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

    // Sandbox Elements
    const tabStandard = document.getElementById('tabStandard');
    const tabSandbox = document.getElementById('tabSandbox');
    const standardWorkspace = document.getElementById('standardWorkspace');
    const sandboxWorkspace = document.getElementById('sandboxWorkspace');
    const copyPromptBtn = document.getElementById('copyPromptBtn');
    const promptText = document.getElementById('promptText');
    const mapSpeakersBtn = document.getElementById('mapSpeakersBtn');
    const jsonInput = document.getElementById('jsonInput');
    const generateDirectedBtn = document.getElementById('generateDirectedBtn');
    const playDirectedBtn = document.getElementById('playDirectedBtn');
    const playBtnBaseline = document.getElementById('playBtnBaseline');
    const speakerModal = document.getElementById('speakerModal');
    const closeSpeakerModalBtn = document.getElementById('closeSpeakerModalBtn');
    const saveSpeakerModalBtn = document.getElementById('saveSpeakerModalBtn');
    const speakerMapContainer = document.getElementById('speakerMapContainer');

    let srtData = [];
    let currentAudioUrl = null;
    let currentSrtUrl = null;
    
    let directedAudioUrl = null;
    let speakerMapping = {}; // e.g. { "Narrator": "f5_builtin_female" }

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
        {
          "id": "am_adam",
          "name": "Adam (Classic Storyteller)",
          "gender": "Male",
          "lang": "English",
          "tags": [
            "Classic"
          ]
        },
        {
          "id": "bm_fable",
          "name": "Fable (British Explorer)",
          "gender": "Male",
          "lang": "English",
          "tags": [
            "Pulp Action",
            "Deep"
          ]
        },
        {
          "id": "am_fenrir",
          "name": "Fenrir (The Beast Hunter)",
          "gender": "Male",
          "lang": "English",
          "tags": [
            "Intense",
            "Jungle"
          ]
        },
        {
          "id": "bm_george",
          "name": "George (Veteran Scholar)",
          "gender": "Male",
          "lang": "English",
          "tags": [
            "Campfire Legend",
            "Deep"
          ]
        },
        {
          "id": "bm_lewis",
          "name": "Lewis (Casual Male, UK)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "am_michael",
          "name": "Michael (1940s Radio Announcer)",
          "gender": "Male",
          "lang": "English",
          "tags": [
            "Punchy"
          ]
        },
        {
          "id": "am_onyx",
          "name": "Onyx (Gritty Mercenary)",
          "gender": "Male",
          "lang": "English",
          "tags": [
            "Movie Trailer",
            "Action"
          ]
        },
        {
          "id": "am_puck",
          "name": "Puck (Theatrical Rogue)",
          "gender": "Male",
          "lang": "English",
          "tags": [
            "Expressive",
            "Dialogue"
          ]
        },
        {
          "id": "af_bella",
          "name": "Bella (Sultry Femme Fatale)",
          "gender": "Female",
          "lang": "English",
          "tags": [
            "Warm",
            "Mystery"
          ]
        },
        {
          "id": "af",
          "name": "Default Female (US)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "bf_emma",
          "name": "Emma (Classy Archeologist)",
          "gender": "Female",
          "lang": "English",
          "tags": [
            "British",
            "Explorer"
          ]
        },
        {
          "id": "af_heart",
          "name": "Heart (Dramatic Female Lead)",
          "gender": "Female",
          "lang": "English",
          "tags": [
            "Cinematic",
            "Intense"
          ]
        },
        {
          "id": "bf_isabella",
          "name": "Isabella (Smooth Female, UK)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "af_nicole",
          "name": "Nicole (Clear Female, US)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "af_sarah",
          "name": "Sarah (Energetic Female, US)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "af_sky",
          "name": "Sky (Casual Female, US)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        }
      ]
    },
    "edge_tts": {
      "default_voice": "en-US-GuyNeural",
      "voices": [
        {
          "id": "en-NG-AbeoNeural",
          "name": "Abeo (NG)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-AndrewNeural",
          "name": "Andrew (US)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-AndrewMultilingualNeural",
          "name": "Andrew (US)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-BrianNeural",
          "name": "Brian (US)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-BrianMultilingualNeural",
          "name": "Brian (US)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-KE-ChilembaNeural",
          "name": "Chilemba (KE)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-ChristopherNeural",
          "name": "Christopher (Authoritative)",
          "gender": "Male",
          "lang": "English",
          "tags": [
            "Deep",
            "Noir"
          ]
        },
        {
          "id": "en-US-ChristopherNeural",
          "name": "Christopher (US)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-IE-ConnorNeural",
          "name": "Connor (IE)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-TZ-ElimuNeural",
          "name": "Elimu (TZ)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-EricNeural",
          "name": "Eric (US)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-GuyNeural",
          "name": "Guy (Passionate Narrator)",
          "gender": "Male",
          "lang": "English",
          "tags": [
            "Action",
            "Pulp"
          ]
        },
        {
          "id": "en-US-GuyNeural",
          "name": "Guy (US)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-PH-JamesNeural",
          "name": "James (PH)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-CA-LiamNeural",
          "name": "Liam (CA)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-ZA-LukeNeural",
          "name": "Luke (ZA)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-NZ-MitchellNeural",
          "name": "Mitchell (NZ)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-IN-PrabhatNeural",
          "name": "Prabhat (IN)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-RogerNeural",
          "name": "Roger (US)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-GB-RyanNeural",
          "name": "Ryan (GB)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-HK-SamNeural",
          "name": "Sam (HK)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-SteffanNeural",
          "name": "Steffan (Gritty Detective)",
          "gender": "Male",
          "lang": "English",
          "tags": [
            "Rational",
            "Mystery"
          ]
        },
        {
          "id": "en-US-SteffanNeural",
          "name": "Steffan (US)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-GB-ThomasNeural",
          "name": "Thomas (GB)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-SG-WayneNeural",
          "name": "Wayne (SG)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-AU-WilliamMultilingualNeural",
          "name": "William (AU)",
          "gender": "Male",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-AnaNeural",
          "name": "Ana (US)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-AriaNeural",
          "name": "Aria (Confident Lead)",
          "gender": "Female",
          "lang": "English",
          "tags": [
            "Protagonist",
            "Strong"
          ]
        },
        {
          "id": "en-US-AriaNeural",
          "name": "Aria (US)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-KE-AsiliaNeural",
          "name": "Asilia (KE)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-AvaNeural",
          "name": "Ava (US)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-AvaMultilingualNeural",
          "name": "Ava (US)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-CA-ClaraNeural",
          "name": "Clara (CA)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-IE-EmilyNeural",
          "name": "Emily (IE)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-EmmaNeural",
          "name": "Emma (US)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-EmmaMultilingualNeural",
          "name": "Emma (US)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-NG-EzinneNeural",
          "name": "Ezinne (NG)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-TZ-ImaniNeural",
          "name": "Imani (TZ)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-JennyNeural",
          "name": "Jenny (US)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-ZA-LeahNeural",
          "name": "Leah (ZA)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-GB-LibbyNeural",
          "name": "Libby (GB)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-SG-LunaNeural",
          "name": "Luna (SG)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-GB-MaisieNeural",
          "name": "Maisie (GB)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-US-MichelleNeural",
          "name": "Michelle (US)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-NZ-MollyNeural",
          "name": "Molly (NZ)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-AU-NatashaNeural",
          "name": "Natasha (AU)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-IN-NeerjaNeural",
          "name": "Neerja (IN)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-IN-NeerjaExpressiveNeural",
          "name": "NeerjaExpressive (IN)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-PH-RosaNeural",
          "name": "Rosa (PH)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-GB-SoniaNeural",
          "name": "Sonia (GB)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        },
        {
          "id": "en-HK-YanNeural",
          "name": "Yan (HK)",
          "gender": "Female",
          "lang": "English",
          "tags": []
        }
      ]
    },
    "f5_tts": {
      "default_voice": "f5_builtin_female",
      "voices": [
        {"id": "f5_builtin_female", "name": "★ F5 Built-in Female (Reference)", "gender": "Female", "lang": "English", "tags": ["Built-in"]},
        {"id": "adam_1", "name": "Adam 1 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "adam_2", "name": "Adam 2 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "adam_3", "name": "Adam 3 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "adam_4", "name": "Adam 4 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "adam_5", "name": "Adam 5 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "adam_6", "name": "Adam 6 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "austin", "name": "Austin F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "bill", "name": "Bill F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "brian_1", "name": "Brian 1 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "brian_2", "name": "Brian 2 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "callum", "name": "Callum F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "carter", "name": "Carter F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "daniel", "name": "Daniel F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "darian", "name": "Darian F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "david_1", "name": "David 1 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "david_2", "name": "David 2 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "david_3", "name": "David 3 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "david_4", "name": "David 4 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "david_5", "name": "David 5 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "david_6", "name": "David 6 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "declan_1", "name": "Declan 1 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "declan_2", "name": "Declan 2 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "deep_ray", "name": "Deep Ray F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "edward", "name": "Edward F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "george", "name": "George F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "hank", "name": "Hank F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "henry", "name": "Henry F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "james", "name": "James F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "jayce_1", "name": "Jayce 1 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "jayce_2", "name": "Jayce 2 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "john", "name": "John F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "liam", "name": "Liam F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "michael_1", "name": "Michael 1 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "michael_2", "name": "Michael 2 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "nathan", "name": "Nathan F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "pharaoh", "name": "Pharaoh F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "roger", "name": "Roger F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "thomas", "name": "Thomas F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "titan", "name": "Titan F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "victor", "name": "Victor F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "william_1", "name": "William 1 F", "gender": "Male", "lang": "English", "tags": ["Clone"]},
        {"id": "william_2", "name": "William 2 F", "gender": "Male", "lang": "English", "tags": ["Clone"]}
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

    // --- SANDBOX LOGIC ---

    // Tab Switching
    tabStandard.addEventListener('click', () => {
        tabStandard.classList.remove('border-transparent', 'text-gray-400');
        tabStandard.classList.add('border-accent', 'text-accent');
        tabSandbox.classList.remove('border-yellow-500', 'text-yellow-500');
        tabSandbox.classList.add('border-transparent', 'text-gray-400');
        standardWorkspace.classList.remove('hidden');
        standardWorkspace.classList.add('flex');
        sandboxWorkspace.classList.add('hidden');
        sandboxWorkspace.classList.remove('flex');
    });

    tabSandbox.addEventListener('click', () => {
        tabSandbox.classList.remove('border-transparent', 'text-gray-400');
        tabSandbox.classList.add('border-yellow-500', 'text-yellow-500');
        tabStandard.classList.remove('border-accent', 'text-accent');
        tabStandard.classList.add('border-transparent', 'text-gray-400');
        sandboxWorkspace.classList.remove('hidden');
        sandboxWorkspace.classList.add('flex');
        standardWorkspace.classList.add('hidden');
        standardWorkspace.classList.remove('flex');

        // Lazy-init sandbox WaveSurfers now that containers are visible
        if (!wavesurferDirected) {
            wavesurferDirected = WaveSurfer.create({
                container: '#waveformDirected',
                waveColor: '#713f12',
                progressColor: '#ca8a04',
                cursorColor: '#facc15',
                barWidth: 2, barRadius: 3, cursorWidth: 1, height: 60, barGap: 3
            });
            wavesurferDirected.on('finish', () => { playDirectedBtn.innerHTML = '<i class="fas fa-play ml-1"></i>'; });
            wavesurferDirected.on('ready', () => {
                const d = wavesurferDirected.getDuration();
                const el = document.getElementById('directedAudioLength');
                if (el) el.textContent = `(${Math.floor(d/3600).toString().padStart(2,'0')}:${Math.floor((d%3600)/60).toString().padStart(2,'0')}:${Math.floor(d%60).toString().padStart(2,'0')})`;
            });
        }
        if (!wavesurferBaseline) {
            wavesurferBaseline = WaveSurfer.create({
                container: '#waveformBaseline',
                waveColor: '#1e3a5f',
                progressColor: '#3B82F6',
                cursorColor: '#60a5fa',
                barWidth: 2, barRadius: 3, cursorWidth: 1, height: 60, barGap: 3
            });
            wavesurferBaseline.on('finish', () => { playBtnBaseline.innerHTML = '<i class="fas fa-play ml-1"></i>'; });
            wavesurferBaseline.on('ready', () => {
                const d = wavesurferBaseline.getDuration();
                const el = document.getElementById('baselineAudioLength');
                if (el) el.textContent = `(${Math.floor(d/3600).toString().padStart(2,'0')}:${Math.floor((d%3600)/60).toString().padStart(2,'0')}:${Math.floor(d%60).toString().padStart(2,'0')})`;
            });
        }
    });

    // Copy Prompt
    copyPromptBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(promptText.value);
        const originalText = copyPromptBtn.innerHTML;
        copyPromptBtn.innerHTML = '<i class="fas fa-check mr-1"></i> Copied!';
        copyPromptBtn.classList.replace('bg-gray-700', 'bg-green-600');
        setTimeout(() => {
            copyPromptBtn.innerHTML = originalText;
            copyPromptBtn.classList.replace('bg-green-600', 'bg-gray-700');
        }, 2000);
    });

    // Speaker Mapping Modal
    mapSpeakersBtn.addEventListener('click', () => {
        try {
            const jsonStr = jsonInput.value.trim();
            if (!jsonStr) return alert("Please paste the JSON first.");
            
            // Clean up backticks if they pasted a markdown block
            const cleanStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(cleanStr);
            
            // Extract unique speakers
            const speakers = [...new Set(data.map(item => item.speaker))];
            
            speakerMapContainer.innerHTML = '';
            
            const f5Voices = config.models.f5_tts.voices;
            
            speakers.forEach(speaker => {
                const row = document.createElement('div');
                row.className = 'flex justify-between items-center bg-gray-800 p-3 rounded';
                
                // Try to find a match
                let defaultMatch = "f5_builtin_female";
                const potentialMatch = f5Voices.find(v => v.id.toLowerCase().includes(speaker.toLowerCase().replace(/\s+/g, '_')) || v.name.toLowerCase().includes(speaker.toLowerCase()));
                if(potentialMatch) defaultMatch = potentialMatch.id;
                
                // If previously mapped, use that
                if (speakerMapping[speaker]) {
                    defaultMatch = speakerMapping[speaker];
                }

                let optionsHtml = f5Voices.map(v => `<option value="${v.id}" ${v.id === defaultMatch ? 'selected' : ''}>${v.name}</option>`).join('');

                row.innerHTML = `
                    <span class="font-bold text-gray-300 w-1/3 truncate" title="${speaker}">${speaker}</span>
                    <i class="fas fa-arrow-right text-gray-600 mx-2"></i>
                    <select class="speaker-select w-2/3 bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:outline-none focus:border-accent" data-speaker="${speaker}">
                        ${optionsHtml}
                    </select>
                `;
                speakerMapContainer.appendChild(row);
            });
            
            speakerModal.classList.remove('hidden');
        } catch (e) {
            alert("Invalid JSON format. Please ensure you copied only the JSON array.");
            console.error(e);
        }
    });

    closeSpeakerModalBtn.addEventListener('click', () => {
        speakerModal.classList.add('hidden');
    });

    saveSpeakerModalBtn.addEventListener('click', () => {
        const selects = document.querySelectorAll('.speaker-select');
        selects.forEach(select => {
            const speaker = select.getAttribute('data-speaker');
            speakerMapping[speaker] = select.value;
        });
        speakerModal.classList.add('hidden');
        alert("Speaker mappings saved!");
    });

    // Generate & Compare — one button fires BOTH baseline and directed simultaneously
    generateDirectedBtn.addEventListener('click', async () => {
        const jsonStr = jsonInput.value.trim();
        if (!jsonStr) return alert('Please paste the JSON first.');

        let data;
        try {
            const cleanStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
            data = JSON.parse(cleanStr);
        } catch (e) {
            return alert("Invalid JSON format.");
        }

        // Reconstruct full clean text for baseline (no emphasis mutations)
        const fullText = data.map(seg => seg.text).join(' ');

        // Voice for baseline: Narrator mapping → first mapping → built-in fallback
        const narratorVoice = speakerMapping['Narrator']
            || Object.values(speakerMapping)[0]
            || 'f5_builtin_female';

        const originalBtnText = generateDirectedBtn.innerHTML;
        generateDirectedBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> GENERATING BASELINE + DIRECTED...';
        generateDirectedBtn.disabled = true;

        try {
            // ── Step 1: Directed (multi-segment, longer job) ──────────────────
            generateDirectedBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Step 1/2: Generating Directed Audio...';
            const directedRes = await fetch('/api/generate_directed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ segments: data, speaker_mapping: speakerMapping })
            });

            if (directedRes.ok) {
                const dd = await directedRes.json();
                directedAudioUrl = dd.audio_url;
                wavesurferDirected.load(dd.audio_url + '?t=' + Date.now());
                playDirectedBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                // Activate download button
                const dlDir = document.getElementById('downloadDirectedBtn');
                dlDir.href = dd.audio_url;
                dlDir.classList.remove('opacity-50', 'pointer-events-none');
            } else {
                alert('Directed generation failed.');
            }

            // ── Step 2: Baseline (single-pass, same voice, no preprocessing) ──
            generateDirectedBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Step 2/2: Generating Baseline Audio...';
            const baselineRes = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: fullText, model: 'f5_tts', voice: narratorVoice, speed: 1.0, volume: 1.0, pitch: 1.0 })
            });

            if (baselineRes.ok) {
                const bd = await baselineRes.json();
                currentAudioUrl = bd.audio_url;
                wavesurferBaseline.load(bd.audio_url + '?t=' + Date.now());
                playBtnBaseline.classList.remove('opacity-50', 'cursor-not-allowed');
                // Activate download button
                const dlBase = document.getElementById('downloadBaselineBtn');
                dlBase.href = bd.audio_url;
                dlBase.classList.remove('opacity-50', 'pointer-events-none');
            } else {
                alert('Baseline generation failed.');
            }

        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred during generation.');
        } finally {
            generateDirectedBtn.innerHTML = originalBtnText;
            generateDirectedBtn.disabled = false;
        }
    });

    playDirectedBtn.addEventListener('click', () => {
        if (!directedAudioUrl || !wavesurferDirected) return;
        if (wavesurferDirected.isPlaying()) {
            wavesurferDirected.pause();
            playDirectedBtn.innerHTML = '<i class="fas fa-play ml-1"></i>';
        } else {
            wavesurferDirected.play();
            playDirectedBtn.innerHTML = '<i class="fas fa-pause"></i>';
        }
    });

    playBtnBaseline.addEventListener('click', () => {
        if (!currentAudioUrl || !wavesurferBaseline) return;
        if (wavesurferBaseline.isPlaying()) {
            wavesurferBaseline.pause();
            playBtnBaseline.innerHTML = '<i class="fas fa-play ml-1"></i>';
        } else {
            wavesurferBaseline.play();
            playBtnBaseline.innerHTML = '<i class="fas fa-pause"></i>';
        }
    });

});

