// HUD.js — Phase 6: Heads-Up Display overlay

// --- Inject HUD DOM ---
const hudHTML = `
<div id="hud" style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;font-family:monospace;">
  <!-- Health bar (top left) -->
  <div id="hud-health" style="position:absolute;top:16px;left:16px;">
    <div style="color:#fff;font-size:14px;margin-bottom:4px;">HP</div>
    <div style="background:#333;width:150px;height:14px;border-radius:3px;">
      <div id="hud-health-bar" style="background:#e74c3c;height:100%;width:100%;border-radius:3px;transition:width 0.2s;"></div>
    </div>
    <div id="hud-health-text" style="color:#fff;font-size:12px;margin-top:2px;">100/100</div>
  </div>

  <!-- Minimap (top right) -->
  <canvas id="hud-minimap" width="120" height="120" style="position:absolute;top:16px;right:16px;border:1px solid #555;border-radius:50%;opacity:0.8;"></canvas>

  <!-- Ammo counter (bottom right) -->
  <div id="hud-ammo" style="position:absolute;bottom:80px;right:20px;color:#fff;text-align:right;">
    <div id="hud-weapon-name" style="font-size:14px;color:#aaa;">Assault Rifle</div>
    <div id="hud-ammo-count" style="font-size:28px;font-weight:bold;">30 / 120</div>
  </div>

  <!-- Crosshair (center) -->
  <div id="hud-crosshair" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">
    <div style="width:2px;height:16px;background:rgba(255,255,255,0.8);margin:0 auto;"></div>
    <div style="width:16px;height:2px;background:rgba(255,255,255,0.8);margin-top:-9px;"></div>
  </div>

  <!-- Scope overlay (hidden by default) -->
  <div id="hud-scope" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);pointer-events:none;">
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:200px;height:200px;border-radius:50%;border:2px solid #aaa;background:transparent;box-shadow:0 0 0 9999px rgba(0,0,0,0.7)"></div>
    <div style="position:absolute;top:50%;left:50%;width:100%;height:1px;background:#aaa;transform:translateY(-50%)"></div>
    <div style="position:absolute;top:50%;left:50%;width:1px;height:100%;background:#aaa;transform:translateX(-50%)"></div>
  </div>

  <!-- Reload indicator -->
  <div id="hud-reload" style="display:none;position:absolute;bottom:120px;right:20px;color:#f39c12;font-size:14px;">RELOADING...</div>

  <!-- Objective text (top center) -->
  <div id="hud-objective" style="position:absolute;top:16px;left:50%;transform:translateX(-50%);color:#fff;font-size:13px;text-align:center;opacity:0.7;"></div>

  <!-- Kill feed (right side) -->
  <div id="hud-killfeed" style="position:absolute;top:160px;right:16px;text-align:right;"></div>

  <!-- Survival overlay (hidden by default) -->
  <div id="hud-survival" style="display:none;position:absolute;top:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.5);color:#fff;font-size:14px;padding:6px 14px;border-radius:4px;white-space:nowrap;">
    Wave: <span id="hud-wave">1</span> | Enemies: <span id="hud-enemies">0</span> | Score: <span id="hud-score">0</span>
  </div>
</div>
`;

document.body.insertAdjacentHTML('beforeend', hudHTML);

// --- Element refs ---
const hud           = document.getElementById('hud');
const healthBar     = document.getElementById('hud-health-bar');
const healthText    = document.getElementById('hud-health-text');
const weaponName    = document.getElementById('hud-weapon-name');
const ammoCount     = document.getElementById('hud-ammo-count');
const scope         = document.getElementById('hud-scope');
const killfeed      = document.getElementById('hud-killfeed');
const reloadEl      = document.getElementById('hud-reload');
const objectiveEl   = document.getElementById('hud-objective');
const minimapCanvas = document.getElementById('hud-minimap');
const survivalEl    = document.getElementById('hud-survival');
const waveEl        = document.getElementById('hud-wave');
const enemiesEl     = document.getElementById('hud-enemies');
const scoreEl       = document.getElementById('hud-score');

const minimapCtx    = minimapCanvas ? minimapCanvas.getContext('2d') : null;

// --- Weapon name map ---
const WEAPON_NAMES = {
  rifle:   'Assault Rifle',
  shotgun: 'Shotgun',
  sniper:  'Sniper Rifle',
};

// --- Camera direction tracking (updated via Engine scene) ---
// We read the camera's forward direction for the minimap arrow.
// Access the scene lazily so we don't create a hard import-time dependency cycle.
let _scene = null;
function getScene() {
  if (_scene) return _scene;
  // Engine.js exports `scene` — grab it from the module registry indirectly
  // by querying Babylon's engine list (available globally via BABYLON).
  try {
    const engines = BABYLON.Engine.Instances;
    if (engines && engines.length > 0) {
      _scene = engines[0].scenes[0];
    }
  } catch (e) { /* not ready yet */ }
  return _scene;
}

