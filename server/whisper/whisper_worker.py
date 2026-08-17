#!/usr/bin/env python3
"""
Faster-Whisper standalone streaming worker for Lectura.
Outputs real-time JSON events to stdout for node IPC.
"""
import os
import sys
import io
import time
import json
import argparse
import gc
import logging
from typing import Optional

# Force UTF-8 on Windows standard I/O streams
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# Prevent internal whisper/huggingface logs from corrupting JSON stdout
logging.basicConfig(level=logging.ERROR)

def is_model_cached(model_size: str, download_root: str) -> bool:
    """Checks whether the faster-whisper CTranslate2 model files are cached locally."""
    # Common huggingface cache folder names for faster-whisper models
    repo_suffixes = [
        f"faster-whisper-{model_size}",
        f"models--Systran--faster-whisper-{model_size}",
        f"Systran/faster-whisper-{model_size}"
    ]
    
    check_dirs = [
        download_root,
        os.path.expanduser("~/.cache/huggingface/hub"),
        os.path.expanduser("~/.cache/whisperflow"),
        os.path.expanduser("~/.cache/faster_whisper")
    ]
    
    for cdir in check_dirs:
        if not os.path.exists(cdir):
            continue
        for root, dirs, files in os.walk(cdir):
            if "model.bin" in files or "model.safetensors" in files:
                for suffix in repo_suffixes:
                    if suffix.lower() in root.lower():
                        return True
    return False

def emit_event(event_type: str, data: dict):
    payload = {"type": event_type, **data}
    json_bytes = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8", errors="replace")
    sys.stdout.buffer.write(json_bytes)
    sys.stdout.buffer.flush()

LANGUAGE_NAME_TO_CODE = {
    "english": "en", "английский": "en", "en": "en",
    "spanish": "es", "испанский": "es", "es": "es",
    "french": "fr", "французский": "fr", "fr": "fr",
    "german": "de", "немецкий": "de", "de": "de",
    "italian": "it", "итальянский": "it", "it": "it",
    "portuguese": "pt", "португальский": "pt", "pt": "pt",
    "russian": "ru", "русский": "ru", "ru": "ru",
    "chinese": "zh", "китайский": "zh", "zh": "zh",
    "japanese": "ja", "японский": "ja", "ja": "ja",
    "korean": "ko", "корейский": "ko", "ko": "ko",
    "dutch": "nl", "нидерландский": "nl", "голландский": "nl", "nl": "nl",
    "turkish": "tr", "турецкий": "tr", "tr": "tr",
    "polish": "pl", "польский": "pl", "pl": "pl",
    "ukrainian": "uk", "украинский": "uk", "uk": "uk",
    "swedish": "sv", "шведский": "sv", "sv": "sv",
    "arabic": "ar", "арабский": "ar", "ar": "ar",
    "hindi": "hi", "хинди": "hi", "hi": "hi",
    "vietnamese": "vi", "вьетнамский": "vi", "vi": "vi",
    "czech": "cs", "чешский": "cs", "cs": "cs",
    "greek": "el", "греческий": "el", "el": "el",
    "kazakh": "kk", "казахский": "kk", "kk": "kk"
}

def normalize_language_code(lang: Optional[str]) -> Optional[str]:
    if not lang or lang.lower().strip() in ("auto", "none", "", "all"):
        return None
    cleaned = lang.lower().strip().split("-")[0].split("_")[0]
    return LANGUAGE_NAME_TO_CODE.get(cleaned, cleaned if len(cleaned) == 2 else None)

