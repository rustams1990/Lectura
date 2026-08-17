# Lectura Project Rules & Dogmas

Refer to [.agents/rules/lectura_core_dogmas.md](file:///c:/Users/User/Desktop/Lectura/.agents/rules/lectura_core_dogmas.md) for full details.

### Key Rules:
1. **Multi-Account Data Isolation**: Strict user-level data segregation (`user_id` scoping on all queries, notes, books, stats, settings). No cross-account data leaks.
2. **Multi-Device Sync**: Real-time or consistent sync between PC, Tablet, and other devices for all account data.
3. **Resource Efficiency**: Low RAM footprint, streaming assets, throttled/batched disk I/O to avoid constant disk writes.
4. **Production Deployment**: Local test -> Version bump -> Git push -> Server update (Ubuntu). MUST perform an automatic DB backup prior to server updates.
5. **Interface Language & Localization**: Respect active UI language settings across all UI components, dialogs, and AI prompts. Maintain clear distinction between UI interface language and target study languages.

