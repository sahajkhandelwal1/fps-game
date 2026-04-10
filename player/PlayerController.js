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
const maxHP = 100;

const dispatchHPChanged = () => {
  window.dispatchEvent(
    new CustomEvent('player:hpChanged', { detail: { hp: currentHP, maxHP } })
  );
};

const dispatchDead = () => {
  window.dispatchEvent(new CustomEvent('player:dead'));
};

const takeDamage = (amount) => {
  if (currentHP <= 0) return; // already dead
  currentHP = Math.max(0, currentHP - amount);
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

export { takeDamage, getHP, heal, camera, cleanup };
