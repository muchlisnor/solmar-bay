// world.js — Solmar Bay: procedural coastal city, roads, buildings, props, collision.
// All original: invented street names, invented skyline. No real-world map is copied.
import * as THREE from 'three';

// Deterministic RNG so the city is identical every load (screenshots stay stable).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CITY = {
  half: 242,            // city playable half-extent (m); beach + ocean beyond +x
  roadSpacing: 44,
  roadWidth: 13,
  blockSize: 31,
  bound: 258,           // hard world bound for player/cars
};

const PALETTE = [0x8a6f5c, 0xb98a5e, 0x7d8aa0, 0xc2a878, 0x9c7b8b, 0x6f8f7a, 0xd9c1a3, 0x5f6f8a, 0xe0b48f, 0xa89a8c];
const DOWNTOWN = [0x4a5a78, 0x5d6f92, 0x7a6a8a, 0x8a7a5e, 0x3f4a63];

export class World {
  constructor(scene) {
    this.scene = scene;
    this.buildings = [];   // {minX,maxX,minZ,maxZ,height,cx,cz} AABBs for collision + minimap
    this.roads = [];       // {axis:'x'|'z', at:number} road centre lines
    this.carSpawns = [];   // {x,z,angle} parked-car slots along roads
    this.pedSpawns = [];   // sidewalk wander points (Builder 2: pedestrians)
    this.missionMarker = new THREE.Vector3(196, 0, -176); // Marina dock (east edge)
    this.playerSpawn = new THREE.Vector3(-18, 0, 0); // on the road (z=0 is a road line)
    this.build(scene);
  }

  build(scene) {
    const rng = mulberry32(20261118);
    this.addSky(scene);
    this.addGround(scene);
    this.addOcean(scene);
    this.addRoads(scene);
    this.addBuildings(scene, rng);
    this.addProps(scene, rng);
    this.addMarina(scene);
    this.addSun(scene);
  }

  addSky(scene) {
    scene.background = new THREE.Color(0xffc98a); // sunset sky
    scene.fog = new THREE.Fog(0xffc98a, 260, 900);
  }

