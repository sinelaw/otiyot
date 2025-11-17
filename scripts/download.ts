import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

interface VowelDef {
  char: string;
  name: string;
  code: string;
}

interface SyllableData {
  syllable: string;
  filename: string;
  prompt: string;
}

const API_KEY = process.env.GEMINI_API_KEY || '';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';
const OUTPUT_DIR = path.join(ROOT_DIR, 'assets', 'audio');
const MANIFEST_FILE = path.join(ROOT_DIR, 'assets', 'audio_manifest.json');
const VOICE = 'Kore';
const MAX_RETRIES = 5;

const VOWELS: VowelDef[] = [
  { char: '\u05B8', name: 'kamatz', code: 'a' },
  { char: '\u05B7', name: 'patach', code: 'a' },
  { char: '\u05B6', name: 'segol', code: 'e' },
  { char: '\u05B5', name: 'tzere', code: 'e' },
  { char: '\u05B4', name: 'chirik', code: 'i' },
  { char: '\u05B9', name: 'holam_chaser', code: 'o' },
  { char: 'ו\u05B9', name: 'holam_maleh', code: 'o' },
  { char: '\u05BB', name: 'kubutz', code: 'u' },
  { char: 'וּ', name: 'shuruk', code: 'u' },
];

const LETTER_MAP: Record<string, string> = {
  'א': 'aleph', 'ב': 'bet_raphe', 'בּ': 'bet_dagesh', 'ג': 'gimel', 'ד': 'dalet', 'ה': 'he',
  'ו': 'vav', 'ז': 'zain', 'ח': 'chet', 'ט': 'tet', 'י': 'yud', 'כ': 'kaf_raphe',
  'כּ': 'kaf_dagesh', 'ל': 'lamed', 'מ': 'mem', 'נ': 'nun', 'ס': 'samech', 'ע': 'ayin',
  'פ': 'pe_raphe', 'פּ': 'pe_dagesh', 'צ': 'tzadi', 'ק': 'kuf', 'ר': 'resh', 'ש': 'shin',
  'ת': 'tav', 'ך': 'kaf_sofit', 'ם': 'mem_sofit', 'ן': 'nun_sofit', 'ף': 'pe_sofit', 'ץ': 'tzadi_sofit'
};

function pcmToWav(pcm16Buffer: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const byteRate = numChannels * sampleRate * bytesPerSample;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = pcm16Buffer.length;
  const buffer = Buffer.alloc(44 + dataSize);

  function writeString(offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      buffer.writeUInt8(str.charCodeAt(i), offset + i);
    }
  }

  writeString(0, 'RIFF');
  buffer.writeUInt32LE(36 + dataSize, 4);
  writeString(8, 'WAVE');

  writeString(12, 'fmt ');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);

  writeString(36, 'data');
  buffer.writeUInt32LE(dataSize, 40);

  pcm16Buffer.copy(buffer, 44);

  return buffer;
}

