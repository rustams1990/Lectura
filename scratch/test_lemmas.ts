import { getSuggestedLemmas } from "../src/morphology";

const testCases = [
  { word: "aprendemos", expected: "aprender" },
  { word: "aparece", expected: "aparecer" },
  { word: "ayúdanos", expected: "ayudar" },
  { word: "bésame", expected: "besar" },
  { word: "dámelo", expected: "dar" },
  { word: "durmiendo", expected: "dormir" },
  { word: "pido", expected: "pedir" },
  { word: "tendré", expected: "tener" },
  { word: "hecho", expected: "hacer" },
  { word: "conozco", expected: "conocer" },
  { word: "bueno", expected: "bono" }, // we should NOT suggest bono
  { word: "fiesta", expected: "festa" }, // we should NOT suggest festa
  { word: "cueva", expected: "cova" } // we should NOT suggest cova
];

console.log("=== RUNNING SPANISH LEMMATIZATION TESTS ===");
let passed = 0;
for (const tc of testCases) {
  const suggestions = getSuggestedLemmas(tc.word, "spanish");
  console.log(`Word: "${tc.word}" -> Suggestions:`, suggestions);
  
  if (tc.word === "bueno" || tc.word === "fiesta" || tc.word === "cueva") {
    // For these, we want to make sure they do NOT contain the incorrect stem-change reversion
    const hasBad = suggestions.includes(tc.expected);
    if (!hasBad) {
      console.log(`  [PASS] Successfully avoided suggesting "${tc.expected}" for "${tc.word}"`);
      passed++;
    } else {
      console.log(`  [FAIL] Incorrectly suggested "${tc.expected}" for "${tc.word}"`);
    }
  } else {
    const hasExpected = suggestions.includes(tc.expected);
    if (hasExpected) {
      console.log(`  [PASS] Found expected lemma "${tc.expected}"`);
      passed++;
    } else {
      console.log(`  [FAIL] Missing expected lemma "${tc.expected}"`);
    }
  }
}

console.log(`\nPassed: ${passed}/${testCases.length}`);
