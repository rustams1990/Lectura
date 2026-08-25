import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSION_ROOT = __dirname;
const DIST_DIR = path.join(EXTENSION_ROOT, 'dist');
const SRC_DIR = path.join(EXTENSION_ROOT, 'src');

async function build() {
  console.log('🚀 Building Lectura Chrome Extension (Manifest V3)...');

  // 1. Ensure clean dist structure
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }

  const subdirs = ['background', 'content', 'popup', 'options', 'icons', 'styles'];
  for (const dir of subdirs) {
    fs.mkdirSync(path.join(DIST_DIR, dir), { recursive: true });
  }

  // 2. Bundle TypeScript Entrypoints with esbuild
  // Service Worker (ES Module for MV3 background service worker)
  await esbuild.build({
    entryPoints: [{ in: path.join(SRC_DIR, 'background', 'service-worker.ts'), out: 'background/service-worker' }],
    outdir: DIST_DIR,
    bundle: true,
    format: 'esm',
    target: ['chrome110'],
    sourcemap: false,
    minify: false,
    logLevel: 'info',
  });

  // Content Scripts & UI pages (IIFE format strictly required for Chrome/Opera content scripts)
  const iifeEntryPoints = [
    { in: path.join(SRC_DIR, 'content', 'youtube-overlay.ts'), out: 'content/youtube-overlay' },
    { in: path.join(SRC_DIR, 'content', 'page-reader.ts'), out: 'content/page-reader' },
    { in: path.join(SRC_DIR, 'popup', 'popup.ts'), out: 'popup/popup' },
    { in: path.join(SRC_DIR, 'options', 'options.ts'), out: 'options/options' },
  ];

  await esbuild.build({
    entryPoints: iifeEntryPoints.map((e) => ({ in: e.in, out: e.out })),
    outdir: DIST_DIR,
    bundle: true,
    format: 'iife',
    target: ['chrome110'],
    sourcemap: false,
    minify: false,
    logLevel: 'info',
  });

  // 3. Copy Static HTML & CSS Assets
  const staticFiles = [
    { from: path.join(SRC_DIR, 'popup', 'popup.html'), to: path.join(DIST_DIR, 'popup', 'popup.html') },
    { from: path.join(SRC_DIR, 'popup', 'popup.css'), to: path.join(DIST_DIR, 'popup', 'popup.css') },
    { from: path.join(SRC_DIR, 'options', 'options.html'), to: path.join(DIST_DIR, 'options', 'options.html') },
    { from: path.join(SRC_DIR, 'options', 'options.css'), to: path.join(DIST_DIR, 'options', 'options.css') },
    { from: path.join(EXTENSION_ROOT, 'manifest.json'), to: path.join(DIST_DIR, 'manifest.json') },
  ];

  for (const file of staticFiles) {
    if (fs.existsSync(file.from)) {
      fs.copyFileSync(file.from, file.to);
    }
  }

  // 4. Also copy compiled JS & HTML/CSS to extension root subdirs so user can select either 'extension' or 'extension/dist'
  const rootSubdirs = ['background', 'content', 'popup', 'options'];
  for (const dir of rootSubdirs) {
    fs.mkdirSync(path.join(EXTENSION_ROOT, dir), { recursive: true });
  }

  const copyToRoot = [
    { from: path.join(DIST_DIR, 'background', 'service-worker.js'), to: path.join(EXTENSION_ROOT, 'background', 'service-worker.js') },
    { from: path.join(DIST_DIR, 'content', 'youtube-overlay.js'), to: path.join(EXTENSION_ROOT, 'content', 'youtube-overlay.js') },
    { from: path.join(DIST_DIR, 'content', 'page-reader.js'), to: path.join(EXTENSION_ROOT, 'content', 'page-reader.js') },
    { from: path.join(DIST_DIR, 'popup', 'popup.js'), to: path.join(EXTENSION_ROOT, 'popup', 'popup.js') },
    { from: path.join(DIST_DIR, 'popup', 'popup.html'), to: path.join(EXTENSION_ROOT, 'popup', 'popup.html') },
    { from: path.join(DIST_DIR, 'popup', 'popup.css'), to: path.join(EXTENSION_ROOT, 'popup', 'popup.css') },
    { from: path.join(DIST_DIR, 'options', 'options.js'), to: path.join(EXTENSION_ROOT, 'options', 'options.js') },
    { from: path.join(DIST_DIR, 'options', 'options.html'), to: path.join(EXTENSION_ROOT, 'options', 'options.html') },
    { from: path.join(DIST_DIR, 'options', 'options.css'), to: path.join(EXTENSION_ROOT, 'options', 'options.css') },
  ];

  for (const item of copyToRoot) {
    if (fs.existsSync(item.from)) {
      fs.copyFileSync(item.from, item.to);
    }
  }

  // 4. Generate/Copy Real Lectura Icons (16, 32, 48, 128) & SVG
  const appFaviconSvg = path.join(EXTENSION_ROOT, '..', 'public', 'favicon.svg');
  if (fs.existsSync(appFaviconSvg)) {
    fs.copyFileSync(appFaviconSvg, path.join(DIST_DIR, 'icons', 'icon.svg'));
    fs.copyFileSync(appFaviconSvg, path.join(EXTENSION_ROOT, 'icons', 'icon.svg'));
  }

  generateLecturaPngIcons(path.join(DIST_DIR, 'icons'));
  generateLecturaPngIcons(path.join(EXTENSION_ROOT, 'icons'));

  console.log('✅ Extension build complete! Output directory:', DIST_DIR);
}

