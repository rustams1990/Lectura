import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadFreqWords(fileName, limit = 50000) {
  const filePath = path.join(__dirname, '..', 'server', 'frequency', fileName);
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const words = [];
  for (let i = 0; i < Math.min(lines.length, limit); i++) {
    const line = lines[i];
    const parts = line.trim().split(/\s+/);
    if (parts[0]) words.push(parts[0].toLowerCase());
  }
  return words;
}

const en50k = new Set(loadFreqWords('en_50k.txt'));
const es50k = new Set(loadFreqWords('es_50k.txt'));
const fr50k = new Set(loadFreqWords('fr_50k.txt'));
const de50k = new Set(loadFreqWords('de_50k.txt'));
const it50k = new Set(loadFreqWords('it_50k.txt'));
const ru50k = new Set(loadFreqWords('ru_50k.txt'));
const pt50k = new Set(loadFreqWords('pt_50k.txt'));

// Now check if a word is in the target language dictionary
console.log('Testing specific words:');
console.log('apple in en:', en50k.has('apple'), 'in es:', es50k.has('apple'));
console.log('zoom in en:', en50k.has('zoom'), 'in es:', es50k.has('zoom'));
console.log('nice in en:', en50k.has('nice'), 'in es:', es50k.has('nice'));
console.log('celeste in es:', es50k.has('celeste'), 'in en:', en50k.has('celeste'));
console.log('rosa in es:', es50k.has('rosa'), 'in en:', en50k.has('rosa'));
console.log('gameplay in es:', es50k.has('gameplay'), 'in en:', en50k.has('gameplay'));
console.log('nintendo in es:', es50k.has('nintendo'));
