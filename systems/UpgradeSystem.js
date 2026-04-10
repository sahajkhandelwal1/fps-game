// UpgradeSystem.js — Phase 7: Upgrade tree between levels

import { getState, activateUpgrade, spendUpgradePoints, isUpgradeActive } from '../engine/GameStateManager.js';
import { loadLevel } from '../engine/LevelLoader.js';

// --- Upgrade Definitions ---
const UPGRADES = [
  { id: 'hp_max',       category: 'Health',    name: 'Max HP +20',          description: 'Increases max HP by 20',                        cost: 1 },
  { id: 'hp_regen',     category: 'Health',    name: 'Regeneration',        description: '+1 HP/sec when out of combat for 5s',            cost: 1 },
  { id: 'armor',        category: 'Health',    name: 'Armor',               description: 'Reduce incoming damage by 10%',                  cost: 2 },
  { id: 'damage',       category: 'Combat',    name: 'Damage +15%',         description: 'All weapons deal 15% more damage',               cost: 1 },
  { id: 'reload_speed', category: 'Combat',    name: 'Reload Speed +20%',   description: 'Reload 20% faster',                             cost: 1 },
  { id: 'ammo_cap',     category: 'Combat',    name: 'Ammo Capacity +50%',  description: 'Reserve ammo increased 50%',                    cost: 1 },
  { id: 'move_speed',   category: 'Movement',  name: 'Move Speed +10%',     description: 'Base movement speed increased',                  cost: 1 },
  { id: 'sprint_dur',   category: 'Movement',  name: 'Sprint Duration +2s', description: 'Sprint stamina extended by 2 seconds',           cost: 1 },
  { id: 'silent_move',  category: 'Movement',  name: 'Silent Movement',     description: 'Halves enemy alert range',                       cost: 2 },
  { id: 'eagle_eye',    category: 'Tactical',  name: 'Eagle Eye',           description: 'Shows enemy positions within 20m on minimap',   cost: 1 },
  { id: 'scavenger',    category: 'Tactical',  name: 'Scavenger',           description: 'Ammo pickups grant 50% more ammo',              cost: 1 },
];

const CATEGORIES = ['Health', 'Combat', 'Movement', 'Tactical'];

// --- Styles ---
const OVERLAY_STYLE = `
  position:fixed;top:0;left:0;width:100%;height:100%;
  background:rgba(0,0,0,0.92);
  color:#fff;
  display:flex;flex-direction:column;align-items:center;
  z-index:200;font-family:monospace;
  overflow-y:auto;
  padding:24px 0 40px;
  box-sizing:border-box;
`;

const HEADER_STYLE = `
  font-size:42px;font-weight:bold;letter-spacing:6px;
  margin-bottom:6px;text-align:center;
`;

const POINTS_STYLE = `
  font-size:18px;color:#f0c040;margin-bottom:24px;letter-spacing:2px;
`;

const CATEGORY_TITLE_STYLE = `
  font-size:20px;font-weight:bold;letter-spacing:3px;
  color:#88ccff;margin:16px 0 8px;text-transform:uppercase;
  border-bottom:1px solid #336;padding-bottom:4px;width:100%;
`;

const CARDS_ROW_STYLE = `
  display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-start;
  width:100%;margin-bottom:4px;
`;

const CARD_STYLE = `
  background:#111;border:1px solid #333;border-radius:6px;
  padding:14px 16px;width:220px;box-sizing:border-box;
  display:flex;flex-direction:column;gap:6px;
`;

const CARD_ACQUIRED_STYLE = `
  background:#0a120a;border:1px solid #2a4a2a;border-radius:6px;
  padding:14px 16px;width:220px;box-sizing:border-box;
  display:flex;flex-direction:column;gap:6px;opacity:0.55;
`;