def main():
    parser = argparse.ArgumentParser(description="Lectura Faster-Whisper Worker")
    parser.add_argument("audio_path", help="Path to 16kHz audio file")
    parser.add_argument("--model", default="base", choices=["tiny", "base", "small", "medium", "large-v3"], help="Model size")
    parser.add_argument("--language", default=None, help="Language code (e.g. en, es, fr, ru) or auto")
    parser.add_argument("--threads", type=int, default=2, help="CPU threads limit (default: 2)")
    parser.add_argument("--vad", action="store_true", default=True, help="Enable VAD filter (default: True)")
    parser.add_argument("--no-vad", dest="vad", action="store_false", help="Disable VAD filter")
    parser.add_argument("--beam-size", type=int, default=1, help="Beam size (default: 1 = greedy, fastest on CPU)")
    parser.add_argument("--temperature", type=float, default=0.0, help="Temperature")
    parser.add_argument("--cache-dir", default=os.path.expanduser("~/.cache/whisperflow"), help="Model cache directory")
    parser.add_argument("--check-cached-only", action="store_true", help="Only check if model is cached on disk and exit")

    args = parser.parse_args()

    if args.check_cached_only:
        cached = is_model_cached(args.model, args.cache_dir)
        emit_event("cache_status", {"model": args.model, "cached": cached})
        sys.exit(0)

    if not os.path.exists(args.audio_path):
        emit_event("error", {"message": f"Audio file not found: {args.audio_path}"})
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        emit_event("error", {"message": f"faster-whisper is not installed in Python environment: {e}"})
        sys.exit(1)

    # 1. Check if model is cached on disk
    cached = is_model_cached(args.model, args.cache_dir)
    if not cached:
        approx_mb = {"tiny": "75MB", "base": "145MB", "small": "480MB", "medium": "1.5GB"}.get(args.model, "200MB")
        emit_event("download_start", {
            "model": args.model, 
            "message": f"First run: Downloading model weights (~{approx_mb})... This only happens once."
        })

    # 2. Load Model into RAM
    load_start = time.time()
    try:
        model = WhisperModel(
            args.model,
            device="cpu",
            compute_type="int8",
            cpu_threads=max(1, min(16, args.threads)),
            download_root=args.cache_dir
        )
        load_time = round(time.time() - load_start, 2)
        emit_event("loaded", {"model": args.model, "load_time_sec": load_time})
    except Exception as e:
        emit_event("error", {"message": f"Failed to load Faster-Whisper model '{args.model}': {e}"})
        sys.exit(1)

    # 3. Transcribe Audio
    start_transcribe = time.time()
    lang_arg = normalize_language_code(args.language)
    # Optimized VAD: tighter speech padding + 0.5 threshold for fast silence rejection
    vad_params = dict(
        threshold=0.5,
        min_speech_duration_ms=250,
        min_silence_duration_ms=300,
        speech_pad_ms=200,
        max_speech_duration_s=float("inf")
    ) if args.vad else None

    try:
        segments_gen, info = model.transcribe(
            args.audio_path,
            language=lang_arg,
            task="transcribe",
            # beam_size=1 + best_of=1: greedy decoding — 2-3x faster on CPU vs beam_size=5
            beam_size=args.beam_size,  # default now 1
            best_of=1,
            # Disabling condition_on_previous_text eliminates hallucination loops ("B, B, B...")
            condition_on_previous_text=False,
            word_timestamps=True,
            vad_filter=args.vad,
            vad_parameters=vad_params,
            temperature=args.temperature
        )

        total_duration = round(getattr(info, "duration", 0.0) or 0.0, 2)
        segments_list = []
        full_text_parts = []
        last_progress_emit = 0

        for seg in segments_gen:
            seg_text = seg.text.strip()
            if seg_text:
                full_text_parts.append(seg_text)

            words_data = []
            if seg.words:
                for w in seg.words:
                    words_data.append({
                        "word": w.word,
                        "start": round(w.start, 3),
                        "end": round(w.end, 3),
                        "probability": round(w.probability, 3) if hasattr(w, "probability") and w.probability is not None else 1.0
                    })

            segments_list.append({
                "id": seg.id,
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg_text,
                "words": words_data
            })

            # Calculate and emit real-time progress
            current_end = seg.end
            if total_duration > 0:
                percent = min(99.0, max(1.0, round((current_end / total_duration) * 100, 1)))
                elapsed = time.time() - start_transcribe
                # ETA calculation based on real-time processing factor
                rtf = elapsed / max(current_end, 0.01)
                remaining_sec = max(0, int((total_duration - current_end) * rtf))
            else:
                percent = 50.0
                remaining_sec = 0

            # Throttle progress events to max once every 250ms
            now = time.time()
            if now - last_progress_emit >= 0.25:
                last_progress_emit = now
                emit_event("progress", {
                    "percent": percent,
                    "currentTime": round(current_end, 2),
                    "totalDuration": total_duration,
                    "etaSeconds": remaining_sec
                })

        # Finished transcription
        total_time = round(time.time() - start_transcribe, 2)
        detected_lang = getattr(info, "language", lang_arg or "en")
        
        result_payload = {
            "text": " ".join(full_text_parts),
            "language": detected_lang,
            "languageProbability": round(getattr(info, "language_probability", 1.0) or 1.0, 3),
            "duration": total_duration if total_duration > 0 else (segments_list[-1]["end"] if segments_list else 0.0),
            "segments": segments_list,
            "stats": {
                "totalSegments": len(segments_list),
                "totalWords": sum(len(s["words"]) for s in segments_list),
                "processingTimeSec": total_time,
                "modelSize": args.model,
                "cpuThreads": args.threads,
                "vadFilter": args.vad
            }
        }

        emit_event("completed", result_payload)

    except Exception as e:
        emit_event("error", {"message": f"Transcription error: {str(e)}"})
        sys.exit(1)
    finally:
        # Explicit garbage collection
        del model
        gc.collect()

if __name__ == "__main__":
    main()