/**
 * Generates crisp, real Lectura PNG icons (16, 32, 48, 128) from master high-res asset
 */
function generateLecturaPngIcons(iconsDir) {
  fs.mkdirSync(iconsDir, { recursive: true });
  const sizes = [16, 32, 48, 128];

  try {
    const UPNG = (await_import_upng() || {}).default;
    const masterPath = path.join(EXTENSION_ROOT, '..', 'public', 'icon-512.png');
    if (UPNG && fs.existsSync(masterPath)) {
      const srcBuf = fs.readFileSync(masterPath);
      const img = UPNG.decode(srcBuf);
      const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
      const srcW = img.width;
      const srcH = img.height;

      for (const size of sizes) {
        const out = new Uint8Array(size * size * 4);
        const xRatio = srcW / size;
        const yRatio = srcH / size;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const srcX = Math.min(srcW - 1, Math.floor(x * xRatio));
            const srcY = Math.min(srcH - 1, Math.floor(y * yRatio));
            const srcIdx = (srcY * srcW + srcX) * 4;
            const outIdx = (y * size + x) * 4;
            out[outIdx] = rgba[srcIdx];
            out[outIdx + 1] = rgba[srcIdx + 1];
            out[outIdx + 2] = rgba[srcIdx + 2];
            out[outIdx + 3] = rgba[srcIdx + 3];
          }
        }
        const pngBuf = Buffer.from(UPNG.encode([out.buffer], size, size, 0));
        fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), pngBuf);

        // Generate grayscale/muted icon for disabled state
        const outDisabled = new Uint8Array(size * size * 4);
        for (let i = 0; i < size * size; i++) {
          const r = out[i * 4];
          const g = out[i * 4 + 1];
          const b = out[i * 4 + 2];
          const a = out[i * 4 + 3];
          const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          outDisabled[i * 4] = gray;
          outDisabled[i * 4 + 1] = gray;
          outDisabled[i * 4 + 2] = gray;
          outDisabled[i * 4 + 3] = Math.round(a * 0.65);
        }
        const disabledPngBuf = Buffer.from(UPNG.encode([outDisabled.buffer], size, size, 0));
        fs.writeFileSync(path.join(iconsDir, `icon${size}_disabled.png`), disabledPngBuf);
      }
      return;
    }
  } catch (err) {
    console.warn('[Build] UPNG resize warning:', err);
  }
}

function await_import_upng() {
  try {
    return require('@pdf-lib/upng');
  } catch (_) {
    return null;
  }
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
