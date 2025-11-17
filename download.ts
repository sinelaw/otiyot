/**
 * Node.js script to generate all possible Hebrew syllable audio files 
 * using the Gemini TTS API and create the audio_manifest.js file.
 * * NOTE: This script requires 'node-fetch' (npm install node-fetch@2) and 'fs'.
 * You must replace 'YOUR_GEMINI_API_KEY' with your actual key.
 */

// Required modules
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // Use v2 of node-fetch for easier usage if not using modern ESM

// --- Configuration ---
const API_KEY = ""; // Replace with your actual Gemini API Key
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';
const OUTPUT_DIR = path.join(__dirname, 'audio');
const MANIFEST_FILE = path.join(__dirname, 'audio_manifest.js');
const VOICE = 'Kore'; // Consistent voice
const MAX_RETRIES = 5;

// --- Syllable Definitions (Must match the HTML file) ---
const VOWELS = [
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

const LETTER_MAP = {
    'א': 'aleph', 'ב': 'bet_raphe', 'בּ': 'bet_dagesh', 'ג': 'gimel', 'ד': 'dalet', 'ה': 'he',
    'ו': 'vav', 'ז': 'zain', 'ח': 'chet', 'ט': 'tet', 'י': 'yud', 'כ': 'kaf_raphe',
    'כּ': 'kaf_dagesh', 'ל': 'lamed', 'מ': 'mem', 'נ': 'nun', 'ס': 'samech', 'ע': 'ayin',
    'פ': 'pe_raphe', 'פּ': 'pe_dagesh', 'צ': 'tzadi', 'ק': 'kuf', 'ר': 'resh', 'ש': 'shin',
    'ת': 'tav', 'ך': 'kaf_sofit', 'ם': 'mem_sofit', 'ן': 'nun_sofit', 'ף': 'pe_sofit', 'ץ': 'tzadi_sofit'
};

// --- Utility Functions ---

/**
 * Converts PCM 16-bit audio data buffer into a WAV buffer.
 * @param {Buffer} pcm16Buffer The raw PCM 16-bit signed audio data buffer.
 * @param {number} sampleRate The sample rate (e.g., 24000).
 * @returns {Buffer} The WAV audio buffer.
 */
function pcmToWav(pcm16Buffer, sampleRate) {
    const numChannels = 1;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const numSamples = pcm16Buffer.length / bytesPerSample;
    const byteRate = numChannels * sampleRate * bytesPerSample;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = pcm16Buffer.length;
    const buffer = Buffer.alloc(44 + dataSize);

    function writeString(offset, string) {
        for (let i = 0; i < string.length; i++) {
            buffer.writeUInt8(string.charCodeAt(i), offset + i);
        }
    }

    // RIFF chunk
    writeString(0, 'RIFF'); // ChunkID
    buffer.writeUInt32LE(36 + dataSize, 4); // ChunkSize
    writeString(8, 'WAVE'); // Format

    // FMT sub-chunk
    writeString(12, 'fmt '); // Subchunk1ID
    buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
    buffer.writeUInt16LE(numChannels, 22); // NumChannels
    buffer.writeUInt32LE(sampleRate, 24); // SampleRate
    buffer.writeUInt32LE(byteRate, 28); // ByteRate
    buffer.writeUInt16LE(blockAlign, 32); // BlockAlign
    buffer.writeUInt16LE(bitDepth, 34); // BitsPerSample

    // DATA sub-chunk
    writeString(36, 'data'); // Subchunk2ID
    buffer.writeUInt32LE(dataSize, 40); // Subchunk2Size

    // Write PCM data
    pcm16Buffer.copy(buffer, 44);

    return buffer;
}


/**
 * Calls the Gemini TTS API with exponential backoff.
 * @param {string} text The Hebrew text to convert to speech.
 * @param {number} attempt Current retry attempt (starts at 1).
 * @returns {Promise<Buffer>} The raw PCM 16-bit audio data buffer.
 */
async function fetchPcmAudio(text, attempt = 1) {
    if (attempt > MAX_RETRIES) {
        throw new Error(`Failed to fetch audio for '${text}' after ${MAX_RETRIES} attempts.`);
    }

    const ttsPrompt = `הברה: ${text}.`;
    const payload = {
        contents: [{
            parts: [{ text: ttsPrompt }]
        }],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: VOICE }
                }
            }
        },
        model: "gemini-2.5-flash-preview-tts"
    };

    const delay = Math.pow(2, attempt) * 1000;
    
    try {
        const response = await fetch(`${BASE_URL}?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

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

        if (audioData && mimeType && mimeType.startsWith("audio/L16")) {
            // Success: Return the PCM data as a Buffer
            return Buffer.from(audioData, 'base64');
        } else {
            // Structural failure (TTS model didn't return audio data)
            console.warn(`Attempt ${attempt}: TTS structural failure for '${text}'. Retrying after ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchPcmAudio(text, attempt + 1);
        }

    } catch (error) {
        console.error(`Attempt ${attempt}: Network/Fetch Error for '${text}':`, error.message);
        console.log(`Retrying after ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchPcmAudio(text, attempt + 1);
    }
}


/**
 * Generates all unique syllables and their corresponding file names.
 */
function generateSyllableData() {
    let syllables = [];
    const syllableMap = new Map();

    const baseConsonants = Object.keys(LETTER_MAP).filter(c => !['ך', 'ם', 'ן', 'ף', 'ץ'].includes(c));
    const finalConsonants = ['ך', 'ם', 'ן', 'ף', 'ץ'];
    
    // 1. Generate standard C+V combinations
    for (const consonant of baseConsonants) {
        if (consonant === 'ו') continue; // Handled separately
        
        for (const vowel of VOWELS) {
            if (vowel.char === 'וּ' || vowel.char === 'ו\u05B9') continue; // Handled separately

            const syllable = consonant + vowel.char;
            const filename = `${LETTER_MAP[consonant]}_${vowel.name}.wav`;
            syllableMap.set(syllable, filename);
            syllables.push({ syllable, filename, prompt: syllable });
        }
    }
    
    // 2. Generate final consonant C+V combinations (usually restricted, but generating all for completeness)
    for (const consonant of finalConsonants) {
        for (const vowel of VOWELS) {
            if (vowel.char === 'וּ' || vowel.char === 'ו\u05B9') continue; // Handled separately

            const syllable = consonant + vowel.char;
            const filename = `${LETTER_MAP[consonant]}_${vowel.name}.wav`;
            syllableMap.set(syllable, filename);
            syllables.push({ syllable, filename, prompt: syllable });
        }
    }

    // 3. Handle Vav combinations ('ו' letter)
    const vavVowels = VOWELS.filter(v => ['\u05BB', '\u05B9'].includes(v.char)); // Kubutz, Holam Chaser
    for (const vowel of vavVowels) {
        const syllable = 'ו' + vowel.char;
        const filename = `${LETTER_MAP['ו']}_${vowel.name}.wav`;
        syllableMap.set(syllable, filename);
        syllables.push({ syllable, filename, prompt: syllable });
    }

    // 4. Handle Holam Maleh ('וֹ') and Shuruk ('וּ')
    // Holam Maleh (ו\u05B9)
    const holamMaleh = VOWELS.find(v => v.name === 'holam_maleh');
    syllableMap.set(holamMaleh.char, `${LETTER_MAP['ו']}_${holamMaleh.name}.wav`);
    syllables.push({ syllable: holamMaleh.char, filename: `${LETTER_MAP['ו']}_${holamMaleh.name}.wav`, prompt: 'וֹ' });

    // Shuruk (וּ)
    const shuruk = VOWELS.find(v => v.name === 'shuruk');
    syllableMap.set(shuruk.char, `${LETTER_MAP['ו']}_${shuruk.name}.wav`);
    syllables.push({ syllable: shuruk.char, filename: `${LETTER_MAP['ו']}_${shuruk.name}.wav`, prompt: 'וּ' });


    return { syllables, syllableMap };
}

/**
 * Main execution function.
 */
async function main() {
    if (!API_KEY || API_KEY === 'YOUR_GEMINI_API_KEY') {
        console.error("ERROR: Please set the API_KEY variable in the script.");
        return;
    }

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR);
        console.log(`Created output directory: ${OUTPUT_DIR}`);
    }

    const { syllables, syllableMap } = generateSyllableData();
    console.log(`Identified ${syllables.length} unique syllables for generation.`);

    const manifestData = {};
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < syllables.length; i++) {
        const { syllable, filename, prompt } = syllables[i];
        const filePath = path.join(OUTPUT_DIR, filename);

        // Skip if file already exists
        if (fs.existsSync(filePath)) {
            manifestData[syllable] = filename;
            successCount++;
            continue;
        }

        console.log(`[${i + 1}/${syllables.length}] Generating '${syllable}' (${filename})...`);
        
        try {
            const pcmData = await fetchPcmAudio(prompt);
            // Assuming default rate is 24000 (standard for this TTS model)
            const wavBuffer = pcmToWav(pcmData, 24000); 
            fs.writeFileSync(filePath, wavBuffer);
            
            manifestData[syllable] = filename;
            successCount++;
            console.log(`Successfully saved: ${filename}`);

        } catch (error) {
            failCount++;
            console.error(`FATAL ERROR for '${syllable}': ${error.message}`);
        }
    }

    // Generate the final manifest file
    const manifestContent = `const AudioManifest = ${JSON.stringify(manifestData, null, 4)};`;
    fs.writeFileSync(MANIFEST_FILE, manifestContent);

    console.log('\n--- Generation Summary ---');
    console.log(`Total Syllables: ${syllables.length}`);
    console.log(`Successful Files: ${successCount}`);
    console.log(`Failed Files: ${failCount}`);
    console.log(`Manifest File Saved to: ${MANIFEST_FILE}`);
    console.log(`Audio Files Saved to: ${OUTPUT_DIR}`);
    console.log('--------------------------');
}

// Check for required modules before running
try {
    require('node-fetch');
} catch (e) {
    console.error("ERROR: This script requires the 'node-fetch' module (version 2).");
    console.error("Please run: npm install node-fetch@2");
    return;
}

// Execute the main function
main().catch(console.error);
