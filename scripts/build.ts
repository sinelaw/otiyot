import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const SRC_DIR = path.join(ROOT_DIR, 'src');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

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

  const audioFiles = fs.readdirSync(audioDir).filter(f => f.endsWith('.wav'));
  if (audioFiles.length === 0) {
    console.error('ERROR: No .wav files found in assets/audio/');
    console.error('Run "npm run download" first to generate audio files.');
    return false;
  }

  console.log(`Found ${audioFiles.length} audio files`);
  return true;
}

function build(): void {
  console.log('Building dist directory...\n');

  if (!checkRequiredAssets()) {
    process.exit(1);
  }

  cleanDist();
  ensureDir(DIST_DIR);

  // Copy source files
  copyFile(path.join(SRC_DIR, 'index.html'), path.join(DIST_DIR, 'index.html'));
  copyFile(path.join(SRC_DIR, 'styles.css'), path.join(DIST_DIR, 'styles.css'));
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

build();
