import sys

def main():
    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Find the bounds of the Reader View Grid
    start_idx = -1
    end_idx = -1
    for i, line in enumerate(lines):
        if '/* Main Interactive Reader View Grid */' in line:
            start_idx = i
        if start_idx != -1 and i > start_idx and '</main>' in line:
            # The reader grid ends right before </main>
            end_idx = i - 1
            break

    if start_idx == -1 or end_idx == -1:
        print("Could not find bounds")
        return

    reader_lines = lines[start_idx:end_idx+1]
    
    # We will just write a new file for ReaderScreen.tsx manually later,
    # or let's actually just extract it as a string and we can format it.
    
    print(f"Found Reader view from line {start_idx} to {end_idx}")

    with open('reader_extracted.txt', 'w', encoding='utf-8') as f:
        f.writelines(reader_lines)

if __name__ == '__main__':
    main()