// --- Minimap drawing ---
function updateMinimap() {
  if (!minimapCtx) return;

  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  const cx = w / 2;
  const cy = h / 2;

  // Clear
  minimapCtx.clearRect(0, 0, w, h);

  // Circular clip
  minimapCtx.save();
  minimapCtx.beginPath();
  minimapCtx.arc(cx, cy, cx - 1, 0, Math.PI * 2);
  minimapCtx.clip();

  // Black background
  minimapCtx.fillStyle = '#000';
  minimapCtx.fillRect(0, 0, w, h);

  // Player dot (blue)
  minimapCtx.fillStyle = '#3498db';
  minimapCtx.beginPath();
  minimapCtx.arc(cx, cy, 5, 0, Math.PI * 2);
  minimapCtx.fill();

  // Direction arrow — white triangle pointing in camera forward direction
  const scene = getScene();
  let angle = 0; // default facing north (up on minimap)
  if (scene) {
    try {
      const cam = scene.getCameraByName('Camera');
      if (cam) {
        // Use camera's rotation.y (yaw) to determine forward direction on minimap
        // Babylon's UniversalCamera rotation.y is yaw in radians.
        // We negate it because screen Y-axis is flipped vs world.
        angle = -cam.rotation.y;
      }
    } catch (e) { /* camera not ready */ }
  }

  const arrowLen = 18;
  const tipX = cx + Math.sin(angle) * arrowLen;
  const tipY = cy - Math.cos(angle) * arrowLen;
  const leftX = cx + Math.sin(angle - 2.4) * 8;
  const leftY = cy - Math.cos(angle - 2.4) * 8;
  const rightX = cx + Math.sin(angle + 2.4) * 8;
  const rightY = cy - Math.cos(angle + 2.4) * 8;

  minimapCtx.fillStyle = 'rgba(255,255,255,0.9)';
  minimapCtx.beginPath();
  minimapCtx.moveTo(tipX, tipY);
  minimapCtx.lineTo(leftX, leftY);
  minimapCtx.lineTo(rightX, rightY);
  minimapCtx.closePath();
  minimapCtx.fill();

  minimapCtx.restore();
}

const minimapIntervalId = setInterval(updateMinimap, 100);

// --- Event handlers ---

// HP changed
window.addEventListener('player:hpChanged', (e) => {
  const { hp, maxHP } = e.detail;
  const pct = Math.max(0, Math.min(100, (hp / maxHP) * 100));
  if (healthBar)  healthBar.style.width = `${pct}%`;
  if (healthText) healthText.textContent = `${hp}/${maxHP}`;
});

// Ammo changed
window.addEventListener('weapon:ammoChanged', (e) => {
  const { mag, reserve, weaponId } = e.detail;
  if (ammoCount)  ammoCount.textContent = `${mag} / ${reserve}`;
  if (weaponName) weaponName.textContent = WEAPON_NAMES[weaponId] || weaponId;
});

// Scope changed
window.addEventListener('weapon:scopeChanged', (e) => {
  if (!scope) return;
  scope.style.display = e.detail.isScoped ? 'block' : 'none';
});

// Reload indicator — listen for weapon:ammoChanged while reload in progress
// WeaponSystem dispatches weapon:ammoChanged when reload finishes; we show
// the indicator on weapon:noAmmo and hide it on the next weapon:ammoChanged.
window.addEventListener('weapon:noAmmo', () => {
  if (reloadEl) reloadEl.style.display = 'block';
});
window.addEventListener('weapon:ammoChanged', () => {
  if (reloadEl) reloadEl.style.display = 'none';
});

// Kill feed
window.addEventListener('enemy:killed', () => {
  if (!killfeed) return;
  const entry = document.createElement('div');
  entry.textContent = 'Enemy down';
  entry.style.cssText = 'color:#e74c3c;font-size:13px;margin-bottom:4px;animation:fadeIn 0.2s ease;';
  killfeed.appendChild(entry);
  setTimeout(() => {
    if (entry.parentNode) entry.parentNode.removeChild(entry);
  }, 2000);
});

// Phase changed — show/hide HUD
window.addEventListener('game:phaseChanged', (e) => {
  const { phase } = e.detail;
  if (!hud) return;

  if (phase === 'menu' || phase === 'gameOver') {
    hud.style.display = 'none';
  } else if (phase === 'playing' || phase === 'levelComplete' || phase === 'survival') {
    hud.style.display = 'block';
  }

  // Survival overlay
  if (survivalEl) {
    survivalEl.style.display = phase === 'survival' ? 'block' : 'none';
  }
});

// Survival state updates
window.addEventListener('game:stateChanged', (e) => {
  const { score, gamePhase } = e.detail;
  if (gamePhase !== 'survival') return;
  if (scoreEl) scoreEl.textContent = score;
});

window.addEventListener('survival:waveChanged', (e) => {
  if (waveEl)   waveEl.textContent   = e.detail.wave   ?? '?';
  if (enemiesEl) enemiesEl.textContent = e.detail.enemies ?? '?';
});

// --- Public API ---
function showHUD() {
  if (hud) hud.style.display = 'block';
}

function hideHUD() {
  if (hud) hud.style.display = 'none';
}

function setObjective(text) {
  if (objectiveEl) objectiveEl.textContent = text || '';
}

export { showHUD, hideHUD, setObjective };
