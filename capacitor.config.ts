import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rustams1990.lectura',
  appName: 'Lectura',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
    allowNavigation: [
      '*.local',
      'localhost',
      '10.0.2.2',
      '127.0.0.1',
      '192.168.*.*',
      '10.*.*.*',
      '172.16.*.*',
      '172.17.*.*',
      '172.18.*.*',
      '172.19.*.*',
      '172.20.*.*',
      '*.youtube.com',
      '*.googlevideo.com',
      '*.ytimg.com',
    ],
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#09090b',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