async function fetchPcmAudio(text: string, attempt = 1): Promise<Buffer> {
  if (attempt > MAX_RETRIES) {
    throw new Error(`Failed to fetch audio for '${text}' after ${MAX_RETRIES} attempts.`);
  }

  const ttsPrompt = `הברה: ${text}.`;
  const payload = {
    contents: [{
      parts: [{ text: ttsPrompt }]
    }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: VOICE }
        }
      }
    },
    model: 'gemini-2.5-flash-preview-tts'
  };

  const delay = Math.pow(2, attempt) * 1000;

  try {
    const response = await fetch(`${BASE_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json() as {
      error?: { message?: string };
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: {
              data?: string;
              mimeType?: string;
            };
          }>;
        };
      }>;
    };

    if (!response.ok) {
      console.error(`Attempt ${attempt}: API Error for '${text}': ${result.error?.message || 'Unknown HTTP Error'}`);
      if (response.status === 429) {
        console.log(`Retrying after ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchPcmAudio(text, attempt + 1);
      }
      throw new Error(`API Request failed with status ${response.status}`);
    }

    const part = result?.candidates?.[0]?.content?.parts?.[0];
    const audioData = part?.inlineData?.data;
    const mimeType = part?.inlineData?.mimeType;

    if (audioData && mimeType && mimeType.startsWith('audio/L16')) {
      return Buffer.from(audioData, 'base64');
    } else {
      console.warn(`Attempt ${attempt}: TTS structural failure for '${text}'. Retrying after ${delay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchPcmAudio(text, attempt + 1);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Attempt ${attempt}: Network/Fetch Error for '${text}':`, errorMessage);
    console.log(`Retrying after ${delay / 1000}s...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchPcmAudio(text, attempt + 1);
  }
}

function generateSyllableData(): { syllables: SyllableData[]; syllableMap: Map<string, string> } {
  const syllables: SyllableData[] = [];
  const syllableMap = new Map<string, string>();

  const baseConsonants = Object.keys(LETTER_MAP).filter(c => !['ך', 'ם', 'ן', 'ף', 'ץ'].includes(c));
  const finalConsonants = ['ך', 'ם', 'ן', 'ף', 'ץ'];

  for (const consonant of baseConsonants) {
    if (consonant === 'ו') continue;

    for (const vowel of VOWELS) {
      if (vowel.char === 'וּ' || vowel.char === 'ו\u05B9') continue;

      const syllable = consonant + vowel.char;
      const filename = `${LETTER_MAP[consonant]}_${vowel.name}.wav`;
      syllableMap.set(syllable, filename);
      syllables.push({ syllable, filename, prompt: syllable });
    }
  }

  for (const consonant of finalConsonants) {
    for (const vowel of VOWELS) {
      if (vowel.char === 'וּ' || vowel.char === 'ו\u05B9') continue;

      const syllable = consonant + vowel.char;
      const filename = `${LETTER_MAP[consonant]}_${vowel.name}.wav`;
      syllableMap.set(syllable, filename);
      syllables.push({ syllable, filename, prompt: syllable });
    }
  }

  const vavVowels = VOWELS.filter(v => ['\u05BB', '\u05B9'].includes(v.char));
  for (const vowel of vavVowels) {
    const syllable = 'ו' + vowel.char;
    const filename = `${LETTER_MAP['ו']}_${vowel.name}.wav`;
    syllableMap.set(syllable, filename);
    syllables.push({ syllable, filename, prompt: syllable });
  }

  const holamMaleh = VOWELS.find(v => v.name === 'holam_maleh');
  if (holamMaleh) {
    syllableMap.set(holamMaleh.char, `${LETTER_MAP['ו']}_${holamMaleh.name}.wav`);
    syllables.push({ syllable: holamMaleh.char, filename: `${LETTER_MAP['ו']}_${holamMaleh.name}.wav`, prompt: 'וֹ' });
  }

  const shuruk = VOWELS.find(v => v.name === 'shuruk');
  if (shuruk) {
    syllableMap.set(shuruk.char, `${LETTER_MAP['ו']}_${shuruk.name}.wav`);
    syllables.push({ syllable: shuruk.char, filename: `${LETTER_MAP['ו']}_${shuruk.name}.wav`, prompt: 'וּ' });
  }

  return { syllables, syllableMap };
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error('ERROR: Please set the GEMINI_API_KEY environment variable.');
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_DIR}`);
  }

  const { syllables } = generateSyllableData();
  console.log(`Identified ${syllables.length} unique syllables for generation.`);

  const manifestData: Record<string, string> = {};
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < syllables.length; i++) {
    const { syllable, filename, prompt } = syllables[i];
    const filePath = path.join(OUTPUT_DIR, filename);

    if (fs.existsSync(filePath)) {
      manifestData[syllable] = filename;
      successCount++;
      continue;
    }

    console.log(`[${i + 1}/${syllables.length}] Generating '${syllable}' (${filename})...`);

    try {
      const pcmData = await fetchPcmAudio(prompt);
      const wavBuffer = pcmToWav(pcmData, 24000);
      fs.writeFileSync(filePath, wavBuffer);

      manifestData[syllable] = filename;
      successCount++;
      console.log(`Successfully saved: ${filename}`);
    } catch (error) {
      failCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`FATAL ERROR for '${syllable}': ${errorMessage}`);
    }
  }

  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifestData, null, 2));

  console.log('\n--- Generation Summary ---');
  console.log(`Total Syllables: ${syllables.length}`);
  console.log(`Successful Files: ${successCount}`);
  console.log(`Failed Files: ${failCount}`);
  console.log(`Manifest File Saved to: ${MANIFEST_FILE}`);
  console.log(`Audio Files Saved to: ${OUTPUT_DIR}`);
  console.log('--------------------------');
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
