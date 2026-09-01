import React from "react";

export interface WordTokenProps {
  wordId: string;
  cleanWord: string;
  rawString: string;
  wordContent: string;
  prefix: string;
  suffix: string;
  status: string;
  isActive: boolean;
  isInSelectedPhrase: boolean;
  isFirstInPhrase: boolean;
  isLastInPhrase: boolean;
  isWordActive: boolean;
  hasWordLink: boolean;
  isHovered: boolean;
  isTextMode: boolean;
  showOnlyUnknown?: boolean;
  unknownViewMode?: string;
  cjkSpacingClass?: string;
  readerTheme?: string;
  onSelect: (e: React.MouseEvent, rawString: string, cleanWord: string) => void;
  onKeyDown: (e: React.KeyboardEvent, rawString: string, cleanWord: string) => void;
  onMouseEnter: (e: React.MouseEvent, wordId: string, cleanWord: string) => void;
  onMouseLeave: () => void;
}

function WordTokenComponent({
  wordId,
  cleanWord,
  rawString,
  wordContent,
  prefix,
  suffix,
  status,
  isActive,
  isInSelectedPhrase,
  isFirstInPhrase,
  isLastInPhrase,
  isWordActive,
  hasWordLink,
  isHovered,
  isTextMode,
  showOnlyUnknown,
  unknownViewMode,
  cjkSpacingClass = "",
  onSelect,
  onKeyDown,
  onMouseEnter,
  onMouseLeave,
}: WordTokenProps) {
  // Padding computation
  const paddingClass = isTextMode
    ? ""
    : isInSelectedPhrase
    ? `${isFirstInPhrase ? "pl-1.5" : "pl-0.5"} ${isLastInPhrase ? "pr-1.5" : "pr-0.5"}`
    : `${prefix ? "pl-0.5" : "pl-1"} ${suffix ? "pr-0.5" : "pr-1"}`;

  // Build style class
  let styleClass = "";
  if (isInSelectedPhrase) {
    const phraseRounding = isFirstInPhrase && isLastInPhrase
      ? "rounded-md"
      : isFirstInPhrase
      ? "rounded-l-md rounded-r-none"
      : isLastInPhrase
      ? "rounded-r-md rounded-l-none"
      : "rounded-none";
    styleClass = `bg-emerald-300/80 dark:bg-emerald-500/40 text-neutral-900 dark:text-neutral-100 ${phraseRounding} py-0.5 leading-tight transition-colors border-0 border-transparent shadow-none in-selected-phrase`;
  } else {
    // Base rounding and styling
    const baseRounding = "rounded-[3px] py-0.5 leading-tight";
    if (status === "ignored" || status === "known") {
      styleClass = `hover:bg-zinc-100/60 dark:hover:bg-zinc-800/50 text-inherit cursor-pointer ${baseRounding} transition-colors font-normal status-${status}`;
    } else if (status === "1") {
      styleClass = `bg-[#f3a4b0]/45 dark:bg-rose-950/60 hover:bg-[#f3a4b0]/70 dark:hover:bg-rose-900/60 text-rose-900 dark:text-rose-300 ${baseRounding} font-semibold border-b border-[#f3a4b0] dark:border-rose-500/80 cursor-pointer transition-colors status-1`;
    } else if (status === "2") {
      styleClass = `bg-[#f0d46d]/45 dark:bg-amber-950/60 hover:bg-[#f0d46d]/70 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-300 ${baseRounding} font-semibold border-b border-[#f0d46d] dark:border-amber-400/80 cursor-pointer transition-colors status-2`;
    } else if (status === "3" || (status as any) === "learning") {
      styleClass = `bg-[#a6d896]/45 dark:bg-emerald-950/60 hover:bg-[#a6d896]/70 dark:hover:bg-emerald-900/60 text-emerald-900 dark:text-emerald-300 ${baseRounding} font-medium border-b border-[#a6d896] dark:border-emerald-400/80 cursor-pointer transition-colors status-3`;
    } else if (status === "4") {
      styleClass = `bg-[#99bce8] dark:bg-blue-950/60 hover:bg-[#86b0e3] dark:hover:bg-blue-900/60 text-blue-950 dark:text-blue-300 ${baseRounding} font-semibold border-b border-[#204bf4] dark:border-blue-400/80 cursor-pointer transition-colors status-4`;
    } else if (status === "5") {
      styleClass = `bg-[#c5aee2] dark:bg-purple-950/60 hover:bg-[#b096d2] dark:hover:bg-purple-900/60 text-purple-950 dark:text-purple-300 ${baseRounding} font-semibold border-b border-[#a882dd] dark:border-purple-400/80 cursor-pointer transition-colors status-5`;
    } else {
      // Default (new / status 0)
      styleClass = `bg-[#cbeeff] dark:bg-sky-950/70 hover:bg-[#addbff] dark:hover:bg-sky-900/60 text-sky-900 dark:text-sky-300 ${baseRounding} cursor-pointer transition-colors status-0`;
    }

    if ((status === "ignored" || status === "known") && showOnlyUnknown && unknownViewMode === "text") {
      styleClass = `${styleClass} opacity-15 dark:opacity-10 blur-[2.5px] hover:blur-none hover:opacity-100 duration-300`;
    }

    if (isTextMode) {
      if (isWordActive) {
        styleClass = `${styleClass} underline decoration-2 underline-offset-4 decoration-amber-500 font-bold bg-amber-500/15 dark:bg-amber-500/25 rounded-xs px-0.5`;
      } else if (isActive) {
        styleClass = `${styleClass} underline decoration-2 underline-offset-4 decoration-teal-500 font-bold bg-teal-500/15 dark:bg-teal-500/25 rounded-xs px-0.5`;
      }
    } else {
      if (isWordActive) {
        styleClass = `${styleClass} ring-2 ring-amber-500 dark:ring-amber-400 font-extrabold shadow-sm`;
      } else if (isActive) {
        styleClass = `${styleClass} ring-2 ring-teal-500 dark:ring-teal-400 ring-offset-1 dark:ring-offset-zinc-950 shadow-sm`;
      }
    }
  }

  return (
    <span
      className={`inline whitespace-nowrap relative ${isHovered ? "z-50" : ""} ${cjkSpacingClass}`}
      spellCheck={false}
    >
      {prefix && (
        <span className="inline text-inherit select-none pointer-events-none opacity-95 mr-0">
          {prefix}
        </span>
      )}
      <span
        role="button"
        tabIndex={0}
        id={`word-${cleanWord}-${wordId}`}
        data-token={cleanWord}
        onClick={(e) => onSelect(e, rawString, cleanWord)}
        onKeyDown={(e) => onKeyDown(e, rawString, cleanWord)}
        onMouseEnter={(e) => onMouseEnter(e, wordId, cleanWord)}
        onMouseLeave={onMouseLeave}
        className={`reader-word-token ${styleClass} ${paddingClass} ${isTextMode ? "inline" : "inline-block my-0.5"} cursor-pointer select-text text-[length:inherit] transition-all`}
        style={{ outline: "none" }}
        spellCheck={false}
      >
        {wordContent}
      </span>
      {suffix && (
        <span className="inline text-inherit select-none pointer-events-none opacity-95 ml-0">
          {suffix}
        </span>
      )}
    </span>
  );
}

export const WordToken = React.memo(WordTokenComponent, (prev, next) => {
  return (
    prev.wordId === next.wordId &&
    prev.status === next.status &&
    prev.isActive === next.isActive &&
    prev.isInSelectedPhrase === next.isInSelectedPhrase &&
    prev.isFirstInPhrase === next.isFirstInPhrase &&
    prev.isLastInPhrase === next.isLastInPhrase &&
    prev.isWordActive === next.isWordActive &&
    prev.hasWordLink === next.hasWordLink &&
    prev.isHovered === next.isHovered &&
    prev.isTextMode === next.isTextMode &&
    prev.showOnlyUnknown === next.showOnlyUnknown &&
    prev.unknownViewMode === next.unknownViewMode &&
    prev.cjkSpacingClass === next.cjkSpacingClass &&
    prev.wordContent === next.wordContent &&
    prev.prefix === next.prefix &&
    prev.suffix === next.suffix
  );
});

export default WordToken;
