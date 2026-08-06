/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ContextSearchHit, highlightMatchInSentence } from "../contextSearch";

interface ContextSearchResultsProps {
  hits: ContextSearchHit[];
  query: string;
  currentLessonId?: string;
  onOpenLesson?: (lessonId: string, word: string, sentence: string) => void;
  compact?: boolean;
  maxVisible?: number;
  embedded?: boolean;
}

export default function ContextSearchResults({
  hits,
  query,
  currentLessonId,
  onOpenLesson,
  compact = false,
  maxVisible = 8,
  embedded = false,
}: ContextSearchResultsProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(true);
  const [showAll, setShowAll] = React.useState(false);

  if (!query.trim() || hits.length === 0) return null;

  const visibleHits = showAll ? hits : hits.slice(0, maxVisible);

  const resultsBody = (
    <div className={`space-y-2 ${compact ? "" : "max-h-72 overflow-y-auto"}`}>
      {!compact && !embedded && (
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed pt-1.5">
          {t('explainer.context_all_occurrences', 'All occurrences of "{{query}}" in uploaded texts:', { query })}
        </p>
      )}

      {visibleHits.map((hit, idx) => (
        <button
          key={`${hit.lessonId}-${idx}`}
          type="button"
          onClick={() => onOpenLesson?.(hit.lessonId, query, hit.sentence)}
          disabled={!onOpenLesson}
          className={`w-full text-left p-2 rounded-lg border transition-colors ${
            onOpenLesson
              ? "cursor-pointer hover:bg-teal-50/60 dark:hover:bg-teal-950/20 border-zinc-200/60 dark:border-zinc-800/60 hover:border-teal-200 dark:hover:border-teal-900/50"
              : "cursor-default border-zinc-200/40 dark:border-zinc-800/40"
          } ${hit.lessonId === currentLessonId ? "bg-teal-50/30 dark:bg-teal-950/10" : "bg-white/70 dark:bg-zinc-900/40"}`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <BookOpen className="w-3 h-3 text-teal-500 shrink-0" />
            <span className="text-[10px] font-black text-teal-700 dark:text-teal-400 truncate">
              {hit.lessonTitle}
            </span>
            {hit.lessonId === currentLessonId && (
              <span className="text-[8px] uppercase font-extrabold text-zinc-400 tracking-wider shrink-0">
                {t('explainer.context_now', 'current')}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-300 italic leading-relaxed">
            &ldquo;
            {highlightMatchInSentence(hit.sentence, hit.matchedForm).map((seg, segIdx) =>
              seg.isMatch ? (
                <mark
                  key={segIdx}
                  className="bg-teal-200/70 dark:bg-teal-800/50 text-teal-900 dark:text-teal-100 not-italic font-semibold rounded px-0.5"
                >
                  {seg.text}
                </mark>
              ) : (
                <span key={segIdx}>{seg.text}</span>
              )
            )}
            &rdquo;
          </p>
        </button>
      ))}

      {hits.length > maxVisible && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="text-[10px] font-extrabold text-teal-600 dark:text-teal-400 uppercase tracking-wider hover:underline cursor-pointer"
        >
          {showAll ? t('explainer.collapse', 'Collapse') : t('explainer.show_more', 'Show {{count}} more', { count: hits.length - maxVisible })}
        </button>
      )}
    </div>
  );

  if (embedded) {
    return resultsBody;
  }

  return (
    <div className="border border-zinc-100 dark:border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-50/40 dark:bg-zinc-950/20">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-2.5 py-1.5 flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/30 transition-colors"
      >
        <span className="uppercase tracking-wider text-[9px] text-zinc-400 dark:text-zinc-500 font-extrabold font-sans flex items-center gap-1.5">
          <BookOpen className="w-3 h-3" />
          {t('explainer.context_search_title', 'Context Search in Your Books')}
          <span className="text-teal-600 dark:text-teal-400 normal-case tracking-normal font-black">
            ({hits.length})
          </span>
        </span>
        {expanded ? <ChevronUp className="w-3 h-3 text-zinc-400" /> : <ChevronDown className="w-3 h-3 text-zinc-400" />}
      </button>

      {expanded && (
        <div className={`p-2.5 pt-0 border-t border-zinc-100 dark:border-zinc-800 ${compact ? "" : ""}`}>
          {resultsBody}
        </div>
      )}
    </div>
  );
}
