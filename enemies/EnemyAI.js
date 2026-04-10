// EnemyAI.js — Phase 4 enemy AI with state machine and line-of-sight
// BABYLON is loaded globally via CDN (no npm imports)

import { scene, engine } from '../engine/Engine.js';
import { camera, takeDamage } from '../player/PlayerController.js';

// ---------------------------------------------------------------------------
// Enemy type definitions
// ---------------------------------------------------------------------------
const ENEMY_TYPES = {
  infantry: {
    hp: 60,
    speed: 3,
    detectionRange: 20,
    attackRange: 15,
    damage: 8,
    fireRate: 120,        // rpm
    color: [0.2, 0.6, 0.2],
  },
  heavy: {
    hp: 200,
    damageReduction: 0.2,
    speed: 1.5,
    detectionRange: 15,
    attackRange: 4,
    damage: 25,
    fireRate: 30,         // rpm
    chargeRange: 4,
    color: [0.4, 0.4, 0.8],
  },
};

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** @type {Map<string, object>} id → enemy object */
const enemies = new Map();

// Guard so the weapon:hit listener is registered only once per module load
let hitListenerRegistered = false;

// ---------------------------------------------------------------------------
// Line-of-sight helper
// ---------------------------------------------------------------------------
function hasLineOfSight(enemy) {
  const enemyPos = enemy.mesh.position;
  const playerPos = camera.position;
  const direction = playerPos.subtract(enemyPos).normalize();
  const detectionRange = ENEMY_TYPES[enemy.type].detectionRange;
  const ray = new BABYLON.Ray(enemyPos, direction, detectionRange);
  const hit = scene.pickWithRay(
    ray,
    mesh => mesh !== enemy.mesh && mesh !== enemy.headMesh,
  );
  // LOS if nothing blocking or first hit is close enough to the player
  return !hit.hit || hit.distance >= BABYLON.Vector3.Distance(enemyPos, playerPos) - 1;
}

