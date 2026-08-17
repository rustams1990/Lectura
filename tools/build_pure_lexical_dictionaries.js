/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Pure Lexical Multi-Language Dictionary Compiler
 * Uses true morphological/spelling dictionaries (Hunspell / SCOWL / LibreOffice)
 * that contain genuine vocabulary words (nouns, verbs, adjectives) and EXCLUDE
 * genuine first names (John, James, William, David, Carlos, Vladimir...).
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

const DICT_DIR = path.resolve('tools/dictionaries');
if (!fs.existsSync(DICT_DIR)) {
  fs.mkdirSync(DICT_DIR, { recursive: true });
}

// True lexical sources (Hunspell / Aspell / SCOWL dictionaries)
const SOURCES = [
  {
    lang: 'es',
    url: 'https://raw.githubusercontent.com/titoBouzout/Dictionaries/master/Spanish.dic',
    fallback: 'https://raw.githubusercontent.com/words/an-array-of-spanish-words/master/index.json'
  },
  {
    lang: 'en',
    url: 'https://raw.githubusercontent.com/titoBouzout/Dictionaries/master/English%20(American).dic'
  },
  {
    lang: 'fr',
    url: 'https://raw.githubusercontent.com/titoBouzout/Dictionaries/master/French.dic'
  },
  {
    lang: 'de',
    url: 'https://raw.githubusercontent.com/titoBouzout/Dictionaries/master/German.dic'
  },
  {
    lang: 'ru',
    url: 'https://raw.githubusercontent.com/titoBouzout/Dictionaries/master/Russian.dic'
  },
  {
    lang: 'it',
    url: 'https://raw.githubusercontent.com/titoBouzout/Dictionaries/master/Italian.dic'
  },
  {
    lang: 'pt',
    url: 'https://raw.githubusercontent.com/titoBouzout/Dictionaries/master/Portuguese%20(Brazilian).dic'
  }
];

// Names that are 100% genuine proper names and NEVER standard vocabulary words
// These should NEVER be in the dictionary wordlist.
const UNAMBIGUOUS_PURE_NAMES = new Set([
  'john', 'james', 'william', 'charles', 'george', 'david', 'thomas', 'robert', 'henry', 'arthur',
  'edward', 'albert', 'samuel', 'joseph', 'richard', 'harold', 'frederick', 'walter', 'louis', 'peter',
  'michael', 'daniel', 'matthew', 'anthony', 'donald', 'paul', 'markus', 'stephen', 'andrew', 'joshua',
  'kenneth', 'kevin', 'brian', 'timothy', 'ronald', 'jason', 'jeffrey', 'ryan', 'jacob', 'gary',
  'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon', 'benjamin', 'sam',
  'gregory', 'alexander', 'patrick', 'franklin', 'raymond', 'dennis', 'jerry', 'tyler', 'aaron', 'jose',
  'adam', 'nathan', 'douglas', 'zachary', 'peter', 'kyle', 'walter', 'ethan', 'jeremy', 'harold',
  'keith', 'christian', 'roger', 'noah', 'gerald', 'carl', 'terry', 'sean', 'austin', 'arthur',
  'lawrence', 'jesse', 'dylan', 'bryan', 'joe', 'jordan', 'billy', 'bruce', 'albert', 'willie',
  'gabriel', 'logan', 'alan', 'juan', 'wayne', 'roy', 'ralph', 'randy', 'eugene', 'vincent',
  'russell', 'louis', 'philip', 'bobby', 'johnny', 'bradley', 'lucas', 'carlos', 'alejandro',
  'mateo', 'santiago', 'sebastian', 'diego', 'nicolas', 'samuel', 'joaquin', 'tomas', 'matias',
  'luciano', 'emiliano', 'rodrigo', 'alonso', 'ignacio', 'gonzalo', 'rafael', 'fernando', 'javier',
  'manuel', 'enrique', 'alberto', 'eduardo', 'alvaro', 'guillermo', 'antonio', 'sergio', 'francisco',
  'miguel', 'jorge', 'luis', 'mario', 'pablo', 'raul', 'ruben', 'adrian', 'ivan', 'oscar',
  'vladimir', 'dmitri', 'dmitriy', 'sergei', 'sergey', 'alexei', 'aleksey', 'mikhail', 'andrei',
  'andrey', 'nikolai', 'nikolay', 'artem', 'artyom', 'maksim', 'maxim', 'igor', 'oleg', 'yuri',
  'yuriy', 'denis', 'pavel', 'anton', 'viktor', 'stanislav', 'vadim', 'ruslan', 'konstantin',
  'elizabeth', 'mary', 'jennifer', 'linda', 'barbara', 'susan', 'jessica', 'sarah', 'karen', 'nancy',
  'lisa', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly', 'emily', 'donna', 'michelle', 'dorothy',
  'carol', 'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura', 'cynthia', 'kathleen',
  'amy', 'shirley', 'angela', 'helen', 'anna', 'brenda', 'pamela', 'nicole', 'emma', 'samantha',
  'katherine', 'christine', 'debra', 'rachel', 'catherine', 'carolyn', 'janet', 'ruth', 'maria', 'heather',
  'diane', 'virginia', 'julie', 'joyce', 'victoria', 'olivia', 'kelly', 'christina', 'lauren', 'joan',
  'evelyn', 'judith', 'megan', 'cheryl', 'andrea', 'hannah', 'martha', 'jacqueline', 'frances', 'gloria',
  'ann', 'teresa', 'kathryn', 'sara', 'janice', 'jean', 'alice', 'madison', 'doris', 'abigail',
  'julia', 'judy', 'sophia', 'isabella', 'charlotte', 'amelia', 'harper', 'mia', 'evelyn', 'camila',
  'gianna', 'elena', 'claire', 'audrey', 'maya', 'naomi', 'aaliyah', 'gabriella', 'alice', 'sadie'
]);

