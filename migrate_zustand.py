import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
if 'import { useUIStore }' not in content:
    content = content.replace('import React', 'import { useUIStore } from "./store/uiStore";\nimport React', 1)

zustand_hook = """  const {
    activeTab, setActiveTab,
    showImportForm, setShowImportForm,
    showSettingsModal, setShowSettingsModal,
    showMatchPairsModal, setShowMatchPairsModal,
    showYoutubePlayer, setShowYoutubePlayer,
    isFocusMode, setIsFocusMode,
    showOnlyUnknown, setShowOnlyUnknown,
    zoomScale, setZoomScale,
    layoutWidthMode, setLayoutWidthMode,
    isSidebarOpen, setIsSidebarOpen
  } = useUIStore();
"""

# Find export default function App() {
app_idx = content.find('export default function App() {')
if app_idx != -1:
    # insert the hook right after
    insert_idx = content.find('\n', app_idx) + 1
    if 'useUIStore();' not in content:
        content = content[:insert_idx] + zustand_hook + content[insert_idx:]

# Regex replacements to remove useState for these
state_vars = [
    'activeTab', 'showImportForm', 'showYoutubePlayer', 
    'showMatchPairsModal', 'showSettingsModal', 'isSidebarOpen',
    'isFocusMode', 'showOnlyUnknown', 'layoutWidthMode', 'zoomScale'
]

lines = content.split('\n')
new_lines = []
for line in lines:
    skip = False
    for var in state_vars:
        if f'const [{var}, set' in line and 'useState' in line:
            skip = True
            break
    if not skip:
        new_lines.append(line)

content = '\n'.join(new_lines)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Migrated UI states to Zustand.")
