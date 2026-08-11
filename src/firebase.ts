/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { initializeFirestore, getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Detect if we're running on a local/self-hosted server
// In that case Firebase is not needed and its initialization would make
// unnecessary network requests (causing 17+ second load times on first visit)
const _hostname = typeof window !== "undefined" ? window.location.hostname : "";
const _isLocalEnv = _hostname === "localhost"
  || _hostname === "127.0.0.1"
  || _hostname === "::1"
  || _hostname.startsWith("192.168.")
  || _hostname.startsWith("10.")
  || _hostname.startsWith("172.");

let safeDb: any = null;

if (!_isLocalEnv) {
  // Initialize Services with custom settings to guarantee connection in sandboxed proxy environments
  const dbId = (firebaseConfig as any).firestoreDatabaseId;
  const targetDbId = (dbId && dbId !== "(default)" && typeof dbId === "string" && dbId.trim().length > 0)
    ? dbId.trim()
    : undefined;

  try {
    if (targetDbId) {
      safeDb = initializeFirestore(app, { experimentalForceLongPolling: true }, targetDbId);
    } else {
      safeDb = initializeFirestore(app, { experimentalForceLongPolling: true });
    }
  } catch (err) {
    console.warn("Firestore already initialized or custom options failed. Falling back to getFirestore:", err);
    try {
      if (targetDbId) {
        safeDb = getFirestore(app, targetDbId);
      } else {
        safeDb = getFirestore(app);
      }
    } catch (fallbackErr) {
      console.error("Critical: Failed to resolve getFirestore as fallback:", fallbackErr);
    }
  }
}

export const db = safeDb;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();


// Connection testing routine as required by the Firebase Integration guide
export async function testConnection() {
  if (!db) {
    console.warn("Firestore database instance 'db' is undefined. Connection test aborted.");
    return;
  }
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("Firebase connection verified.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Please check your Firebase configuration: client appears to be offline.");
    } else {
      console.log("Initial silent connection ping to register Firestore rules lookup complete.");
    }
  }
}

// Active test trigger — only in cloud mode (server mode doesn't use Firebase)
// Check hostname directly since localStorage is per-origin and may be empty on first visit
if (typeof window !== "undefined") {
  const hostname = window.location.hostname;
  const isLocalEnv = hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname.startsWith("192.168.")
    || hostname.startsWith("10.")
    || hostname.startsWith("172.");
  if (!isLocalEnv) {
    setTimeout(() => {
      testConnection().catch((err) => {
        console.warn("Silent Firebase verification ping promise was rejected:", err);
      });
    }, 1500);
  }
}

