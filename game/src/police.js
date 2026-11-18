// police.js — wanted level + Solmar PD: patrol cars that chase and ram, foot
// officers at 3+ stars, busted when caught, and heat that fades when the player
// stays out of sight. Wanted also rises on car theft witnessed, traffic smashes
// and hitting pedestrians (those systems call raiseWanted here).
import * as THREE from 'three';

function buildPoliceCar(scene) {
  const g = new THREE.Group();
  const black = new THREE.MeshLambertMaterial({ color: 0x14161c });
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2836 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), black);
  body.position.y = 0.55;
  g.add(body);
  const doors = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.5, 2.0), white);
  doors.position.y = 0.6;
  g.add(doors);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0), glass);
  cabin.position.set(0, 1.12, -0.2);
  g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 1.9), white);
  roof.position.set(0, 1.42, -0.2);
  g.add(roof);
  // Roof light bar: red + blue, flashed by the update loop.
  const barMatR = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const barMatB = new THREE.MeshBasicMaterial({ color: 0x2a6bff });
  const barR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.5), barMatR);
  barR.position.set(-0.5, 1.58, -0.2);
  g.add(barR);
  const barB = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.5), barMatB);
  barB.position.set(0.5, 1.58, -0.2);
  g.add(barB);
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 8), tyre);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
  }
  g.userData.isPoliceBody = true;
  scene.add(g);
  return { group: g, barMatR, barMatB };
}

function buildOfficer(scene) {
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1c2a4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5e });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14161c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.82, 0.34), navy);
  body.position.y = 1.26;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.38), skin);
  head.position.y = 1.9;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.42), dark);
  cap.position.y = 2.12;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), dark);
  legL.position.set(-0.16, 0.4, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.18), navy);
  armL.position.set(-0.4, 1.28, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.4;
  g.add(armR);
  scene.add(g);
  return { group: g, legL, legR, armL, armR, body };
}

