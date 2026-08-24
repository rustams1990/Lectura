/**
 * Lectura Extension Internationalization (i18n) Service
 * Supports English (en - default), Russian (ru), and Spanish (es)
 */

export type SupportedUiLang = 'en' | 'ru' | 'es';

export const EXTENSION_TRANSLATIONS: Record<SupportedUiLang, Record<string, string>> = {
  en: {
    // Brand & Header
    settings_title: "Lectura Extension Settings",
    settings_subtitle: "Configure connectivity, YouTube interactive overlays, and in-situ reading preferences",
    checking_connection: "Checking...",
    connected: "Connected",
    disconnected: "Disconnected",
    server_unreachable: "Server Unreachable",
    test_connection: "Test",
    test_connection_full: "Test Connection",
    save_config: "Save",
    save_all_changes: "Save All Changes",
    all_settings_saved: "All settings saved successfully!",

    // Tabs
    tab_settings: "⚙️ Settings",
    tab_activity: "📊 Activity",

    // Sections
    section_connection: "1. Connection & Authentication",
    section_connection_desc: "Specify your local or remote Lectura server URL and access credentials.",
    section_subtitles: "2. YouTube Interactive Subtitles Overlay",
    section_subtitles_desc: "Interactive tokenized captions with hotkeys, hover dictionary, and pause controls on YouTube videos.",
    section_reader: "3. Web Page Word Lookup & Selection",
    section_reader_desc: "Instant word translation and SRS vocabulary saving across arbitrary websites.",

    // Form fields
    server_url: "Server URL",
    server_url_hint: "Include protocol and port (e.g., http://localhost:3000 or https://lectura.yourdomain.com).",
    target_profile: "Profile / Account",
    target_profile_hint: "Select which Lectura account receives vocabulary and lesson imports.",
    default_profile: "🌐 Default Profile (Single User / Guest)",
    auth_token: "Auth Token / Sync Key (Optional)",
    auth_token_full: "Authorization Token (Bearer)",
    auth_token_hint: "Required only if your Lectura server has authentication enabled.",
    sync_key: "Local Sync Key (Fallback)",
    sync_key_hint: "Matches LOCAL_SYNC_KEY on your server.",
    study_lang: "Study Language",
    translate_to: "Translation / Native Language",
    tts_dialect: "TTS Engine & Dialect",
    ui_language: "Interface Language",
    word_popup_theme: "Word Popup Theme",
    subtitle_style: "Subtitle Highlight Style",
    style_underline: "_ Underline",
    style_color: "🎨 Color",
    subtitle_size: "Subtitle Size",
    subtitle_size_full: "Subtitle Size Preset",
    subtitle_font_size: "Subtitle Font Size (px)",
    subtitle_bg_color: "Subtitle Background Color",
    size_sm: "Small (16px — Compact)",
    size_md: "Medium (21px — Default)",
    size_lg: "Large (27px — Fullscreen / 4K)",

    // Themes
    theme_glass: "✨ Modern Glass (Neon)",
    theme_calm_light: "🌿 Calm Light (Pastel)",
    theme_extended: "📚 Extended (Dictionary)",
    theme_compact: "⚡ Compact (Minimal)",

    // Toggles
    enable_yt_overlay: "Enable YouTube Overlay",
    enable_yt_overlay_hint: "Show interactive subtitles",
    track_listening_activity: "Track Listening Activity",
    track_listening_hint: "Record watch time in calendar",
    enable_overlay: "Enable YouTube Interactive Overlay",
    enable_overlay_desc: "Renders clickable word tokens over video subtitles and enables interactive learning.",
    enable_dual_subs: "Dual Subtitles",
    enable_dual_subs_desc: "Displays a translated full sentence below original captions (toggle with B or E).",
    dual_subs_hint: "Hotkeys: [B] or [E]",
    capture_snapshot: "Capture Video Frame Snapshot on Word Save",
    capture_snapshot_desc: "Automatically saves a frame screenshot with every saved word/phrase to provide visual context in Lectura.",
    pause_on_click: "Pause Video on Word Click",
    pause_on_click_desc: "Automatically pause video playback when clicking a subtitle word or phrase.",
    enable_insitu: "Enable In-Situ Word Tooltip",
    enable_insitu_desc: "Shows floating translation card when selecting text or double-clicking a word on any web page.",
    highlight_learned: "Highlight Learned Vocabulary Words",
    highlight_learned_desc: "Color-codes words on web pages based on your Lectura learning progress (1-5, Known).",

    // Quick Actions
    import_video_page: "📥 Import Current Video / Page",
    open_app: "🚀 Open App",
    sync_words: "🔄 Sync Words",
    syncing: "Syncing...",
    synced_words: "Synced vocabulary words!",
    importing: "Parsing Article...",
    saving_to_lectura: "Saving to Lectura...",
    imported: "Imported!",

    // Activity & History
    day_history: "Day History",
    click_day_hint: "Click a day in calendar",
    delete_entry: "Delete entry",
    confirm_delete_log: "Delete this video viewing entry from history?",
    failed_delete_log: "Failed to delete log entry",
    no_activity_day: "No activity recorded for this day",
    failed_load_day_activity: "Failed to load day activity",
    goal_per_day: "Goal",
    overall: "Overall",
    stat_week: "WEEK",
    stat_month: "MONTH",
    stat_languages: "LANGUAGES",

    // Overlay Card & Tooltips
    tab_meaning: "Meaning",
    tab_definition: "Definition",
    tab_usage: "Usage",
    tab_dicts: "Dicts",
    tab_root: "Root",
    status_ignored: "Ignored",
    status_new: "New",
    status_learning: "Learning",
    status_known: "Known",
    btn_listen: "Listen",
    btn_reverso: "Reverso",
    btn_cambridge: "Cambridge",
    btn_wiktionary: "Wiktionary",
    btn_link: "Link",
    btn_unlink: "Unlink",
    base_root_placeholder: "Base root (e.g. salir)...",
    custom_meaning_placeholder: "Custom translation / meaning...",
    suggestions_label: "SUGGESTIONS",
    translating: "Translating...",
    replaying_cue: "Replaying cue",
    prev_cue: "Previous cue",
    next_cue: "Next cue",
    dual_subs_toast: "Dual Subtitles",
  },
  ru: {
    // Brand & Header
    settings_title: "Настройки расширения Lectura",
    settings_subtitle: "Настройка подключения, интерактивных субтитров YouTube и веб-ридера",
    checking_connection: "Проверка...",
    connected: "Подключено",
    disconnected: "Отключено",
    server_unreachable: "Сервер недоступен",
    test_connection: "Тест",
    test_connection_full: "Проверить связь",
    save_config: "Сохранить",
    save_all_changes: "Сохранить все изменения",
    all_settings_saved: "Все настройки успешно сохранены!",

    // Tabs
    tab_settings: "⚙️ Настройки",
    tab_activity: "📊 Активность",

    // Sections
    section_connection: "1. Подключение и Авторизация",
    section_connection_desc: "Укажите адрес локального или удаленного сервера Lectura и данные доступа.",
    section_subtitles: "2. Интерактивные субтитры YouTube",
    section_subtitles_desc: "Кликабельные слова субтитров с быстрыми клавишами, всплывающим словарем и автопаузой.",
    section_reader: "3. Выделение слов на веб-страницах",
    section_reader_desc: "Мгновенный перевод и сохранение слов в карточки SRS на любых сайтах.",

    // Form fields
    server_url: "Адрес сервера",
    server_url_hint: "Укажите протокол и порт (например, http://localhost:3000 или https://lectura.yourdomain.com).",
    target_profile: "Профиль / Аккаунт",
    target_profile_hint: "Выберите профиль Lectura, в который будут сохраняться слова и уроки.",
    default_profile: "🌐 Основной профиль (Гость)",
    auth_token: "Токен авторизации (Опционально)",
    auth_token_full: "Токен авторизации (Bearer)",
    auth_token_hint: "Требуется только если на сервере Lectura включена авторизация.",
    sync_key: "Ключ синхронизации (Fallback)",
    sync_key_hint: "Совпадает с LOCAL_SYNC_KEY на сервере.",
    study_lang: "Изучаемый язык",
    translate_to: "Язык перевода",
    tts_dialect: "Движок озвучки и акцент",
    ui_language: "Язык интерфейса",
    word_popup_theme: "Тема карточки слова",
    subtitle_style: "Стиль подсветки субтитров",
    style_underline: "_ Подчеркивание",
    style_color: "🎨 Цвет текста",
    subtitle_size: "Размер субтитров",
    subtitle_size_full: "Размер субтитров",
    subtitle_font_size: "Размер шрифта субтитров (px)",
    subtitle_bg_color: "Цвет фона плашки",
    size_sm: "Мелкий (16px — Оконный)",
    size_md: "Средний (21px — Стандарт)",
    size_lg: "Крупный (27px — Полноэкранный)",

    // Themes
    theme_glass: "✨ Modern Glass (Неон)",
    theme_calm_light: "🌿 Calm Light (Светлая пастель)",
    theme_extended: "📚 Extended (Словарный)",
    theme_compact: "⚡ Compact (Мини)",

    // Toggles
    enable_yt_overlay: "Включить субтитры YouTube",
    enable_yt_overlay_hint: "Показывать интерактивные субтитры",
    track_listening_activity: "Учет времени просмотра",
    track_listening_hint: "Записывать время в календарь",
    enable_overlay: "Включить оверлей субтитров YouTube",
    enable_overlay_desc: "Отображает интерактивные кликабельные слова поверх видео и включает обучение.",
    enable_dual_subs: "Двойные субтитры",
    enable_dual_subs_desc: "Отображает строку перевода предложения под оригинальными субтитрами (клавиша B или E).",
    dual_subs_hint: "Горячие клавиши: [B] или [E]",
    capture_snapshot: "Снимок кадра при сохранении слова",
    capture_snapshot_desc: "Автоматически сохраняет скриншот кадра для контекста в Lectura.",
    pause_on_click: "Пауза видео при клике на слово",
    pause_on_click_desc: "Автоматически ставить видео на паузу при открытии карточки слова.",
    enable_insitu: "Всплывающий перевод на веб-страницах",
    enable_insitu_desc: "Показывает плавающую карточку перевода при выделении текста или двойном клике.",
    highlight_learned: "Подсветка изученных слов на сайтах",
    highlight_learned_desc: "Окрашивает слова на веб-страницах в соответствии с вашим прогрессом (1-5, Изучено).",

    // Quick Actions
    import_video_page: "📥 Импортировать страницу / видео",
    open_app: "🚀 Открыть приложение",
    sync_words: "🔄 Синхронизировать",
    syncing: "Синхронизация...",
    synced_words: "Слова успешно синхронизированы!",
    importing: "Чтение статьи...",
    saving_to_lectura: "Сохранение в Lectura...",
    imported: "Импортировано!",

    // Activity & History
    day_history: "История за день",
    click_day_hint: "Нажмите на день в календаре",
    delete_entry: "Удалить запись",
    confirm_delete_log: "Удалить эту запись просмотра видео из истории?",
    failed_delete_log: "Не удалось удалить запись",
    no_activity_day: "Нет записей активности за этот день",
    failed_load_day_activity: "Не удалось загрузить активность за день",
    goal_per_day: "Цель",
    overall: "Всего",
    stat_week: "НЕДЕЛЯ",
    stat_month: "МЕСЯЦ",
    stat_languages: "ЯЗЫКИ",

    // Overlay Card & Tooltips
    tab_meaning: "Перевод",
    tab_definition: "Определение",
    tab_usage: "Примеры",
    tab_dicts: "Словари",
    tab_root: "Корень",
    status_ignored: "Игнор",
    status_new: "Новое",
    status_learning: "Учу",
    status_known: "Знаю",
    btn_listen: "Слушать",
    btn_reverso: "Reverso",
    btn_cambridge: "Cambridge",
    btn_wiktionary: "Wiktionary",
    btn_link: "Связать",
    btn_unlink: "Отвязать",
    base_root_placeholder: "Начальная форма (например, salir)...",
    custom_meaning_placeholder: "Свой перевод / значение...",
    suggestions_label: "ПОДСКАЗКИ",
    translating: "Перевод...",
    replaying_cue: "Повтор фразы",
    prev_cue: "Предыдущая фраза",
    next_cue: "Следующая фраза",
    dual_subs_toast: "Двойные субтитры",
  },
  es: {
    // Brand & Header
    settings_title: "Ajustes de la extensión Lectura",
    settings_subtitle: "Configura la conectividad, subtítulos interactivos de YouTube y lector web",
    checking_connection: "Comprobando...",
    connected: "Conectado",
    disconnected: "Desconectado",
    server_unreachable: "Servidor no disponible",
    test_connection: "Probar",
    test_connection_full: "Probar conexión",
    save_config: "Guardar",
    save_all_changes: "Guardar todos los cambios",
    all_settings_saved: "¡Todos los ajustes se han guardado con éxito!",

    // Tabs
    tab_settings: "⚙️ Ajustes",
    tab_activity: "📊 Actividad",

    // Sections
    section_connection: "1. Conexión y Autenticación",
    section_connection_desc: "Especifica la URL del servidor Lectura y las credenciales de acceso.",
    section_subtitles: "2. Subtítulos interactivos de YouTube",
    section_subtitles_desc: "Subtítulos interactivos con atajos, diccionario emergente y controles de pausa en YouTube.",
    section_reader: "3. Búsqueda y selección en páginas web",
    section_reader_desc: "Traducción instantánea y guardado de vocabulario SRS en cualquier sitio web.",

    // Form fields
    server_url: "URL del servidor",
    server_url_hint: "Incluye protocolo y puerto (p. ej. http://localhost:3000 o https://lectura.tudominio.com).",
    target_profile: "Perfil / Cuenta",
    target_profile_hint: "Selecciona qué cuenta de Lectura recibe las palabras y lecciones importadas.",
    default_profile: "🌐 Perfil predeterminado (Invitado)",
    auth_token: "Token de autorización (Opcional)",
    auth_token_full: "Token de autorización (Bearer)",
    auth_token_hint: "Requerido solo si tu servidor Lectura tiene autenticación habilitada.",
    sync_key: "Clave de sincronización local",
    sync_key_hint: "Coincide con LOCAL_SYNC_KEY en tu servidor.",
    study_lang: "Idioma de estudio",
    translate_to: "Idioma de traducción",
    tts_dialect: "Motor de voz y acento",
    ui_language: "Idioma de la interfaz",
    word_popup_theme: "Tema de la tarjeta",
    subtitle_style: "Estilo de resaltado de subtítulos",
    style_underline: "_ Subrayado",
    style_color: "🎨 Color",
    subtitle_size: "Tamaño de subtítulos",
    subtitle_size_full: "Tamaño de subtítulos",
    subtitle_font_size: "Tamaño de fuente de subtítulos (px)",
    subtitle_bg_color: "Color de fondo de subtítulos",
    size_sm: "Pequeño (16px — Compacto)",
    size_md: "Medio (21px — Estándar)",
    size_lg: "Grande (27px — Pantalla completa)",

    // Themes
    theme_glass: "✨ Modern Glass (Neón)",
    theme_calm_light: "🌿 Calm Light (Pastel)",
    theme_extended: "📚 Extended (Diccionario)",
    theme_compact: "⚡ Compact (Mínimo)",

    // Toggles
    enable_yt_overlay: "Activar subtítulos de YouTube",
    enable_yt_overlay_hint: "Mostrar subtítulos interactivos",
    track_listening_activity: "Registrar tiempo de escucha",
    track_listening_hint: "Guardar tiempo en el calendario",
    enable_overlay: "Activar superposición de YouTube",
    enable_overlay_desc: "Muestra palabras interactivas sobre los subtítulos del video y habilita el aprendizaje.",
    enable_dual_subs: "Subtítulos dobles",
    enable_dual_subs_desc: "Muestra la traducción completa debajo de los subtítulos originales (tecla B o E).",
    dual_subs_hint: "Atajos: [B] o [E]",
    capture_snapshot: "Capturar fotograma al guardar palabra",
    capture_snapshot_desc: "Guarda automáticamente una captura de pantalla para dar contexto visual en Lectura.",
    pause_on_click: "Pausar video al hacer clic en palabra",
    pause_on_click_desc: "Pausa automáticamente el video al hacer clic en una palabra o frase de los subtítulos.",
    enable_insitu: "Activar tooltip en páginas web",
    enable_insitu_desc: "Muestra una tarjeta de traducción al seleccionar texto o hacer doble clic en cualquier página.",
    highlight_learned: "Resaltar vocabulario aprendido",
    highlight_learned_desc: "Colorea las palabras en la web según tu progreso en Lectura (1-5, Aprendida).",

    // Quick Actions
    import_video_page: "📥 Importar página / video actual",
    open_app: "🚀 Abrir aplicación",
    sync_words: "🔄 Sincronizar palabras",
    syncing: "Sincronizando...",
    synced_words: "¡Vocabulario sincronizado con éxito!",
    importing: "Analizando artículo...",
    saving_to_lectura: "Guardando en Lectura...",
    imported: "¡Importado!",

    // Activity & History
    day_history: "Historial del día",
    click_day_hint: "Haz clic en un día del calendario",
    delete_entry: "Eliminar registro",
    confirm_delete_log: "¿Eliminar este registro de video del historial?",
    failed_delete_log: "Error al eliminar el registro",
    no_activity_day: "No hay actividad registrada para este día",
    failed_load_day_activity: "Error al cargar la actividad del día",
    goal_per_day: "Meta",
    overall: "Total",
    stat_week: "SEMANA",
    stat_month: "MES",
    stat_languages: "IDIOMAS",

    // Overlay Card & Tooltips
    tab_meaning: "Significado",
    tab_definition: "Definición",
    tab_usage: "Uso",
    tab_dicts: "Diccs",
    tab_root: "Raíz",
    status_ignored: "Ignorado",
    status_new: "Nuevo",
    status_learning: "Aprendiendo",
    status_known: "Conocido",
    btn_listen: "Escuchar",
    btn_reverso: "Reverso",
    btn_cambridge: "Cambridge",
    btn_wiktionary: "Wiktionary",
    btn_link: "Vincular",
    btn_unlink: "Desvincular",
    base_root_placeholder: "Raíz base (p. ej. salir)...",
    custom_meaning_placeholder: "Traducción / significado personalizado...",
    suggestions_label: "SUGERENCIAS",
    translating: "Traduciendo...",
    replaying_cue: "Repitiendo frase",
    prev_cue: "Frase anterior",
    next_cue: "Frase siguiente",
    dual_subs_toast: "Subtítulos dobles",
  }
};

