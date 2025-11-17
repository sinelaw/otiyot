// Game configuration
const VOWELS = [
  { char: '\u05B8', name: 'kamatz', display: 'קמץ (a)' },
  { char: '\u05B7', name: 'patach', display: 'פתח (a)' },
  { char: '\u05B6', name: 'segol', display: 'סגול (e)' },
  { char: '\u05B5', name: 'tzere', display: 'צירה (e)' },
  { char: '\u05B4', name: 'chirik', display: 'חיריק (i)' },
  { char: '\u05B9', name: 'holam_chaser', display: 'חולם חסר (o)' },
  { char: 'ו\u05B9', name: 'holam_maleh', display: 'חולם מלא (o)' },
  { char: '\u05BB', name: 'kubutz', display: 'קובוץ (u)' },
  { char: 'וּ', name: 'shuruk', display: 'שורוק (u)' },
];

const BASE_LETTERS = ['א', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'ל', 'מ', 'נ', 'ס', 'ע', 'צ', 'ק', 'ר', 'ש', 'ת'];
const DAGESH_LETTERS = ['ב', 'בּ', 'כ', 'כּ', 'פ', 'פּ'];
const FINAL_LETTERS = ['ך', 'ם', 'ן', 'ף', 'ץ'];

const NUM_OPTIONS = 4;

// Game state
let audioManifest = {};
let allowedSyllables = [];
let currentSyllable = '';
let correctScore = 0;
let totalScore = 0;
let isAudioPlaying = false;

// DOM elements
let configScreen;
let gameScreen;
let vowelsOptionsDiv;
let startGameBtn;
let playSoundBtn;
let optionsGrid;
let messageBox;
let correctScoreSpan;
let totalScoreSpan;
let playIcon;
let loadingSpinner;
let filterError;

function initDOMReferences() {
  configScreen = document.getElementById('config-screen');
  gameScreen = document.getElementById('game-screen');
  vowelsOptionsDiv = document.getElementById('vowels-options');
  startGameBtn = document.getElementById('start-game-btn');
  playSoundBtn = document.getElementById('play-sound-btn');
  optionsGrid = document.getElementById('options-grid');
  messageBox = document.getElementById('message-box');
  correctScoreSpan = document.getElementById('correct-score');
  totalScoreSpan = document.getElementById('total-score');
  playIcon = document.getElementById('play-icon');
  loadingSpinner = document.getElementById('loading-spinner');
  filterError = document.getElementById('filter-error');
}

async function loadManifest() {
  const response = await fetch('./audio_manifest.json');
  if (!response.ok) {
    throw new Error('Failed to load audio_manifest.json');
  }
  audioManifest = await response.json();
  console.log('Audio manifest loaded successfully');
}

function playLocalAudio(syllable) {
  const filename = audioManifest[syllable];
  if (!filename) {
    console.error(`Filename not found for syllable: ${syllable}`);
    messageBox.textContent = `שגיאה: אין קובץ צליל עבור '${syllable}'.`;
    setLoading(false);
    return;
  }

  try {
    const audioUrl = `./audio/${filename}`;
    const audio = new Audio(audioUrl);

    audio.onplaying = () => {
      isAudioPlaying = true;
      document.querySelectorAll('#options-grid button').forEach(btn => btn.disabled = true);
      playSoundBtn.disabled = true;
      setLoading(false);
    };

    audio.onended = () => {
      isAudioPlaying = false;
      document.querySelectorAll('#options-grid button').forEach(btn => btn.disabled = false);
      playSoundBtn.disabled = false;
    };

    audio.onerror = (e) => {
      console.error(`Error loading audio file: ${audioUrl}`, e);
      messageBox.textContent = 'שגיאה בטעינת קובץ האודיו.';
      setLoading(false);
    };

    audio.play();
  } catch (e) {
    console.error('Audio playback error:', e);
    messageBox.textContent = 'שגיאה בניגון הצליל.';
    setLoading(false);
  }
}

