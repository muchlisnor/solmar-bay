// camera.js — third-person orbit camera with smoothing; chase cam while driving.
import * as THREE from 'three';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI * 0.75;
    this.pitch = 0.32;
    this.distance = 9;
    this.smoothed = new THREE.Vector3();
    this.first = true;
    this.overlook = false; // shot mode: high static overlook
  }

  /** dt, target Vector3 (player or car), driving bool. */
  update(dt, input, target, driving) {
    const drag = input.consumeDrag();
    this.yaw += drag.yaw;
    this.pitch = Math.max(-0.15, Math.min(0.9, this.pitch + drag.pitch));
    if (this.overlook) {
      this.camera.position.set(target.x - 90, 130, target.z + 130);
      this.camera.lookAt(target.x, 0, target.z);
      return;
    }
    const dist = driving ? 12 : 8.5;
    const height = driving ? 4.6 : 3.4;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const off = new THREE.Vector3(
      -Math.sin(this.yaw) * cp * dist,
      height + sp * dist * 0.6,
      -Math.cos(this.yaw) * cp * dist
    );
    const desired = target.clone().add(off);
    if (this.first) { this.smoothed.copy(desired); this.first = false; }
    const k = 1 - Math.exp(-dt * (driving ? 7 : 10));
    this.smoothed.lerp(desired, k);
    this.camera.position.copy(this.smoothed);
    const look = target.clone(); look.y += driving ? 1.2 : 1.6;
    this.camera.lookAt(look);
  }

  /** Snap behind the player (used on entering a car / shot staging). */
  snapBehind(target, yaw) {
    this.yaw = yaw;
    this.first = true;
  }
}
