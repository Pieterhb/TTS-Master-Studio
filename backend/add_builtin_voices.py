import importlib.util, os, shutil

p = importlib.util.find_spec('f5_tts').submodule_search_locations[0]
ref_dir = r"models\f5_tts\references"

# Copy the built-in English example voice
src_wav = os.path.join(p, 'infer', 'examples', 'basic', 'basic_ref_en.wav')
dst_wav = os.path.join(ref_dir, 'f5_builtin_female.wav')
shutil.copy2(src_wav, dst_wav)

# Write the exact reference text that matches it
with open(os.path.join(ref_dir, 'f5_builtin_female.txt'), 'w', encoding='utf-8') as f:
    f.write("Some call me nature, others call me mother nature.")

print(f"Copied: {src_wav} -> {dst_wav}")
print("Done! f5_builtin_female voice is ready.")
