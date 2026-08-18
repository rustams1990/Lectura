/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'locales');
const EN_PATH = path.join(LOCALES_DIR, 'en', 'translation.json');
const RU_PATH = path.join(LOCALES_DIR, 'ru', 'translation.json');
const ES_PATH = path.join(LOCALES_DIR, 'es', 'translation.json');
const DE_PATH = path.join(LOCALES_DIR, 'de', 'translation.json');

const en = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'));
const ru = JSON.parse(fs.readFileSync(RU_PATH, 'utf8'));

fs.mkdirSync(path.join(LOCALES_DIR, 'es'), { recursive: true });
fs.mkdirSync(path.join(LOCALES_DIR, 'de'), { recursive: true });

function getAllKeyPaths(obj, prefix = '') {
  let keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(getAllKeyPaths(v, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys;
}

function setDeepValue(obj, pathStr, value) {
  const parts = pathStr.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!curr[p] || typeof curr[p] !== 'object') {
      curr[p] = {};
    }
    curr = curr[p];
  }
  curr[parts[parts.length - 1]] = value;
}

function getDeepValue(obj, pathStr) {
  const parts = pathStr.split('.');
  let curr = obj;
  for (const p of parts) {
    if (curr === undefined || curr === null) return undefined;
    curr = curr[p];
  }
  return curr;
}

