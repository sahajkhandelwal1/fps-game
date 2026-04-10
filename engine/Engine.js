// Engine.js — Babylon.js engine initialisation
// BABYLON is loaded globally via CDN (no npm imports)

const canvas = document.getElementById('renderCanvas');
const loadingOverlay = document.getElementById('loadingOverlay');

// Validate required DOM elements
if (!canvas) throw new Error('Required DOM element #renderCanvas not found');

// --- Engine & Scene ---
const engine = new BABYLON.Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
});

const scene = new BABYLON.Scene(engine);

// --- Camera ---
const camera = new BABYLON.UniversalCamera('Camera', new BABYLON.Vector3(0, 2, -5), scene);
camera.setTarget(new BABYLON.Vector3(0, 2, 0));
camera.attachControl(canvas, true);

// WASD + arrow key movement
camera.keysUp    = [87, 38]; // W, ArrowUp
camera.keysDown  = [83, 40]; // S, ArrowDown
camera.keysLeft  = [65, 37]; // A, ArrowLeft
camera.keysRight = [68, 39]; // D, ArrowRight
camera.speed = 0.3;
camera.minZ = 0.1;

// --- Pointer lock ---
const onCanvasClick = () => canvas.requestPointerLock();
canvas.addEventListener('click', onCanvasClick);

// --- Lighting ---
// Directional light (sun-like, angled down-forward)
const dirLight = new BABYLON.DirectionalLight(
  'DirLight',
  new BABYLON.Vector3(-1, -2, -1),
  scene,
);
dirLight.intensity = 0.8;

// Hemisphere light for soft ambient fill
const hemiLight = new BABYLON.HemisphericLight(
  'HemiLight',
  new BABYLON.Vector3(0, 1, 0),
  scene,
);
hemiLight.intensity = 0.4;

// --- Ground ---
const ground = BABYLON.MeshBuilder.CreateGround(
  'ground',
  { width: 50, height: 50 },
  scene,
);
const groundMat = new BABYLON.StandardMaterial('groundMat', scene);
groundMat.diffuseColor = new BABYLON.Color3(0.3, 0.5, 0.3);
ground.material = groundMat;

// --- Reference boxes ---
const boxPositions = [
  new BABYLON.Vector3(3,  0.5,  4),
  new BABYLON.Vector3(-4, 0.5,  6),
  new BABYLON.Vector3(6,  0.5, -3),
  new BABYLON.Vector3(-2, 0.5, -5),
];

const boxColors = [
  new BABYLON.Color3(0.8, 0.2, 0.2),
  new BABYLON.Color3(0.2, 0.4, 0.9),
  new BABYLON.Color3(0.9, 0.7, 0.1),
  new BABYLON.Color3(0.5, 0.2, 0.8),
];

boxPositions.forEach((pos, i) => {
  const box = BABYLON.MeshBuilder.CreateBox(`box${i}`, { size: 1 }, scene);
  box.position = pos;
  const mat = new BABYLON.StandardMaterial(`boxMat${i}`, scene);
  mat.diffuseColor = boxColors[i];
  box.material = mat;
});

// --- Render loop ---
engine.runRenderLoop(() => scene.render());

// --- Resize handler ---
window.addEventListener('resize', () => engine.resize());

// --- Hide loading overlay once the first frame renders ---
// Add 10-second fallback in case the engine crashes before scene loads
const loadingTimeout = setTimeout(() => {
  if (loadingOverlay) {
    loadingOverlay.textContent = 'Failed to load. Please refresh.';
  }
}, 10000);

scene.executeWhenReady(() => {
  clearTimeout(loadingTimeout);
  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden');
  }
});

export { engine, scene };

import '../player/PlayerController.js';
import '../player/WeaponSystem.js';
import '../enemies/EnemyAI.js';
