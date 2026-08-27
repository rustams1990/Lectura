import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
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

  // Reset playback state when active lesson changes
  useEffect(() => {
    setIsPlaying(false);
    const initialTime = activeLesson?.audioProgress || (activeLesson as any)?.lastPlaybackPosition || 0;
    setCurrentTime(initialTime);
    setDuration(activeLesson?.audioDuration || 0);
    setSeekToTime(null);
  }, [activeLesson?.id]);

  // Reactive synchronization of playback position when lesson data updates while paused
  useEffect(() => {
    if (!isPlaying && activeLesson?.audioProgress !== undefined) {
      const incomingProgress = Number(activeLesson.audioProgress) || 0;
      if (Math.abs(currentTime - incomingProgress) > 1) {
        setCurrentTime(incomingProgress);
      }
    }
  }, [activeLesson?.audioProgress, isPlaying]);


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
