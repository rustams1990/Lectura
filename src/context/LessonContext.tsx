import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { Lesson } from "../types";

interface LessonContextType {
  activeLesson: Lesson | null;
  setActiveLesson: (lesson: Lesson | null) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  duration: number;
  setDuration: (duration: number) => void;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  seekToTime: number | null;
  setSeekToTime: (time: number | null) => void;
  isDetectingIdioms: boolean;
  setIsDetectingIdioms: (detecting: boolean) => void;
}

const LessonContext = createContext<LessonContextType | undefined>(undefined);

export function LessonProvider({ children }: { children: ReactNode }) {
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [seekToTime, setSeekToTime] = useState<number | null>(null);
  const [isDetectingIdioms, setIsDetectingIdioms] = useState<boolean>(false);

  const activeLessonIdRef = useRef<string | null>(null);

  // Reset playback state ONLY when active lesson changes (strictly by id)
  useEffect(() => {
    if (activeLesson?.id && activeLesson.id !== activeLessonIdRef.current) {
      activeLessonIdRef.current = activeLesson.id;
      setIsPlaying(false);
      const initialTime = Number(activeLesson?.audioProgress) || Number((activeLesson as any)?.lastPlaybackPosition) || 0;
      setCurrentTime(initialTime);
      setDuration(activeLesson?.audioDuration || 0);
      setSeekToTime(null);
    }
  }, [activeLesson?.id]);


  return (
    <LessonContext.Provider
      value={{
        activeLesson,
        setActiveLesson,
        isPlaying,
        setIsPlaying,
        currentTime,
        setCurrentTime,
        duration,
        setDuration,
        playbackRate,
        setPlaybackRate,
        seekToTime,
        setSeekToTime,
        isDetectingIdioms,
        setIsDetectingIdioms,
      }}
    >
      {children}
    </LessonContext.Provider>
  );
}

export function useLesson() {
  const context = useContext(LessonContext);
  if (!context) {
    throw new Error("useLesson must be used within a LessonProvider");
  }
  return context;
}