// Full Spanish map
const esMap = {
  settings: {
    title: "Ajustes de la Aplicación",
    language: "Idioma de la interfaz",
    language_desc: "Elige el idioma de la aplicación. Los cambios se aplican de inmediato.",
    close: "Cerrar",
    zoom_title: "Escala de la interfaz",
    zoom_desc: "Controla la escala de la aplicación para mayor legibilidad o más contenido. Los cambios se aplican al instante.",
    active_zoom: "Escala activa:",
    recommended: "(Recomendado)",
    decrease_zoom: "Disminuir escala (-5%)",
    increase_zoom: "Aumentar escala (+5%)",
    reset: "Restablecer",
    presets: "Selecciona un ajuste preestablecido:",
    max_width: "Ancho máximo de la interfaz:",
    reset_zoom: "Restablecer escala (100%)",
    done: "Listo",
    subtitle: "Configura la escala, relaciones de palabras y banderas de idioma.",
    width_std: "Estándar (1280px)",
    width_std_desc: "Vista compacta",
    width_wide: "Ancha (1560px)",
    width_wide_desc: "Equilibrada",
    width_full: "Pantalla completa",
    width_full_desc: "Espacio máximo",
    dim_covers_label: "Atenuar portadas de libros en la biblioteca",
    dim_covers_desc: "Aplica una superposición de degradado oscuro sobre las portadas para mayor contraste de texto (desactivado por defecto).",
    regional_preferences: "Preferencias Regionales",
    regional_preferences_desc: "Formatos de fecha y hora en listas, vocabulario y estadísticas.",
    date_format: "Formato de fecha",
    time_format: "Formato de hora",
    format_auto: "Automático (por idioma)",
    time_24h: "24 horas (22:30)",
    time_12h: "12 horas (10:30 PM)",
    first_day_of_week: "Primer día de la semana",
    first_day_monday: "Lunes (Europa, CEI)",
    first_day_sunday: "Domingo (EE. UU., Canadá)",
    live_preview: "Vista previa:",
    scale_preview: "Vista previa de escala en vivo",
    scale_preview_desc: "Este cuadro simula los cambios. A escala {{zoomScale}}%, las fuentes y botones se ajustan en consecuencia.",
    demo_btn: "¡Botón de demostración!",
    save: "Guardar",
    understood_label: "Comprendido",
    vocab_label: "Vocabulario",
    tab_flags: "Banderas de Idioma",
    tab_ui: "Interfaz",
    tab_audio: "Audio (TTS)",
    tab_ai: "Asistente IA",
    tab_whisper: "Whisper (STT)",
    tab_stats: "Estadísticas",
    tab_ignore_lists: "Listas de Exclusión",
    tab_links: "Relaciones de Palabras",
    tab_storage: "Datos y Sincronización",
    profile_label: "Perfil:",
    local_backups: "Copias de seguridad en disco (Backups locales)",
    download_json: "Descargar copia (.json)",
    restore_json: "Restaurar desde archivo",
    restore_json_desc: "Carga un archivo .json de copia de seguridad previamente guardado",
    danger_zone: "Zona de peligro",
    clear_data_btn: "Borrar todos los datos locales",
    clear_data_desc: "Elimina de forma irreversible todos los textos, el vocabulario guardado y el historial de este dispositivo",
    delete_link_btn: "Eliminar enlace",
    delete_link_title: "Eliminar relación",
    delete_link_confirm: "¿Estás seguro de que deseas eliminar el enlace para \"{{word}}\"?",
    flags: "BANDERAS DE IDIOMA",
    interface: "INTERFAZ Y ESCALA",
    word_links: "RELACIONES DE PALABRAS",
    storage: "DATOS Y SINCRONIZACIÓN",
    profile_and_sync: "Perfil y Sincronización",
    sync_active: "Sincronización activa",
    profile_sync_desc: "Todos los materiales, palabras y progreso se guardan automáticamente en tu base de datos SQLite.",
    switch_profile: "Cambiar perfil",
    logout: "Cerrar sesión",
    guest_profile: "Modo invitado",
    guest_desc: "Inicia sesión o crea una cuenta para guardar materiales y sincronizar tu progreso entre dispositivos.",
    login_or_register: "Iniciar sesión o registrarse",
    tts_engine: "Motor de voz (TTS)",
    tts_desc: "Elige la voz para la pronunciación al presionar 🔊 en la tarjeta de palabra.",
    google_badge: "Como en AwesomeTTS",
    google_desc: "La misma voz que en el complemento AwesomeTTS de Anki. Clara, agradable, gratuita, sin clave API.",
    kokoro_badge: "Local / IA sin conexión",
    kokoro_desc: "Voz neuronal con calidad de estudio (Kokoro-82M / Piper). Se ejecuta localmente en tu servidor sin nube.",
    gemini_badge: "Requiere clave API",
    gemini_desc: "Voz de IA de Gemini: muy natural y viva. Requiere GEMINI_API_KEY (límite de 10 palabras al día en la versión gratuita).",
    browser_label: "Navegador (Integrado)",
    browser_badge: "Sin conexión",
    browser_desc: "Voz del sistema operativo. Funciona sin internet, pero la calidad depende de tu SO.",
    kokoro_port_note: "Puerto estándar para kokoro-fastapi:",
    ai_title: "Configuración de IA (AI Provider)",
    ai_profiles_title: "Claves de IA y Proveedores (Conmutación por error)",
    ai_profiles_desc: "Agrega múltiples claves o proveedores. Si se agota la cuota (error 429 / Quota Exceeded), Lectura cambiará automáticamente a la siguiente clave activa en la lista.",
    add_ai_profile: "+ Agregar clave / proveedor de IA",
    ai_profile_name: "Nombre del perfil",
    ai_provider: "Proveedor",
    ai_model: "Modelo",
    ai_api_key: "Clave API",
    ai_base_url: "URL base del endpoint",
    ai_priority: "Prioridad",
    ai_enabled: "Activo",
    ai_test_btn: "Probar",
    ai_testing: "Probando...",
    ai_test_success: "¡Conexión exitosa!",
    ai_test_failed: "Error de conexión:",
    ai_delete_profile_title: "Eliminar perfil",
    ai_delete_profile_confirm: "¿Eliminar el perfil de IA \"{{name}}\"?",
    ai_provider_gemini: "Google Gemini",
    ai_provider_openai: "OpenAI / Compatible",
    ai_provider_groq: "Groq (Llama 3 / Mixtral ultra rápido)",
    ai_provider_ollama: "Ollama (Servidor IA local)",
    ai_provider_custom: "API compatible con OpenAI personalizada",
    stats_metric_title: "Métrica principal en las tarjetas de libros",
    stats_metric_desc: "Elige qué porcentaje se muestra en la barra de progreso principal de las tarjetas de la biblioteca:",
    metric_comprehension: "Comprensión (por tokens en el texto)",
    metric_comprehension_desc: "Muestra el porcentaje de palabras que ya conoces en el texto. Recomendado para evaluar la facilidad de lectura.",
    metric_vocabulary: "Vocabulario (por lemas únicos)",
    metric_vocabulary_desc: "Muestra cuántas formas base únicas del libro ya has aprendido. Ideal para el seguimiento del vocabulario.",
    show_detailed_stats_label: "Mostrar estadísticas detalladas en las tarjetas",
    show_detailed_stats_desc: "Muestra líneas adicionales con desglose de vocabulario y palabras comprendidas debajo de la barra.",
    show_progress_bar_label: "Mostrar barra de progreso de lectura",
    show_progress_bar_desc: "Muestra el indicador de progreso verde/azul en las tarjetas de libros de la biblioteca.",
    tts_locales_title: "Configuración de dialectos y acentos (TTS)",
    tts_locales_desc: "Selecciona el acento deseado para cada idioma al usar la voz de Google TTS:",
    local_tts_voices_title: "Voces locales para Kokoro / Piper",
    local_tts_voices_desc: "Configura el identificador de voz para cada idioma al usar Kokoro TTS local:",
    no_languages: "Aún no se han añadido idiomas a la biblioteca.",
    current_flag: "Bandera actual:",
    all_world_flags: "Todas las banderas del mundo y símbolos:",
    choose_flag_for: "Elige una bandera para {{lang}}",
    reset_flags_btn: "Restablecer todas las banderas",
    reset_flags_confirm: "¿Restablecer todas las banderas a los valores predeterminados?",
    search_word_links: "Buscar en relaciones de palabras...",
    links_count: "Total de relaciones: {{count}}",
    no_word_links: "Aún no se han creado relaciones de palabras.",
    link_from: "Forma de la palabra",
    link_to: "Forma base (Lema)",
    storage_sync_title: "Almacenamiento y Sincronización",
    storage_sync_desc: "Elige cómo y dónde se almacenan tus datos:",
    storage_local: "Base de datos SQLite local",
    storage_local_desc: "Todos los datos se almacenan localmente en tu dispositivo.",
    storage_server: "Servidor Lectura remoto",
    storage_server_desc: "Sincroniza tus datos a través de una instancia de servidor Lectura compartida.",
    sync_now_btn: "Sincronizar ahora",
    syncing: "Sincronizando...",
    sync_success: "¡Sincronización completada con éxito!",
    sync_error: "Error durante la sincronización.",
    server_sync_key: "Clave de sincronización del servidor",
    server_sync_key_placeholder: "Introduce la clave de sincronización...",
    server_sync_status_connected: "Conectado al servidor",
    server_sync_status_error: "No se puede conectar al servidor",
    listening_seconds_title: "Tiempo total de escucha registrado",
    listening_seconds_desc: "Segundos acumulados de audio y práctica auditiva:",
    seconds_label: "segundos",
    save_listening_time: "Guardar tiempo de escucha",
    clear_data_warning: "Esta acción borrará todas las lecciones, el vocabulario, las relaciones y el historial.",
    clear_data_confirm_title: "¿Borrar todos los datos?",
    clear_data_confirm_text: "Escribe BORRAR para confirmar la eliminación completa:",
    clear_data_confirm_word: "BORRAR",
    clear_data_success: "Todos los datos se han eliminado correctamente.",
    word_links_desc: "Gestiona las relaciones morfológicas y enlaces de lemas entre variantes de palabras."
  }
};

// Fill in every key from en structure
function cloneAndTranslate(source, translationDict, fallbackDict) {
  const allPaths = getAllKeyPaths(source);
  const out = {};

  for (const p of allPaths) {
    const rawEn = getDeepValue(source, p);
    const custom = getDeepValue(translationDict, p);
    if (custom !== undefined) {
      setDeepValue(out, p, custom);
    } else if (fallbackDict && getDeepValue(fallbackDict, p) !== undefined) {
      setDeepValue(out, p, getDeepValue(fallbackDict, p));
    } else {
      setDeepValue(out, p, rawEn);
    }
  }
  return out;
}

// Generate the synchronized RU, ES, and DE files
const syncedRu = cloneAndTranslate(en, ru, null);
const syncedEs = cloneAndTranslate(en, esMap, null);
const syncedDe = cloneAndTranslate(en, {}, null);

fs.writeFileSync(RU_PATH, JSON.stringify(syncedRu, null, 2), 'utf8');
fs.writeFileSync(ES_PATH, JSON.stringify(syncedEs, null, 2), 'utf8');
fs.writeFileSync(DE_PATH, JSON.stringify(syncedDe, null, 2), 'utf8');

console.log('✅ Synchronized all 3 locales to 100% key parity with en/translation.json');
