import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

interface LecturaAudioPluginInterface {
  startForegroundAudio(options: { title: string; artist: string; isPlaying?: boolean }): Promise<void>;
  stopForegroundAudio(): Promise<void>;
  addListener(eventName: 'onAudioAction', listenerFunc: (data: { action: string }) => void): Promise<PluginListenerHandle>;
}

const LecturaAudio = registerPlugin<LecturaAudioPluginInterface>('LecturaAudio');

export async function startNativeForegroundAudio(title: string, artist: string, isPlaying: boolean = true): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return;
  }
  try {
    await LecturaAudio.startForegroundAudio({ title, artist, isPlaying });
  } catch (err) {
    console.warn('[NativeAudioBridge] Could not start foreground audio:', err);
  }
}

export async function stopNativeForegroundAudio(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return;
  }
  try {
    await LecturaAudio.stopForegroundAudio();
  } catch (err) {
    console.warn('[NativeAudioBridge] Could not stop foreground audio:', err);
  }
}

/**
 * Registers callback for native notification action clicks (-10s, play/pause, +10s).
 */
export function registerNativeAudioActionListener(callback: (action: string) => void): () => void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return () => {};
  }

  let handle: PluginListenerHandle | null = null;
  LecturaAudio.addListener('onAudioAction', (data) => {
    if (data && data.action) {
      callback(data.action);
    }
  }).then((h) => {
    handle = h;
  }).catch((e) => console.warn('[NativeAudioBridge] addListener error:', e));

  return () => {
    if (handle) {
      handle.remove();
    }
  };
}
