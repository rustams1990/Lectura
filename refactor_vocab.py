import os
import re
import shutil

src_file = "src/components/VocabularyPractice.tsx"
out_dir = "src/components/practice"
os.makedirs(out_dir, exist_ok=True)

with open(src_file, "r", encoding="utf-8") as f:
    content = f.read()

# We won't parse React properly with Python regex for everything, but we can just split things up manually since I have context.
# Alternatively, I can just write the new files entirely. Let's do that.