// ---------------------------------------------------------------------------
// Per-frame AI update (registered once in onBeforeRenderObservable)
// ---------------------------------------------------------------------------
scene.onBeforeRenderObservable.add(() => {
  const dt = engine.getDeltaTime() / 1000; // seconds

  for (const [, enemy] of enemies) {
    if (enemy.state === 'dead') continue;

    const def = ENEMY_TYPES[enemy.type];
    const enemyPos = enemy.mesh.position;
    const playerPos = camera.position;
    const distToPlayer = BABYLON.Vector3.Distance(enemyPos, playerPos);

    switch (enemy.state) {
      // ---- idle --------------------------------------------------------
      case 'idle': {
        enemy.idleTimer = (enemy.idleTimer || 0) + dt;
        if (enemy.idleTimer >= 2) {
          enemy.idleTimer = 0;
          enemy.state = 'patrol';
        }
        break;
      }

      // ---- patrol -------------------------------------------------------
      case 'patrol': {
        if (!enemy.patrolPath || enemy.patrolPath.length === 0) {
          // No patrol path — just watch for the player
          if (distToPlayer < def.detectionRange) {
            enemy.state = 'alert';
            enemy.alertTimer = 0;
          }
          break;
        }

        const target = enemy.patrolPath[enemy.patrolIndex];
        const toTarget = target.subtract(enemyPos);
        const distToWaypoint = toTarget.length();

        if (distToWaypoint < 0.5) {
          // Reached waypoint — advance (looping)
          enemy.patrolIndex = (enemy.patrolIndex + 1) % enemy.patrolPath.length;
        } else {
          // Move toward waypoint
          const dir = toTarget.normalize();
          enemy.mesh.position.addInPlace(dir.scale(def.speed * dt));
        }

        if (distToPlayer < def.detectionRange) {
          enemy.state = 'alert';
          enemy.alertTimer = 0;
        }
        break;
      }

      // ---- alert --------------------------------------------------------
      case 'alert': {
        enemy.alertTimer = (enemy.alertTimer || 0) + dt;

        // Rotate toward player
        const toPlayerAlert = playerPos.subtract(enemyPos);
        if (toPlayerAlert.length() > 0.01) {
          enemy.mesh.lookAt(playerPos);
        }

        if (hasLineOfSight(enemy)) {
          enemy.state = 'engage';
        } else if (enemy.alertTimer > 3) {
          enemy.alertTimer = 0;
          enemy.state = 'patrol';
        }
        break;
      }

      // ---- engage -------------------------------------------------------
      case 'engage': {
        if (distToPlayer <= def.attackRange) {
          enemy.state = 'attack';
          break;
        }

        if (distToPlayer > def.detectionRange * 1.5) {
          enemy.state = 'patrol';
          break;
        }

        // Move toward player
        const toPlayerEngage = playerPos.subtract(enemyPos).normalize();
        enemy.mesh.position.addInPlace(toPlayerEngage.scale(def.speed * dt));
        enemy.mesh.lookAt(playerPos);
        break;
      }

      // ---- attack -------------------------------------------------------
      case 'attack': {
        // Check retreat condition
        if (enemy.hp / enemy.maxHp < 0.3) {
          enemy.state = 'retreat';
          enemy.retreatTimer = 0;
          break;
        }

        // Face the player
        enemy.mesh.lookAt(playerPos);

        // Charge behaviour for heavy type
        if (enemy.type === 'heavy' && distToPlayer <= def.chargeRange) {
          const chargeDir = playerPos.subtract(enemyPos).normalize();
          enemy.mesh.position.addInPlace(chargeDir.scale(def.speed * 3 * dt));
        }

        // Shoot at fireRate (rpm → seconds per shot)
        const secondsPerShot = 60 / def.fireRate;
        enemy.lastAttackTime = enemy.lastAttackTime || 0;
        enemy.lastAttackTime += dt;

        if (enemy.lastAttackTime >= secondsPerShot) {
          enemy.lastAttackTime = 0;
          takeDamage(def.damage);
        }

        // Transition back out if player moved away
        if (distToPlayer > def.attackRange) {
          enemy.state = 'engage';
        }
        break;
      }

      // ---- retreat ------------------------------------------------------
      case 'retreat': {
        enemy.retreatTimer = (enemy.retreatTimer || 0) + dt;

        // Move away from player
        const awayFromPlayer = enemyPos.subtract(playerPos).normalize();
        enemy.mesh.position.addInPlace(awayFromPlayer.scale(def.speed * dt));

        if (enemy.retreatTimer >= 3 || distToPlayer > def.detectionRange) {
          enemy.retreatTimer = 0;
          enemy.state = 'engage';
        }
        break;
      }

      default:
        break;
    }
  }
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Spawn an enemy into the scene.
 * @param {string} id         Unique identifier
 * @param {'infantry'|'heavy'} type
 * @param {BABYLON.Vector3} position
 * @param {BABYLON.Vector3[]} [patrolPath]
 */
function spawnEnemy(id, type, position, patrolPath = []) {
  const def = ENEMY_TYPES[type];
  if (!def) throw new Error(`EnemyAI: unknown enemy type "${type}"`);

  // Body — capsule
  const mesh = BABYLON.MeshBuilder.CreateCapsule(
    `enemy_${id}_body`,
    { height: 2, radius: 0.4 },
    scene,
  );
  mesh.position = position.clone();
  mesh.metadata = { enemyId: id };

  // Head — small sphere sitting on top of the capsule, parented to body
  const headMesh = BABYLON.MeshBuilder.CreateSphere(
    `enemy_${id}_head`,
    { diameter: 0.5 },
    scene,
  );
  headMesh.parent = mesh;
  headMesh.position = new BABYLON.Vector3(0, 1.2, 0);
  headMesh.metadata = { enemyId: id };

  // Shared material
  const mat = new BABYLON.StandardMaterial(`enemy_${id}_mat`, scene);
  const [r, g, b] = def.color;
  mat.diffuseColor = new BABYLON.Color3(r, g, b);
  mesh.material = mat;
  headMesh.material = mat;

  // Initial state object
  const enemy = {
    id,
    type,
    hp: def.hp,
    maxHp: def.hp,
    state: 'idle',
    position,
    patrolPath,
    patrolIndex: 0,
    lastAttackTime: 0,
    idleTimer: 0,
    alertTimer: 0,
    retreatTimer: 0,
    mesh,
    headMesh,
  };

  enemies.set(id, enemy);
}

/**
 * Apply damage to an enemy.
 * @param {string}  id
 * @param {number}  amount
 * @param {boolean} [isHeadshot=false]
 */
function damageEnemy(id, amount, isHeadshot = false) {
  const enemy = enemies.get(id);
  if (!enemy || enemy.state === 'dead') return;

  const def = ENEMY_TYPES[enemy.type];
  let finalDamage = amount;

  // Heavy type damage reduction — headshots bypass armour
  if (enemy.type === 'heavy' && !isHeadshot) {
    finalDamage = amount * (1 - def.damageReduction);
  }

  enemy.hp -= finalDamage;

  if (enemy.hp <= 0) {
    enemy.hp = 0;
    enemy.state = 'dead';

    // Clean up meshes and remove from tracking map BEFORE dispatching the
    // event so getEnemyCount() returns the correct (decremented) value
    // inside any 'enemy:killed' handlers (e.g. the win condition check).
    enemy.mesh.dispose();
    enemy.headMesh.dispose();
    enemies.delete(id);

    window.dispatchEvent(
      new CustomEvent('enemy:killed', { detail: { id, type: enemy.type } }),
    );
  } else {
    window.dispatchEvent(
      new CustomEvent('enemy:damaged', {
        detail: { id, hp: enemy.hp, maxHp: enemy.maxHp },
      }),
    );
  }
}

/**
 * Force an enemy into the alert state (e.g. triggered by noise).
 * @param {string} id
 */
function alertEnemy(id) {
  const enemy = enemies.get(id);
  if (!enemy || enemy.state === 'dead') return;
  enemy.state = 'alert';
  enemy.alertTimer = 0;
}

/** Return the number of living enemies currently tracked. */
function getEnemyCount() {
  return enemies.size;
}

/** Dispose all enemy meshes and clear the internal map. */
function clearAllEnemies() {
  for (const [, enemy] of enemies) {
    if (enemy.mesh) enemy.mesh.dispose();
    if (enemy.headMesh) enemy.headMesh.dispose();
  }
  enemies.clear();
}

// ---------------------------------------------------------------------------
// Weapon hit listener — registered once via flag; persists across level loads
// ---------------------------------------------------------------------------
if (!hitListenerRegistered) {
  window.addEventListener('weapon:hit', (e) => {
    const { enemyId, damage, isHeadshot } = e.detail;
    damageEnemy(enemyId, damage, isHeadshot);
  });
  hitListenerRegistered = true;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export { spawnEnemy, damageEnemy, alertEnemy, getEnemyCount, clearAllEnemies };