  addSun(scene) {
    const hemi = new THREE.HemisphereLight(0xffe0b3, 0x4a3a30, 1.6);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb36b, 2.8);
    sun.position.set(-140, 120, 60);
    scene.add(sun);
    // Low sun disc on the horizon (west) — pure geometry, no texture.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(26, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false })
    );
    disc.position.set(-620, 70, -260);
    disc.lookAt(0, 40, 0);
    scene.add(disc);
  }

  addGround(scene) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 1100),
      new THREE.MeshLambertMaterial({ color: 0x5c5648 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    scene.add(ground);
    // Beach sand strip on the east edge.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 560),
      new THREE.MeshLambertMaterial({ color: 0xe8cf9e })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(272, 0.02, 0);
    scene.add(sand);
  }

  addOcean(scene) {
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(320, 1100),
      new THREE.MeshLambertMaterial({ color: 0x2a7fa8 })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(470, -0.4, 0);
    scene.add(ocean);
    // A second, darker far band for depth.
    const deep = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 1100),
      new THREE.MeshLambertMaterial({ color: 0x1d5f86 })
    );
    deep.rotation.x = -Math.PI / 2;
    deep.position.set(760, -0.6, 0);
    scene.add(deep);
  }

  roadLines() {
    const lines = [];
    for (let v = -220; v <= 220; v += CITY.roadSpacing) lines.push(v);
    return lines;
  }

  addRoads(scene) {
    const lines = this.roadLines();
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x46464f });
    const walkMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
    for (const v of lines) {
      this.roads.push({ axis: 'x', at: v });
      this.roads.push({ axis: 'z', at: v });
      const rx = new THREE.Mesh(new THREE.PlaneGeometry(500, CITY.roadWidth), roadMat);
      rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0.05, v); scene.add(rx);
      const rz = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, 500), roadMat);
      rz.rotation.x = -Math.PI / 2; rz.position.set(v, 0.05, 0); scene.add(rz);
      // Sidewalks flanking each road.
      const sw = CITY.roadWidth / 2 + 2.5;
      const sx = new THREE.Mesh(new THREE.PlaneGeometry(500, 5), walkMat);
      sx.rotation.x = -Math.PI / 2; sx.position.set(0, 0.06, v + sw); scene.add(sx);
      const sz = new THREE.Mesh(new THREE.PlaneGeometry(5, 500), walkMat);
      sz.rotation.x = -Math.PI / 2; sz.position.set(v + sw, 0.06, 0); scene.add(sz);
      // Dashed centre line (cheap: thin pale boxes every 8 m).
      for (let d = -240; d <= 240; d += 16) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(4, 0.08, 0.5), new THREE.MeshBasicMaterial({ color: 0xd8d8c8 }));
        dash.position.set(d, 0.09, v); scene.add(dash);
        const dash2 = dash.clone(); dash2.rotation.y = Math.PI / 2; dash2.position.set(v, 0.09, d); scene.add(dash2);
      }
    }
  }

  addBuildings(scene, rng) {
    const lines = this.roadLines();
    const spots = [];
    for (let i = 0; i < lines.length - 1; i++) {
      for (let j = 0; j < lines.length - 1; j++) {
        const cx = (lines[i] + lines[i + 1]) / 2;
        const cz = (lines[j] + lines[j + 1]) / 2;
        // Skip the block east of the beach road and the marina plaza.
        if (cx > 200) continue;
        if (Math.abs(cx - 196) < 30 && Math.abs(cz + 176) < 30) continue;
        spots.push({ cx, cz });
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length * 4); // up to 2 buildings + 2 rooftops per block
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    let n = 0;
    for (const s of spots) {
      const distC = Math.hypot(s.cx, s.cz);
      const downtown = distC < 95;
      // 1-2 buildings per block, offset inside the block.
      const count = downtown ? 2 : (rng() < 0.55 ? 2 : 1);
      for (let k = 0; k < count; k++) {
        const w = 12 + rng() * 12;
        const d = 12 + rng() * 12;
        const h = downtown ? 22 + rng() * 55 : 7 + rng() * 16;
        const ox = (rng() - 0.5) * (CITY.blockSize - w - 8); // keep >=4 m clear of the block edge
        const oz = (rng() - 0.5) * (CITY.blockSize - d - 8);
        const x = s.cx + ox, z = s.cz + oz;
        m4.compose(new THREE.Vector3(x, h / 2, z), q, new THREE.Vector3(w, h, d));
        mesh.setMatrixAt(n, m4);
        const pal = downtown ? DOWNTOWN : PALETTE;
        col.setHex(pal[Math.floor(rng() * pal.length)]);
        col.offsetHSL(0, 0, (rng() - 0.5) * 0.08);
        mesh.setColorAt(n, col);
        this.buildings.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h, cx: x, cz: z, w, d });
        n++;
        // Rooftop box on tall towers.
        if (h > 30 && rng() < 0.7) {
          const rw = w * 0.3;
          m4.compose(new THREE.Vector3(x, h + 1.2, z), q, new THREE.Vector3(rw, 2.4, rw));
          mesh.setMatrixAt(n, m4);
          col.setHex(0x3a3a40); mesh.setColorAt(n, col);
          n++;
        }
      }
      // Parked-car slots on the road, hugging the curb; pedestrian points on the sidewalk.
      const curbX = s.cx - CITY.roadSpacing / 2 + 4;
      const curbZ = s.cz - CITY.roadSpacing / 2 + 4;
      if (rng() < 0.75) this.carSpawns.push({ x: curbX, z: s.cz, angle: 0 });
      if (rng() < 0.5) this.carSpawns.push({ x: s.cx, z: curbZ, angle: Math.PI / 2 });
      this.pedSpawns.push({ x: s.cx - 13, z: s.cz });
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }

  addProps(scene, rng) {
    // Streetlights: instanced poles + glowing heads, along every road.
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2b2b30 });
    const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const spots = [];
    for (const v of this.roadLines()) {
      for (let d = -220; d <= 220; d += 44) {
        spots.push([d, v + CITY.roadWidth / 2 + 1.2]);
        spots.push([v + CITY.roadWidth / 2 + 1.2, d]);
      }
    }
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      m4.makeTranslation(x, 3.5, z); poles.setMatrixAt(i, m4);
      m4.makeTranslation(x, 7.1, z); heads.setMatrixAt(i, m4);
    });
    scene.add(poles); scene.add(heads);
    // Palm trees along the beach road and the marina boulevard.
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
    const leafGeo = new THREE.ConeGeometry(2.6, 3.2, 7);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
    const palms = [];
    for (let z = -230; z <= 230; z += 28) palms.push([228, z]);
    for (let x = -200; x <= 180; x += 44) palms.push([x, -198]);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palms.length);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, palms.length);
    palms.forEach(([x, z], i) => {
      m4.makeTranslation(x, 3, z); trunks.setMatrixAt(i, m4);
      m4.makeTranslation(x, 7.4, z); leaves.setMatrixAt(i, m4);
    });
    scene.add(trunks); scene.add(leaves);
    // Traffic lights at downtown intersections.
    const tlMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x30ff70 });
    for (const vx of [-44, 0, 44]) {
      for (const vz of [-44, 0, 44]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4), tlMat);
        post.position.set(vx + 8, 2.5, vz + 8); scene.add(post);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), tlMat);
        lamp.position.set(vx + 8, 5.4, vz + 8); scene.add(lamp);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lampMat);
        glow.position.set(vx + 8, 5.8, vz + 8.4); scene.add(glow);
      }
    }
    // Benches on the marina plaza.
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 1), benchMat);
      b.position.set(186 + i * 5, 0.6, -168);
      scene.add(b);
    }
    void rng;
  }

  addMarina(scene) {
    // Marina pier + docked boats (simple hulls) at the east edge.
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(30, 1, 8), pierMat);
    pier.position.set(240, 0.5, -176); scene.add(pier);
    const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    const hullMat2 = new THREE.MeshLambertMaterial({ color: 0xd94f3d });
    [[252, -160, hullMat], [252, -186, hullMat2], [258, -172, hullMat]].forEach(([x, z, m]) => {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 3.4), m);
      hull.position.set(x, 0.6, z); scene.add(hull);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 2.4), new THREE.MeshLambertMaterial({ color: 0x2a4a6a }));
      cab.position.set(x - 1, 2.2, z); scene.add(cab);
    });
    // Mission marker beacon: tall glowing pillar, visible across the city.
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 60, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.35 })
    );
    beacon.position.set(this.missionMarker.x, 30, this.missionMarker.z);
    scene.add(beacon);
    this.beacon = beacon;
  }

  // --- Collision helpers (Builder 2 uses these for traffic, peds, police) ---
  /** Push a circle (x,z,r) out of every building AABB. Returns true if it hit anything. */
  resolveCircle(pos, r) {
    let hit = false;
    for (const b of this.buildings) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          // Centre inside the box: push out along the smallest penetration axis.
          const pl = pos.x - b.minX, pr = b.maxX - pos.x, pt = pos.z - b.minZ, pb = b.maxZ - pos.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) pos.x = b.minX - r; else if (m === pr) pos.x = b.maxX + r;
          else if (m === pt) pos.z = b.minZ - r; else pos.z = b.maxZ + r;
        }
      }
    }
    return hit;
  }

  /** True if point (x,z) is on a road (within half road width of a road line). */
  isOnRoad(x, z) {
    const hw = CITY.roadWidth / 2;
    for (const v of this.roadLines()) {
      if (Math.abs(z - v) < hw || Math.abs(x - v) < hw) return true;
    }
    return false;
  }

  /** Clamp a position inside the playable world (beach edge + ocean stops at +x). */
  clampToWorld(pos, margin = 2) {
    const b = CITY.bound;
    pos.x = Math.max(-b, Math.min(b + 6, pos.x)); // +x lets the player reach the sand
    pos.z = Math.max(-b, Math.min(b, pos.z));
  }

  /** Nearest parked-car slot to a point, for spawning the player's first car. */
  nearestCarSpawn(x, z) {
    let best = this.carSpawns[0], bd = Infinity;
    for (const s of this.carSpawns) {
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
}