function setLoading(isLoading) {
  if (isLoading) {
    playIcon.classList.add('hidden');
    loadingSpinner.classList.remove('hidden');
    playSoundBtn.disabled = true;
    optionsGrid.querySelectorAll('button').forEach(btn => btn.disabled = true);
  } else {
    playIcon.classList.remove('hidden');
    loadingSpinner.classList.add('hidden');
    if (!isAudioPlaying) {
      playSoundBtn.disabled = false;
      if (!gameScreen.classList.contains('hidden')) {
        optionsGrid.querySelectorAll('button').forEach(btn => btn.disabled = false);
      }
    }
  }
}

function playCurrentSyllable() {
  if (!currentSyllable || isAudioPlaying) return;

  setLoading(true);
  messageBox.textContent = 'מנגן צליל...';

  playLocalAudio(currentSyllable);
  messageBox.textContent = 'לחץ/י על התשובה הנכונה:';
}

function updateAllowedSyllables() {
  const selectedVowels = Array.from(document.querySelectorAll('#vowels-options input:checked')).map(cb => cb.value);
  const includeDagesh = document.getElementById('include-dagesh').checked;
  const includeFinal = document.getElementById('include-final').checked;
  const includeBase = document.getElementById('include-base').checked;

  if (selectedVowels.length === 0) {
    startGameBtn.disabled = true;
    filterError.classList.remove('hidden');
    allowedSyllables = [];
    return;
  }

  filterError.classList.add('hidden');
  const potentialSyllables = [];

  let allowedConsonants = [];
  if (includeBase) {
    allowedConsonants.push(...BASE_LETTERS);
  }
  if (includeDagesh) {
    allowedConsonants.push(...DAGESH_LETTERS);
  } else {
    allowedConsonants.push('ב', 'כ', 'פ');
    allowedConsonants = allowedConsonants.filter(c => c !== 'בּ' && c !== 'כּ' && c !== 'פּ');
  }
  if (includeFinal) {
    allowedConsonants.push(...FINAL_LETTERS);
  }
  allowedConsonants = [...new Set(allowedConsonants)];

  for (const consonant of allowedConsonants) {
    for (const vowel of selectedVowels) {
      if (consonant === 'ו' && (vowel === 'וּ' || vowel === 'ו\u05B9')) {
        potentialSyllables.push(vowel);
      } else if (consonant === 'ו') {
        continue;
      } else if (vowel === 'וּ' || vowel === 'ו\u05B9') {
        continue;
      } else {
        potentialSyllables.push(consonant + vowel);
      }
    }
  }

  if (selectedVowels.includes('ו\u05B9')) {
    potentialSyllables.push('ו\u05B9');
  }
  if (selectedVowels.includes('וּ')) {
    potentialSyllables.push('וּ');
  }

  allowedSyllables = [...new Set(potentialSyllables)]
    .filter(s => s)
    .filter(s => Object.prototype.hasOwnProperty.call(audioManifest, s));

  if (allowedSyllables.length === 0) {
    startGameBtn.disabled = true;
    messageBox.textContent = 'אין הברות תואמות עם ניקודים וקבצי אודיו זמינים.';
    filterError.classList.remove('hidden');
  } else {
    startGameBtn.disabled = false;
    messageBox.textContent = "לחץ/י על 'התחל משחק'!";
  }
  console.log('Allowed syllables:', allowedSyllables);
}

