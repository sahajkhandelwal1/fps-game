// WeaponSystem.js — Phase 3 weapon logic
// Depends on BABYLON global (loaded via CDN) and scene from Engine.js

import { scene } from '../engine/Engine.js';

// --- Weapon Definitions ---
const WEAPONS = {
  rifle: {
    name: 'Assault Rifle',
    damage: 20,
    fireRate: 600,        // rounds per minute
    magSize: 30,
    reserveAmmo: 120,
    range: 500,
    automatic: true,
    reloadTime: 2000,     // ms
  },
  shotgun: {
    name: 'Shotgun',
    damage: 15,           // per pellet
    pellets: 8,
    fireRate: 60,         // rpm (slow)
    magSize: 8,
    reserveAmmo: 32,
    range: 30,            // short range
    automatic: false,
    reloadTime: 2500,
  },
  sniper: {
    name: 'Sniper Rifle',
    damage: 120,
    fireRate: 30,         // rpm
    magSize: 5,
    reserveAmmo: 20,
    range: 1000,
    automatic: false,
    reloadTime: 3000,
    scopeZoom: 2.5,       // FOV divisor when scoped
  },
};

const WEAPON_ORDER = ['rifle', 'shotgun', 'sniper'];

const DEFAULT_FOV = Math.PI / 3;
const SCOPED_FOV  = Math.PI / 6;

// --- State ---
const unlockedWeapons = new Set(['rifle']);

const ammoState = {};
for (const [id, def] of Object.entries(WEAPONS)) {
  ammoState[id] = { mag: def.magSize, reserve: def.reserveAmmo };
}

let currentWeaponId = 'rifle';
let isReloading     = false;
let isFiring        = false;
let isScoped        = false;
let lastShotTime    = 0;
let reloadTimer     = null;
let autoFireInterval = null;

// --- Camera reference ---
const camera = scene.getCameraByName('Camera');

// --- Helpers ---
const dispatchAmmoChanged = () => {
  const { mag, reserve } = ammoState[currentWeaponId];
  window.dispatchEvent(
    new CustomEvent('weapon:ammoChanged', {
      detail: { mag, reserve, weaponId: currentWeaponId },
    })
  );
};

const dispatchScopeChanged = () => {
  window.dispatchEvent(
    new CustomEvent('weapon:scopeChanged', { detail: { isScoped } })
  );
};

const dispatchNoAmmo = () => {
  window.dispatchEvent(new CustomEvent('weapon:noAmmo'));
};

// Convert degrees to radians
const degToRad = (deg) => (deg * Math.PI) / 180;

// --- Raycast helpers ---
const doRaycast = (offsetX = 0, offsetY = 0) => {
  // Use scene pointer coords with optional spread offset (in screen pixels equivalent)
  // For spread we rotate the pick ray slightly
  if (offsetX === 0 && offsetY === 0) {
    return scene.pick(scene.pointerX, scene.pointerY);
  }

  // Build a spread ray by modifying camera forward vector
  const forward = camera.getForwardRay(1000).direction;
  const right   = BABYLON.Vector3.Cross(forward, camera.upVector).normalize();
  const up      = BABYLON.Vector3.Cross(right, forward).normalize();

  const spreadRad = degToRad(2); // ±2° spread

  // Random angle within ±spreadRad
  const angleH = (Math.random() * 2 - 1) * spreadRad;
  const angleV = (Math.random() * 2 - 1) * spreadRad;

  const spreadDir = forward
    .add(right.scale(Math.tan(angleH)))
    .add(up.scale(Math.tan(angleV)))
    .normalize();

  const ray = new BABYLON.Ray(camera.position, spreadDir, 1000);
  return scene.pickWithRay(ray);
};

const processHit = (hit, damage) => {
  if (!hit || !hit.hit || !hit.pickedMesh) return;

  const mesh = hit.pickedMesh;

  // Check if this mesh belongs to an enemy
  if (!mesh.metadata || mesh.metadata.enemyId === undefined) return;

  let finalDamage = damage;
  let isHeadshot  = false;

  if (mesh.name && mesh.name.toLowerCase().includes('head')) {
    isHeadshot   = true;
    finalDamage *= 2;
  }

  window.dispatchEvent(
    new CustomEvent('weapon:hit', {
      detail: {
        enemyId:   mesh.metadata.enemyId,
        damage:    finalDamage,
        isHeadshot,
      },
    })
  );
};

// --- Fire logic ---
const fireSingleShot = () => {
  const weapon = WEAPONS[currentWeaponId];
  const state  = ammoState[currentWeaponId];
  const now    = performance.now();
  const cooldown = 60000 / weapon.fireRate; // ms between shots

  if (now - lastShotTime < cooldown) return;
  if (isReloading) return;

  if (state.mag <= 0) {
    dispatchNoAmmo();
    return;
  }

  lastShotTime = now;
  state.mag   -= 1;

  if (currentWeaponId === 'shotgun') {
    // Fire multiple pellets with spread
    for (let i = 0; i < weapon.pellets; i++) {
      const hit = doRaycast(1, 1); // non-zero triggers spread
      processHit(hit, weapon.damage);
    }
  } else {
    const hit = doRaycast(0, 0);
    processHit(hit, weapon.damage);
  }

  dispatchAmmoChanged();

  // Auto-reload when mag empty
  if (state.mag === 0 && state.reserve > 0) {
    reload();
  }
};

