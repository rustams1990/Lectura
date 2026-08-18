import { Capacitor, registerPlugin } from '@capacitor/core';

interface LecturaAudioPluginInterface {
  startForegroundAudio(options: { title: string; artist: string }): Promise<void>;
  stopForegroundAudio(): Promise<void>;
}

const LecturaAudio = registerPlugin<LecturaAudioPluginInterface>('LecturaAudio');

export async function startNativeForegroundAudio(title: string, artist: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return;
  }
  try {
    await LecturaAudio.startForegroundAudio({ title, artist });
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
