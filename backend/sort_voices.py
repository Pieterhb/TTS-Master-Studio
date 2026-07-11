import json

filepath = 'c:/APPS MET GEMINI/45. TTS MODELS make voices harder/tts-caption-app/frontend/main_app.js'
with open(filepath, 'r', encoding='utf-8') as f:
    js_str = f.read()

start_idx = js_str.find('const config = {') + 15
end_idx = js_str.find('};', start_idx) + 1
config_json_str = js_str[start_idx:end_idx]

config = json.loads(config_json_str)

for model_name, model_data in config['models'].items():
    model_data['voices'].sort(key=lambda x: (0 if x['gender']=='Male' else 1, x['name']))

sorted_config_str = json.dumps(config, indent=2)

new_js_str = js_str[:start_idx] + sorted_config_str + js_str[end_idx:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_js_str)

print("Done sorting!")
