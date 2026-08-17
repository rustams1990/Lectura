import React, { useState, useEffect } from "react";
import { Zap, Cpu, HardDrive, RefreshCw, CheckCircle2, Download, AlertCircle, Layers, Activity, Trash2 } from "lucide-react";
import { ReaderSettings } from "../types";
import { WhisperTelemetry } from "../services/whisperQueueService";

interface WhisperSettingsManagerProps {
  settings: any;
  onSettingsChange: (settings: any) => void;
  t: any;
}

const MODEL_DETAILS = [
  { id: "tiny", label: "Tiny", ram: "~150 MB", speed: "Fastest", desc: "Minimal memory footprint, good for quick audio" },
  { id: "base", label: "Base (Recommended)", ram: "~250 MB", speed: "Balanced", desc: "Best balance of accuracy, speed and memory" },
  { id: "small", label: "Small", ram: "~500 MB", speed: "Accurate", desc: "Higher accuracy for complex terminology & accents" },
  { id: "medium", label: "Medium", ram: "~1.5 GB", speed: "High precision", desc: "Maximum precision for long books & podcasts" }
];

export default function WhisperSettingsManager({
  settings,
  onSettingsChange,
  t
}: WhisperSettingsManagerProps) {
  const currentModel = settings.whisperModel || "base";
  const currentThreads = settings.whisperThreads || 2;
  const currentVad = settings.whisperVad !== false;
  const showMiniTelemetry = !!settings.showWhisperMiniTelemetry;

  const [cacheStatus, setCacheStatus] = useState<Record<string, { cached: boolean }>>({});
  const [telemetry, setTelemetry] = useState<WhisperTelemetry | null>(null);
  const [isUnloading, setIsUnloading] = useState(false);
  const [unloadMessage, setUnloadMessage] = useState<string | null>(null);

  // Fetch cache status on mount
  useEffect(() => {
    fetch("/api/whisper/models-status")
      .then(res => res.json())
      .then(data => {
        if (data.models) setCacheStatus(data.models);
      })
      .catch(() => {});
  }, []);

  // Poll telemetry every 3 seconds while on this tab
  useEffect(() => {
    const fetchTelemetry = () => {
      fetch("/api/whisper/telemetry")
        .then(res => res.json())
        .then(data => setTelemetry(data))
        .catch(() => {});
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleModelSelect = (modelId: string) => {
    onSettingsChange({
      ...settings,
      whisperModel: modelId as any
    });
  };

  const handleThreadsChange = (threads: number) => {
    onSettingsChange({
      ...settings,
      whisperThreads: threads
    });
  };

  const handleVadToggle = () => {
    onSettingsChange({
      ...settings,
      whisperVad: !currentVad
    });
  };

  const handleMiniTelemetryToggle = () => {
    onSettingsChange({
      ...settings,
      showWhisperMiniTelemetry: !showMiniTelemetry
    });
  };

  const handleReleaseRam = async () => {
    setIsUnloading(true);
    setUnloadMessage(null);
    try {
      const res = await fetch("/api/whisper/unload", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setUnloadMessage(t("whisper.ram_released_msg", "RAM successfully released!"));
        // Refresh telemetry
        const telRes = await fetch("/api/whisper/telemetry");
        const telData = await telRes.json();
        setTelemetry(telData);
      } else {
        setUnloadMessage(data.error || "Failed to release RAM");
      }
    } catch (e: any) {
      setUnloadMessage(e.message || "Failed to release RAM");
    } finally {
      setIsUnloading(false);
      setTimeout(() => setUnloadMessage(null), 4000);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="p-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent border border-emerald-200/60 dark:border-emerald-800/40 rounded-2xl flex items-start gap-3">
        <div className="p-2.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0 mt-0.5">
          <Zap className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h4 className="text-xs sm:text-sm font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <span>{t("whisper.title", "Local Speech Recognition (Faster-Whisper CPU)")}</span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 uppercase tracking-widest border border-emerald-200/60 dark:border-emerald-800/40">
              INT8 CPU
            </span>
          </h4>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-sans">
            {t("whisper.desc", "Fast offline speech-to-text with word-level timestamps and zero RAM overhead during idle (auto-unloads from memory when not in use).")}
          </p>
        </div>
      </div>

      {/* Model Selection */}
      <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h5 className="text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
              {t("whisper.model_selection", "Whisper Model Size")}
            </h5>
          </div>
          <span className="text-[10px] text-zinc-400 font-bold">
            {t("whisper.lazy_load_hint", "Loads only during active jobs")}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {MODEL_DETAILS.map((m) => {
            const isSelected = currentModel === m.id;
            const isCached = cacheStatus[m.id]?.cached;

            return (
              <div
                key={m.id}
                onClick={() => handleModelSelect(m.id)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                  isSelected
                    ? "bg-white dark:bg-zinc-900 border-emerald-500 dark:border-emerald-500 shadow-md ring-2 ring-emerald-500/20"
                    : "bg-white/60 dark:bg-zinc-900/60 border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-zinc-900 dark:text-zinc-100">
                        {m.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                      {m.desc}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <CheckCircle2 className="w-3 h-3" />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800/80 text-[10px]">
                  <span className="font-mono font-bold text-zinc-600 dark:text-zinc-300">
                    RAM: {m.ram}
                  </span>

                  {isCached ? (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1 border border-emerald-200/60 dark:border-emerald-800/40">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      <span>{t("whisper.cached_badge", "Cached on Disk")}</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold flex items-center gap-1 border border-amber-200/60 dark:border-amber-800/40">
                      <Download className="w-2.5 h-2.5" />
                      <span>{t("whisper.download_on_demand", "Downloads on Demand")}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Compute Threads & VAD Filter */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        
        {/* CPU Threads Slider */}
        <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <h5 className="text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                {t("whisper.cpu_threads", "CPU Threads")}
              </h5>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 font-mono font-bold text-xs text-zinc-800 dark:text-zinc-200">
              {currentThreads} {currentThreads === 1 ? "Thread" : "Threads"}
            </span>
          </div>

          <p className="text-[10px] text-zinc-500 leading-snug">
            {t("whisper.threads_desc", "Number of CPU cores used for transcription. Higher values speed up transcription on multi-core CPUs.")}
          </p>

          <input
            type="range"
            min="1"
            max={telemetry?.cpu?.cores || 8}
            step="1"
            value={currentThreads}
            onChange={(e) => handleThreadsChange(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-teal-600"
          />
          <div className="flex justify-between text-[9px] text-zinc-400 font-mono font-bold">
            <span>1 Core</span>
            <span>{Math.round((telemetry?.cpu?.cores || 8) / 2)} (Recommended)</span>
            <span>{telemetry?.cpu?.cores || 8} Cores</span>
          </div>
        </div>

        {/* VAD Filter Switch */}
        <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 flex flex-col justify-between space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-500" />
                <h5 className="text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                  {t("whisper.vad_filter", "VAD Silence Filter")}
                </h5>
              </div>
              <p className="text-[10px] text-zinc-500 leading-snug">
                {t("whisper.vad_desc", "Voice Activity Detection filters out silent gaps and background music before processing.")}
              </p>
            </div>

            <button
              type="button"
              onClick={handleVadToggle}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                currentVad ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  currentVad ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="text-[10px] font-bold text-zinc-400">
            {currentVad ? "✅ Enabled (Recommended)" : "⚪ Disabled (Transcribes raw audio)"}
          </div>
        </div>

      </div>

      {/* Hardware Telemetry & RAM Lifecycle */}
      <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h5 className="text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
              {t("whisper.telemetry_title", "Hardware Monitor & RAM Lifecycle")}
            </h5>
          </div>

          {/* Model Status Badge */}
          {telemetry?.model && (
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-black border flex items-center gap-1.5 ${
                telemetry.model.isLoaded
                  ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 animate-pulse"
                  : "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${telemetry.model.isLoaded ? "bg-emerald-500" : "bg-zinc-400"}`} />
                <span>{telemetry.model.status}</span>
              </span>

              {telemetry.model.isLoaded && (
                <button
                  type="button"
                  disabled={isUnloading}
                  onClick={handleReleaseRam}
                  className="px-2.5 py-1 text-[10px] font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg transition cursor-pointer flex items-center gap-1"
                  title={t("whisper.release_ram_tooltip", "Manually free model RAM immediately")}
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{isUnloading ? "Releasing..." : t("whisper.release_ram_btn", "Release RAM")}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {unloadMessage && (
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold rounded-xl border border-emerald-200">
            {unloadMessage}
          </div>
        )}

        {/* Live Gauges */}
        {telemetry && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/80 dark:border-zinc-800 space-y-1">
              <div className="text-[10px] font-bold uppercase text-zinc-400">Total System RAM</div>
              <div className="text-sm font-black font-mono text-zinc-800 dark:text-zinc-100">
                {Math.round(telemetry.ram.totalMb / 1024)} GB
              </div>
              <div className="text-[9px] text-zinc-400">
                Free: {Math.round(telemetry.ram.freeMb / 1024)} GB
              </div>
            </div>

            <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/80 dark:border-zinc-800 space-y-1">
              <div className="text-[10px] font-bold uppercase text-zinc-400">RAM Allocation</div>
              <div className="text-sm font-black font-mono text-zinc-800 dark:text-zinc-100">
                {telemetry.ram.percent}% Used
              </div>
              <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all duration-300"
                  style={{ width: `${telemetry.ram.percent}%` }}
                />
              </div>
            </div>

            <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/80 dark:border-zinc-800 space-y-1">
              <div className="text-[10px] font-bold uppercase text-zinc-400">Auto-Unload Timer</div>
              <div className="text-sm font-black font-mono text-zinc-800 dark:text-zinc-100">
                {telemetry.model.isLoaded ? `${telemetry.model.idleRemainingSeconds}s remaining` : "Idle (0s)"}
              </div>
              <div className="text-[9px] text-zinc-400">
                Returns 100% RAM to OS after 5m
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
