// effects.js — juice: skid marks, dust/exhaust puffs, crash sparks, screen shake,
// pickup sparkles and a red damage flash. Cheap pooled meshes, no textures.
import * as THREE from 'three';

const P_COUNT = 90;
const SKID_COUNT = 36;

export function createEffectsSystem(game) {
  const scene = game.scene;

  // --- particle pool (small bright boxes, reused) ---
  const pGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  const parts = [];
  for (let i = 0; i < P_COUNT; i++) {
    const mesh = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    mesh.visible = false;
    scene.add(mesh);
    parts.push({ mesh, vel: new THREE.Vector3(), life: 0, max: 1, grav: 9 });
  }

  // --- skid-mark pool (flat dark strips, fade out) ---
  const skidGeo = new THREE.BoxGeometry(0.5, 0.02, 1.5);
  const skids = [];
  for (let i = 0; i < SKID_COUNT; i++) {
    const mesh = new THREE.Mesh(skidGeo, new THREE.MeshBasicMaterial({ color: 0x0c0c0c, transparent: true, opacity: 0 }));
    mesh.visible = false;
    scene.add(mesh);
    skids.push({ mesh, life: 0 });
  }
  let skidIdx = 0;

  // --- red damage flash overlay (DOM, fades fast) ---
  const flashEl = document.createElement('div');
  flashEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,rgba(255,30,20,.55) 100%);opacity:0;z-index:30;transition:opacity .12s;';
  document.body.appendChild(flashEl);

  let shakeAmt = 0;
  let flashA = 0;
  let prevHealth = game.health;

  const fx = {
    /** Burst of n particles at pos. power = spread speed, up = vertical kick. */
    burst(pos, color, n = 10, power = 6, up = 3, grav = 9) {
      let placed = 0;
      for (const p of parts) {
        if (placed >= n) break;
        if (p.life > 0) continue;
        placed++;
        p.mesh.visible = true;
        p.mesh.position.copy(pos);
        p.mesh.material.color.setHex(color);
        p.mesh.material.opacity = 1;
        p.vel.set((Math.random() - 0.5) * 2 * power, Math.random() * up + 1, (Math.random() - 0.5) * 2 * power);
        p.max = 0.45 + Math.random() * 0.45;
        p.life = p.max;
        p.grav = grav;
      }
    },
    sparkle(pos) { this.burst(pos, 0xffd23e, 12, 3, 4, 4); },
    sparks(pos) { this.burst(pos, 0xffa030, 14, 7, 4, 10); },
    dust(pos) { this.burst(pos, 0x8f8880, 2, 1.2, 1.6, -1.5); },
    shake(a) { shakeAmt = Math.max(shakeAmt, a); },
    flash() { flashA = 0.5; },
  };
  game.effects = fx;

  let skidT = 0;
  let dustT = 0;

  return {
    name: 'effects',
    update(dt, g) {
      // Particles: fly, fall, fade.
      for (const p of parts) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { p.mesh.visible = false; p.mesh.material.opacity = 0; continue; }
        p.vel.y -= p.grav * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        if (p.mesh.position.y < 0.1) { p.mesh.position.y = 0.1; p.vel.y = 0; }
        p.mesh.material.opacity = p.life / p.max;
      }
      // Skid marks fade slowly.
      for (const s of skids) {
        if (s.life <= 0) continue;
        s.life -= dt;
        s.mesh.material.opacity = Math.max(0, s.life / 5) * 0.55;
        if (s.life <= 0) s.mesh.visible = false;
      }
      // Damage flash: a health drop flashes the screen red.
      if (g.health < prevHealth) { flashA = 0.5; fx.shake(0.25); }
      prevHealth = g.health;
      if (flashA > 0) {
        flashA = Math.max(0, flashA - dt * 1.8);
        flashEl.style.opacity = String(flashA);
      }
      // Screen shake: jitter the camera after the camera system placed it.
      if (shakeAmt > 0.01) {
        g.camera.position.x += (Math.random() - 0.5) * shakeAmt;
        g.camera.position.y += (Math.random() - 0.5) * shakeAmt * 0.6;
        g.camera.position.z += (Math.random() - 0.5) * shakeAmt;
        shakeAmt = Math.max(0, shakeAmt - dt * 1.6);
      }
      // Driving juice: handbrake skids + exhaust dust.
      const car = g.player.inCar;
      if (car) {
        const spd = Math.abs(car.speed);
        const fx0 = Math.sin(car.angle), fz = Math.cos(car.angle);
        const rx = -Math.cos(car.angle), rz = Math.sin(car.angle); // right vector
        if (g.input.down('Space') && spd > 8) {
          skidT -= dt;
          if (skidT <= 0) {
            skidT = 0.055;
            for (const side of [-0.95, 0.95]) {
              const s = skids[skidIdx++ % SKID_COUNT];
              s.mesh.visible = true;
              s.mesh.position.set(car.pos.x - fx0 * 1.7 + rx * side, 0.08, car.pos.z - fz * 1.7 + rz * side);
              s.mesh.rotation.y = car.angle;
              s.life = 5;
            }
            if (Math.random() < 0.4) fx.dust(new THREE.Vector3(car.pos.x - fx0 * 2.2, 0.4, car.pos.z - fz * 2.2));
          }
        }
        if (spd > 5) {
          dustT -= dt;
          if (dustT <= 0) {
            dustT = 0.16;
            fx.dust(new THREE.Vector3(car.pos.x - fx0 * 2.3, 0.35, car.pos.z - fz * 2.3));
          }
        }
        // Hard building hit: sparks + shake (core sets car.crashed on impact).
        if (car.crashed && spd > 4) {
          fx.sparks(new THREE.Vector3(car.pos.x + fx0 * 2, 0.8, car.pos.z + fz * 2));
          fx.shake(0.55);
        }
      }
    },
  };
}
