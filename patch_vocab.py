import os

file_path = "src/components/practice/VocabularyPractice.tsx"
try:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
except UnicodeDecodeError:
    with open(file_path, "r", encoding="utf-16") as f:
        content = f.read()

# 1. Update Imports
content = content.replace(
    'import WordExplainer from "./WordExplainer";',
    'import WordExplainer from "../WordExplainer";\nimport FlashcardMode from "./FlashcardMode";\nimport SpellingMode from "./SpellingMode";'
)
content = content.replace(
    'import { VocabItem, WordStatus, Lesson, ReaderSettings } from "../types";',
    'import { VocabItem, WordStatus, Lesson, ReaderSettings } from "../../types";\nimport { calculateNextReview } from "../../utils/srsAlgorithm";'
)
content = content.replace(
    'import { safeJsonParse, getTtsAudioFromCache, saveTtsAudioToCache, getLanguageCode, getBCP47LanguageTag, getEffectiveTtsLocale, getLanguageNameWithDialect, safeLocalStorageSetItem } from "../utils";',
    'import { safeJsonParse, getTtsAudioFromCache, saveTtsAudioToCache, getLanguageCode, getBCP47LanguageTag, getEffectiveTtsLocale, getLanguageNameWithDialect, safeLocalStorageSetItem } from "../../utils";'
)
content = content.replace(
    'import { LANGUAGES_SUPPORTED } from "../data";',
    'import { LANGUAGES_SUPPORTED } from "../../data";'
)
content = content.replace(
    'Download, Settings } from "lucide-react";',
    'Download, Settings, BrainCircuit } from "lucide-react";'
)

# 2. Add handleSrsAnswer after handleMarkKnown
srs_logic = """  const handleMarkKnown = () => {
    if (!currentLq) return;

    // 1. Determine target next word before list changes
    const targetWord = learningList[(currentIndex + 1) % learningList.length]?.word || null;
    nextWordTargetRef.current = targetWord;

    onUpdateStatus(currentLq.word, "known", selectedPracticeLang);
    setIsFlipped(false);
  };

  const handleSrsAnswer = (quality: number) => {
    if (!currentLq || !onSaveVocab) return;
    
    const nextSrs = calculateNextReview(
      quality,
      currentLq.srsEaseFactor || 2.5,
      currentLq.srsInterval || 0,
      currentLq.srsRepetitions || 0
    );

    const updatedItem = {
      ...currentLq,
      srsNextReview: nextSrs.nextReviewDate,
      srsInterval: nextSrs.interval,
      srsEaseFactor: nextSrs.easeFactor,
      srsRepetitions: nextSrs.repetitions,
    };

    if (quality >= 3) {
      const targetWord = learningList[(currentIndex + 1) % learningList.length]?.word || null;
      nextWordTargetRef.current = targetWord;
    }

    onSaveVocab(updatedItem, selectedPracticeLang);
    setIsFlipped(false);
    
    if (quality < 3) {
      setCurrentIndex((prev) => (prev + 1) % learningList.length);
    }
  };"""

content = content.replace("""  const handleMarkKnown = () => {
    if (!currentLq) return;

    // 1. Determine target next word before list changes
    const targetWord = learningList[(currentIndex + 1) % learningList.length]?.word || null;
    nextWordTargetRef.current = targetWord;

    onUpdateStatus(currentLq.word, "known", selectedPracticeLang);
    setIsFlipped(false);
  };""", srs_logic)

# 3. Update deckTypeFilter
old_filter = """        if (deckTypeFilter === "learning") {
          const isActive = lq.status && ["1", "2", "3", "4", "5", "learning"].includes(lq.status);
          if (!isActive) return false;
          if (studyMode === "spelling" && (lq.lastSpelledCorrectly === true || lq.spellingExclude === true)) return false;
        }"""
new_filter = """        if (deckTypeFilter === "learning") {
          const isActive = lq.status && ["1", "2", "3", "4", "5", "learning"].includes(lq.status);
          if (!isActive) return false;
          
          if (studyMode !== "spelling") {
            const isDue = !lq.srsNextReview || lq.srsNextReview <= Date.now();
            if (!isDue) return false;
          } else {
            if (lq.lastSpelledCorrectly === true || lq.spellingExclude === true) return false;
          }
        }"""
content = content.replace(old_filter, new_filter)

# 4. Replace massive JSX block
start_marker = "{/* Main Flashcard wrapper */}"
end_marker = "      <div className=\"text-center space-y-4 pt-2\">"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    new_jsx = """      {/* Main Study wrapper */}
      {studyMode === "spelling" ? (
        <SpellingMode
          item={currentLq}
          isFlipped={isFlipped}
          setIsFlipped={setIsFlipped}
          playSpeech={() => playSpeech(currentLq.word)}
          playingSpeech={playingSpeech}
          onEditWord={() => setIsEditingWord(currentLq.word)}
          spellingInput={spellingInput}
          setSpellingInput={setSpellingInput}
          spellingStatus={spellingStatus}
          hasCheckedSpelling={hasCheckedSpelling}
          spellingInputRef={spellingInputRef}
          onCheckSpelling={checkSpelling}
          onNext={handleNext}
          onExclude={handleExcludeSpelling}
        />
      ) : (
        <FlashcardMode
          item={currentLq}
          isFlipped={isFlipped}
          setIsFlipped={setIsFlipped}
          playSpeech={() => playSpeech(currentLq.word)}
          playingSpeech={playingSpeech}
          onEditWord={() => setIsEditingWord(currentLq.word)}
          onAnswer={handleSrsAnswer}
          studyDirection={studyDirection}
        />
      )}

"""
    content = content[:start_idx] + new_jsx + content[end_idx:]
else:
    print("Could not find JSX markers")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patched successfully")
