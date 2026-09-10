import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

interface LecturaAudioPluginInterface {
  startForegroundAudio(options: {
    title: string;
    artist: string;
    isPlaying?: boolean;
    coverUrl?: string;
    position?: number;   // seconds
    duration?: number;   // seconds
  }): Promise<void>;
  updatePosition(options: { position: number; duration: number; isPlaying: boolean }): Promise<void>;
  stopForegroundAudio(): Promise<void>;
  addListener(eventName: 'onAudioAction', listenerFunc: (data: { action: string }) => void): Promise<PluginListenerHandle>;
}

const LecturaAudio = registerPlugin<LecturaAudioPluginInterface>('LecturaAudio');

export async function startNativeForegroundAudio(
  title: string,
  artist: string,
  isPlaying: boolean = true,
  coverUrl?: string | null,
  position: number = 0,
  duration: number = 0,
): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  try {
    await LecturaAudio.startForegroundAudio({
      title,
      artist,
      isPlaying,
      coverUrl: coverUrl || undefined,
      position: Math.floor(position),
      duration: Math.floor(duration),
    });
  } catch (err) {
    console.warn('[NativeAudioBridge] startForegroundAudio error:', err);
  }
}

export async function updateNativeAudioPosition(
  position: number,
  duration: number,
  isPlaying: boolean,
): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  try {
    await LecturaAudio.updatePosition({
      position: Math.floor(position),
      duration: Math.floor(duration),
      isPlaying,
    });
  } catch (_) {}
}

export async function stopNativeForegroundAudio(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  try {
    await LecturaAudio.stopForegroundAudio();
  } catch (err) {
    console.warn('[NativeAudioBridge] stopForegroundAudio error:', err);
  }
}

export function registerNativeAudioActionListener(callback: (action: string) => void): () => void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return () => {};

  let handle: PluginListenerHandle | null = null;
  LecturaAudio.addListener('onAudioAction', (data) => {
    if (data?.action) callback(data.action);
  }).then((h) => { handle = h; })
    .catch((e) => console.warn('[NativeAudioBridge] addListener error:', e));

  return () => { if (handle) handle.remove(); };
}
