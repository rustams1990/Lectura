import React, { useState } from "react";
import { Sparkles, ChevronUp, ChevronDown, Loader2, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { safeJsonParse } from "../utils";

interface AiExplainerChatProps {
  word: string | null;
  sentence: string | null;
  targetLanguage: string;
  translationLanguage: string;
  settings: any;
  customAnswer: string;
  onCustomAnswerChange: (val: string) => void;
  onExplanationReceived: (data: any, questionText: string) => void;
  onSaveExplanation: () => void;
}

export default function AiExplainerChat({
  word,
  sentence,
  targetLanguage,
  translationLanguage,
  settings,
  customAnswer,
  onCustomAnswerChange,
  onExplanationReceived,
  onSaveExplanation,
}: AiExplainerChatProps) {
  const { t } = useTranslation();
  const [askAiOpen, setAskAiOpen] = useState(true);
  const [customQuestion, setCustomQuestion] = useState("");
  const [customAiLoading, setCustomAiLoading] = useState(false);
  const [customAiError, setCustomAiError] = useState<string | null>(null);

  const handleAskAi = async (questionText: string) => {
    if (!word || !questionText.trim()) return;
    setCustomAiLoading(true);
    setCustomAiError(null);
    if (customQuestion !== questionText) {
      setCustomQuestion(questionText);
    }

    try {
      const endpoint = "/api/explain";
      const bodyParams: any = {
        word,
        context: sentence || word,
        targetLanguage,
        translationLanguage,
        aiProvider: settings?.aiProvider || "gemini",
        localAiUrl: settings?.localAiUrl || "http://localhost:11434/api/generate",
        localAiModel: settings?.localAiModel || "phi3.5",
        customQuestion: questionText.trim(),
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyParams),
      });

      if (!response.ok) {
        throw new Error("Failed to get explanation from AI.");
      }

      const data = await safeJsonParse(response);
      onExplanationReceived(data, questionText);
    } catch (err: any) {
      console.error(err);
      setCustomAiError(err.message || t('explainer.connection_error', "Ошибка соединения."));
    } finally {
      setCustomAiLoading(false);
    }
  };

  return (
    <div className="space-y-3 shrink-0 animate-in slide-in-from-top-1 duration-150">
      <div className="border border-purple-100 dark:border-purple-900/50 rounded-xl overflow-visible bg-purple-50/10 dark:bg-purple-950/5">
        <button
          type="button"
          onClick={() => setAskAiOpen(!askAiOpen)}
          className="w-full px-2.5 py-1.5 flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-purple-50/20 dark:hover:bg-purple-950/10 transition-colors"
        >
          <span className="uppercase tracking-wider text-[9px] text-purple-600 dark:text-purple-400 font-black font-sans flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-purple-500 animate-pulse" /> {t('explainer.ask_ai_btn', 'Ask AI')}
          </span>
          {askAiOpen ? <ChevronUp className="w-3 h-3 text-purple-400" /> : <ChevronDown className="w-3 h-3 text-purple-400" />}
        </button>

        {askAiOpen && (
          <div className="p-2.5 pt-0 border-t border-purple-100/30 dark:border-purple-900/20 space-y-2.5">
            <div className="relative mt-1.5">
              <textarea
                value={customQuestion}
                onChange={(e) => setCustomQuestion(e.target.value)}
                placeholder={t('explainer.ask_ai_placeholder', 'Ask a question about the text... (e.g., Why this form? Explain grammar.)')}
                rows={2}
                className="w-full p-2 text-xs bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500/80 transition-all font-medium custom-scrollbar resize-none"
              />
            </div>

            {/* Quick Prompts */}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => handleAskAi(t('explainer.ask_grammar_prompt', 'Explain grammar and word forms'))}
                className="px-2 py-1 bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-bold rounded-lg border border-purple-100/50 dark:border-purple-900/30 transition-all cursor-pointer"
              >
                📖 {t('explainer.ask_grammar_btn', 'Explain grammar')}
              </button>
              <button
                type="button"
                onClick={() => handleAskAi(t('explainer.ask_meaning_prompt', 'What does this expression/idiom mean in context?'))}
                className="px-2 py-1 bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-bold rounded-lg border border-purple-100/50 dark:border-purple-900/30 transition-all cursor-pointer"
              >
                💡 {t('explainer.ask_meaning_btn', 'Explain idiom/meaning')}
              </button>
              <button
                type="button"
                onClick={() => handleAskAi(t('explainer.ask_literal_prompt', 'Translate literally and explain differences'))}
                className="px-2 py-1 bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-bold rounded-lg border border-purple-100/50 dark:border-purple-900/30 transition-all cursor-pointer"
              >
                ⚡ {t('explainer.ask_literal_btn', 'Translate literally')}
              </button>
            </div>

            {/* Action and status row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                {customAiLoading && (
                  <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] font-bold">
                    <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
                    <span className="truncate">{t('explainer.ai_typing', 'AI is formulating answer...')}</span>
                  </div>
                )}
                {customAiError && (
                  <div className="text-[10px] text-red-500 font-bold truncate" title={customAiError}>
                    {t('explainer.error_prefix', 'Error: ')}{customAiError}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleAskAi(customQuestion)}
                disabled={customAiLoading || !customQuestion.trim()}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10.5px] font-bold shrink-0 transition-all disabled:opacity-50 flex items-center gap-1 cursor-pointer active:scale-95"
              >
                {t('explainer.ask_ai_submit', 'Ask AI ✨')}
              </button>
            </div>

            {/* Answer display */}
            {customAnswer && (
              <div className="space-y-1.5 pt-2.5 border-t border-purple-100/30 dark:border-purple-900/20">
                <div className="flex items-center justify-between">
                  <span className="text-[8.5px] font-extrabold uppercase tracking-widest text-purple-600 dark:text-purple-400">{t('explainer.ai_explanation_label', 'AI Explanation:')}</span>
                  <button
                    type="button"
                    onClick={onSaveExplanation}
                    className="text-[9px] font-bold text-teal-600 hover:text-teal-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <Save className="w-2.5 h-2.5" /> {t('explainer.save_to_dict', 'Save to dictionary')}
                  </button>
                </div>
                <div className="relative group/answer">
                  <textarea
                    value={customAnswer}
                    onChange={(e) => onCustomAnswerChange(e.target.value)}
                    rows={5}
                    className="w-full p-2 text-xs bg-purple-50/15 dark:bg-purple-950/5 border border-purple-100/50 dark:border-purple-900/20 rounded-lg text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500/80 transition-all font-medium custom-scrollbar"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
