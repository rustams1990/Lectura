const fs = require('fs');
let content = fs.readFileSync('src/components/ReaderPanel.tsx', 'utf8');

// Fix splitIntoSentences
content = content.replace(/splitIntoSentences\(([^,]+)\)/g, 'splitIntoSentences($1, isCjk)');

// Fix didUserNavigateRef
content = content.replace(/didUserNavigateRef\.current = true;\s*setCurrentPageIdx\(prev => Math\.max\(0, prev - 1\)\);\s*document\.getElementById\(`reader-top`\)\?\.scrollIntoView\(\{ behavior: "smooth" \}\);/g, 'navigateToPage(Math.max(0, clampedPageIdx - 1));');

content = content.replace(/didUserNavigateRef\.current = true;\s*setCurrentPageIdx\(prev => Math\.min\(pages\.length - 1, prev \+ 1\)\);\s*document\.getElementById\(`reader-top`\)\?\.scrollIntoView\(\{ behavior: "smooth" \}\);/g, 'navigateToPage(Math.min(pages.length - 1, clampedPageIdx + 1));');

content = content.replace(/didUserNavigateRef\.current = true;\s*setCurrentPageIdx\(([^)]+)\);\s*document\.getElementById\(`reader-top`\)\?\.scrollIntoView\(\{ behavior: "smooth" \}\);/g, 'navigateToPage($1);');

content = content.replace(/didUserNavigateRef\.current = true;\s*setCurrentPageIdx\(0\);\s*safeLocalStorageSetItem\(`vocab_progress_\$\{lesson\.id\}`,\s*"0"\);\s*document\.getElementById\(`reader-top`\)\?\.scrollIntoView\(\{ behavior: "smooth" \}\);/g, 'navigateToPage(0); safeLocalStorageSetItem(`vocab_progress_${lesson.id}`, "0");');

// Fix destructuring for navigateToPage
content = content.replace(/handleTouchEnd,/g, 'handleTouchEnd,\n    navigateToPage,');

fs.writeFileSync('src/components/ReaderPanel.tsx', content);
console.log('Fixed ReaderPanel');
