// GameStateManager.js — Central game state hub

import { getEnemyCount } from '../enemies/EnemyAI.js';

// --- State ---
let currentLevelIndex = 0;
let score = 0;
let upgradePoints = 0;
let activeUpgrades = new Set(); // upgrade IDs that are active
let gamePhase = 'menu'; // 'menu' | 'playing' | 'levelComplete' | 'gameOver' | 'survival'

// --- Helpers ---
function dispatchStateChange() {
  window.dispatchEvent(new CustomEvent('game:stateChanged', { detail: getState() }));
}

// --- Exports ---
function getState() {
  return { currentLevelIndex, score, upgradePoints, activeUpgrades: [...activeUpgrades], gamePhase };
}

function addScore(points) {
  score += points;
  dispatchStateChange();
}

function addUpgradePoints(n) {
  upgradePoints += n;
  dispatchStateChange();
}

function spendUpgradePoints(n) {
  upgradePoints -= n;
  dispatchStateChange();
}

function activateUpgrade(id) {
  activeUpgrades.add(id);
  dispatchStateChange();
}

function isUpgradeActive(id) {
  return activeUpgrades.has(id);
}

function setGamePhase(phase) {
  gamePhase = phase;
  window.dispatchEvent(new CustomEvent('game:phaseChanged', { detail: { phase } }));
}

function nextLevel() {
  currentLevelIndex++;
}

function resetState() {
  currentLevelIndex = 0;
  score = 0;
  upgradePoints = 0;
  activeUpgrades = new Set();
  setGamePhase('menu');
  dispatchStateChange();
}

// --- Win condition check ---
function checkWinCondition() {
  if (gamePhase === 'playing' && getEnemyCount() === 0) {
    window.dispatchEvent(new CustomEvent('game:levelComplete'));
    setGamePhase('levelComplete');
  }
}

// --- Event listeners ---
window.addEventListener('enemy:killed', () => {
  addScore(100);
  checkWinCondition();
});

window.addEventListener('player:dead', () => {
  setGamePhase('gameOver');
});

export {
  getState,
  addScore,
  addUpgradePoints,
  spendUpgradePoints,
  activateUpgrade,
  isUpgradeActive,
  setGamePhase,
  nextLevel,
  resetState,
};
