const fs = require('fs');
let content = fs.readFileSync('src/components/ReaderPanel.tsx', 'utf8');

content = content.replace(
  'import { segmentSentenceTokens } from "../tokenizer";',
  'import { segmentSentenceTokens } from "../tokenizer";\nimport { useReaderPagination, TextSegment } from "../hooks/useReaderPagination";'
);

const parseTimestampStart = content.indexOf('function parseTimestampToSeconds');
const fontSizeMapStart = content.indexOf('const fontSizeMap = {');
if (parseTimestampStart !== -1 && fontSizeMapStart !== -1) {
  content = content.substring(0, parseTimestampStart) + content.substring(fontSizeMapStart);
}

const splitSentencesStart = content.indexOf('  // Helper to split paragraph text into individual sentences');
const activeSettingsStart = content.indexOf('  const activeSettings = useMemo<Required<ReaderSettings>>(() => {');
if (splitSentencesStart !== -1 && activeSettingsStart !== -1) {
  content = content.substring(0, splitSentencesStart) + content.substring(activeSettingsStart);
}

const pagesStart = content.indexOf('  // Compute pages based on segments list');
const activePhrasesStart = content.indexOf('  // Compute active saved multi-word phrases/idioms in active target language inside this text');

if (pagesStart !== -1 && activePhrasesStart !== -1) {
  const hookCall = `  const {
    segments,
    pages,
    currentPageIdx,
    setCurrentPageIdx,
    clampedPageIdx,
    activeSegmentsForPage,
    activeSegmentIndex,
    handleTouchStart,
    handleTouchEnd,
    hasTimestamps
  } = useReaderPagination({
    lesson,
    isCjk,
    pageSize: activeSettings.pageSize,
    currentYoutubeTime,
    activeWord,
    onWordClick
  });\n\n`;
  content = content.substring(0, pagesStart) + hookCall + content.substring(activePhrasesStart);
}

fs.writeFileSync('src/components/ReaderPanel.tsx', content);
console.log('Refactoring complete.');