const startFiring = () => {
  if (autoFireInterval !== null) { clearInterval(autoFireInterval); autoFireInterval = null; }
  const weapon = WEAPONS[currentWeaponId];
  isFiring = true;
  fireSingleShot();

  if (weapon.automatic) {
    const cooldown = 60000 / weapon.fireRate;
    autoFireInterval = setInterval(() => {
      if (!isFiring) {
        clearInterval(autoFireInterval);
        autoFireInterval = null;
        return;
      }
      fireSingleShot();
    }, cooldown);
  }
};

const stopFiring = () => {
  isFiring = false;
  if (autoFireInterval !== null) {
    clearInterval(autoFireInterval);
    autoFireInterval = null;
  }
};

// --- Reload ---
const reload = () => {
  const weapon = WEAPONS[currentWeaponId];
  const state  = ammoState[currentWeaponId];

  if (isReloading)                  return;
  if (state.mag >= weapon.magSize)  return;
  if (state.reserve <= 0)           return;

  isReloading = true;
  stopFiring();

  reloadTimer = setTimeout(() => {
    // Re-check current weapon hasn't changed (switch cancels reload but that clears reloadTimer)
    // Safety: only applies if weapon hasn't switched (cancelReload clears this timer on switch)
    const needed  = weapon.magSize - state.mag;
    const toAdd   = Math.min(needed, state.reserve);
    state.mag    += toAdd;
    state.reserve -= toAdd;
    isReloading   = false;
    reloadTimer   = null;
    dispatchAmmoChanged();
  }, weapon.reloadTime);
};

const cancelReload = () => {
  if (reloadTimer !== null) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
  }
  isReloading = false;
};

// --- Scoping ---
const unscope = () => {
  if (!isScoped) return;
  isScoped = false;
  if (camera) camera.fov = DEFAULT_FOV;
  dispatchScopeChanged();
};

const toggleScope = () => {
  if (isReloading) return;
  if (currentWeaponId !== 'sniper') return;

  isScoped = !isScoped;
  if (camera) {
    camera.fov = isScoped ? SCOPED_FOV : DEFAULT_FOV;
  }
  dispatchScopeChanged();
};

// --- Weapon Switching ---
const switchWeapon = (weaponId) => {
  if (!WEAPONS[weaponId])              return;
  if (!unlockedWeapons.has(weaponId))  return;
  if (weaponId === currentWeaponId)    return;

  cancelReload();
  stopFiring();
  unscope();

  currentWeaponId = weaponId;
  dispatchAmmoChanged();
};

// --- Unlocking ---
const unlockWeapon = (weaponId) => {
  if (WEAPONS[weaponId]) {
    unlockedWeapons.add(weaponId);
  }
};

// --- Exports / Getters ---
const getCurrentWeapon = () => {
  const state = ammoState[currentWeaponId];
  return {
    id: currentWeaponId,
    ...WEAPONS[currentWeaponId],
    mag:        state.mag,
    reserve:    state.reserve,
    isScoped,
    isReloading,
  };
};

const getAmmo = () => {
  const { mag, reserve } = ammoState[currentWeaponId];
  return { mag, reserve };
};

// --- Event Listeners ---

// Mouse down — start firing (left click only)
const onMouseDown = (evt) => {
  if (evt.button === 0) {
    startFiring();
  }
};

// Mouse up — stop auto fire
const onMouseUp = (evt) => {
  if (evt.button === 0) {
    stopFiring();
  }
};

// Right-click — toggle scope
const onContextMenu = (evt) => {
  evt.preventDefault();
  toggleScope();
};

// Keyboard — reload & weapon switch
const onKeyDown = (evt) => {
  switch (evt.code) {
    case 'KeyR':
      reload();
      break;
    case 'Digit1':
      switchWeapon('rifle');
      break;
    case 'Digit2':
      switchWeapon('shotgun');
      break;
    case 'Digit3':
      switchWeapon('sniper');
      break;
    default:
      break;
  }
};

// Scroll wheel — cycle weapons
const onWheel = (evt) => {
  const currentIndex = WEAPON_ORDER.indexOf(currentWeaponId);
  const direction    = evt.deltaY > 0 ? 1 : -1; // scroll down = next, scroll up = previous

  // Find next unlocked weapon in direction
  let attempts = WEAPON_ORDER.length - 1;
  let nextIndex = currentIndex;

  while (attempts-- > 0) {
    nextIndex = (nextIndex + direction + WEAPON_ORDER.length) % WEAPON_ORDER.length;
    const candidate = WEAPON_ORDER[nextIndex];
    if (unlockedWeapons.has(candidate)) {
      switchWeapon(candidate);
      break;
    }
  }
};

window.addEventListener('mousedown', onMouseDown);
window.addEventListener('mouseup', onMouseUp);
window.addEventListener('contextmenu', onContextMenu);
window.addEventListener('keydown', onKeyDown);
window.addEventListener('wheel', onWheel);

// --- Cleanup ---
const destroy = () => {
  window.removeEventListener('mousedown', onMouseDown);
  window.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('contextmenu', onContextMenu);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('wheel', onWheel);
  stopFiring();
  cancelReload();
};

export { getCurrentWeapon, switchWeapon, unlockWeapon, reload, getAmmo, destroy };
