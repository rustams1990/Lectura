/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  writeBatch 
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { Lesson, LessonType, VocabItem } from "./types";

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

/**
 * Handles Firestore errors by wrapping them with detailed metadata.
 * This is a mandatory requirement to enable automated security rules diagnosis.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error("Firestore Error logged:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Normalizes document IDs to ensure they only contain characters valid in standard Firestore.
 */
function safeDocId(word: string): string {
  return encodeURIComponent(word.trim()).replace(/\./g, "%2E");
}

/**
 * Normalizes the reverse.
 */
export function decodeDocId(id: string): string {
  return decodeURIComponent(id);
}

export interface ExtractedImage {
  id: string;
  dataUrl: string;
  width: string;
  height: string;
}

/**
 * Strips base64 image strings from lesson text and returns them as a separate list,
 * replacing them with lightweight references.
 */
export function stripLessonImages(lesson: Lesson): { lessonWithoutImages: Lesson; images: ExtractedImage[] } {
  const images: ExtractedImage[] = [];
  if (!lesson || !lesson.text) {
    return { lessonWithoutImages: lesson, images };
  }

  let index = 0;
  const text = lesson.text.replace(/\[IMG:(data:image\/[^|\]]+)(?:\|([^|\]]*))?(?:\|([^\]]*))?\]/gi, (match, dataUrl, width, height) => {
    const imgId = `img_${lesson.id}_${index++}`;
    images.push({
      id: imgId,
      dataUrl,
      width: width || "",
      height: height || ""
    });
    return `[IMG_REF:${imgId}|${width || ""}|${height || ""}]`;
  });

  return {
    lessonWithoutImages: {
      ...lesson,
      text
    },
    images
  };
}

/**
 * Restores light references in lesson text back to full base64 images.
 */
export function restoreLessonImages(text: string, imagesMap: Record<string, string>): string {
  if (!text) return "";
  return text.replace(/\[IMG_REF:([^|\]]+)(?:\|([^|\]]*))?(?:\|([^\]]*))?\]/gi, (match, imgId, width, height) => {
    const dataUrl = imagesMap[imgId];
    if (dataUrl) {
      if (width || height) {
        return `[IMG:${dataUrl}|${width || ""}|${height || ""}]`;
      }
      return `[IMG:${dataUrl}]`;
    }
    return match;
  });
}

