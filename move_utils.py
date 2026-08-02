import sys

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

out_app = []
out_utils = []

skip = False
for i, line in enumerate(lines):
    if line.startswith('function migrateLocalStorage()'):
        skip = True
        out_utils.append(line.replace('function migrateLocalStorage', 'export function migrateLocalStorage'))
        continue

    if skip:
        if line.startswith('export default function App()'):
            skip = False
            out_app.append(line)
        else:
            if line.startswith('function safeParse'):
                out_utils.append(line.replace('function safeParse', 'export function safeParse'))
            elif line.startswith('function normalizeLanguagePrefixedKey'):
                # ALREADY in utils.ts! Do not append to out_utils.
                pass
            elif line.startswith('const isLocalHostname = '):
                out_utils.append(line.replace('const isLocalHostname', 'export const isLocalHostname'))
            elif line.startswith('migrateLocalStorage();'):
                out_utils.append(line)
                # DO NOT append it to App.tsx
            else:
                if 'normalizeLanguagePrefixedKey' not in line:
                    # just a quick hack to avoid adding the body of normalizeLanguagePrefixedKey to utils.ts
                    # wait, it's safer to just skip the block.
                    # but since we already know the exact lines, let's just do:
                    out_utils.append(line)
    else:
        # replace import to include new utils
        if 'import { safeJsonParse, safeLocalStorageSetItem, sanitizeLessonsForLocalStorage' in line:
            line = line.replace('import { safeJsonParse', 'import { safeJsonParse, safeParse, normalizeLanguagePrefixedKey, isLocalHostname')
        out_app.append(line)

# Let's fix the hack with normalizeLanguagePrefixedKey body
# Actually, the body of normalizeLanguagePrefixedKey is 6 lines:
# function normalizeLanguagePrefixedKey(key: string): string {
#   let k = key;
#   while (k.match(/^([a-zA-Z]+)_\1_/i)) {
#     k = k.replace(/^([a-zA-Z]+)_\1_/i, "$1_");
#   }
#   return k;
# }
cleaned_utils = []
skip_norm = False
for line in out_utils:
    if line.startswith('function normalizeLanguagePrefixedKey'):
        skip_norm = True
        continue
    if skip_norm and line.startswith('}'):
        skip_norm = False
        continue
    if skip_norm:
        continue
    cleaned_utils.append(line)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.writelines(out_app)

with open('src/utils.ts', 'a', encoding='utf-8') as f:
    f.write('\n')
    f.writelines(cleaned_utils)

print("Moved utils to utils.ts")
