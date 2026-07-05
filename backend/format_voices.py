import edge_tts, asyncio
async def main():
    voices = await edge_tts.list_voices()
    en = [v for v in voices if v['Locale'].startswith('en-')]
    for v in en:
        gender = v['Gender']
        name = v["ShortName"].split("-")[2].replace("Neural","").replace("Multilingual","")
        loc = v["Locale"].split("-")[1]
        print(f'{{"id": "{v["ShortName"]}", "name": "{name} ({loc})", "gender": "{gender}", "lang": "English", "tags": []}},')
asyncio.run(main())