const CARD_NAME_STYLE   = `font-size:15px;font-weight:bold;color:#eee;`;
const CARD_DESC_STYLE   = `font-size:12px;color:#aaa;line-height:1.4;`;
const CARD_COST_STYLE   = `font-size:13px;color:#f0c040;margin-top:2px;`;
const ACQUIRED_STYLE    = `font-size:13px;color:#6dbf6d;font-weight:bold;`;

const BTN_BUY_STYLE = `
  margin-top:6px;padding:7px 14px;
  background:#1a3a5a;color:#fff;
  border:1px solid #4a8abf;border-radius:4px;
  font-family:monospace;font-size:13px;cursor:pointer;
  transition:background 0.15s;align-self:flex-start;
`;

const BTN_BUY_DISABLED_STYLE = `
  margin-top:6px;padding:7px 14px;
  background:#222;color:#666;
  border:1px solid #444;border-radius:4px;
  font-family:monospace;font-size:13px;cursor:not-allowed;
  align-self:flex-start;
`;

const BTN_CONTINUE_STYLE = `
  margin-top:28px;padding:14px 48px;
  background:#1a4a1a;color:#fff;
  border:1px solid #4abf4a;border-radius:4px;
  font-family:monospace;font-size:18px;cursor:pointer;
  letter-spacing:2px;
  transition:background 0.15s;
`;

const CONTENT_WRAP_STYLE = `
  width:90%;max-width:900px;
`;

// --- DOM ---
const overlay = document.createElement('div');
overlay.id = 'upgrade-overlay';
overlay.setAttribute('style', OVERLAY_STYLE + 'display:none;');
document.body.appendChild(overlay);

const header = document.createElement('div');
header.setAttribute('style', HEADER_STYLE);
header.textContent = 'UPGRADES';

const pointsDisplay = document.createElement('div');
pointsDisplay.setAttribute('style', POINTS_STYLE);

const contentWrap = document.createElement('div');
contentWrap.setAttribute('style', CONTENT_WRAP_STYLE);

const continueBtn = document.createElement('button');
continueBtn.textContent = 'Continue to Next Level';
continueBtn.setAttribute('style', BTN_CONTINUE_STYLE);
continueBtn.addEventListener('mouseover', () => { continueBtn.style.background = '#2a6a2a'; });
continueBtn.addEventListener('mouseout',  () => { continueBtn.style.background = '#1a4a1a'; });

overlay.appendChild(header);
overlay.appendChild(pointsDisplay);
overlay.appendChild(contentWrap);
overlay.appendChild(continueBtn);

// --- Render upgrade cards ---
function renderUpgrades() {
  const state = getState();
  pointsDisplay.textContent = `Upgrade Points: ${state.upgradePoints}`;

  contentWrap.innerHTML = '';

  for (const category of CATEGORIES) {
    const categoryUpgrades = UPGRADES.filter(u => u.category === category);
    if (categoryUpgrades.length === 0) continue;

    const catTitle = document.createElement('div');
    catTitle.setAttribute('style', CATEGORY_TITLE_STYLE);
    catTitle.textContent = category;
    contentWrap.appendChild(catTitle);

    const cardsRow = document.createElement('div');
    cardsRow.setAttribute('style', CARDS_ROW_STYLE);

    for (const upgrade of categoryUpgrades) {
      const acquired = isUpgradeActive(upgrade.id);
      const canAfford = state.upgradePoints >= upgrade.cost;

      const card = document.createElement('div');
      card.setAttribute('style', acquired ? CARD_ACQUIRED_STYLE : CARD_STYLE);

      const name = document.createElement('div');
      name.setAttribute('style', CARD_NAME_STYLE);
      name.textContent = upgrade.name;

      const desc = document.createElement('div');
      desc.setAttribute('style', CARD_DESC_STYLE);
      desc.textContent = upgrade.description;

      const cost = document.createElement('div');
      cost.setAttribute('style', CARD_COST_STYLE);
      cost.textContent = `Cost: ${upgrade.cost} point${upgrade.cost !== 1 ? 's' : ''}`;

      card.appendChild(name);
      card.appendChild(desc);
      card.appendChild(cost);

      if (acquired) {
        const acquiredLabel = document.createElement('div');
        acquiredLabel.setAttribute('style', ACQUIRED_STYLE);
        acquiredLabel.textContent = 'ACQUIRED';
        card.appendChild(acquiredLabel);
      } else {
        const buyBtn = document.createElement('button');
        buyBtn.textContent = 'Buy';

        if (canAfford) {
          buyBtn.setAttribute('style', BTN_BUY_STYLE);
          buyBtn.addEventListener('mouseover', () => { buyBtn.style.background = '#2a5a8a'; });
          buyBtn.addEventListener('mouseout',  () => { buyBtn.style.background = '#1a3a5a'; });
          buyBtn.addEventListener('click', () => {
            purchaseUpgrade(upgrade);
          });
        } else {
          buyBtn.setAttribute('style', BTN_BUY_DISABLED_STYLE);
          buyBtn.disabled = true;
        }

        card.appendChild(buyBtn);
      }

      cardsRow.appendChild(card);
    }

    contentWrap.appendChild(cardsRow);
  }
}

