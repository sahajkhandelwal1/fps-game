// Screens.js — Phase 6: Full-screen overlays (menu, pause, level complete, game over)

import { loadLevel } from '../engine/LevelLoader.js';
import { getState, nextLevel, setGamePhase, resetState } from '../engine/GameStateManager.js';

// --- Shared styles ---
const SCREEN_BASE = `
  position:fixed;top:0;left:0;width:100%;height:100%;
  background:rgba(0,0,0,0.85);
  color:#fff;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  z-index:20;font-family:monospace;
`;

const BTN_STYLE = `
  margin:8px 0;padding:12px 32px;
  background:#111;color:#fff;
  border:1px solid #fff;border-radius:4px;
  font-family:monospace;font-size:16px;cursor:pointer;
  transition:background 0.15s;
`;

const TITLE_STYLE = `font-size:48px;font-weight:bold;margin-bottom:24px;letter-spacing:4px;`;
const SUB_STYLE   = `font-size:16px;color:#aaa;margin-bottom:32px;`;
const STAT_STYLE  = `font-size:18px;color:#ddd;margin-bottom:8px;`;

// --- Button helper ---
function makeBtn(label, onClick) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.setAttribute('style', BTN_STYLE);
  btn.addEventListener('mouseover', () => { btn.style.background = '#333'; });
  btn.addEventListener('mouseout',  () => { btn.style.background = '#111'; });
  btn.addEventListener('click', onClick);
  return btn;
}

// --- Screen container helper ---
function makeScreen(id) {
  const div = document.createElement('div');
  div.id = id;
  div.setAttribute('style', SCREEN_BASE + 'display:none;');
  document.body.appendChild(div);
  return div;
}

// --- Level loading helper ---
async function loadLevelByIndex(index) {
  hideAllScreens();
  const levelFile = `./levels/level${index + 1}.json`;
  try {
    const r = await fetch(levelFile);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const cfg = await r.json();
    loadLevel(cfg);
  } catch (err) {
    console.error('[Screens] Failed to load level', index + 1, err);
  }
}

// ==================== MAIN MENU ====================
const menuScreen = makeScreen('screen-menu');

(function buildMenu() {
  const title = document.createElement('div');
  title.setAttribute('style', TITLE_STYLE);
  title.textContent = 'FPS GAME';

  const controls = document.createElement('div');
  controls.setAttribute('style', 'font-size:13px;color:#888;margin-bottom:32px;line-height:1.8;text-align:center;');
  controls.innerHTML = `
    WASD — Move &nbsp;|&nbsp; Mouse — Look &nbsp;|&nbsp; Left Click — Shoot<br>
    R — Reload &nbsp;|&nbsp; Shift — Sprint &nbsp;|&nbsp; Space — Jump<br>
    1 / 2 / 3 — Switch Weapon &nbsp;|&nbsp; Right Click — Scope
  `;

  const playBtn = makeBtn('PLAY', () => {
    resetState();
    setGamePhase('playing');
    loadLevelByIndex(0);
  });

  menuScreen.appendChild(title);
  menuScreen.appendChild(controls);
  menuScreen.appendChild(playBtn);
}());

// ==================== PAUSE SCREEN ====================
const pauseScreen = makeScreen('screen-pause');

(function buildPause() {
  const title = document.createElement('div');
  title.setAttribute('style', TITLE_STYLE);
  title.textContent = 'PAUSED';

  const resumeBtn = makeBtn('Resume', () => {
    hideAllScreens();
    setGamePhase('playing');
  });

  const restartBtn = makeBtn('Restart Level', () => {
    const state = getState();
    loadLevelByIndex(state.currentLevelIndex);
  });

  const menuBtn = makeBtn('Main Menu', () => {
    resetState();
    showScreen('screen-menu');
  });

  pauseScreen.appendChild(title);
  pauseScreen.appendChild(resumeBtn);
  pauseScreen.appendChild(restartBtn);
  pauseScreen.appendChild(menuBtn);
}());

// ==================== LEVEL COMPLETE SCREEN ====================
const levelCompleteScreen = makeScreen('screen-levelcomplete');