// Real dictionary words that must ALWAYS be filtered out
const STRICT_VOCABULARY_BLACKLIST = new Set([
  'able', 'ace', 'art', 'baron', 'best', 'bird', 'blade', 'blessing', 'blue', 'bright', 'brown', 'buddy', 'busy',
  'candy', 'case', 'cash', 'chance', 'clay', 'clear', 'cliff', 'clover', 'cook', 'counsel', 'courage', 'cross', 'crystal',
  'daily', 'danger', 'dark', 'dawn', 'day', 'deal', 'dear', 'diamond', 'divine', 'dodge', 'dream', 'duke', 'dusty',
  'early', 'earth', 'east', 'easy', 'echo', 'edge', 'fancy', 'favor', 'flash', 'fleet', 'flint', 'fortune', 'fox',
  'frank', 'free', 'fresh', 'frost', 'gale', 'gardener', 'gem', 'gift', 'glory', 'gold', 'golden', 'grace', 'grand',
  'gray', 'grey', 'green', 'guide', 'gull', 'gunner', 'handy', 'harbor', 'hardy', 'harmony', 'haven', 'heart', 'heaven',
  'hero', 'hill', 'holly', 'holy', 'honest', 'honey', 'hope', 'hunter', 'ideal', 'iron', 'ivy', 'jewel', 'joy', 'judge',
  'july', 'june', 'just', 'justice', 'keen', 'king', 'knight', 'lake', 'lane', 'lark', 'lead', 'leaf', 'liberty', 'light',
  'lily', 'little', 'lively', 'lock', 'lord', 'love', 'loyal', 'lucky', 'magic', 'major', 'manly', 'march', 'mark',
  'mason', 'master', 'matrix', 'may', 'mayor', 'meadow', 'mercy', 'merit', 'miller', 'minor', 'mint', 'miracle',
  'modest', 'monday', 'money', 'moon', 'morning', 'moss', 'mount', 'noble', 'noon', 'north', 'novel', 'nurse', 'ocean',
  'olive', 'orange', 'page', 'palace', 'palm', 'park', 'parker', 'parson', 'pastor', 'patent', 'patience', 'peace',
  'peak', 'pearl', 'peer', 'penny', 'perfection', 'pilot', 'piper', 'plain', 'pleasant', 'plenty', 'poet', 'polar',
  'pope', 'porter', 'power', 'praise', 'prayer', 'prince', 'princess', 'prior', 'promise', 'proud', 'prudence', 'pure',
  'queen', 'quest', 'quick', 'rain', 'ranger', 'ray', 'reason', 'red', 'reed', 'reid', 'reign', 'remedy', 'rich',
  'rider', 'ridge', 'ring', 'river', 'robin', 'rock', 'rose', 'royal', 'ruby', 'ruler', 'runner', 'rush', 'rust',
  'sage', 'sailor', 'saint', 'sand', 'sandy', 'sargent', 'savior', 'scarlet', 'scout', 'seal', 'season', 'secret',
  'senior', 'serene', 'serenity', 'shade', 'shadow', 'sharp', 'shepherd', 'shield', 'shine', 'ship', 'shore', 'short',
  'silver', 'simple', 'singer', 'sky', 'smart', 'smile', 'smith', 'smoke', 'snow', 'soldier', 'sole', 'solitude',
  'song', 'soul', 'sound', 'south', 'spark', 'sparrow', 'spear', 'speed', 'spirit', 'spring', 'spur', 'square', 'star',
  'steel', 'steer', 'sterling', 'stone', 'storm', 'story', 'stout', 'stream', 'street', 'strong', 'sugar', 'summer',
  'sun', 'sunday', 'sunny', 'supreme', 'sweet', 'swift', 'sword', 'tailor', 'tale', 'talent', 'target', 'taylor', 'teal',
  'temperance', 'temple', 'tender', 'thistle', 'thorn', 'thunder', 'tide', 'tiger', 'timber', 'time', 'top', 'tower',
  'trace', 'track', 'trader', 'trail', 'treasure', 'tree', 'tribute', 'trinity', 'trip', 'triumph', 'true', 'trust',
  'truth', 'turner', 'twin', 'union', 'unity', 'vale', 'valley', 'valor', 'vanilla', 'velvet', 'venture', 'verse',
  'vessel', 'veteran', 'vibe', 'vicar', 'victor', 'victory', 'view', 'vigor', 'village', 'vintage', 'violet', 'virtue',
  'vision', 'voice', 'voyage', 'waif', 'walker', 'wall', 'war', 'ward', 'warden', 'warrior', 'watch', 'water', 'wave',
  'way', 'weaver', 'welcome', 'well', 'west', 'wheat', 'wheel', 'whisper', 'white', 'wild', 'will', 'willow', 'wind',
  'wine', 'wing', 'winner', 'winter', 'wisdom', 'wise', 'wish', 'wolf', 'wonder', 'wood', 'wool', 'word', 'worker',
  'world', 'worth', 'worthy', 'wren', 'wright', 'yard', 'year', 'yield', 'young', 'youth', 'zeal', 'zenith',
  'bill', 'gene', 'pat', 'sue', 'cat', 'don', 'guy', 'bob', 'dale', 'carol', 'daisy', 'foster', 'butler', 'cook',
  'abbot', 'monk', 'priest', 'clerk', 'essence', 'laurel', 'haven', 'destiny', 'heaven', 'flea', 'fly', 'bee', 'wasp', 'ant', 'beetle',
  'alma', 'almond', 'rosa', 'blanca', 'dolores', 'esperanza', 'sol', 'victoria', 'cruz', 'angel', 'flor', 'luz', 'mercedes', 'pilar', 'paz',
  'soledad', 'amparo', 'consuelo', 'marina', 'clara', 'dulce', 'gloria', 'gracia', 'reina', 'rocio', 'santos', 'serena',
  'valentin', 'socorro', 'remedios', 'milagros', 'nieves', 'asuncion', 'concepcion', 'encarnacion', 'inmaculada', 'trinidad',
  'camino', 'estrella', 'cielo', 'mar', 'rio', 'valle', 'monte', 'sierra', 'pena', 'castillo', 'torre', 'fuente', 'iglesia',
  'cruz', 'rey', 'conde', 'duque', 'caballero', 'escudero', 'pastor', 'vaquero', 'marinero', 'herrero', 'carpintero', 'zapatero',
  'molinero', 'panadero', 'carnicero', 'pescador', 'cazador', 'leñador', 'minero', 'tejedor', 'sastre', 'barbero', 'medico',
  'bello', 'hermoso', 'lindo', 'bueno', 'santo', 'justo', 'noble', 'franco', 'leal', 'fiel', 'bravo', 'fuerte', 'valiente',
  'grande', 'chico', 'pequeno', 'alto', 'bajo', 'gordo', 'flaco', 'rubio', 'moreno', 'castano', 'cano', 'calvo', 'tuerto',
  'berry', 'cherry', 'cinnamon', 'clove', 'coco', 'ginger', 'hazel', 'honey', 'jasmine', 'lemon', 'maple', 'nutmeg', 'peach',
  'pepper', 'plum', 'rosemary', 'saffron', 'sugar', 'sweet'
]);

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest, { encoding: 'utf-8' });
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function run() {
  console.log('🔄 Сборка чистых лексических словарей (Hunspell/Morphology)...');

  const masterSet = new Set(STRICT_VOCABULARY_BLACKLIST);

  for (const src of SOURCES) {
    const dest = path.join(DICT_DIR, `${src.lang}_hunspell.dic`);
    try {
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
        console.log(`⏳ Скачиваем ${src.lang.toUpperCase()} Hunspell словарь...`);
        await downloadFile(src.url, dest);
        console.log(`✅ ${src.lang.toUpperCase()} скачан`);
      }

      const content = fs.readFileSync(dest, 'utf-8');
      const lines = content.split(/\r?\n/);
      let count = 0;
      for (const line of lines) {
        // Hunspell format: "word/flags"
        const raw = line.split('/')[0].trim().toLowerCase();
        if (raw && raw.length > 1 && !/^\d+$/.test(raw)) {
          // If this token is an unambiguous pure name (like 'john', 'david', 'james'), DO NOT add it to dictionary blacklist!
          if (!UNAMBIGUOUS_PURE_NAMES.has(raw)) {
            masterSet.add(raw);
            count++;
          }
        }
      }
      console.log(`   + Добавлено ${count.toLocaleString()} чистых словарных слов для ${src.lang.toUpperCase()}`);
    } catch (e) {
      console.warn(`⚠️ Ошибка для ${src.lang}:`, e.message);
    }
  }

  // Remove any remaining unambiguous names that might have sneaked in
  UNAMBIGUOUS_PURE_NAMES.forEach(n => {
    if (!STRICT_VOCABULARY_BLACKLIST.has(n)) {
      masterSet.delete(n);
    }
  });

  const sortedWords = Array.from(masterSet).sort();
  const masterJsonPath = path.join(DICT_DIR, 'master_dictionary.json');
  fs.writeFileSync(masterJsonPath, JSON.stringify(sortedWords), 'utf-8');

  const masterJsPath = path.join(DICT_DIR, 'master_dictionary.js');
  fs.writeFileSync(masterJsPath, `window.OFFLINE_DICTIONARY_SET = new Set(${JSON.stringify(sortedWords)});`, 'utf-8');

  console.log('\n======================================================');
  console.log(`🎉 Чистая словарная база успешно скомпилирована!`);
  console.log(`📊 Всего уникальных словарных слов в базе: ${masterSet.size.toLocaleString()}`);
  console.log(`✅ Имена (John, James, William, David, Carlos...) РАЗРЕШЕНЫ как имена!`);
  console.log(`🛡️ Словарные слова (alma, almond, rose, will, may...) НАДЕЖНО ОТСЕКАЮТСЯ!`);
  console.log('======================================================\n');
}

run().catch(console.error);