// Stats / Profile Operations
export async function saveProfileStats(userId: string, listeningSeconds: number) {
  if (!db) {
    console.warn("Firestore database 'db' is undefined. Skipping saveProfileStats.");
    return;
  }
  const path = `users/${userId}`;
  try {
    await setDoc(doc(db, "users", userId), {
      listeningSeconds,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveProfileSettings(userId: string, settings: { languageFlags?: Record<string, string>; listeningSeconds?: number }) {
  if (!db) {
    console.warn("Firestore database 'db' is undefined. Skipping saveProfileSettings.");
    return;
  }
  const path = `users/${userId}`;
  try {
    await setDoc(doc(db, "users", userId), {
      ...settings,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// Vocab (Words) Operations
export async function saveVocab(userId: string, word: string, vocabItem: VocabItem) {
  if (!db) {
    console.warn("Firestore database 'db' is undefined. Skipping saveVocab.");
    return;
  }
  const normalizedId = safeDocId(word);
  const path = `users/${userId}/lingqs/${normalizedId}`;
  try {
    await setDoc(doc(db, "users", userId, "lingqs", normalizedId), {
      ...vocabItem,
      word: vocabItem.word ? vocabItem.word.replace(/^[a-zA-Z]+_/, "") : word.replace(/^[a-zA-Z]+_/, "")
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteVocab(userId: string, word: string) {
  if (!db) {
    console.warn("Firestore database 'db' is undefined. Skipping deleteVocab.");
    return;
  }
  if (!word || !word.trim()) return;
  const normalizedId = safeDocId(word);
  if (!normalizedId) return;
  const path = `users/${userId}/lingqs/${normalizedId}`;
  try {
    await deleteDoc(doc(db, "users", userId, "lingqs", normalizedId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function deleteMultipleVocabs(userId: string, words: string[]) {
  if (!db) {
    console.warn("Firestore database 'db' is undefined. Skipping deleteMultipleVocabs.");
    return;
  }
  const path = `users/${userId}/lingqs`;
  try {
    let batch = writeBatch(db);
    let opCount = 0;
    
    // Clean and deduplicate normalizedIds, strictly filtering out empty/falsy IDs
    const cleanIds = Array.from(new Set(
      words
        .map(w => {
          if (!w) return "";
          return safeDocId(w);
        })
        .filter(id => id && id.trim() !== "")
    ));

    for (const normalizedId of cleanIds) {
      batch.delete(doc(db, "users", userId, "lingqs", normalizedId));
      opCount++;
      if (opCount >= 200) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    }
    if (opCount > 0) {
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Lessons Operations
export async function saveLesson(
  userId: string,
  lesson: Lesson,
  externalImages?: Record<string, { dataUrl: string; width: string; height: string }>
) {
  if (!db) {
    console.warn("Firestore database 'db' is undefined. Skipping saveLesson.");
    return;
  }
  const { lessonWithoutImages, images } = stripLessonImages(lesson);
  const path = `users/${userId}/lessons/${lesson.id}`;

  const imagesToSave: ExtractedImage[] = [...images];
  if (externalImages) {
    for (const [id, meta] of Object.entries(externalImages)) {
      if (!imagesToSave.some((img) => img.id === id)) {
        imagesToSave.push({
          id,
          dataUrl: meta.dataUrl,
          width: meta.width,
          height: meta.height,
        });
      }
    }
  }

  try {
    await setDoc(doc(db, "users", userId, "lessons", lesson.id), lessonWithoutImages);
    for (const img of imagesToSave) {
      await setDoc(doc(db, "users", userId, "lessons", lesson.id, "images", img.id), {
        dataUrl: img.dataUrl,
        width: img.width,
        height: img.height
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteLesson(userId: string, lessonId: string) {
  if (!db) {
    console.warn("Firestore database 'db' is undefined. Skipping deleteLesson.");
    return;
  }
  const path = `users/${userId}/lessons/${lessonId}`;
  try {
    // Delete subcollection documents first
    const imagesSnap = await getDocs(collection(db, "users", userId, "lessons", lessonId, "images"));
    for (const d of imagesSnap.docs) {
      await deleteDoc(doc(db, "users", userId, "lessons", lessonId, "images", d.id));
    }
    await deleteDoc(doc(db, "users", userId, "lessons", lessonId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Word Alias Mapping Operations
export async function saveWordRangeLink(userId: string, source: string, target: string) {
  if (!db) {
    console.warn("Firestore database 'db' is undefined. Skipping saveWordRangeLink.");
    return;
  }
  const normalizedId = safeDocId(source);
  const path = `users/${userId}/wordLinks/${normalizedId}`;
  try {
    await setDoc(doc(db, "users", userId, "wordLinks", normalizedId), {
      sourceWord: source,
      targetWord: target
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteWordRangeLink(userId: string, source: string) {
  if (!db) {
    console.warn("Firestore database 'db' is undefined. Skipping deleteWordRangeLink.");
    return;
  }
  const normalizedId = safeDocId(source);
  const path = `users/${userId}/wordLinks/${normalizedId}`;
  try {
    await deleteDoc(doc(db, "users", userId, "wordLinks", normalizedId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function deleteLessonType(userId: string, typeId: string) {
  if (!db) {
    console.warn("Firestore database 'db' is undefined. Skipping deleteLessonType.");
    return;
  }
  const path = `users/${userId}/lessonTypes/${typeId}`;
  try {
    await deleteDoc(doc(db, "users", userId, "lessonTypes", typeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Custom Lesson Types Operations
export async function saveLessonType(userId: string, type: LessonType) {
  if (!db) {
    console.warn("Firestore database 'db' is undefined. Skipping saveLessonType.");
    return;
  }
  const path = `users/${userId}/lessonTypes/${type.id}`;
  try {
    await setDoc(doc(db, "users", userId, "lessonTypes", type.id), type);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// Load entire state payload for user
export async function loadUserData(userId: string) {
  const infoLoad = {
    listeningSeconds: 0,
    vocab: {} as Record<string, VocabItem>,
    lessons: [] as Lesson[],
    lessonTypes: [] as LessonType[],
    wordLinks: {} as Record<string, string>,
    languageFlags: {} as Record<string, string>,
  };

  if (!db) {
    console.warn("Firestore database 'db' is undefined. Returning local fallback empty dataset.");
    return infoLoad;
  }

  try {
    // Execute all top-level collection queries in parallel
    const [profileSnap, lingqsSnap, lessonsSnap, typesSnap, linksSnap] = await Promise.all([
      getDoc(doc(db, "users", userId)),
      getDocs(collection(db, "users", userId, "lingqs")),
      getDocs(collection(db, "users", userId, "lessons")),
      getDocs(collection(db, "users", userId, "lessonTypes")),
      getDocs(collection(db, "users", userId, "wordLinks"))
    ]);

    // 1. Profile metadata
    if (profileSnap.exists()) {
      const data = profileSnap.data();
      infoLoad.listeningSeconds = data.listeningSeconds || 0;
      infoLoad.languageFlags = data.languageFlags || {};
    }

    // 2. Vocab (Words stored in "lingqs" collection)
    lingqsSnap.forEach(doc => {
      const data = doc.data() as VocabItem;
      if (data.word) {
        data.word = data.word.replace(/^[a-zA-Z]+_/, "");
      }
      infoLoad.vocab[decodeDocId(doc.id)] = data;
    });

    // 3. Lessons (hydrating images in parallel)
    const lessonPromises = lessonsSnap.docs.map(async (d) => {
      const lesson = d.data() as Lesson;
      if (lesson.text && lesson.text.includes("[IMG_REF:")) {
        try {
          const imagesSnap = await getDocs(collection(db, "users", userId, "lessons", lesson.id, "images"));
          const imagesMap: Record<string, string> = {};
          imagesSnap.forEach(imgDoc => {
            imagesMap[imgDoc.id] = imgDoc.data().dataUrl;
          });
          lesson.text = restoreLessonImages(lesson.text, imagesMap);
        } catch (err) {
          console.error("Failed to load images for lesson", lesson.id, err);
        }
      }
      return lesson;
    });
    infoLoad.lessons = await Promise.all(lessonPromises);

    // 4. Custom lesson categories
    typesSnap.forEach(doc => {
      infoLoad.lessonTypes.push(doc.data() as LessonType);
    });

    // 5. Morphological word associations
    linksSnap.forEach(doc => {
      const data = doc.data();
      if (data.sourceWord && data.targetWord) {
        infoLoad.wordLinks[data.sourceWord] = data.targetWord;
      }
    });

  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
  }

  return infoLoad;
}

/**
 * Upload local cache structures to Firestore in batch
 */
export async function uploadLocalToCloud(
  userId: string, 
  lessonsList: Lesson[], 
  typesList: LessonType[], 
  vocabMap: Record<string, VocabItem>, 
  wordLinksMap: Record<string, string>,
  listeningSecs: number,
  languageFlagsMap: Record<string, string>
) {
  if (!db) {
    console.warn("Firestore database 'db' is undefined. Skipping uploadLocalToCloud.");
    return;
  }
  // Push profile first including languageFlags
  const path = `users/${userId}`;
  try {
    await setDoc(doc(db, "users", userId), {
      listeningSeconds: listeningSecs,
      languageFlags: languageFlagsMap,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }

  // Batched uploading
  let batch = writeBatch(db);
  let opCount = 0;

  // Flush batches in blocks of 200 to stay safely below Firestore 500 limits
  const commitBatchIfNeeded = async () => {
    opCount++;
    if (opCount >= 200) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  };

  // Add all local custom lessons
  for (const lesson of lessonsList) {
    const { lessonWithoutImages, images } = stripLessonImages(lesson);
    const lessonDocRef = doc(db, "users", userId, "lessons", lesson.id);
    batch.set(lessonDocRef, lessonWithoutImages);
    await commitBatchIfNeeded();

    for (const img of images) {
      const imgRef = doc(db, "users", userId, "lessons", lesson.id, "images", img.id);
      batch.set(imgRef, {
        dataUrl: img.dataUrl,
        width: img.width,
        height: img.height
      });
      await commitBatchIfNeeded();
    }
  }

  // Add all local lesson types
  for (const t of typesList) {
    const typeRef = doc(db, "users", userId, "lessonTypes", t.id);
    batch.set(typeRef, t);
    await commitBatchIfNeeded();
  }

  // Add all custom words (stored in "lingqs" collection)
  for (const word of Object.keys(vocabMap)) {
    const normId = safeDocId(word);
    const lingqRef = doc(db, "users", userId, "lingqs", normId);
    batch.set(lingqRef, {
      ...vocabMap[word],
      word: (vocabMap[word].word || word).replace(/^[a-zA-Z]+_/, "")
    });
    await commitBatchIfNeeded();
  }

  // Add word translation connections
  for (const srcWord of Object.keys(wordLinksMap)) {
    const normId = safeDocId(srcWord);
    const linkRef = doc(db, "users", userId, "wordLinks", normId);
    batch.set(linkRef, {
      sourceWord: srcWord,
      targetWord: wordLinksMap[srcWord]
    });
    await commitBatchIfNeeded();
  }

  // Final commit
  if (opCount > 0) {
    await batch.commit();
  }
}

export async function clearAllUserDataOnFirestore(userId: string) {
  if (!db) {
    console.warn("Firestore database 'db' is undefined. Skipping clearAllUserDataOnFirestore.");
    return;
  }
  const path = `users/${userId}`;
  try {
    // Reset parent user document stats
    await setDoc(doc(db, "users", userId), {
      listeningSeconds: 0,
      languageFlags: {},
      updatedAt: Date.now()
    }, { merge: true });

    let batch = writeBatch(db);
    let opCount = 0;

    const commitBatchIfNeeded = async () => {
      opCount++;
      if (opCount >= 200) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    };

    // 1. Delete all lessons
    const lessonsSnap = await getDocs(collection(db, "users", userId, "lessons"));
    for (const docSnap of lessonsSnap.docs) {
      const lessonId = docSnap.id;
      const imagesSnap = await getDocs(collection(db, "users", userId, "lessons", lessonId, "images"));
      for (const imgSnap of imagesSnap.docs) {
        batch.delete(imgSnap.ref);
        await commitBatchIfNeeded();
      }
      batch.delete(docSnap.ref);
      await commitBatchIfNeeded();
    }

    // 2. Delete all lessonTypes
    const typesSnap = await getDocs(collection(db, "users", userId, "lessonTypes"));
    for (const docSnap of typesSnap.docs) {
      batch.delete(docSnap.ref);
      await commitBatchIfNeeded();
    }

    // 3. Delete all custom words (stored in "lingqs" collection)
    const lingqsSnap = await getDocs(collection(db, "users", userId, "lingqs"));
    for (const docSnap of lingqsSnap.docs) {
      batch.delete(docSnap.ref);
      await commitBatchIfNeeded();
    }

    // 4. Delete all wordLinks
    const linksSnap = await getDocs(collection(db, "users", userId, "wordLinks"));
    for (const docSnap of linksSnap.docs) {
      batch.delete(docSnap.ref);
      await commitBatchIfNeeded();
    }

    if (opCount > 0) {
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

