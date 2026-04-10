// LevelLoader.js — Loads a level from JSON config and builds the scene

import { scene } from './Engine.js';
import { spawnEnemy, clearAllEnemies } from '../enemies/EnemyAI.js';
import { unlockWeapon, heal } from '../player/WeaponSystem.js';
import { camera } from '../player/PlayerController.js';
import { setGamePhase } from './GameStateManager.js';

// --- Level loading ---
async function loadLevel(levelConfig) {
  // 1. Clear previous level
  clearPreviousLevel();

  // 2. Build geometry from config
  levelConfig.geometry.forEach(geo => buildGeometry(geo));

  // 3. Spawn enemies
  levelConfig.enemySpawns.forEach((spawn, i) => {
    spawnEnemy(
      `${levelConfig.id}_enemy_${i}`,
      spawn.type,
      new BABYLON.Vector3(...spawn.position),
      spawn.patrol?.map(p => new BABYLON.Vector3(...p)) ?? []
    );
  });

  // 4. Spawn pickups
  levelConfig.pickups.forEach((pickup, i) => spawnPickup(pickup, i, levelConfig.id));

  // 5. Unlock weapon if specified
  if (levelConfig.weaponUnlock) unlockWeapon(levelConfig.weaponUnlock);

  // 6. Set player start position
  if (levelConfig.playerStart) {
    camera.position = new BABYLON.Vector3(...levelConfig.playerStart);
  }

  // 7. Set game phase to playing
  setGamePhase('playing');
}

// --- Clear previous level ---
function clearPreviousLevel() {
  clearAllEnemies();
  // Dispose all meshes tagged as level geometry
  scene.meshes
    .filter(m => m.metadata?.isLevelGeometry)
    .forEach(m => m.dispose());
  // Dispose pickup meshes
  scene.meshes
    .filter(m => m.metadata?.isPickup)
    .forEach(m => m.dispose());
}

// --- Build geometry ---
function buildGeometry(geo) {
  // geo = { type: 'box', name?, position: [x,y,z], size: [w,h,d], color?: [r,g,b] }
  // geo = { type: 'ground', name?, position: [x,y,z], size: [w,d] }
  let mesh;
  if (geo.type === 'box') {
    mesh = BABYLON.MeshBuilder.CreateBox(
      geo.name || 'wall',
      { width: geo.size[0], height: geo.size[1], depth: geo.size[2] },
      scene
    );
  } else if (geo.type === 'ground') {
    mesh = BABYLON.MeshBuilder.CreateGround(
      geo.name || 'floor',
      { width: geo.size[0], height: geo.size[1] },
      scene
    );
  }

  if (mesh) {
    mesh.position = new BABYLON.Vector3(...geo.position);
    mesh.metadata = { isLevelGeometry: true };
    if (geo.color) {
      const mat = new BABYLON.StandardMaterial('geoMat_' + Math.random(), scene);
      mat.diffuseColor = new BABYLON.Color3(...geo.color);
      mesh.material = mat;
    }
  }
}

// --- Spawn pickup ---
function spawnPickup(pickup, index, levelId) {
  // pickup = { type: 'ammo'|'health', weapon?: string, amount?: number, position: [x,y,z] }
  const id = `${levelId}_pickup_${index}`;
  const mesh = BABYLON.MeshBuilder.CreateSphere(id, { diameter: 0.5 }, scene);
  mesh.position = new BABYLON.Vector3(...pickup.position);
  mesh.metadata = { isPickup: true, pickup };

  // Color: health = red, ammo = yellow
  const mat = new BABYLON.StandardMaterial('pickupMat_' + id, scene);
  mat.diffuseColor =
    pickup.type === 'health'
      ? new BABYLON.Color3(1, 0.2, 0.2)
      : new BABYLON.Color3(1, 0.9, 0);
  mesh.material = mat;

  // Rotate slowly + check collection distance each frame
  const observer = scene.onBeforeRenderObservable.add(() => {
    if (mesh.isDisposed()) {
      scene.onBeforeRenderObservable.remove(observer);
      return;
    }

    // Rotate
    mesh.rotation.y += 0.02;

    // Collection check — within 1.5m of camera
    const dist = BABYLON.Vector3.Distance(camera.position, mesh.position);
    if (dist < 1.5) {
      const p = mesh.metadata.pickup;
      if (p.type === 'health') {
        // Dispatch health pickup event; PlayerController listens if needed, or call heal directly
        window.dispatchEvent(new CustomEvent('player:heal', { detail: { amount: p.amount ?? 25 } }));
      } else if (p.type === 'ammo') {
        window.dispatchEvent(
          new CustomEvent('weapon:ammoPickup', { detail: { weapon: p.weapon, amount: p.amount } })
        );
      }
      scene.onBeforeRenderObservable.remove(observer);
      mesh.dispose();
    }
  });
}

export { loadLevel };
