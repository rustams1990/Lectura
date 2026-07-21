import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global error handlers to capture any elusive uncaught exceptions or network errors
window.addEventListener("error", (event) => {
  console.error("Global captured uncaught error:", event.message, "at", event.filename, ":", event.lineno);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Global captured unhandled promise rejection:", event.reason);
});

import { AuthProvider } from './context/AuthContext';
import { LessonProvider } from './context/LessonContext';
import { VocabProvider } from './context/VocabContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <VocabProvider>
        <LessonProvider>
          <App />
        </LessonProvider>
      </VocabProvider>
    </AuthProvider>
  </StrictMode>,
);

// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[PWA] Service Worker registered successfully:', reg.scope);
      })
      .catch((err) => {
        console.error('[PWA] Service Worker registration failed:', err);
      });
  });
}


