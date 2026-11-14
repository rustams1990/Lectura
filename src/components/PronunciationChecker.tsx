/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Square, Play, Volume2, RotateCcw, X, Loader2 } from 'lucide-react';
import {
  PronunciationEvaluation,
  PronunciationRecorderSession,
  revokeLastRecordedAudio,
} from '../utils/pronunciationService';
import { playGoogleTTS, getEffectiveTtsLocale } from '../utils';
import { ReaderSettings } from '../types';
import { useTranslation } from 'react-i18next';

export interface UsePronunciationTrainerOptions {
  targetText: string;
  targetLanguage: string;
  settings?: ReaderSettings;
  onPlayReference?: () => void;
}

export function usePronunciationTrainer({
  targetText,
  targetLanguage,
  settings,
  onPlayReference,
}: UsePronunciationTrainerOptions) {
  const { i18n } = useTranslation();
  const [state, setState] = useState<'idle' | 'listening' | 'processing'>('idle');
  const [interimText, setInterimText] = useState('');
  const [evaluation, setEvaluation] = useState<PronunciationEvaluation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPlayingMyVoice, setIsPlayingMyVoice] = useState(false);
  const [isPlayingRef, setIsPlayingRef] = useState(false);

  const sessionRef = useRef<PronunciationRecorderSession | null>(null);
  const myAudioRef = useRef<HTMLAudioElement | null>(null);

  // Reset when targetText changes
  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.stop();
      sessionRef.current = null;
    }
    setState('idle');
    setInterimText('');
    setEvaluation(null);
    setErrorMsg(null);
  }, [targetText]);

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.stop();
        sessionRef.current = null;
      }
      if (myAudioRef.current) {
        myAudioRef.current.pause();
        myAudioRef.current = null;
      }
    };
  }, []);

  const pauseActivePageMedia = useCallback(() => {
    try {
      // Pause any HTML5 video/audio on the page
      document.querySelectorAll<HTMLMediaElement>('video, audio').forEach((el) => {
        if (!el.paused) el.pause();
      });
      // Pause YouTube iframe player if present in ReaderScreen
      const ytPlayer = (window as any).__lecturaYoutubePlayer;
      if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
        ytPlayer.pauseVideo();
      }
      window.dispatchEvent(new CustomEvent('lectura:word-auto-pause'));
    } catch (_) {}
  }, []);

  const toggleRecording = useCallback(async () => {
    if (!targetText || !targetText.trim()) return;

    if (state === 'listening') {
      await sessionRef.current?.stop();
      return;
    }

    if (state === 'processing') return;

    pauseActivePageMedia();
    setErrorMsg(null);
    setInterimText('');
    setEvaluation(null);

    const locale = getEffectiveTtsLocale(targetLanguage, settings);
    const session = new PronunciationRecorderSession(
      targetText,
      locale || targetLanguage,
      {
        onStateChange: (s) => setState(s),
        onInterim: (txt) => setInterimText(txt),
        onResult: (evalRes) => {
          setEvaluation(evalRes);
          setInterimText('');
        },
        onError: (err) => {
          setErrorMsg(err);
          setState('idle');
        },
      },
      '',
      i18n.language || 'en'
    );
    sessionRef.current = session;
    await session.start();
  }, [targetText, targetLanguage, settings, state, pauseActivePageMedia, i18n.language]);

  const playMyVoice = useCallback(() => {
    if (!evaluation?.audioBlobUrl) return;
    if (myAudioRef.current) {
      myAudioRef.current.pause();
      myAudioRef.current = null;
    }
    const audio = new Audio(evaluation.audioBlobUrl);
    myAudioRef.current = audio;
    setIsPlayingMyVoice(true);
    audio.onended = () => setIsPlayingMyVoice(false);
    audio.onerror = () => setIsPlayingMyVoice(false);
    audio.play().catch(() => setIsPlayingMyVoice(false));
  }, [evaluation?.audioBlobUrl]);

  const playReferenceVoice = useCallback(async () => {
    if (onPlayReference) {
      onPlayReference();
      return;
    }
    if (!targetText || isPlayingRef) return;
    setIsPlayingRef(true);
    try {
      await playGoogleTTS(targetText, targetLanguage, settings);
    } catch (_) {
    } finally {
      setIsPlayingRef(false);
    }
  }, [onPlayReference, targetText, targetLanguage, settings, isPlayingRef]);

  const closePanel = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.stop();
      sessionRef.current = null;
    }
    setState('idle');
    setInterimText('');
    setEvaluation(null);
    setErrorMsg(null);
    revokeLastRecordedAudio();
  }, []);

  return {
    state,
    interimText,
    evaluation,
    errorMsg,
    isPlayingMyVoice,
    isPlayingRef,
    toggleRecording,
    playMyVoice,
    playReferenceVoice,
    closePanel,
    isOpen: state !== 'idle' || evaluation !== null || errorMsg !== null,
  };
}

