// vehicles.js — arcade cars: enter/exit, accelerate/brake/steer/reverse, handbrake.
// Original invented models: Comet, Bay Runner, Pelican, Sun Chaser, Marina GT.
import * as THREE from 'three';

export const CAR_MODELS = [
  { name: 'Comet', color: 0xd94f3d, topSpeed: 34, accel: 16 },
  { name: 'Bay Runner', color: 0x2a6fb0, topSpeed: 30, accel: 14 },
  { name: 'Pelican', color: 0xe8c84a, topSpeed: 26, accel: 12 },
  { name: 'Sun Chaser', color: 0x3aa655, topSpeed: 32, accel: 15 },
  { name: 'Marina GT', color: 0x8a4fd9, topSpeed: 38, accel: 18 },
  { name: 'Dockside Van', color: 0xd8d8d8, topSpeed: 24, accel: 10 },
];

const CAR_NAMES = CAR_MODELS.map((m) => m.name);

export class Vehicle {
  constructor(scene, model, x, z, angle) {
    this.model = model;
    this.pos = new THREE.Vector3(x, 0, z);
    this.angle = angle;          // heading, radians (0 = +z)
    this.speed = 0;              // m/s, signed (negative = reversing)
    this.steer = 0;
    this.headlights = false;
    this.group = this.buildCar(scene, model);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.angle;
  }

  buildCar(scene, model) {
    const g = new THREE.Group();
    const paint = new THREE.MeshLambertMaterial({ color: model.color });
    const glass = new THREE.MeshLambertMaterial({ color: 0x1a2836 });
    const tyre = new THREE.MeshLambertMaterial({ color: 0x141414 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
    body.position.y = 0.55; g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass);
    cabin.position.set(0, 1.12, -0.2); g.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 2.0), paint);
    roof.position.set(0, 1.42, -0.2); g.add(roof);
    // Headlights + taillights.
    const hl = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    const tl = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    for (const sx of [-0.65, 0.65]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), hl);
      h.position.set(sx, 0.55, 2.22); g.add(h);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), tl);
      t.position.set(sx, 0.55, -2.22); g.add(t);
    }
    // Wheels (spin + front steer handled in update).
    this.wheels = [];
    for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10), tyre);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.36, wz);
      g.add(w); this.wheels.push(w);
    }
    // Headlight beams (two translucent cones, toggled by F).
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14 });
    this.beams = [];
    for (const sx of [-0.65, 0.65]) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 7, 8, 1, true), this.beamMat);
      beam.rotation.x = Math.PI / 2 + 0.12;
      beam.position.set(sx, 0.5, 5.6);
      beam.visible = false;
      g.add(beam); this.beams.push(beam);
    }
    scene.add(g);
    return g;
  }

  setHeadlights(on) {
    this.headlights = on;
    for (const b of this.beams) b.visible = on;
  }

  /** Arcade update. input: Input instance. Returns speed in mph for the HUD. */
  update(dt, input, world) {
    const fwd = input.axis('KeyS', 'KeyW');       // W accelerate, S brake/reverse
    const steerIn = input.axis('KeyA', 'KeyD');   // A left, D right
    const handbrake = input.down('Space');
    const targetSteer = steerIn * 0.55 * (this.speed >= 0 ? 1 : -1);
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    if (fwd > 0) this.speed += this.model.accel * dt;
    else if (fwd < 0) {
      if (this.speed > 0.5) this.speed -= this.model.accel * 1.6 * dt; // brake
      else this.speed -= this.model.accel * 0.55 * dt;                  // reverse
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt); // drag
    }
    if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 26 * dt);
    this.speed = Math.max(-12, Math.min(this.model.topSpeed, this.speed));
    // Steering scales with speed, fades at a standstill.
    const steerEffect = this.steer * Math.min(1, Math.abs(this.speed) / 8);
    this.angle += steerEffect * (this.speed / this.model.topSpeed) * 2.4 * dt * Math.sign(this.speed || 1);
    const nx = this.pos.x + Math.sin(this.angle) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.angle) * this.speed * dt;
    const prev = this.pos.clone();
    this.pos.x = nx; this.pos.z = nz;
    // Building collision: slide back + scrape speed off, with a thud flag.
    const hit = world.resolveCircle(this.pos, 2.0);
    if (hit) {
      const crashed = Math.abs(this.speed) > 9;
      this.speed *= 0.35;
      this.crashed = crashed;
    } else this.crashed = false;
    world.clampToWorld(this.pos, 3);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.angle;
    // Wheels: front pair steers, all spin with speed.
    const spin = (this.speed * dt) / 0.36;
    this.wheels.forEach((w, i) => {
      w.rotation.x += spin;
      if (i < 2) w.rotation.y = this.steer * 0.8;
    });
    void prev;
    return Math.abs(this.speed) * 2.23694; // mph
  }
}

export class VehicleManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.vehicles = [];
    this.spawnParkedCars();
  }

  spawnParkedCars() {
    const rngSpots = this.world.carSpawns.slice(0, 16);
    rngSpots.forEach((s, i) => {
      const model = CAR_MODELS[i % CAR_MODELS.length];
      this.vehicles.push(new Vehicle(this.scene, model, s.x, s.z, s.angle));
    });
  }

  /** Spawn a car by model name at (x,z). Builder 2: traffic + police use this. */
  spawnVehicle(modelName, x, z, angle = 0) {
    const model = CAR_MODELS.find((m) => m.name === modelName) || CAR_MODELS[0];
    const v = new Vehicle(this.scene, model, x, z, angle);
    this.vehicles.push(v);
    return v;
  }

  /** Nearest vehicle within `maxDist` of a point (for E to enter). */
  nearestTo(x, z, maxDist = 4.5) {
    let best = null, bd = maxDist * maxDist;
    for (const v of this.vehicles) {
      const d = (v.pos.x - x) ** 2 + (v.pos.z - z) ** 2;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  update(dt, input, world, activeVehicle) {
    let mph = 0;
    if (activeVehicle) mph = activeVehicle.update(dt, input, world);
    return mph;
  }
}

export { CAR_NAMES };
