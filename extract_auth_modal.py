import sys

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

out = []
skip = False
skip_auth_submit = False
skip_auth_modal = False
skip_auth_tab = False

for i, line in enumerate(lines):
    # Imports
    if 'import SettingsModal from "./components/SettingsModal";' in line:
        out.append(line)
        out.append('import AuthModal from "./components/AuthModal";\n')
        continue
    
    # States to remove
    if any(x in line for x in [
        'const [authError, setAuthError]',
        'const [localNameInput, setLocalNameInput]',
        'const [isLocalServerRegister, setIsLocalServerRegister]',
        'const [localServerEmail, setLocalServerEmail]',
        'const [localServerPassword, setLocalServerPassword]',
        'const [localServerName, setLocalServerName]',
        'const [isLocalServerAuthLoading, setIsLocalServerAuthLoading]',
        'const [emailInput, setEmailInput]',
        'const [passwordInput, setPasswordInput]',
        'const [isEmailRegister, setIsEmailRegister]',
        'const [emailAuthLoading, setEmailAuthLoading]'
    ]):
        continue

    # Block: authModalTab
    if 'const [authModalTab, setAuthModalTab] = useState<"local" | "cloud">(() => {' in line:
        skip_auth_tab = True
        continue
    if skip_auth_tab and '});' in line and 'return isLocalHostname() ? "local" : "cloud";' in lines[i-1]:
        skip_auth_tab = False
        continue
    if skip_auth_tab:
        continue

    # Block: handleServerAuthSubmit
    if 'const handleServerAuthSubmit = async ' in line:
        skip_auth_submit = True
        continue
    if skip_auth_submit and '}' in line and '  };' in line and 'setIsLocalServerAuthLoading(false);' in lines[i-2]:
        skip_auth_submit = False
        continue
    if skip_auth_submit:
        continue

    # Block: Auth Modal
    if '{/* Local/Guest Auth fallback Modal */}' in line:
        skip_auth_modal = True
        out.append(line)
        out.append('      <AuthModal\n')
        out.append('        isOpen={showLocalLoginModal}\n')
        out.append('        onClose={() => setShowLocalLoginModal(false)}\n')
        out.append('        onLocalServerLogin={() => {\n')
        out.append('          serverInitialLoadComplete.current = false;\n')
        out.append('        }}\n')
        out.append('      />\n')
        continue
    if skip_auth_modal and '{/* Floating draggable/resizable YouTube player window */}' in line:
        skip_auth_modal = False
        # fall through to append this line

    if not skip_auth_tab and not skip_auth_submit and not skip_auth_modal:
        out.append(line)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.writelines(out)

print("App.tsx Updated")
