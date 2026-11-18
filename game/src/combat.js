// combat.js — fists and a pistol: F punches (short range, knocks people back),
// 1 draws the pistol, click shoots a real raycast against pedestrians, officers,
// traffic and parked cars and the mission boss. Limited ammo, green ammo boxes
// around the city, health regens slowly out of combat. Shooting raises wanted.
import * as THREE from 'three';

const AMMO_SPOTS = [{ x: -44, z: 88 }, { x: 132, z: -44 }, { x: -88, z: -132 }];

export function createCombatSystem(game) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 70;
  const dirVec = new THREE.Vector3();
  let pistolOut = false;
  let ammo = 12;
  let punchCd = 0;
  let raiseCd = 0;
  let prevHealth = game.health;
  let lastHurtT = -100;
  let clock = 0;
  let downPos = null;
  let downT = 0;

  // Ammo HUD chip (lives inside #hud so it hides with it).
  const ammoEl = document.createElement('div');
  ammoEl.id = 'ammo-hud';
  ammoEl.style.cssText = 'position:absolute;right:18px;bottom:118px;color:#fff;font:700 15px system-ui,sans-serif;text-shadow:0 1px 3px #000;background:rgba(0,0,0,.45);padding:4px 10px;border-radius:6px;display:none;';
  document.getElementById('hud').appendChild(ammoEl);

  function refreshAmmo() {
    ammoEl.style.display = pistolOut ? 'block' : 'none';
    ammoEl.textContent = `🔫 PISTOL — ${ammo} rounds`;
  }

  // Ammo pickups: glowing green boxes, respawn 45 s after being taken.
  const pickups = AMMO_SPOTS.map((s) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshBasicMaterial({ color: 0x35e08a }),
    );
    mesh.position.set(s.x, 0.9, s.z);
    game.scene.add(mesh);
    return { mesh, x: s.x, z: s.z, taken: false, respawnT: 0 };
  });

  // Click (not drag) to shoot: mousedown + mouseup close together = a shot.
  window.addEventListener('mousedown', (e) => {
    downPos = { x: e.clientX, y: e.clientY };
    downT = performance.now();
  });
  // Keys are event-driven (not polled): at ~1-2 fps under SwiftShader a short
  // tap can fall between frames, so the edge is caught on the event itself.
  window.addEventListener('keydown', (e) => {
    if (e.repeat || game.state !== 'playing') return;
    if (e.code === 'Digit1') {
      pistolOut = !pistolOut;
      refreshAmmo();
      game.hud.toast(pistolOut ? 'Pistol drawn — click to shoot.' : 'Pistol holstered.');
      game.audio.blip(pistolOut ? 990 : 660, 0.06);
    } else if (e.code === 'KeyF' && !game.player.inCar) {
      punch();
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (!downPos || game.state !== 'playing' || !pistolOut) { downPos = null; return; }
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    const held = performance.now() - downT;
    downPos = null;
    if (moved < 6 && held < 500) shoot();
  });

  function ownerOf(obj) {
    let o = obj;
    while (o) {
      if (o.userData && o.userData.owner) return o.userData.owner;
      o = o.parent;
    }
    return null;
  }

  function shoot() {
    if (ammo <= 0) {
      game.audio.blip(180, 0.06, 'square', 0.1);
      game.hud.toast('Out of ammo — find a green ammo box.');
      return;
    }
    ammo--;
    refreshAmmo();
    game.audio.blip(1500, 0.05, 'square', 0.14);
    game.camera.getWorldDirection(dirVec);
    const origin = game.camera.position.clone().addScaledVector(dirVec, 1.2);
    game.effects?.burst(origin, 0xffe27a, 6, 3, 1, 2);
    // Shooting in the city raises the heat (throttled).
    if (raiseCd <= 0 && game.police) {
      raiseCd = 4;
      game.police.raiseWanted(1, 'Shots fired!');
    }
    if (game.peds) game.peds.scareAt(game.player.pos.x, game.player.pos.z, 45);
    // Raycast against everything shootable.
    const targets = [];
    if (game.peds) for (const p of game.peds.list) targets.push(p.group);
    if (game.police) for (const o of game.police.officers) targets.push(o.group);
    if (game.traffic) for (const c of game.traffic.cars) targets.push(c.mesh);
    for (const v of game.vehicles.vehicles) targets.push(v.group);
    if (game.missions && game.missions.boss) targets.push(game.missions.boss.mesh);
    raycaster.set(origin, dirVec);
    const hits = raycaster.intersectObjects(targets, true);
    if (!hits.length) return;
    const hit = hits[0];
    const owner = ownerOf(hit.object);
    const hp = hit.point;
    if (owner && owner.kind === 'ped') {
      game.peds.downPed(owner.ref, game.player.pos);
      game.effects?.burst(hp, 0xd92a2a, 10, 4, 3, 8);
    } else if (owner && owner.kind === 'officer') {
      game.police.downOfficer(owner.ref, game.player.pos);
      game.effects?.burst(hp, 0x2a6bff, 10, 4, 3, 8);
    } else if (owner && owner.kind === 'boss') {
      game.missions.damageBoss(34);
      game.effects?.sparks(hp);
    } else {
      // Traffic car, parked car, or the player figure's own car: sparks + shake.
      game.effects?.sparks(hp);
      game.effects?.shake(0.2);
      const tc = game.traffic && game.traffic.cars.find((c) => c.mesh === hit.object || c.mesh.children.includes(hit.object));
      if (tc) tc.stunned = 2;
    }
  }

  function punch() {
    if (punchCd > 0) return;
    punchCd = 0.5;
    game.audio.blip(200, 0.08, 'sawtooth', 0.14);
    const pp = game.player.pos;
    const fx = Math.sin(game.player.yaw), fz = Math.cos(game.player.yaw);
    let hitAny = false;
    const tryTarget = (pos, down, isOfficer) => {
      const dx = pos.x - pp.x, dz = pos.z - pp.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.5 && (dx * fx + dz * fz) > -0.3) {
        down({ x: pp.x, z: pp.z });
        game.effects?.burst(new THREE.Vector3(pos.x, 1.3, pos.z), 0xffe27a, 6, 4, 2, 6);
        hitAny = true;
        if (isOfficer && game.police) game.police.raiseWanted(1, 'You punched an officer!');
      }
    };
    if (game.peds) for (const p of game.peds.list) {
      if (p.state !== 'down') tryTarget(p.pos, (from) => game.peds.downPed(p, from), false);
    }
    if (game.police) for (const o of game.police.officers) {
      if (o.state !== 'down') tryTarget(o.pos, (from) => game.police.downOfficer(o, from), true);
    }
    if (!hitAny) game.hud.toast('You swing at the air.');
  }

  const combat = {
    get ammo() { return ammo; },
    get pistolOut() { return pistolOut; },
    shoot, punch,
  };
  game.combat = combat;

  return {
    name: 'combat',
    update(dt, g) {
      clock += dt;
      punchCd = Math.max(0, punchCd - dt);
      raiseCd = Math.max(0, raiseCd - dt);
      // Ammo pickups.
      for (const p of pickups) {
        if (p.taken) {
          p.respawnT -= dt;
          if (p.respawnT <= 0) { p.taken = false; p.mesh.visible = true; }
          continue;
        }
        const d = Math.hypot(g.player.pos.x - p.x, g.player.pos.z - p.z);
        if (d < 2.5) {
          p.taken = true;
          p.respawnT = 45;
          p.mesh.visible = false;
          ammo += 12;
          refreshAmmo();
          g.hud.toast('+12 pistol ammo');
          g.audio.pickupBlip();
          g.effects?.sparkle(new THREE.Vector3(p.x, 1.5, p.z));
        }
      }
      // Health regen: +3/s after 8 s without taking damage.
      if (g.health < prevHealth) lastHurtT = clock;
      prevHealth = g.health;
      if (g.health > 0 && g.health < 100 && clock - lastHurtT > 8) {
        g.health = Math.min(100, g.health + 3 * dt);
        g.player.health = g.health;
      }
    },
  };
}