/**
 * Returns translated string for given key and UI language
 */
export function t(key: string, lang: string = 'en'): string {
  const norm = (lang || 'en').toLowerCase().slice(0, 2) as SupportedUiLang;
  const currentDict = EXTENSION_TRANSLATIONS[norm] || EXTENSION_TRANSLATIONS.en;
  return currentDict[key] || EXTENSION_TRANSLATIONS.en[key] || key;
}

/**
 * Applies translations to all DOM elements with data-i18n attributes
 */
export function applyI18nToDOM(root: Document | HTMLElement = document, lang: string = 'en') {
  const elements = root.querySelectorAll<HTMLElement>('[data-i18n]');
  elements.forEach((el) => {
    const key = el.dataset.i18n;
    if (key) {
      const translated = t(key, lang);
      if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text') {
        (el as HTMLInputElement).placeholder = translated;
      } else {
        el.textContent = translated;
      }
    }
  });

  const placeholders = root.querySelectorAll<HTMLElement>('[data-i18n-placeholder]');
  placeholders.forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (key) {
      (el as HTMLInputElement).placeholder = t(key, lang);
    }
  });

  const titles = root.querySelectorAll<HTMLElement>('[data-i18n-title]');
  titles.forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (key) {
      el.title = t(key, lang);
    }
  });
}