function nextRound() {
  if (allowedSyllables.length === 0) {
    messageBox.textContent = 'שגיאה: אין הברות נבחרות.';
    return;
  }

  const options = new Set();

  while (options.size < NUM_OPTIONS && options.size < allowedSyllables.length) {
    const randomIndex = Math.floor(Math.random() * allowedSyllables.length);
    const randomSyllable = allowedSyllables[randomIndex];
    options.add(randomSyllable);
  }

  const optionsArray = Array.from(options).sort(() => Math.random() - 0.5);

  const correctIndex = Math.floor(Math.random() * optionsArray.length);
  currentSyllable = optionsArray[correctIndex];

  optionsGrid.innerHTML = '';
  optionsArray.forEach(syllable => {
    const btn = document.createElement('button');
    btn.textContent = syllable;
    btn.className = 'game-option flex items-center justify-center bg-white text-gray-800 rounded-xl shadow-md border-b-8 hover:bg-yellow-100 disabled:opacity-50';
    btn.onclick = () => checkAnswer(syllable);
    btn.disabled = true;
    optionsGrid.appendChild(btn);
  });

  messageBox.textContent = 'לחץ/י על הרמקול כדי לשמוע את ההברה';
  playSoundBtn.disabled = false;
}

function checkAnswer(chosenSyllable) {
  optionsGrid.querySelectorAll('button').forEach(btn => btn.disabled = true);
  playSoundBtn.disabled = true;

  totalScore++;
  let isCorrect = false;

  if (chosenSyllable === currentSyllable) {
    correctScore++;
    messageBox.innerHTML = '<span class="text-green-600">כל הכבוד! נכון! <i class="fas fa-check-circle"></i></span>';
    isCorrect = true;
  } else {
    messageBox.innerHTML = `<span class="text-red-600">אופס! טעות. <i class="fas fa-times-circle"></i></span><br>התשובה הנכונה: <span class="text-3xl font-extrabold text-blue-600">${currentSyllable}</span>`;
  }

  optionsGrid.querySelectorAll('button').forEach(btn => {
    if (btn.textContent === currentSyllable) {
      btn.classList.add('bg-green-300', 'border-green-600');
      btn.classList.remove('bg-white', 'border-yellow-400', 'hover:bg-yellow-100');
    } else if (btn.textContent === chosenSyllable && !isCorrect) {
      btn.classList.add('bg-red-300', 'border-red-600');
      btn.classList.remove('bg-white', 'border-yellow-400', 'hover:bg-yellow-100');
    }
  });

  correctScoreSpan.textContent = correctScore.toString();
  totalScoreSpan.textContent = totalScore.toString();

  setTimeout(nextRound, 2500);
}

function initializeVowelsUI() {
  VOWELS.forEach(vowel => {
    const container = document.createElement('div');
    container.className = 'flex items-center space-x-2 space-x-reverse';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `vowel-${vowel.char.replace(/[^\w]/g, '_')}`;
    input.value = vowel.char;
    input.className = 'hidden';
    input.checked = true;
    input.onchange = updateAllowedSyllables;

    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.className = 'checkbox-label text-xl flex items-center justify-center w-full';
    label.innerHTML = `${vowel.char} <span class="text-sm mr-2 text-gray-500">(${vowel.display})</span>`;

    container.appendChild(input);
    container.appendChild(label);
    vowelsOptionsDiv.appendChild(container);
  });

  document.getElementById('include-dagesh').onchange = updateAllowedSyllables;
  document.getElementById('include-final').onchange = updateAllowedSyllables;
}

function startGame() {
  if (allowedSyllables.length === 0) {
    filterError.classList.remove('hidden');
    return;
  }
  configScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  messageBox.textContent = 'מתחילים! לחץ/י על הרמקול';
  correctScore = 0;
  totalScore = 0;
  correctScoreSpan.textContent = '0';
  totalScoreSpan.textContent = '0';
  nextRound();
}

function backToConfig() {
  gameScreen.classList.add('hidden');
  configScreen.classList.remove('hidden');
  updateAllowedSyllables();
}

async function init() {
  initDOMReferences();
  initializeVowelsUI();
  try {
    await loadManifest();
    updateAllowedSyllables();
  } catch (e) {
    console.error(e);
    messageBox.textContent = e.message;
    startGameBtn.disabled = true;
  }
}

// Export functions for HTML onclick handlers
window.startGame = startGame;
window.playCurrentSyllable = playCurrentSyllable;
window.checkAnswer = checkAnswer;
window.backToConfig = backToConfig;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
