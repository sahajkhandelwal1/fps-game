// PlayerController.js — Phase 2 player logic
// Depends on BABYLON global (loaded via CDN) and scene/engine from Engine.js

import { scene } from '../engine/Engine.js';

// --- Camera ---
const camera = scene.getCameraByName('Camera');

if (!camera) {
  throw new Error('PlayerController: Camera not found in scene. Ensure Engine.js creates a camera named "Camera".');
}

// --- Sprinting ---
const NORMAL_SPEED = 0.3;
const SPRINT_SPEED = 0.6;

const onKeyDown = (evt) => {
  if (evt.code === 'ShiftLeft') {
    camera.speed = SPRINT_SPEED;
  }
};

const onKeyUp = (evt) => {
  if (evt.code === 'ShiftLeft') {
    camera.speed = NORMAL_SPEED;
  }
};

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);

// Cleanup function to remove event listeners
const cleanup = () => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('keydown', onJumpKeyDown);
  window.removeEventListener('upgrade:applied', onUpgradeApplied);
};

// --- Jumping ---
const GROUND_Y = 2;          // standing eye height
const JUMP_IMPULSE = 8;      // units/sec upward velocity on jump
const GRAVITY = -20;         // units/sec² downward acceleration

let verticalVelocity = 0;
let isGrounded = true;

const onJumpKeyDown = (evt) => {
  if (evt.code === 'Space' && isGrounded) {
    verticalVelocity = JUMP_IMPULSE;
    isGrounded = false;
  }
};

window.addEventListener('keydown', onJumpKeyDown);

// Physics tick — runs every frame before render
scene.onBeforeRenderObservable.add(() => {
  if (!camera || !camera.position) return;
  if (!isGrounded) {
    const dt = scene.getEngine().getDeltaTime() / 1000; // convert ms → seconds
    verticalVelocity += GRAVITY * dt;
    camera.position.y += verticalVelocity * dt;

    if (camera.position.y <= GROUND_Y) {
      camera.position.y = GROUND_Y;
      verticalVelocity = 0;
      isGrounded = true;
    }
  }
});

// --- Health System ---
let currentHP = 100;
let maxHP = 100;
let damageReduction = 0;      // armor upgrade: reduces incoming damage by a fraction
let lastDamageTime = 0;       // timestamp of last damage taken (for regen)
let regenInterval = null;     // setInterval handle for hp_regen upgrade

const dispatchHPChanged = () => {
  window.dispatchEvent(
    new CustomEvent('player:hpChanged', { detail: { hp: currentHP, maxHP } })
  );
};

const dispatchDead = () => {
  if (regenInterval !== null) {
    clearInterval(regenInterval);
    regenInterval = null;
  }
  window.dispatchEvent(new CustomEvent('player:dead'));
};

const takeDamage = (amount) => {
  if (currentHP <= 0) return; // already dead
  const reduced = amount * (1 - damageReduction);
  currentHP = Math.max(0, currentHP - reduced);
  lastDamageTime = Date.now();
  dispatchHPChanged();
  if (currentHP === 0) {
    // first time reaching 0 — dispatch death
    dispatchDead();
  }
};

const getHP = () => currentHP;

const heal = (amount) => {
  if (currentHP <= 0) return; // can't heal when dead
  currentHP = Math.min(maxHP, currentHP + amount);
  dispatchHPChanged();
};

// --- Upgrade: applied event handler ---
const onUpgradeApplied = (e) => {
  const { id } = e.detail;

  switch (id) {
    case 'hp_max':
      maxHP += 20;
      currentHP = Math.min(currentHP, maxHP);
      dispatchHPChanged();
      break;

    case 'hp_regen':
      // Start regen: +1 HP/sec when out of combat for 5 seconds
      if (regenInterval !== null) { clearInterval(regenInterval); regenInterval = null; }
      regenInterval = setInterval(() => {
        if (currentHP <= 0) return;
        const outOfCombat = (Date.now() - lastDamageTime) > 5000;
        if (outOfCombat && currentHP < maxHP) {
          heal(1);
        }
      }, 1000);
      break;

    case 'armor':
      damageReduction = 0.1;
      break;

    default:
      break;
  }
};
window.addEventListener('upgrade:applied', onUpgradeApplied);

export { takeDamage, getHP, heal, camera, cleanup };
