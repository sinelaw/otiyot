import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const SRC_DIR = path.join(ROOT_DIR, 'src');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const EMOJI_CACHE_DIR = path.join(ASSETS_DIR, 'emoji');
const EMOJI_DIST_DIR = path.join(DIST_DIR, 'emoji');

// Twemoji CDN base URL (using latest version)
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg';

interface EmojiConfig {
  emojis: string[];
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

function copyFile(src: string, dest: string): void {
  fs.copyFileSync(src, dest);
  console.log(`Copied: ${path.relative(ROOT_DIR, src)} -> ${path.relative(ROOT_DIR, dest)}`);
}

function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) {
    console.warn(`Warning: Source directory does not exist: ${src}`);
    return;
  }

  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

function cleanDist(): void {
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true });
    console.log('Cleaned dist directory');
  }
}

function checkRequiredAssets(): boolean {
  const manifestPath = path.join(ASSETS_DIR, 'audio_manifest.json');
  const audioDir = path.join(ASSETS_DIR, 'audio');

  if (!fs.existsSync(manifestPath)) {
    console.error('ERROR: audio_manifest.json not found in assets/');
    console.error('Run "npm run download" first to generate audio files.');
    return false;
  }

  if (!fs.existsSync(audioDir)) {
    console.error('ERROR: audio/ directory not found in assets/');
    console.error('Run "npm run download" first to generate audio files.');
    return false;
  }

  const audioFiles = fs.readdirSync(audioDir).filter(f => f.endsWith('.wav') || f.endsWith('.mp3'));
  if (audioFiles.length === 0) {
    console.error('ERROR: No audio files (.wav or .mp3) found in assets/audio/');
    console.error('Run "npm run download" first to generate audio files.');
    return false;
  }

  console.log(`Found ${audioFiles.length} audio files`);
  return true;
}

function emojiToCodePoints(emoji: string): string {
  const codePoints: string[] = [];
  for (const char of emoji) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && codePoint !== 0xfe0f) { // Skip variation selector
      codePoints.push(codePoint.toString(16));
    }
  }
  return codePoints.join('-');
}

async function downloadEmoji(emoji: string, destPath: string): Promise<void> {
  const codePoints = emojiToCodePoints(emoji);
  const url = `${TWEMOJI_BASE}/${codePoints}.svg`;

  console.log(`Downloading emoji ${emoji} (${codePoints}) from ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download emoji ${emoji}: ${response.status} ${response.statusText}`);
  }

  const svgContent = await response.text();
  fs.writeFileSync(destPath, svgContent);
}

async function processEmojis(): Promise<Map<string, string>> {
  const emojiMap = new Map<string, string>();
  const emojiConfigPath = path.join(SRC_DIR, 'emojis.json');

  if (!fs.existsSync(emojiConfigPath)) {
    console.log('No emojis.json found, skipping emoji processing');
    return emojiMap;
  }

  const config = JSON.parse(fs.readFileSync(emojiConfigPath, 'utf-8')) as EmojiConfig;
  if (!config.emojis || config.emojis.length === 0) {
    console.log('No emojis specified in emojis.json');
    return emojiMap;
  }

  // Use cache dir in assets (survives dist clean), copy to dist
  ensureDir(EMOJI_CACHE_DIR);
  ensureDir(EMOJI_DIST_DIR);

  console.log(`Processing ${config.emojis.length} emojis...`);

  for (const emoji of config.emojis) {
    const codePoints = emojiToCodePoints(emoji);
    const filename = `${codePoints}.svg`;
    const cachePath = path.join(EMOJI_CACHE_DIR, filename);
    const distPath = path.join(EMOJI_DIST_DIR, filename);

    try {
      if (fs.existsSync(cachePath)) {
        console.log(`  ${emoji} -> ${filename} (cached)`);
      } else {
        await downloadEmoji(emoji, cachePath);
        console.log(`  ${emoji} -> ${filename} (downloaded)`);
      }
      // Copy from cache to dist
      fs.copyFileSync(cachePath, distPath);
      emojiMap.set(emoji, `emoji/${filename}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`  Failed to download ${emoji}: ${errorMessage}`);
    }
  }

  return emojiMap;
}

function replaceEmojisInCSS(content: string, emojiMap: Map<string, string>): string {
  let result = content;

  for (const [emoji, svgPath] of emojiMap) {
    // Replace emoji in content property: content: 'emoji' -> content: url(path)
    const contentRegex = new RegExp(`content:\\s*['"]${emoji}['"]`, 'g');
    result = result.replace(contentRegex, `content: url('${svgPath}')`);
  }

  return result;
}

function replaceEmojisInHTML(content: string, emojiMap: Map<string, string>): string {
  let result = content;

  for (const [emoji, svgPath] of emojiMap) {
    // Replace direct emoji usage with img tag
    const emojiRegex = new RegExp(emoji, 'g');
    result = result.replace(emojiRegex, `<img src="${svgPath}" alt="${emoji}" class="inline-emoji" />`);
  }

  return result;
}

async function build(): Promise<void> {
  console.log('Building dist directory...\n');

  if (!checkRequiredAssets()) {
    process.exit(1);
  }

  cleanDist();
  ensureDir(DIST_DIR);

  // Process emojis first
  const emojiMap = await processEmojis();

  // Process and copy source files with emoji replacement
  let htmlContent = fs.readFileSync(path.join(SRC_DIR, 'index.html'), 'utf-8');
  let cssContent = fs.readFileSync(path.join(SRC_DIR, 'styles.css'), 'utf-8');

  if (emojiMap.size > 0) {
    console.log('\nReplacing emojis in source files...');
    htmlContent = replaceEmojisInHTML(htmlContent, emojiMap);
    cssContent = replaceEmojisInCSS(cssContent, emojiMap);

    // Add inline-emoji class to CSS if not present
    if (!cssContent.includes('.inline-emoji')) {
      cssContent += `
/* Inline emoji styling */
.inline-emoji {
  display: inline-block;
  width: 1em;
  height: 1em;
  vertical-align: -0.1em;
}
`;
    }
  }

  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), htmlContent);
  console.log(`Processed: src/index.html -> dist/index.html`);

  fs.writeFileSync(path.join(DIST_DIR, 'styles.css'), cssContent);
  console.log(`Processed: src/styles.css -> dist/styles.css`);

  copyFile(path.join(SRC_DIR, 'app.js'), path.join(DIST_DIR, 'app.js'));

  // Copy assets
  copyFile(
    path.join(ASSETS_DIR, 'audio_manifest.json'),
    path.join(DIST_DIR, 'audio_manifest.json')
  );
  copyDir(path.join(ASSETS_DIR, 'audio'), path.join(DIST_DIR, 'audio'));

  console.log('\nBuild complete!');
  console.log(`Output directory: ${DIST_DIR}`);

  const distSize = getDirSize(DIST_DIR);
  console.log(`Total size: ${formatBytes(distSize)}`);
}

function getDirSize(dir: string): number {
  let size = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      size += getDirSize(fullPath);
    } else {
      size += fs.statSync(fullPath).size;
    }
  }

  return size;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

build().catch(error => {
  console.error('Build failed:', error);
  process.exit(1);
});
