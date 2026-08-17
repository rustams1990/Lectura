# Lectura — Core Architectural & Operational Dogmas

## 1. Absolute Multi-Account Data Isolation (Zero Leakage)
- Every user account must have strictly isolated data: books, reading history, notes, highlights, settings, statistics, audio/image caches, etc.
- Database queries and API endpoints MUST enforce tenant/user scoping (e.g., `WHERE user_id = ?`).
- Data of one account MUST NEVER spill over, leak, or be exposed to any other account under any circumstances.

## 2. Seamless Multi-Device Synchronization
- Lectura is accessed across multiple devices (PC, Tablet, Mobile, Web).
- All changes (adding a book, updating reading position, changing settings, adding vocabulary/notes, etc.) must synchronize across all devices logged into the same account.
- Conflict resolution and state updates must ensure consistency across PC and Tablet.

## 3. Resource Efficiency & Memory / Disk I/O Management
- **Memory (RAM)**: Keep consumption low. Prevent memory leaks, release unneeded objects, stream large assets (audio/EPUBs) efficiently.
- **Disk Write Control**: Do NOT constantly write high-frequency changes to disk. Use batching, throttling, debouncing, or optimized SQLite/Database write strategies (WAL mode, transactions, etc.) to prevent high disk wear and I/O bottlenecks.

## 4. Deployment Pipeline & Mandatory Server Database Backup
- **Workflow Flow**: Local PC Testing -> Version Bump -> Push to GitHub -> Update Production Server (Ubuntu).
- **Mandatory Backup**: Before applying updates on the Ubuntu server, an **automatic backup of the database** MUST be executed. Never run server updates/migrations without creating a fresh database backup snapshot first.

## 5. UI Interface Language Consistency & Localization Scoping
- Respect active UI interface language preferences across all screens, modals, system toasts, and AI explanations.
- Maintain a strict technical and visual distinction between the application's interface language (UI language) and target/learning languages (materials/books being studied).
- Generated prompts, translation responses, and UI elements must conform to the designated interface language without unexpected language switches.

