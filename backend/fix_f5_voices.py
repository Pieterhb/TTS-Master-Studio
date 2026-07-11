import re

filepath = 'c:/APPS MET GEMINI/45. TTS MODELS make voices harder/tts-caption-app/frontend/main_app.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# New clean f5_tts block
new_f5_block = '''    "f5_tts": {
      "default_voice": "adam_1",
      "voices": [
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
    }'''

# Find and replace the f5_tts block using regex
pattern = r'"f5_tts"\s*:\s*\{.*?\}\s*\}'
new_content = re.sub(pattern, new_f5_block.strip(), content, flags=re.DOTALL)

if new_content == content:
    print("ERROR: Pattern not found! No changes made.")
else:
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("SUCCESS: f5_tts voices updated cleanly!")
