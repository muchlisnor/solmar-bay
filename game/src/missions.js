// missions.js — story chain + side activities, data-driven from MISSIONS.
// Chain (builds on the core Marina hook, stage 0 -> 1, $500 from Rico):
//   1 Getaway      — steal a fast car, reach the South Docks while wanted >= 2
//   2 Three Drops  — collect 3 packages for Rico around the city
//   3 Lose the Heat— shake a 3-star wanted level
//   4 Showdown     — run Vance Kroll's car off the road
//   5 Free roam    — taxi fares (T) and timed checkpoint runs (C) keep paying
import * as THREE from 'three';

const MISSIONS = [
  {
    stage: 1, id: 'getaway', title: 'Getaway',
    objective: 'Steal a fast car and reach the South Docks drop-off — PD is already looking for you.',
    payout: 800, type: 'reach', target: { x: -176, z: 176 },
  },
  {
    stage: 2, id: 'packages', title: 'Three Drops',
    objective: 'Collect 3 packages for Rico — follow the yellow marker.',
    payout: 600, type: 'packages',
    spots: [{ x: 44, z: -88 }, { x: -132, z: 44 }, { x: 88, z: 132 }],
  },
  {
    stage: 3, id: 'lose-heat', title: 'Lose the Heat',
    objective: 'Lose the 3-star wanted level — stay out of sight until the stars fade.',
    payout: 1000, type: 'lose-heat',
  },
  {
    stage: 4, id: 'showdown', title: 'Showdown with Vance',
    objective: "Run Vance Kroll off the road — stay on his tail and ram his car, or shoot it out.",
    payout: 2500, type: 'boss',
  },
  {
    stage: 5, id: 'free', title: 'Free Roam',
    objective: 'Solmar Bay is yours. Taxi fares (T) and checkpoint runs (C) pay cash.',
    payout: 0, type: 'free',
  },
];

const SAVE_KEY = 'solmar-bay-missions-v1';

function buildPackageMesh(scene, x, z) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  box.position.y = 0.9;
  g.add(box);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 14, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.3 }),
  );
  beam.position.y = 7;
  g.add(beam);
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}

function buildBossCar(scene) {
  const g = new THREE.Group();
  const black = new THREE.MeshLambertMaterial({ color: 0x14141a });
  const gold = new THREE.MeshLambertMaterial({ color: 0xd8a020 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2836 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), black);
  body.position.y = 0.55;
  g.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 4.42), gold);
  stripe.position.y = 0.88;
  g.add(stripe);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass);
  cabin.position.set(0, 1.12, -0.2);
  g.add(cabin);
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 8), tyre);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
  }
  scene.add(g);
  return g;
}

function buildCheckpointMesh(scene, x, z, color) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 9, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
  );
  m.position.set(x, 4.5, z);
  scene.add(m);
  return m;
}

function roadPoint(world, cx, cz, minD, maxD) {
  const lines = world.roadLines();
  for (let tries = 0; tries < 30; tries++) {
    const x = lines[Math.floor(Math.random() * lines.length)];
    const z = lines[Math.floor(Math.random() * lines.length)];
    const d = Math.hypot(x - cx, z - cz);
    if (d >= minD && d <= maxD) return { x, z };
  }
  return { x: 0, z: 0 };
}

