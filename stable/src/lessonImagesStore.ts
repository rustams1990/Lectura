/**
 * In-memory cache for EPUB/imported lesson images referenced via [IMG_REF:...] in lesson text.
 * Keeps lesson.text lightweight while ReaderPanel resolves images at render time.
 */

export interface LessonImageMeta {
  dataUrl: string;
  width: string;
  height: string;
}

const dataUrlCache = new Map<string, Record<string, string>>();
const metaCache = new Map<string, Record<string, LessonImageMeta>>();

export function setLessonImages(lessonId: string, images: Record<string, LessonImageMeta>): void {
  if (!images || Object.keys(images).length === 0) return;
  metaCache.set(lessonId, images);
  dataUrlCache.set(
    lessonId,
    Object.fromEntries(Object.entries(images).map(([id, img]) => [id, img.dataUrl]))
  );
}

export function getLessonImagesMap(lessonId: string): Record<string, string> {
  return dataUrlCache.get(lessonId) || {};
}

export function mergeLessonImages(lessonId: string, imagesMap: Record<string, string>): void {
  if (!imagesMap || Object.keys(imagesMap).length === 0) return;
  const existing = dataUrlCache.get(lessonId) || {};
  dataUrlCache.set(lessonId, { ...existing, ...imagesMap });
}

export function removeLessonImages(lessonId: string): void {
  dataUrlCache.delete(lessonId);
  metaCache.delete(lessonId);
}

export function getLessonImagesForSave(lessonId: string): Record<string, LessonImageMeta> {
  const meta = metaCache.get(lessonId);
  if (meta) return meta;

  const urls = dataUrlCache.get(lessonId);
  if (!urls) return {};

  return Object.fromEntries(
    Object.entries(urls).map(([id, dataUrl]) => [id, { dataUrl, width: "", height: "" }])
  );
}
