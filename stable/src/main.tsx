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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