// --- Purchase logic ---
function purchaseUpgrade(upgrade) {
  const state = getState();
  if (state.upgradePoints < upgrade.cost) return;
  if (isUpgradeActive(upgrade.id)) return;

  activateUpgrade(upgrade.id);
  spendUpgradePoints(upgrade.cost);

  // Dispatch event so PlayerController / WeaponSystem can react
  window.dispatchEvent(new CustomEvent('upgrade:applied', { detail: { id: upgrade.id } }));

  // Re-render with updated state
  renderUpgrades();
}

// --- Show / hide ---
function showUpgradeScreen() {
  renderUpgrades();
  overlay.style.display = 'flex';
}

function hideUpgradeScreen() {
  overlay.style.display = 'none';
}

// --- Continue button: load next level ---
continueBtn.addEventListener('click', async () => {
  hideUpgradeScreen();

  // nextLevel() is already called by Screens.js's Continue button (which fires before our overlay
  // intercepts). So we just read the already-incremented currentLevelIndex from state.
  const { setGamePhase } = await import('../engine/GameStateManager.js');
  const { currentLevelIndex } = getState();

  if (currentLevelIndex >= 7) {
    try {
      const r = await fetch('./levels/survival.json');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const cfg = await r.json();
      loadLevel(cfg);
      setGamePhase('survival');
    } catch (err) {
      console.error('[UpgradeSystem] Failed to load survival level', err);
      showUpgradeScreen();
      const errMsg = document.createElement('div');
      errMsg.textContent = 'Failed to load level. Please try again.';
      errMsg.style.cssText = 'color:#e74c3c;text-align:center;margin-top:10px;';
      document.getElementById('upgrade-overlay')?.appendChild(errMsg);
      setTimeout(() => errMsg.remove(), 3000);
    }
  } else {
    const levelFile = `./levels/level${currentLevelIndex + 1}.json`;
    fetch(levelFile)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(cfg => {
        loadLevel(cfg);
        setGamePhase('playing');
      })
      .catch(err => {
        console.error('[UpgradeSystem] Failed to load level', currentLevelIndex + 1, err);
        showUpgradeScreen();
        const errMsg = document.createElement('div');
        errMsg.textContent = 'Failed to load level. Please try again.';
        errMsg.style.cssText = 'color:#e74c3c;text-align:center;margin-top:10px;';
        document.getElementById('upgrade-overlay')?.appendChild(errMsg);
        setTimeout(() => errMsg.remove(), 3000);
      });
  }
});

// --- Listen for level complete ---
window.addEventListener('game:levelComplete', () => {
  // Small delay so GameStateManager and Screens.js can update first,
  // then we put the upgrade overlay on top
  setTimeout(() => {
    showUpgradeScreen();
  }, 50);
});

export { showUpgradeScreen, hideUpgradeScreen };
