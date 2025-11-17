// Game configuration
const VOWELS = [
  { char: '\u05B8', name: 'קמץ' },
  { char: '\u05B7', name: 'פתח' },
  { char: '\u05B6', name: 'סגול' },
  { char: '\u05B5', name: 'צירה' },
  { char: '\u05B4', name: 'חיריק' },
  { char: '\u05B9', name: 'חולם חסר' },
  { char: 'ו\u05B9', name: 'חולם מלא' },
  { char: '\u05BB', name: 'קובוץ' },
  { char: 'וּ', name: 'שורוק' },
];

const ALL_LETTERS = ['א', 'ב', 'בּ', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ', 'כּ', 'ך', 'ל', 'מ', 'ם', 'נ', 'ן', 'ס', 'ע', 'פ', 'פּ', 'ף', 'צ', 'ץ', 'ק', 'ר', 'ש', 'ת'];
const NUM_OPTIONS = 4;

// Game state
let audioManifest = {};
let allowedSyllables = [];
let currentSyllable = '';
let correctScore = 0;
let totalScore = 0;
let currentAudio = null; // To manage audio playback
let isAudioPlaying = false;

// DOM elements
let configScreen, gameScreen, vowelsOptionsDiv, lettersOptionsDiv, startGameBtnTop, startGameBtnBottom, playSoundBtn, optionsGrid, messageBox, correctScoreSpan, totalScoreSpan, playIcon, loadingSpinner, filterError;

function initDOMReferences() {
  configScreen = document.getElementById('config-screen');
  gameScreen = document.getElementById('game-screen');
  vowelsOptionsDiv = document.getElementById('vowels-options');
  lettersOptionsDiv = document.getElementById('letters-options');
  startGameBtnTop = document.getElementById('start-game-btn-top');
  startGameBtnBottom = document.getElementById('start-game-btn-bottom');
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
  try {
    const response = await fetch('./audio_manifest.json');
    if (!response.ok) throw new Error('Failed to load audio_manifest.json');
    audioManifest = await response.json();
    console.log('Audio manifest loaded successfully');
  } catch (error) {
    console.error(error);
    messageBox.textContent = 'שגיאה חמורה בטעינת המשחק. נסה לרענן את הדף.';
    startGameBtnTop.disabled = true;
    startGameBtnBottom.disabled = true;
  }
}

function playLocalAudio(syllable) {
  const filename = audioManifest[syllable];
  if (!filename) {
    console.error(`Filename not found for syllable: ${syllable}`);
    messageBox.textContent = `שגיאה: אין קובץ צליל עבור '${syllable}'.`;
    setLoading(false);
    return;
  }

  // Stop current audio if playing
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  try {
    const audio = new Audio(`./audio/${filename}`);
    currentAudio = audio; // Store reference to current audio

    audio.onplaying = () => {
      isAudioPlaying = true;
      setLoading(false);
    };
    audio.onended = () => {
      isAudioPlaying = false;
      document.querySelectorAll('#options-grid button').forEach(btn => btn.disabled = false);
      playSoundBtn.disabled = false;
    };
    audio.onerror = (e) => {
      console.error(`Error loading audio file`, e);
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
  playIcon.classList.toggle('hidden', isLoading);
  loadingSpinner.classList.toggle('hidden', !isLoading);
  playSoundBtn.disabled = isLoading;
  optionsGrid.querySelectorAll('button').forEach(btn => btn.disabled = isLoading);
}

function playCurrentSyllable() {
  if (!currentSyllable) return; // Removed isAudioPlaying check to allow replaying
  setLoading(true);
  messageBox.textContent = '...מאזינים';
  playLocalAudio(currentSyllable);
}

function updateAllowedSyllables() {
  const selectedVowels = Array.from(document.querySelectorAll('#vowels-options input:checked')).map(cb => cb.value);
  const selectedLetters = Array.from(document.querySelectorAll('#letters-options input:checked')).map(cb => cb.value);

  if (selectedVowels.length === 0 || selectedLetters.length === 0) {
    startGameBtnTop.disabled = true;
    startGameBtnBottom.disabled = true;
    filterError.classList.remove('hidden');
    allowedSyllables = [];
    return;
  }

  filterError.classList.add('hidden');
  
  const potentialSyllables = new Set();
  for (const consonant of selectedLetters) {
    for (const vowel of selectedVowels) {
      // Skip creating syllables with 'vav' as a consonant and a vowel that uses 'vav'
      if (consonant === 'ו' && (vowel === 'וּ' || vowel === 'ו\u05B9')) continue;
      // Skip adding 'shuruk' or 'holam maleh' as a vowel to other consonants
      if (vowel === 'וּ' || vowel === 'ו\u05B9') continue;
      potentialSyllables.add(consonant + vowel);
    }
  }

  // Add 'vav' based vowels if they are selected
  if (selectedVowels.includes('ו\u05B9')) potentialSyllables.add('ו\u05B9');
  if (selectedVowels.includes('וּ')) potentialSyllables.add('וּ');

  allowedSyllables = [...potentialSyllables].filter(s => audioManifest[s]);
  
  const disableButtons = allowedSyllables.length < NUM_OPTIONS;
  startGameBtnTop.disabled = disableButtons;
  startGameBtnBottom.disabled = disableButtons;

  if (disableButtons) {
    filterError.textContent = `לא נמצאו מספיק הברות (${allowedSyllables.length} מתוך ${NUM_OPTIONS} דרושות). נסה אפשרויות סינון אחרות.`;
    filterError.classList.remove('hidden');
  } else {
    filterError.classList.add('hidden');
  }
}

function nextRound() {
  if (allowedSyllables.length < NUM_OPTIONS) {
    backToConfig();
    alert('אין מספיק אותיות וניקודים כדי להמשיך. אנא בחר אפשרויות נוספות.');
    return;
  }

  const options = new Set();
  while (options.size < NUM_OPTIONS) {
    options.add(allowedSyllables[Math.floor(Math.random() * allowedSyllables.length)]);
  }

  const optionsArray = [...options].sort(() => Math.random() - 0.5);
  currentSyllable = optionsArray[Math.floor(Math.random() * optionsArray.length)];

  optionsGrid.innerHTML = '';
  optionsArray.forEach(syllable => {
    const btn = document.createElement('button');
    btn.textContent = syllable;
    btn.className = 'game-option';
    btn.onclick = () => checkAnswer(syllable, btn);
    btn.disabled = true;
    optionsGrid.appendChild(btn);
  });

  messageBox.textContent = 'לחץ על הרמקול!';
  playSoundBtn.disabled = false;
}

function checkAnswer(chosenSyllable, btn) {
  optionsGrid.querySelectorAll('button').forEach(b => b.disabled = true);
  playSoundBtn.disabled = true;
  totalScore++;

  if (chosenSyllable === currentSyllable) {
    correctScore++;
    messageBox.innerHTML = 'כל הכבוד! נכון!';
    btn.classList.add('correct');
  } else {
    messageBox.innerHTML = `אופס! התשובה הנכונה: <span class="correct-answer">${currentSyllable}</span>`;
    btn.classList.add('incorrect');
    optionsGrid.querySelectorAll('button').forEach(b => {
      if (b.textContent === currentSyllable) b.classList.add('correct');
    });
  }

  correctScoreSpan.textContent = correctScore;
  totalScoreSpan.textContent = totalScore;

  setTimeout(nextRound, 2000);
}

function createCheckbox(item, groupName, container, defaultChecked = true) {
    const div = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `${groupName}-${item.char || item}`;
    input.value = item.char || item;
    input.checked = defaultChecked;
    input.onchange = updateAllowedSyllables;
    
    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.className = 'checkbox-label';
    label.innerHTML = `${item.char || item} <span class="vowel-name">${item.name || ''}</span>`; // Show char and name

    div.appendChild(input);
    div.appendChild(label);
    container.appendChild(div);
}

function initializeVowelsUI() {
  VOWELS.forEach(vowel => createCheckbox(vowel, 'vowel', vowelsOptionsDiv));
}

function initializeLettersUI() {
  ALL_LETTERS.forEach(letter => createCheckbox(letter, 'letter', lettersOptionsDiv));
}

function createFloatingEmojis() {
    const container = document.body;
    for (let i = 0; i < 15; i++) {
        const emoji = document.createElement('div');
        emoji.className = 'bg-emoji';
        emoji.textContent = EMOJIS[i % EMOJIS.length];
        emoji.style.left = `${Math.random() * 100}vw`;
        emoji.style.top = `${Math.random() * 100}vh`;
        emoji.style.fontSize = `${Math.random() * 2 + 2}rem`;
        emoji.style.animationDuration = `${Math.random() * 5 + 5}s`;
        emoji.style.animationDelay = `${Math.random() * -5}s`;
        emoji.style.animationName = Math.random() > 0.5 ? 'float' : 'float-side-to-side';
        container.appendChild(emoji);
    }
}

function startGame() {
  if (allowedSyllables.length < NUM_OPTIONS) return;
  configScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  messageBox.textContent = 'מתחילים! לחץ על הרמקול';
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
  initializeLettersUI();
  await loadManifest();
  updateAllowedSyllables();
}

// Export for HTML onclicks
window.startGame = startGame;
window.playCurrentSyllable = playCurrentSyllable;
window.backToConfig = backToConfig;

document.addEventListener('DOMContentLoaded', init);