interface PronunciationMicButtonProps {
  state: 'idle' | 'listening' | 'processing';
  onClick: () => void;
  size?: 'sm' | 'md';
  className?: string;
  label?: string;
}

export const PronunciationMicButton: React.FC<PronunciationMicButtonProps> = ({
  state,
  onClick,
  size = 'md',
  className = '',
  label,
}) => {
  const { t, i18n } = useTranslation();
  const isRu = (i18n.language || 'en').toLowerCase().startsWith('ru');
  const isListening = state === 'listening';
  const isProcessing = state === 'processing';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={
        isListening
          ? t('pronunciation.stop_recording', isRu ? 'Остановить запись' : 'Stop recording')
          : t('pronunciation.check_pronunciation', isRu ? 'Проверить произношение (🎙️)' : 'Check pronunciation (🎙️)')
      }
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border transition-all cursor-pointer select-none shrink-0 ${
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-2.5 text-xs'
      } ${
        isListening
          ? 'bg-rose-500 text-white border-rose-600 animate-pulse shadow-sm shadow-rose-500/30'
          : isProcessing
            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
            : 'bg-orange-50/90 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-900/40 text-orange-600 dark:text-orange-400 border-orange-200/70 dark:border-orange-900/50 active:scale-95'
      } ${className}`}
    >
      {isProcessing ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : isListening ? (
        <Square className="w-3 h-3 fill-current" />
      ) : (
        <Mic className="w-3.5 h-3.5" />
      )}
      {label && <span className="font-bold">{label}</span>}
    </button>
  );
};

interface PronunciationResultPanelProps {
  state: 'idle' | 'listening' | 'processing';
  interimText: string;
  evaluation: PronunciationEvaluation | null;
  errorMsg: string | null;
  isPlayingMyVoice: boolean;
  onToggleRecording: () => void;
  onPlayMyVoice: () => void;
  onPlayReference: () => void;
  onClose: () => void;
  compact?: boolean;
}

export const PronunciationResultPanel: React.FC<PronunciationResultPanelProps> = ({
  state,
  interimText,
  evaluation,
  errorMsg,
  isPlayingMyVoice,
  onToggleRecording,
  onPlayMyVoice,
  onPlayReference,
  onClose,
  compact = false,
}) => {
  const { t, i18n } = useTranslation();
  const isRu = (i18n.language || 'en').toLowerCase().startsWith('ru');

  if (state === 'idle' && !evaluation && !errorMsg) return null;

  const score = evaluation?.overallScore ?? 0;
  const scoreColorClass =
    score >= 80
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
      : score >= 50
        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';

  const scoreLabel =
    score >= 85
      ? t('pronunciation.excellent', isRu ? 'Отлично!' : 'Excellent!')
      : score >= 65
        ? t('pronunciation.good', isRu ? 'Хорошо!' : 'Good!')
        : score >= 45
          ? t('pronunciation.fair', isRu ? 'Почти!' : 'Almost!')
          : t('pronunciation.try_again', isRu ? 'Попробуйте ещё раз' : 'Try again');

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`rounded-xl border border-orange-200/80 dark:border-zinc-700/90 bg-gradient-to-br from-orange-50/70 via-white to-amber-50/40 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-800/90 ${
        compact ? 'p-2.5 my-2' : 'p-3.5 my-2.5'
      } shadow-xs transition-all animate-in fade-in duration-150`}
    >
      {/* Top Row: Status or Score + Close */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {state === 'listening' && (
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span>{t('pronunciation.listening_now', isRu ? 'Говорите сейчас...' : 'Speak now...')}</span>
            </div>
          )}
          {state === 'processing' && (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t('pronunciation.analyzing', isRu ? 'Анализ произношения...' : 'Analyzing pronunciation...')}</span>
            </div>
          )}
          {state === 'idle' && evaluation && (
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-extrabold border ${scoreColorClass}`}
              >
                🎙️ {score}% · {scoreLabel}
              </span>
            </div>
          )}
          {errorMsg && (
            <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
              ⚠️ {errorMsg}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          title={t('common.close', isRu ? 'Закрыть' : 'Close')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Live Interim Transcript while speaking */}
      {state === 'listening' && (
        <div className="text-xs text-zinc-600 dark:text-zinc-300 italic bg-white/80 dark:bg-zinc-950/60 rounded-lg px-2.5 py-1.5 border border-zinc-200/60 dark:border-zinc-800 min-h-[28px] flex items-center justify-between gap-2">
          <span className="truncate">
            {interimText || t('pronunciation.speak_prompt', isRu ? 'Произнесите выделенное слово или фразу вслух...' : 'Speak the selected word or phrase aloud...')}
          </span>
          <button
            type="button"
            onClick={onToggleRecording}
            className="px-2 py-0.5 rounded bg-rose-500 text-white text-[11px] font-bold shrink-0 cursor-pointer hover:bg-rose-600"
          >
            {t('pronunciation.done', isRu ? 'Готово' : 'Done')}
          </button>
        </div>
      )}

      {/* Evaluation Word-by-Word Breakdown + Compare My Voice Controls */}
      {state === 'idle' && evaluation && (
        <div className="space-y-2">
          {/* Colored Words */}
          <div className="flex flex-wrap items-center gap-1.5 bg-white/90 dark:bg-zinc-950/70 rounded-lg px-2.5 py-2 border border-zinc-200/70 dark:border-zinc-800">
            {evaluation.words.map((w, idx) => {
              const colorCls =
                w.status === 'good'
                  ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
                  : w.status === 'fair'
                    ? 'text-amber-700 dark:text-amber-300 bg-amber-500/15 border-amber-500/30'
                    : 'text-rose-700 dark:text-rose-300 bg-rose-500/15 border-rose-500/30 line-through decoration-rose-500/50';
              return (
                <span
                  key={`${w.raw}-${idx}`}
                  title={
                    w.spokenMatch
                      ? `${w.similarity}% (${t('pronunciation.heard', isRu ? 'услышано' : 'heard')}: "${w.spokenMatch}")`
                      : `${w.similarity}%`
                  }
                  className={`px-1.5 py-0.5 rounded-md text-sm font-bold border transition-colors ${colorCls}`}
                >
                  {w.raw}
                </span>
              );
            })}
          </div>

          {evaluation.spokenText && (
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 px-0.5">
              {t('pronunciation.you_said', isRu ? 'Распознано' : 'Heard')}:{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                «{evaluation.spokenText}»
              </span>
            </div>
          )}

          {/* Action Buttons: Compare My Voice ("▶️ Моя запись"), Reference ("🔊 Оригинал"), Retry ("🔄 Ещё раз") */}
          <div className="flex items-center flex-wrap gap-1.5 pt-0.5">
            {evaluation.audioBlobUrl && (
              <button
                type="button"
                onClick={onPlayMyVoice}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  isPlayingMyVoice
                    ? 'bg-sky-600 text-white border-sky-700 animate-pulse'
                    : 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/50'
                }`}
                title={t('pronunciation.listen_my_voice', isRu ? 'Прослушать свою запись' : 'Listen to my recording')}
              >
                <Play className="w-3 h-3 fill-current" />
                <span>{t('pronunciation.my_recording', isRu ? 'Моя запись' : 'My Voice')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onPlayReference}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-all cursor-pointer"
              title={t('pronunciation.listen_reference', isRu ? 'Прослушать оригинал' : 'Listen to original')}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{t('pronunciation.original', isRu ? 'Оригинал' : 'Original')}</span>
            </button>

            <button
              type="button"
              onClick={onToggleRecording}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-all cursor-pointer ml-auto"
              title={t('pronunciation.retry', isRu ? 'Повторить попытку' : 'Try again')}
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t('pronunciation.retry_short', isRu ? 'Ещё раз' : 'Retry')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
