import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load frequency dictionaries
function loadFreq(fileName) {
  const filePath = path.join(__dirname, '..', 'server', 'frequency', fileName);
  if (!fs.existsSync(filePath)) return new Set();
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const words = new Set();
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts[0]) words.add(parts[0].toLowerCase());
  }
  return words;
}

const enDict = loadFreq('en_50k.txt');
const esDict = loadFreq('es_50k.txt');
const frDict = loadFreq('fr_50k.txt');
const deDict = loadFreq('de_50k.txt');
const itDict = loadFreq('it_50k.txt');
const ruDict = loadFreq('ru_50k.txt');
const ptDict = loadFreq('pt_50k.txt');

const allDicts = {
  en: enDict,
  es: esDict,
  fr: frDict,
  de: deDict,
  it: itDict,
  ru: ruDict,
  pt: ptDict
};

console.log('Dictionaries loaded:');
Object.entries(allDicts).forEach(([k, v]) => console.log(`  ${k}: ${v.size} words`));

// Check words in files
const gamingFile = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'ignoreLists', 'gaming.ts'), 'utf-8');
const techFile = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'ignoreLists', 'techBrands.ts'), 'utf-8');
const namesFile = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'ignoreLists', 'namesCities.ts'), 'utf-8');
const anglicismsFile = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'ignoreLists', 'anglicisms.ts'), 'utf-8');

function extractUniversal(content) {
  const match = content.match(/universal:\s*\[([\s\S]*?)\]/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map(s => s.replace(/["'\n\r\t]/g, '').trim().toLowerCase())
    .filter(Boolean);
}

const universalWords = [
  ...extractUniversal(gamingFile),
  ...extractUniversal(techFile),
  ...extractUniversal(namesFile),
  ...extractUniversal(anglicismsFile)
];

console.log(`\nChecking ${universalWords.length} universal words against all 7 dictionaries...`);
const collisions = [];
for (const word of universalWords) {
  const matchedLangs = [];
  for (const [lang, dict] of Object.entries(allDicts)) {
    if (dict.has(word)) {
      matchedLangs.push(lang);
    }
  }
  if (matchedLangs.length > 0) {
    collisions.push({ word, matchedLangs });
  }
}

console.log(`\nFOUND ${collisions.length} WORDS IN UNIVERSAL THAT ARE DICTIONARY WORDS IN REAL LANGUAGES:`);
collisions.forEach(c => {
  console.log(`- "${c.word}" exists in: ${c.matchedLangs.join(', ')}`);
});
