// pedestrians.js — walking city folk: low-poly figures with limb swing, wandering
// sidewalk waypoints, street crossings, and fleeing from speeding cars / gunfire.
// Getting run over hurts the pedestrian — and the player's wanted level.
import * as THREE from 'three';

const COUNT = 12;
const SHIRTS = [0x3a7bd5, 0xe8a13d, 0x7a4a8a, 0x3aa655, 0xd94f6a, 0x4a9a8a, 0xc2c2c2, 0x8a6f4d];
const SKINS = [0xc98a5e, 0x8a5a3a, 0xe8b88a, 0x6a4a30];

function buildPed(scene, shirt, skin) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2a3a5c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.8, 0.32), shirtMat);
  body.position.y = 1.25;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.38), skinMat);
  head.position.y = 1.9;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), pantsMat);
  legL.position.set(-0.16, 0.4, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.18), shirtMat);
  armL.position.set(-0.4, 1.28, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.4;
  g.add(armR);
  scene.add(g);
  return { group: g, legL, legR, armL, armR, body };
}

export function createPedestriansSystem(game) {
  const world = game.world;
  const spawns = world.pedSpawns;
  const list = [];

  function randomSpawnNear(x, z, minD, maxD) {
    for (let tries = 0; tries < 20; tries++) {
      const s = spawns[Math.floor(Math.random() * spawns.length)];
      const d = Math.hypot(s.x - x, s.z - z);
      if (d >= minD && d <= maxD) return s;
    }
    return spawns[Math.floor(Math.random() * spawns.length)];
  }

  function spawnPed() {
    const s = randomSpawnNear(0, 0, 10, 170);
    const parts = buildPed(game.scene, SHIRTS[Math.floor(Math.random() * SHIRTS.length)], SKINS[Math.floor(Math.random() * SKINS.length)]);
    const ped = {
      ...parts,
      pos: parts.group.position,
      yaw: Math.random() * Math.PI * 2,
      state: 'walk', // walk | flee | down
      target: new THREE.Vector3(s.x, 0, s.z),
      speed: 1.3 + Math.random() * 0.6,
      phase: Math.random() * 6,
      waitT: 0,
      fleeT: 0,
      downT: 0,
      fleeFrom: new THREE.Vector3(),
    };
    ped.pos.set(s.x, 0, s.z);
    ped.group.userData.owner = { kind: 'ped', ref: ped };
    list.push(ped);
    return ped;
  }

  for (let i = 0; i < COUNT; i++) spawnPed();

  function pickWaypoint(ped) {
    // Usually a nearby sidewalk point; sometimes straight across the street.
    if (Math.random() < 0.25) {
      const lines = world.roadLines();
      let best = lines[0], bd = Infinity;
      for (const v of lines) {
        const d = Math.min(Math.abs(ped.pos.x - v), Math.abs(ped.pos.z - v));
        if (d < bd) { bd = d; best = v; }
      }
      const acrossX = Math.abs(ped.pos.x - best) < Math.abs(ped.pos.z - best);
      const side = ped.pos[acrossX ? 'x' : 'z'] > best ? -1 : 1;
      ped.target.set(
        acrossX ? best + side * 10 : ped.pos.x + (Math.random() - 0.5) * 20,
        0,
        acrossX ? ped.pos.z + (Math.random() - 0.5) * 20 : best + side * 10,
      );
    } else {
      const s = randomSpawnNear(ped.pos.x, ped.pos.z, 5, 90);
      ped.target.set(s.x, 0, s.z);
    }
  }

  function downPed(ped, fromPos) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downT = 5;
    ped.group.rotation.x = -Math.PI / 2 + 0.15; // knocked flat
    if (fromPos) {
      const dx = ped.pos.x - fromPos.x, dz = ped.pos.z - fromPos.z;
      const d = Math.hypot(dx, dz) || 1;
      ped.pos.x += (dx / d) * 1.5;
      ped.pos.z += (dz / d) * 1.5;
    }
  }

  function scareAt(x, z, r) {
    for (const ped of list) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
      if (d < r) {
        ped.state = 'flee';
        ped.fleeT = 3;
        ped.fleeFrom.set(x, 0, z);
      }
    }
  }

  game.peds = {
    list,
    downPed,
    scareAt,
    nearest(x, z, maxD) {
      let best = null, bd = maxD * maxD;
      for (const ped of list) {
        if (ped.state === 'down') continue;
        const d = (ped.pos.x - x) ** 2 + (ped.pos.z - z) ** 2;
        if (d < bd) { bd = d; best = ped; }
      }
      return best;
    },
  };

  let hitCooldown = 0;

  return {
    name: 'pedestrians',
    update(dt, g) {
      hitCooldown = Math.max(0, hitCooldown - dt);
      const pp = g.player.pos;
      const pCar = g.player.inCar;
      for (const ped of list) {
        if (ped.state === 'down') {
          ped.downT -= dt;
          if (ped.downT <= 0) {
            // Get back up somewhere else in the city.
            const s = randomSpawnNear(pp.x, pp.z, 40, 120);
            ped.pos.set(s.x, 0, s.z);
            ped.group.rotation.x = 0;
            ped.state = 'walk';
            ped.waitT = 0;
            pickWaypoint(ped);
          }
          continue;
        }
        // Flee a speeding player car or a scare event.
        if (pCar && Math.abs(pCar.speed) > 4) {
          const d = Math.hypot(ped.pos.x - pCar.pos.x, ped.pos.z - pCar.pos.z);
          if (d < 11 && ped.state !== 'flee') {
            ped.state = 'flee';
            ped.fleeT = 2.5;
            ped.fleeFrom.copy(pCar.pos);
          }
        }
        if (ped.state === 'flee') {
          ped.fleeT -= dt;
          const dx = ped.pos.x - ped.fleeFrom.x, dz = ped.pos.z - ped.fleeFrom.z;
          const d = Math.hypot(dx, dz) || 1;
          ped.yaw = Math.atan2(dx / d, dz / d);
          ped.pos.x += (dx / d) * 4.2 * dt;
          ped.pos.z += (dz / d) * 4.2 * dt;
          ped.phase += dt * 11;
          if (ped.fleeT <= 0) { ped.state = 'walk'; pickWaypoint(ped); }
        } else {
          if (ped.waitT > 0) {
            ped.waitT -= dt;
          } else {
            const dx = ped.target.x - ped.pos.x, dz = ped.target.z - ped.pos.z;
            const d = Math.hypot(dx, dz);
            if (d < 1.5) {
              ped.waitT = Math.random() * 2;
              pickWaypoint(ped);
            } else {
              ped.yaw = Math.atan2(dx / d, dz / d);
              ped.pos.x += (dx / d) * ped.speed * dt;
              ped.pos.z += (dz / d) * ped.speed * dt;
              ped.phase += dt * ped.speed * 5;
            }
          }
        }
        world.clampToWorld(ped.pos);
        const swing = ped.state === 'flee' ? Math.sin(ped.phase) * 0.9 : Math.sin(ped.phase) * 0.55;
        const moving = ped.state === 'flee' || ped.waitT <= 0;
        ped.legL.rotation.x = moving ? swing : 0;
        ped.legR.rotation.x = moving ? -swing : 0;
        ped.armL.rotation.x = moving ? -swing * 0.8 : 0;
        ped.armR.rotation.x = moving ? swing * 0.8 : 0;
        ped.group.position.copy(ped.pos);
        ped.group.rotation.y = ped.yaw;

        // Run over by the player's car: down, wanted heat, red burst.
        if (pCar && Math.abs(pCar.speed) > 3) {
          const d = Math.hypot(ped.pos.x - pCar.pos.x, ped.pos.z - pCar.pos.z);
          if (d < 2.3) {
            downPed(ped, pCar.pos);
            pCar.speed *= 0.6;
            g.effects?.burst(new THREE.Vector3(ped.pos.x, 1, ped.pos.z), 0xd92a2a, 10, 4, 3, 8);
            g.effects?.shake(0.35);
            g.audio.crash();
            if (hitCooldown <= 0 && g.police) {
              hitCooldown = 5;
              g.police.raiseWanted(1, 'You hit a pedestrian!');
            }
          }
        }
      }
    },
  };
}
