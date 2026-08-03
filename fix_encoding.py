import subprocess
import os

# Get the original file content from the commit before I broke it.
# The commit before the last one is HEAD~1
# The file was originally at src/components/VocabularyPractice.tsx
try:
    # Use raw bytes to avoid encoding issues
    result = subprocess.run(
        ["git", "show", "HEAD~1:src/components/VocabularyPractice.tsx"],
        capture_output=True,
        check=True
    )
    original_bytes = result.stdout
except subprocess.CalledProcessError as e:
    # If the file was already moved in HEAD~1, let's try the moved path
    result = subprocess.run(
        ["git", "show", "HEAD~1:src/components/practice/VocabularyPractice.tsx"],
        capture_output=True,
        check=True
    )
    original_bytes = result.stdout

# Write it as raw bytes to the new location
with open("src/components/practice/VocabularyPractice.tsx", "wb") as f:
    f.write(original_bytes)

print("Restored original UTF-8 file successfully.")
