// traffic.js — moving city traffic: AI cars driving the road grid, turning at
// intersections, stopping for the player, despawning/respawning to keep the count
// steady. Uses the existing car models (colours only); light on purpose.
import * as THREE from 'three';
import { CAR_MODELS } from './vehicles.js';

const COUNT = 10;

function buildTrafficCar(scene, color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2836 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass);
  cabin.position.set(0, 1.12, -0.2);
  g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 2.0), paint);
  roof.position.set(0, 1.42, -0.2);
  g.add(roof);
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 8), tyre);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
  }
  g.userData.isTrafficBody = true;
  scene.add(g);
  return g;
}

/** Heading angle for a road axis + direction. Forward is (sin a, cos a). */
function roadAngle(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

export function createTrafficSystem(game) {
  const world = game.world;
  const lines = world.roadLines();
  const cars = [];

  function pickRoadNear(px, pz, minD, maxD) {
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const at = lines[Math.floor(Math.random() * lines.length)];
    const alongBase = axis === 'x' ? px : pz;
    const along = alongBase + (minD + Math.random() * (maxD - minD)) * (Math.random() < 0.5 ? -1 : 1);
    return { axis, at, along: Math.max(-228, Math.min(228, along)) };
  }

  function spawnCar(nearPlayer) {
    const model = CAR_MODELS[Math.floor(Math.random() * CAR_MODELS.length)];
    const mesh = buildTrafficCar(game.scene, model.color);
    const px = game.player.pos.x, pz = game.player.pos.z;
    let road;
    if (nearPlayer) road = pickRoadNear(px, pz, 55, 130);
    else {
      road = {
        axis: Math.random() < 0.5 ? 'x' : 'z',
        at: lines[Math.floor(Math.random() * lines.length)],
        along: -220 + Math.random() * 440,
      };
    }
    const dir = Math.random() < 0.5 ? -1 : 1;
    const lane = dir * 2.6;
    const car = {
      mesh, model, road, dir, lane,
      angle: roadAngle(road.axis, dir),
      speed: 0,
      cruise: 8 + Math.random() * 6,
      waitT: 0, turnCd: 2 + Math.random() * 4, stunned: 0,
    };
    if (road.axis === 'x') car.mesh.position.set(road.along, 0, road.at + lane);
    else car.mesh.position.set(road.at + lane, 0, road.along);
    car.mesh.rotation.y = car.angle;
    cars.push(car);
    return car;
  }

  for (let i = 0; i < COUNT; i++) spawnCar(false);
  game.traffic = { cars, count: () => cars.length };

  let hitCooldown = 0;

  return {
    name: 'traffic',
    update(dt, g) {
      hitCooldown = Math.max(0, hitCooldown - dt);
      const pp = g.player.pos;
      const pCar = g.player.inCar;
      for (const c of cars) {
        if (c.stunned > 0) {
          c.stunned -= dt;
          c.speed = Math.max(0, c.speed - 20 * dt);
        } else {
          let target = c.cruise;
          // Stop for a car ahead on the same road, same direction.
          for (const o of cars) {
            if (o === c || o.road.axis !== c.road.axis || o.road.at !== c.road.at || o.dir !== c.dir) continue;
            const ahead = c.road.axis === 'x'
              ? (o.mesh.position.x - c.mesh.position.x) * c.dir
              : (o.mesh.position.z - c.mesh.position.z) * c.dir;
            if (ahead > 0 && ahead < 9) { target = 0; break; }
          }
          // Slow for the player's car ahead.
          if (pCar) {
            const dx = pCar.pos.x - c.mesh.position.x;
            const dz = pCar.pos.z - c.mesh.position.z;
            const dist = Math.hypot(dx, dz);
            const fwdX = Math.sin(c.angle), fwdZ = Math.cos(c.angle);
            if (dist < 11 && (dx * fwdX + dz * fwdZ) > 0) target = Math.min(target, 3);
          }
          // Intersections: sometimes turn, sometimes wait.
          c.turnCd -= dt;
          if (c.waitT > 0) {
            c.waitT -= dt;
            target = 0;
          } else if (c.turnCd <= 0) {
            const crossLines = lines.filter((v) => {
              const d = c.road.axis === 'x' ? Math.abs(c.mesh.position.z - v) : Math.abs(c.mesh.position.x - v);
              return d < 4;
            });
            if (crossLines.length) {
              const r = Math.random();
              if (r < 0.3) {
                // Turn onto the crossing road.
                const at = crossLines[0];
                c.road = { axis: c.road.axis === 'x' ? 'z' : 'x', at, along: c.road.axis === 'x' ? c.mesh.position.z : c.mesh.position.x };
                c.dir = Math.random() < 0.5 ? -1 : 1;
                c.lane = c.dir * 2.6;
              } else if (r < 0.45) c.waitT = 0.8 + Math.random() * 1.4;
              c.turnCd = 7 + Math.random() * 6;
            } else c.turnCd = 0.5;
          }
          // Ease speed toward target.
          const rate = target > c.speed ? 6 : 14;
          c.speed += Math.max(-rate * dt, Math.min(rate * dt, target - c.speed));
        }
        // Move along the road.
        const a = lerpAngle(c.angle, roadAngle(c.road.axis, c.dir), dt * 3);
        c.angle = a;
        const nx = c.mesh.position.x + Math.sin(a) * c.speed * dt;
        const nz = c.mesh.position.z + Math.cos(a) * c.speed * dt;
        c.mesh.position.x = nx;
        c.mesh.position.z = nz;
        // Keep the car glued to its lane (turns swing through the intersection).
        if (c.road.axis === 'x') c.mesh.position.z += ((c.road.at + c.lane) - c.mesh.position.z) * Math.min(1, dt * 2);
        else c.mesh.position.x += ((c.road.at + c.lane) - c.mesh.position.x) * Math.min(1, dt * 2);
        c.mesh.rotation.y = c.angle;

        // Ran off the grid edge: respawn near the player to keep the count steady.
        const along = c.road.axis === 'x' ? c.mesh.position.x : c.mesh.position.z;
        if (Math.abs(along) > 234) {
          const road = pickRoadNear(pp.x, pp.z, 55, 130);
          c.road = road;
          c.dir = Math.random() < 0.5 ? -1 : 1;
          c.lane = c.dir * 2.6;
          c.angle = roadAngle(road.axis, c.dir);
          if (road.axis === 'x') c.mesh.position.set(road.along, 0, road.at + c.lane);
          else c.mesh.position.set(road.at + c.lane, 0, road.along);
          c.mesh.rotation.y = c.angle;
          c.speed = c.cruise * 0.5;
          continue;
        }

        // Collision with the player's car: shove, sparks, wanted heat if it was a real hit.
        if (pCar) {
          const d = Math.hypot(pCar.pos.x - c.mesh.position.x, pCar.pos.z - c.mesh.position.z);
          if (d < 3.6 && c.stunned <= 0) {
            const hard = Math.abs(pCar.speed) > 8;
            c.stunned = 1.6;
            c.speed = 0;
            // Nudge the traffic car sideways out of the way.
            const nx2 = c.mesh.position.x + (c.mesh.position.x - pCar.pos.x) * 0.3;
            const nz2 = c.mesh.position.z + (c.mesh.position.z - pCar.pos.z) * 0.3;
            c.mesh.position.x = nx2; c.mesh.position.z = nz2;
            pCar.speed *= 0.55;
            g.effects?.sparks(new THREE.Vector3((pCar.pos.x + c.mesh.position.x) / 2, 0.9, (pCar.pos.z + c.mesh.position.z) / 2));
            g.effects?.shake(0.4);
            g.audio.crash();
            if (hard && hitCooldown <= 0 && g.police) {
              hitCooldown = 5;
              g.police.raiseWanted(1, 'You smashed into traffic!');
            }
          }
        }
      }
    },
  };
}
