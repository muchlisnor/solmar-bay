// player.js — Mara Voss on foot: third-person low-poly figure, walk/run/jump.
import * as THREE from 'three';

export class Player {
  constructor(scene, world) {
    this.world = world;
    this.pos = world.playerSpawn.clone();
    this.yaw = Math.PI * 0.75;   // facing down the street
    this.velY = 0;
    this.onGround = true;
    this.walkSpeed = 6;
    this.runSpeed = 10.5;
    this.health = 100;
    this.inCar = null;           // Vehicle instance or null
    this.walkPhase = 0;
    this.group = this.buildFigure(scene);
  }

  buildFigure(scene) {
    const g = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5e });
    const jacket = new THREE.MeshLambertMaterial({ color: 0xd94f3d }); // red jacket
    const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3a5c });
    const hair = new THREE.MeshLambertMaterial({ color: 0x1c1210 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.34), jacket);
    body.position.y = 1.28; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skin);
    head.position.y = 1.95; g.add(head);
    const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.44), hair);
    hairM.position.y = 2.18; g.add(hairM);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.26), jeans);
    legL.position.set(-0.17, 0.43, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.17; g.add(legR);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.2), jacket);
    armL.position.set(-0.42, 1.3, 0); g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
    this.legL = legL; this.legR = legR; this.armL = armL; this.armR = armR;
    g.position.copy(this.pos);
    scene.add(g);
    return g;
  }

  /** Move on foot. input: Input instance. dt seconds. Returns speed (m/s). */
  update(dt, input, camYaw) {
    if (this.inCar) { this.group.visible = false; return 0; }
    this.group.visible = true;
    const fwd = input.axis('KeyS', 'KeyW');
    const strafe = input.axis('KeyA', 'KeyD');
    const running = input.down('ShiftLeft', 'ShiftRight');
    const speed = running ? this.runSpeed : this.walkSpeed;
    let mx = 0, mz = 0;
    if (fwd !== 0 || strafe !== 0) {
      // Movement is relative to the camera yaw, so WASD always feels right.
      // Camera forward on the ground is (sin yaw, cos yaw); right is (-cos yaw, sin yaw).
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      mx = (sin * fwd - cos * strafe);
      mz = (cos * fwd + sin * strafe);
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      this.yaw = Math.atan2(mx, mz);
      this.walkPhase += dt * speed * 1.6;
    }
    this.pos.x += mx * speed * dt;
    this.pos.z += mz * speed * dt;
    // Jump + gravity.
    if (input.down('Space') && this.onGround) { this.velY = 7.5; this.onGround = false; }
    if (!this.onGround) {
      this.velY -= 22 * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.velY = 0; this.onGround = true; }
    }
    this.world.resolveCircle(this.pos, 0.55);
    this.world.clampToWorld(this.pos);
    // Pose: swing limbs while moving, face travel direction.
    const swing = (fwd !== 0 || strafe !== 0) ? Math.sin(this.walkPhase) * 0.7 : 0;
    this.legL.rotation.x = swing; this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8; this.armR.rotation.x = swing * 0.8;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    return (fwd !== 0 || strafe !== 0) ? speed : 0;
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    return this.health;
  }

  heal(amount) { this.health = Math.min(100, this.health + amount); }
}