export function createMissionsSystem(game) {
  const world = game.world;
  let configuredStage = -1;
  let cur = null;
  let packages = [];   // {mesh, x, z, taken}
  let collected = 0;
  let loseHeatArmed = false;
  let boss = null;     // {mesh, pos, angle, speed, health, touchT, repathT, target}
  let taxi = null;     // {phase:'pickup'|'drop', x, z, fare}
  let run = null;      // {points:[{x,z}], idx, timeLeft, mesh}
  let savedMarker = null;

  // Restore package progress from the missions save (stage is in the core save).
  let savedProgress = { collected: 0 };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) savedProgress = JSON.parse(raw);
  } catch { /* fresh start */ }

  function persistPackages() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ collected })); } catch { /* ignore */ }
  }

  function clearPackages() {
    for (const p of packages) game.scene.remove(p.mesh);
    packages = [];
  }

  function clearBoss() {
    if (boss) { game.scene.remove(boss.mesh); boss = null; }
  }

  function clearRun() {
    if (run && run.mesh) game.scene.remove(run.mesh);
    run = null;
  }

  function restoreMarker() {
    if (savedMarker) {
      world.missionMarker.set(savedMarker.x, 0, savedMarker.z);
      savedMarker = null;
    } else if (cur && cur.target) {
      world.missionMarker.set(cur.target.x, 0, cur.target.z);
    }
  }

  function missionTarget() {
    if (!cur) return null;
    if (cur.type === 'reach') return cur.target;
    if (cur.type === 'packages') {
      const next = packages.find((p) => !p.taken);
      return next ? { x: next.x, z: next.z } : null;
    }
    if (cur.type === 'boss' && boss) return { x: boss.pos.x, z: boss.pos.z };
    return null;
  }

  function pointMarkerAt(t) {
    if (t) world.missionMarker.set(t.x, 0, t.z);
  }

  function complete(g) {
    const m = cur;
    if (!m) return;
    if (m.payout > 0) g.addMoney(m.payout);
    g.hud.toast(`${m.title} — DONE! +$${m.payout}`);
    g.audio.pickupBlip();
    g.effects?.sparkle(new THREE.Vector3(g.player.pos.x, 1.5, g.player.pos.z));
    const next = m.stage + 1;
    g.setObjective(MISSIONS.find((x) => x.stage === next)?.objective || m.objective, next);
    g.saveNow();
  }

  function configure(g, stage) {
    configuredStage = stage;
    cur = MISSIONS.find((m) => m.stage === stage) || null;
    clearPackages();
    clearBoss();
    collected = 0;
    loseHeatArmed = false;
    if (!cur) return;
    if (cur.type === 'reach') {
      pointMarkerAt(cur.target);
      g.setObjective(cur.objective, stage);
      if (g.wanted < 2) g.setWanted(2);
      g.hud.toast('New job from Rico: Getaway');
    } else if (cur.type === 'packages') {
      collected = Math.min(savedProgress.collected || 0, cur.spots.length);
      packages = cur.spots.map((s, i) => {
        const mesh = buildPackageMesh(game.scene, s.x, s.z);
        const taken = i < collected;
        mesh.visible = !taken;
        return { mesh, x: s.x, z: s.z, taken };
      });
      pointMarkerAt(missionTarget());
      g.setObjective(cur.objective, stage);
      g.hud.toast('New job from Rico: Three Drops');
      if (collected >= packages.length) {
        // Restored progress says every package is already collected (a prior
        // session saved the count but the stage was reset): finish the job.
        complete(g);
        return;
      }
    } else if (cur.type === 'lose-heat') {
      g.setWanted(3);
      loseHeatArmed = true;
      g.setObjective(cur.objective, stage);
      g.hud.toast('New job from Rico: Lose the Heat');
    } else if (cur.type === 'boss') {
      const pp = g.player.pos;
      const a = Math.random() * Math.PI * 2;
      const mesh = buildBossCar(game.scene);
      boss = {
        mesh, pos: mesh.position,
        angle: 0, speed: 0, health: 100, touchT: 0, repathT: 0,
        target: new THREE.Vector3(pp.x + Math.sin(a) * 40, 0, pp.z + Math.cos(a) * 40),
      };
      boss.pos.set(pp.x + Math.sin(a) * 30, 0, pp.z + Math.cos(a) * 30);
      mesh.userData.owner = { kind: 'boss', ref: boss };
      g.setObjective(cur.objective, stage);
      g.hud.toast('Vance Kroll is running — catch him!');
    } else if (cur.type === 'free') {
      world.missionMarker.set(196, 0, -176); // back to the Marina
      g.setObjective(cur.objective, stage);
      g.hud.toast('Story complete — Solmar Bay is yours.');
    }
  }

  function damageBoss(n) {
    if (!boss) return;
    boss.health -= n;
    game.effects?.sparks(new THREE.Vector3(boss.pos.x, 1, boss.pos.z));
    if (boss.health <= 0) {
      game.effects?.burst(new THREE.Vector3(boss.pos.x, 1, boss.pos.z), 0xffa030, 24, 9, 5, 10);
      game.effects?.shake(0.7);
      complete(game);
    }
  }

  function startTaxi(g) {
    if (taxi) {
      taxi = null;
      restoreMarker();
      g.setObjective(cur ? cur.objective : '', game.missionStage);
      g.hud.toast('Taxi job cancelled.');
      return;
    }
    const pp = g.player.pos;
    const pick = roadPoint(world, pp.x, pp.z, 35, 80);
    savedMarker = { x: world.missionMarker.x, z: world.missionMarker.z };
    taxi = { phase: 'pickup', x: pick.x, z: pick.z, fare: 120 + Math.floor(Math.random() * 140) };
    pointMarkerAt(taxi);
    g.setObjective(`Taxi: pick up the fare at the marker ($${taxi.fare}).`, game.missionStage);
    g.hud.toast('Taxi fare waiting — drive to the marker.');
  }

  function startRun(g) {
    if (run) {
      clearRun();
      restoreMarker();
      g.setObjective(cur ? cur.objective : '', game.missionStage);
      g.hud.toast('Checkpoint run cancelled.');
      return;
    }
    const pp = g.player.pos;
    const points = [];
    let cx = pp.x, cz = pp.z;
    for (let i = 0; i < 4; i++) {
      const p = roadPoint(world, cx, cz, 55, 110);
      points.push(p);
      cx = p.x; cz = p.z;
    }
    savedMarker = { x: world.missionMarker.x, z: world.missionMarker.z };
    run = { points, idx: 0, timeLeft: 75, mesh: buildCheckpointMesh(game.scene, points[0].x, points[0].z, 0x35e0ff) };
    pointMarkerAt(points[0]);
    g.setObjective('Checkpoint run: hit all 4 gates in 75 seconds!', game.missionStage);
    g.hud.toast('Checkpoint run started — 75 seconds!');
  }

  const missions = { damageBoss, get boss() { return boss; }, get taxi() { return taxi; }, get run() { return run; } };
  game.missions = missions;

  // Side-activity keys are event-driven (not polled): at ~1-2 fps under
  // SwiftShader a short tap can fall between frames, so the edge is caught
  // on the event itself. T = taxi fare, C = checkpoint run (in a car).
  window.addEventListener('keydown', (e) => {
    if (e.repeat || game.state !== 'playing' || !game.player.inCar) return;
    if (e.code === 'KeyT') startTaxi(game);
    else if (e.code === 'KeyC') startRun(game);
  });

  return {
    name: 'missions',
    update(dt, g) {
      // Stage changed (core hook, save load, or a completion): configure it.
      if (g.missionStage !== configuredStage) configure(g, g.missionStage);
      const pp = g.player.pos;

      // --- taxi fare ---
      if (taxi) {
        const d = Math.hypot(pp.x - taxi.x, pp.z - taxi.z);
        if (d < 7) {
          if (taxi.phase === 'pickup') {
            const dest = roadPoint(world, taxi.x, taxi.z, 120, 220);
            taxi.phase = 'drop';
            taxi.x = dest.x; taxi.z = dest.z;
            pointMarkerAt(taxi);
            g.setObjective(`Taxi: drop the fare off at the marker ($${taxi.fare}).`, g.missionStage);
            g.hud.toast('Fare on board — drive to the drop-off.');
            g.audio.pickupBlip();
          } else {
            g.addMoney(taxi.fare);
            g.hud.toast(`Fare paid — +$${taxi.fare}`);
            g.audio.pickupBlip();
            g.effects?.sparkle(new THREE.Vector3(pp.x, 1.5, pp.z));
            taxi = null;
            restoreMarker();
            g.setObjective(cur ? cur.objective : '', g.missionStage);
          }
        }
      }

      // --- checkpoint run ---
      if (run) {
        run.timeLeft -= dt;
        const p = run.points[run.idx];
        const d = Math.hypot(pp.x - p.x, pp.z - p.z);
        if (d < 5) {
          g.addMoney(50);
          g.audio.pickupBlip();
          g.effects?.sparkle(new THREE.Vector3(p.x, 2, p.z));
          run.idx++;
          if (run.idx >= run.points.length) {
            g.addMoney(400);
            g.hud.toast('Checkpoint run complete! +$400 bonus');
            clearRun();
            restoreMarker();
            g.setObjective(cur ? cur.objective : '', g.missionStage);
            g.saveNow();
          } else {
            game.scene.remove(run.mesh);
            run.mesh = buildCheckpointMesh(game.scene, run.points[run.idx].x, run.points[run.idx].z, 0x35e0ff);
            pointMarkerAt(run.points[run.idx]);
            g.hud.toast(`Gate ${run.idx + 1}/4 — +$50 (${Math.ceil(run.timeLeft)}s left)`);
          }
        } else if (run.timeLeft <= 0) {
          g.hud.toast('Checkpoint run failed — out of time.');
          clearRun();
          restoreMarker();
          g.setObjective(cur ? cur.objective : '', g.missionStage);
        }
      }

      if (!cur) return;

      // --- story missions ---
      if (cur.type === 'reach') {
        const d = Math.hypot(pp.x - cur.target.x, pp.z - cur.target.z);
        if (d < 9) complete(g);
      } else if (cur.type === 'packages') {
        for (const p of packages) {
          if (p.taken) continue;
          const d = Math.hypot(pp.x - p.x, pp.z - p.z);
          if (d < 3.5) {
            p.taken = true;
            p.mesh.visible = false;
            collected++;
            persistPackages();
            g.addMoney(150);
            g.audio.pickupBlip();
            g.effects?.sparkle(new THREE.Vector3(p.x, 1.5, p.z));
            pointMarkerAt(missionTarget());
            if (collected >= packages.length) {
              complete(g);
            } else {
              g.hud.toast(`Package ${collected}/3 collected — +$150`);
            }
            break;
          }
        }
      } else if (cur.type === 'lose-heat') {
        if (loseHeatArmed && g.wanted === 0) complete(g);
      } else if (cur.type === 'boss' && boss) {
        // Vance flees from the player, steering around the city.
        const dx = boss.pos.x - pp.x, dz = boss.pos.z - pp.z;
        const dist = Math.hypot(dx, dz);
        boss.repathT -= dt;
        if (boss.repathT <= 0 || Math.hypot(boss.target.x - boss.pos.x, boss.target.z - boss.pos.z) < 12) {
          boss.repathT = 2.5;
          const a = Math.atan2(dx, dz) + (Math.random() - 0.5) * 1.2;
          boss.target.set(
            Math.max(-230, Math.min(230, boss.pos.x + Math.sin(a) * 90)),
            0,
            Math.max(-230, Math.min(230, boss.pos.z + Math.cos(a) * 90)),
          );
        }
        const tx = boss.target.x - boss.pos.x, tz = boss.target.z - boss.pos.z;
        const desired = Math.atan2(tx, tz);
        let dA = desired - boss.angle;
        while (dA > Math.PI) dA -= Math.PI * 2;
        while (dA < -Math.PI) dA += Math.PI * 2;
        boss.angle += Math.max(-2.2 * dt, Math.min(2.2 * dt, dA));
        const targetSpeed = dist < 25 ? 26 : 22;
        boss.speed += Math.max(-12 * dt, Math.min(9 * dt, targetSpeed - boss.speed));
        boss.pos.x += Math.sin(boss.angle) * boss.speed * dt;
        boss.pos.z += Math.cos(boss.angle) * boss.speed * dt;
        world.resolveCircle(boss.pos, 2.0);
        world.clampToWorld(boss.pos, 3);
        boss.mesh.position.copy(boss.pos);
        boss.mesh.rotation.y = boss.angle;
        pointMarkerAt({ x: boss.pos.x, z: boss.pos.z });
        // Stay on his tail to run him off the road.
        if (dist < 7) {
          boss.touchT += dt;
          if (Math.random() < dt * 6) g.effects?.sparks(new THREE.Vector3(boss.pos.x, 1, boss.pos.z));
          if (boss.touchT >= 3) {
            g.effects?.burst(new THREE.Vector3(boss.pos.x, 1, boss.pos.z), 0xffa030, 24, 9, 5, 10);
            g.effects?.shake(0.7);
            complete(g);
          }
        } else boss.touchT = Math.max(0, boss.touchT - dt * 0.5);
      }
    },
  };
}
