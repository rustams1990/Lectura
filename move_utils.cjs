const fs = require('fs');

// 1. App.tsx
let appContent = fs.readFileSync('src/App.tsx', 'utf8');

const utilsBlockRegex = /function migrateLocalStorage\(\) \{[\s\S]*?const isLocalHostname = \(\): boolean => \{[\s\S]*?\};\n/;
const match = appContent.match(utilsBlockRegex);
if (!match) {
  console.log("Could not find utils block in App.tsx!");
} else {
  let utilsCode = match[0];
  // Replace the block in App.tsx with empty string
  appContent = appContent.replace(utilsBlockRegex, '');
  
  // Also we need to make sure we import these from utils.ts.
  // safeParse is used. isLocalHostname is used. migrateLocalStorage is called inside App.tsx?
  // Wait, in App.tsx `migrateLocalStorage();` is called RIGHT AFTER its declaration:
  const migrateCallRegex = /migrateLocalStorage\(\);\n/;
  if (migrateCallRegex.test(appContent)) {
    appContent = appContent.replace(migrateCallRegex, '');
    utilsCode += 'migrateLocalStorage();\n'; // we keep it calling itself upon import in utils.ts
  }
  
  appContent = appContent.replace(
    'import { safeJsonParse, safeLocalStorageSetItem',
    'import { safeJsonParse, safeLocalStorageSetItem, safeParse, normalizeLanguagePrefixedKey, isLocalHostname'
  );
  
  fs.writeFileSync('src/App.tsx', appContent);
  
  // 2. utils.ts
  // modify utilsCode to export functions
  utilsCode = utilsCode.replace('function migrateLocalStorage()', 'export function migrateLocalStorage()');
  utilsCode = utilsCode.replace('function safeParse<T>', 'export function safeParse<T>');
  utilsCode = utilsCode.replace('function normalizeLanguagePrefixedKey(', 'export function normalizeLanguagePrefixedKey(');
  utilsCode = utilsCode.replace('const isLocalHostname = ', 'export const isLocalHostname = ');

  fs.appendFileSync('src/utils.ts', '\n' + utilsCode);

  // 3. AuthModal.tsx
  let authModalContent = fs.readFileSync('src/components/AuthModal.tsx', 'utf8');
  authModalContent = authModalContent.replace(/const isLocalHostname = \(\): boolean => \{[\s\S]*?\};\n/, '');
  authModalContent = authModalContent.replace('import { useAuth } from "../context/AuthContext";', 'import { useAuth } from "../context/AuthContext";\nimport { isLocalHostname } from "../utils";');
  fs.writeFileSync('src/components/AuthModal.tsx', authModalContent);

  console.log('Moved utilities to utils.ts');
}
