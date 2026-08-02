import sys

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import ReaderScreen
if 'import ReaderScreen' not in content:
    content = content.replace('import React', 'import ReaderScreen from "./components/ReaderScreen";\nimport React', 1)

# Find the start and end of the block
start_marker = "/* Main Interactive Reader View Grid */"
end_marker = "</main>"

start_idx = content.find(start_marker)
if start_idx == -1:
    print("Could not find start marker")
    sys.exit(1)

# Wait, the end of the reader block is right before </main>
end_idx = content.find(end_marker, start_idx)

if end_idx == -1:
    print("Could not find end marker")
    sys.exit(1)

reader_component = """/* Main Interactive Reader View Grid */
          <ReaderScreen
            activeLesson={activeLesson}
            activeLessonImagesMap={activeLessonImagesMap}
            readerSettings={readerSettings}
            setReaderSettings={setReaderSettings}
            handleAudioUploaded={handleAudioUploaded}
            handleListeningTick={handleListeningTick}
            handleMediaEnded={handleMediaEnded}
            setEditingLesson={setEditingLesson}
            history={history}
            handleUpdateHistory={handleUpdateHistory}
            selectedWord={selectedWord}
            setSelectedWord={setSelectedWord}
            selectedContext={selectedContext}
            activeVocabItem={activeVocabItem}
            wordLinks={wordLinks}
            vocab={vocab}
            handleSaveVocabItem={handleSaveVocabItem}
            handleDeleteVocabItem={handleDeleteVocabItem}
            handleSaveWordLink={handleSaveWordLink}
            handleDeleteWordLink={handleDeleteWordLink}
            handleWordClick={handleWordClick}
            handleOpenLesson={handleOpenLesson}
            lessons={lessons}
            currentReaderTheme={currentReaderTheme}
            handleDetectIdioms={handleDetectIdioms}
            isDetectingIdioms={isDetectingIdioms}
          />
      """

new_content = content[:start_idx] + reader_component + content[end_idx:]

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Replaced Reader View Grid with <ReaderScreen />")
