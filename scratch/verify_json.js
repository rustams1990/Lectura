import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDir = path.join(__dirname, '..', 'src', 'data', 'ignoreLists');

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.name.endsWith('.json')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const arr = JSON.parse(content);
      if (!Array.isArray(arr)) {
        console.error(`ERROR: ${fullPath} is not an array!`);
      }
      for (const item of arr) {
        if (typeof item !== 'string') {
          console.error(`ERROR in ${entry.name}: item is not string:`, item);
        }
        if (item.includes(' ')) {
          console.error(`ERROR in ${entry.name}: item has spaces: "${item}"`);
        }
      }
      console.log(`✓ ${path.relative(baseDir, fullPath)}: ${arr.length} valid single-token words`);
    }
  }
}

scanDir(baseDir);