export function createPoliceSystem(game) {
  const cars = [];    // {group, barMatR, barMatB, pos, angle, speed, reverseT, flashT}
  const officers = []; // {group..., pos, yaw, state, downT, phase}
  let hideT = 0;       // time with no police close by (drives wanted decay)
  let bustT = 0;       // time boxed in while stationary in a car
  let ramCooldown = 0;
  let raiseCooldown = 0;
  let prevInCar = null;
  let graceT = 3;      // ignore "car theft" for the first 3 s of play: shot staging
                       // seats the player in a car, which is not a theft
  let flashOn = false;
  let flashT = 0;

  function spawnPoliceCar() {
    const built = buildPoliceCar(game.scene);
    const pp = game.player.pos;
    const heading = game.player.inCar ? game.player.inCar.angle : game.player.yaw;
    // Spawn behind the player's direction of travel, on open ground.
    const bx = pp.x - Math.sin(heading) * 32 + (Math.random() - 0.5) * 14;
    const bz = pp.z - Math.cos(heading) * 32 + (Math.random() - 0.5) * 14;
    const car = {
      ...built,
      pos: built.group.position,
      angle: Math.atan2(pp.x - bx, pp.z - bz),
      speed: 12,
      reverseT: 0,
    };
    car.pos.set(bx, 0, bz);
    car.group.rotation.y = car.angle;
    cars.push(car);
    return car;
  }

  function removePoliceCar(car) {
    game.scene.remove(car.group);
    cars.splice(cars.indexOf(car), 1);
  }

  function spawnOfficer() {
    const built = buildOfficer(game.scene);
    const pp = game.player.pos;
    const a = Math.random() * Math.PI * 2;
    const d = 14 + Math.random() * 10;
    const off = {
      ...built,
      pos: built.group.position,
      yaw: a,
      state: 'chase',
      downT: 0,
      phase: Math.random() * 6,
    };
    off.pos.set(pp.x + Math.sin(a) * d, 0, pp.z + Math.cos(a) * d);
    game.world.resolveCircle(off.pos, 0.6);
    off.group.userData.owner = { kind: 'officer', ref: off };
    officers.push(off);
    return off;
  }

  function removeOfficer(off) {
    game.scene.remove(off.group);
    officers.splice(officers.indexOf(off), 1);
  }

  function downOfficer(off, fromPos) {
    if (off.state === 'down') return;
    off.state = 'down';
    off.downT = 6;
    off.group.rotation.x = -Math.PI / 2 + 0.15;
    if (fromPos) {
      const dx = off.pos.x - fromPos.x, dz = off.pos.z - fromPos.z;
      const d = Math.hypot(dx, dz) || 1;
      off.pos.x += (dx / d) * 1.5;
      off.pos.z += (dz / d) * 1.5;
    }
  }

  function raiseWanted(n, reason) {
    if (raiseCooldown > 0 || game.wanted >= 5) return;
    raiseCooldown = 2.5;
    hideT = 0;
    game.setWanted(game.wanted + n);
    if (reason) game.hud.toast(reason + ' Wanted level up!');
    else game.hud.toast('Wanted level up!');
  }

  const police = {
    cars, officers, raiseWanted, downOfficer,
    /** Spawn one patrol car at an exact spot (shot staging puts one in frame). */
    spawnCarAt(x, z, angle) {
      const built = buildPoliceCar(game.scene);
      const car = { ...built, pos: built.group.position, angle, speed: 10, reverseT: 0 };
      car.pos.set(x, 0, z);
      car.group.rotation.y = angle;
      cars.push(car);
      return car;
    },
    get hideT() { return hideT; },
    set hideT(v) { hideT = v; },
  };
  game.police = police;

  return {
    name: 'police',
    update(dt, g) {
      raiseCooldown = Math.max(0, raiseCooldown - dt);
      ramCooldown = Math.max(0, ramCooldown - dt);
      const wanted = g.wanted;
      const pp = g.player.pos;
      const pCar = g.player.inCar;

      // Car theft witnessed: entering a car that is not the starter, with a
      // pedestrian or patrol nearby, raises the heat. (Skipped during the
      // opening grace period so staged shots are not "thefts".)
      if (graceT > 0) graceT -= dt;
      else if (prevInCar === null && pCar && pCar !== g.starterCar) {
        const seen = (g.peds && g.peds.nearest(pp.x, pp.z, 30)) || cars.some((c) => Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z) < 60);
        if (seen) raiseWanted(1, 'Someone saw you take that car!');
      }
      prevInCar = pCar;

      // Keep the patrol count matched to the wanted level.
      const wantCars = wanted === 0 ? 0 : wanted >= 4 ? 3 : wanted >= 2 ? 2 : 1;
      while (cars.length < wantCars) spawnPoliceCar();
      while (cars.length > wantCars) removePoliceCar(cars[cars.length - 1]);
      const wantOfficers = wanted >= 5 ? 3 : wanted >= 3 ? 2 : 0;
      let liveOfficers = officers.filter((o) => o.state !== 'down').length;
      while (liveOfficers < wantOfficers) { spawnOfficer(); liveOfficers++; }
      if (wanted === 0) {
        while (officers.length) removeOfficer(officers[0]);
      }

      // Flash the light bars.
      flashT -= dt;
      if (flashT <= 0) {
        flashT = 0.28;
        flashOn = !flashOn;
        for (const c of cars) {
          c.barMatR.color.setHex(flashOn ? 0xff2a2a : 0x551111);
          c.barMatB.color.setHex(flashOn ? 0x112255 : 0x2a6bff);
        }
      }

      // --- patrol car pursuit ---
      // Top speed stays just under the player's fast cars so a clean getaway
      // is possible; beyond 60 m the patrol loses the trail and slows down,
      // which is what lets the wanted level decay (see below).
      const policeTop = 24 + wanted * 2.0;
      for (const c of cars) {
        const dx = pp.x - c.pos.x, dz = pp.z - c.pos.z;
        const dist = Math.hypot(dx, dz);
        const desired = Math.atan2(dx, dz);
        let dA = desired - c.angle;
        while (dA > Math.PI) dA -= Math.PI * 2;
        while (dA < -Math.PI) dA += Math.PI * 2;
        const turn = Math.max(-2.4 * dt, Math.min(2.4 * dt, dA));
        if (c.reverseT > 0) {
          c.reverseT -= dt;
          c.speed = Math.max(-7, c.speed - 14 * dt);
          c.angle -= turn * 0.6;
        } else {
          c.angle += turn;
          // Ease off when close to a player on foot; full speed in a car chase;
          // lose-the-trail slowdown when far away so escapes are possible.
          const target = pCar
            ? (dist > 60 ? policeTop * 0.55 : dist > 70 ? policeTop : policeTop * 0.85)
            : (dist < 6 ? 0 : 14);
          c.speed += Math.max(-16 * dt, Math.min(10 * dt, target - c.speed));
        }
        c.pos.x += Math.sin(c.angle) * c.speed * dt;
        c.pos.z += Math.cos(c.angle) * c.speed * dt;
        const hit = g.world.resolveCircle(c.pos, 2.0);
        if (hit && Math.abs(c.speed) > 6 && c.reverseT <= 0) {
          c.speed *= 0.3;
          c.reverseT = 0.8;
        }
        g.world.clampToWorld(c.pos, 3);
        c.group.position.copy(c.pos);
        c.group.rotation.y = c.angle;

        // Ram the player's car; bump damage on hard hits.
        if (pCar && dist < 4.2) {
          pCar.speed *= 0.82;
          if (Math.abs(c.speed) > 8 && ramCooldown <= 0) {
            ramCooldown = 1.2;
            g.takeDamage(3);
            g.effects?.sparks(new THREE.Vector3((pCar.pos.x + c.pos.x) / 2, 0.9, (pCar.pos.z + c.pos.z) / 2));
            g.effects?.shake(0.4);
            g.audio.crash();
            g.hud.toast('Solmar PD is ramming you!');
          }
        }
      }

      // --- foot officers chase the player on foot ---
      for (const off of [...officers]) {
        if (off.state === 'down') {
          off.downT -= dt;
          if (off.downT <= 0) {
            if (wanted >= 3) {
              const a = Math.random() * Math.PI * 2;
              off.pos.set(pp.x + Math.sin(a) * 18, 0, pp.z + Math.cos(a) * 18);
              off.group.rotation.x = 0;
              off.state = 'chase';
            } else removeOfficer(off);
          }
          continue;
        }
        const dx = pp.x - off.pos.x, dz = pp.z - off.pos.z;
        const dist = Math.hypot(dx, dz);
        // Run over by the player's car.
        if (pCar && Math.abs(pCar.speed) > 3 && dist < 2.4) {
          downOfficer(off, pCar.pos);
          pCar.speed *= 0.6;
          g.effects?.burst(new THREE.Vector3(off.pos.x, 1, off.pos.z), 0x2a6bff, 10, 4, 3, 8);
          raiseWanted(1, 'You ran down an officer!');
          continue;
        }
        off.yaw = Math.atan2(dx / (dist || 1), dz / (dist || 1));
        const spd = pCar ? 5.5 : 6.8;
        if (dist > 1.6) {
          off.pos.x += (dx / (dist || 1)) * spd * dt;
          off.pos.z += (dz / (dist || 1)) * spd * dt;
          off.phase += dt * 10;
        }
        g.world.resolveCircle(off.pos, 0.55);
        g.world.clampToWorld(off.pos);
        const swing = Math.sin(off.phase) * 0.7;
        off.legL.rotation.x = swing;
        off.legR.rotation.x = -swing;
        off.armL.rotation.x = -swing * 0.8;
        off.armR.rotation.x = swing * 0.8;
        off.group.position.copy(off.pos);
        off.group.rotation.y = off.yaw;
        // Caught on foot: BUSTED.
        if (!pCar && dist < 1.7) {
          g.gameOver('Solmar PD caught you on foot — BUSTED.');
        }
      }

      // --- boxed in while stationary in a car: BUSTED after 4 seconds ---
      if (pCar && Math.abs(pCar.speed) < 1.5 && wanted > 0) {
        const near = cars.some((c) => Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z) < 4.5);
        bustT = near ? bustT + dt : 0;
        if (bustT > 4) g.gameOver('Solmar PD boxed you in — BUSTED.');
      } else bustT = 0;

      // --- wanted decay: no police within 45 m for 10 s drops one star ---
      let nearest = Infinity;
      for (const c of cars) nearest = Math.min(nearest, Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z));
      for (const o of officers) {
        if (o.state !== 'down') nearest = Math.min(nearest, Math.hypot(o.pos.x - pp.x, o.pos.z - pp.z));
      }
      if (wanted > 0) {
        if (nearest > 45 || nearest === Infinity) {
          hideT += dt;
          if (hideT > 10) {
            hideT = 0;
            g.setWanted(wanted - 1);
            g.hud.toast(wanted - 1 === 0 ? 'You lost the heat — clean.' : 'You lost some heat…');
          }
        } else hideT = 0;
      }
    },
  };
}
