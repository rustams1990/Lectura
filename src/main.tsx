import React, { Component, ErrorInfo, ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';

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
import { ToastProvider } from './context/ToastContext';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// @ts-ignore
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // @ts-ignore
  constructor(props: ErrorBoundaryProps) {
    // @ts-ignore
    super(props);
    // @ts-ignore
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught ErrorBoundary error:", error, errorInfo);
  }

  public render() {
    // @ts-ignore
    if (this.state && this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 flex items-center justify-center p-6 text-zinc-800 dark:text-zinc-200">
          <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto text-xl">
              ⚠️
            </div>
            <h2 className="text-lg font-black tracking-tight">An error occurred while rendering</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono bg-zinc-100 dark:bg-zinc-950 p-3 rounded-xl break-words text-left max-h-32 overflow-y-auto">
              {/* @ts-ignore */}
              {this.state.error?.message || "Unknown interface error"}
            </p>
            <button
              onClick={() => {
                window.location.hash = "#/library";
                window.location.reload();
              }}
              className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    // @ts-ignore
    return this.props ? this.props.children : null;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <VocabProvider>
            <LessonProvider>
              <App />
            </LessonProvider>
          </VocabProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// Service Worker is now automatically registered by vite-plugin-pwa


