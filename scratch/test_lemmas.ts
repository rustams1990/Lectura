import { getSuggestedLemmas } from "../src/morphology";

const testCases = [
  { word: "aprendemos", expected: "aprender", excluded: ["aprendemo"] }, // wait, 'aprendemo' was regular noun plural guess, which is fine, but let's see. Actually, let's keep it.
  { word: "aparece", expected: "aparecer" },
  { word: "ayúdanos", expected: "ayudar", excluded: ["ayuder", "ayudir", "ayodar", "ayoder", "ayodir", "ayúdar", "ayúder", "ayúdir"] },
  { word: "bésame", expected: "besar", excluded: ["bésamar", "beser", "besir", "bésar", "béser", "bésir"] },
  { word: "dámelo", expected: "dar" },
  { word: "durmiendo", expected: "dormir", excluded: ["durmer", "durmir", "dormer"] }, // dormer is not a word
  { word: "pido", expected: "pedir", excluded: ["pidar", "pider", "pidir", "pedar", "peder"] },
  { word: "tendré", expected: "tener", excluded: ["tendrar"] },
  { word: "hecho", expected: "hacer" },
  { word: "conozco", expected: "conocer", excluded: ["conocir"] },
  { word: "caigas", expected: "caer", excluded: ["caigar"] },
  { word: "caras", expected: "cara", excluded: ["carar", "carer", "carir"] },
  { word: "cantas", expected: "cantar" },
  { word: "compartirlos", expected: "compartir" },
  { word: "comerse", expected: "comer" },
  { word: "discúlpeme", expected: "disculpar" },
  { word: "búsqueme", expected: "buscar", excluded: ["busquer", "busquir", "busquar"] },
  { word: "imaginaba", expected: "imaginar" },
  { word: "interrumpiendo", expected: "interrumpir" },
  { word: "sonrío", expected: "sonreír", excluded: ["sonriar", "sonrier", "sonrir"] },
  { word: "atiendo", expected: "atender", excluded: ["ater", "atir"] },
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
    const hasAnyExcluded = tc.excluded ? tc.excluded.some(ex => suggestions.includes(ex)) : false;
    
    if (hasExpected && !hasAnyExcluded) {
      console.log(`  [PASS] Found expected lemma "${tc.expected}" and avoided excluded ones`);
      passed++;
    } else {
      if (!hasExpected) {
        console.log(`  [FAIL] Missing expected lemma "${tc.expected}"`);
      }
      if (hasAnyExcluded) {
        const foundExcluded = tc.excluded?.filter(ex => suggestions.includes(ex));
        console.log(`  [FAIL] Incorrectly included excluded lemmas:`, foundExcluded);
      }
    }
  }
}

console.log(`\nPassed: ${passed}/${testCases.length}`);

