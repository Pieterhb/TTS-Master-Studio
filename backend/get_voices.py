import edge_tts
import asyncio

async def main():
    voices = await edge_tts.list_voices()
    en_voices = [x['ShortName'] for x in voices if x['Locale'].startswith('en')]
    print(", ".join(en_voices))

asyncio.run(main())