const lcTitle     = document.createElement('div');
const lcScore     = document.createElement('div');
const lcKills     = document.createElement('div');
const lcTime      = document.createElement('div');
const lcContinue  = makeBtn('Continue', () => {
  const state = getState();
  nextLevel();
  const next = getState().currentLevelIndex; // after nextLevel() increments

  // After level 7 (index 6) → survival
  if (next >= 7) {
    fetch('./levels/survival.json')
      .then(r => r.json())
      .then(cfg => {
        hideAllScreens();
        loadLevel(cfg);
        setGamePhase('survival');
      })
      .catch(err => console.error('[Screens] Failed to load survival level', err));
  } else {
    loadLevelByIndex(next);
  }
});

(function buildLevelComplete() {
  lcTitle.setAttribute('style', TITLE_STYLE);
  lcTitle.textContent = 'LEVEL COMPLETE';

  lcScore.setAttribute('style', STAT_STYLE);
  lcKills.setAttribute('style', STAT_STYLE);
  lcTime.setAttribute('style',  STAT_STYLE);

  levelCompleteScreen.appendChild(lcTitle);
  levelCompleteScreen.appendChild(lcScore);
  levelCompleteScreen.appendChild(lcKills);
  levelCompleteScreen.appendChild(lcTime);
  levelCompleteScreen.appendChild(lcContinue);
}());

// ==================== GAME OVER SCREEN ====================
const gameOverScreen = makeScreen('screen-gameover');

const goTitle = document.createElement('div');
const goScore = document.createElement('div');

const goRetry = makeBtn('Retry', () => {
  const state = getState();
  loadLevelByIndex(state.currentLevelIndex);
});

const goMenu = makeBtn('Main Menu', () => {
  resetState();
  showScreen('screen-menu');
});

(function buildGameOver() {
  goTitle.setAttribute('style', TITLE_STYLE);
  goTitle.textContent = 'GAME OVER';

  goScore.setAttribute('style', STAT_STYLE);

  gameOverScreen.appendChild(goTitle);
  gameOverScreen.appendChild(goScore);
  gameOverScreen.appendChild(goRetry);
  gameOverScreen.appendChild(goMenu);
}());

// --- Level complete tracking ---
let levelStartTime  = Date.now();
let killsThisLevel  = 0;

window.addEventListener('enemy:killed', () => {
  killsThisLevel++;
});

window.addEventListener('game:levelComplete', () => {
  const state     = getState();
  const elapsed   = Math.round((Date.now() - levelStartTime) / 1000);

  lcScore.textContent = `Score: ${state.score}`;
  lcKills.textContent = `Enemies killed: ${killsThisLevel}`;
  lcTime.textContent  = `Time: ${elapsed}s`;

  killsThisLevel = 0;
});

// --- Phase change handler ---
window.addEventListener('game:phaseChanged', (e) => {
  const { phase } = e.detail;

  switch (phase) {
    case 'menu':
      showScreen('screen-menu');
      break;

    case 'playing':
    case 'survival':
      hideAllScreens();
      levelStartTime = Date.now();
      killsThisLevel = 0;
      break;

    case 'levelComplete':
      showScreen('screen-levelcomplete');
      break;

    case 'gameOver': {
      const state = getState();
      goScore.textContent = `Score: ${state.score}`;
      showScreen('screen-gameover');
      break;
    }

    default:
      break;
  }
});

// --- Keyboard: Escape → pause / resume ---
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;

  const state = getState();

  if (state.gamePhase === 'playing') {
    setGamePhase('paused');
    showScreen('screen-pause');
  } else if (state.gamePhase === 'paused') {
    hideAllScreens();
    setGamePhase('playing');
  }
});

// --- Public API ---
function showScreen(id) {
  hideAllScreens();
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function hideAllScreens() {
  [menuScreen, pauseScreen, levelCompleteScreen, gameOverScreen].forEach(s => {
    s.style.display = 'none';
  });
}

// Show main menu on load
showScreen('screen-menu');

export { showScreen, hideAllScreens };
