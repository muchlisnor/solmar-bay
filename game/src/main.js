// main.js — Solmar Bay bootstrap: renderer, game state, systems registry, main loop.
// Core systems live here as small { name, update(dt, ctx) } objects; Builder 2 adds
// traffic/police/missions/combat via systems.js -> registerExtraSystems(game).
import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { VehicleManager } from './vehicles.js';
import { CameraRig } from './camera.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { getSaveData, saveGame, loadSaveData, applySaveData, hasSave } from './save.js';
import { registerExtraSystems } from './systems.js';
import { createGameAPI } from './api.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // drive | street | overlook | null

class Game {
  constructor() {
    this.state = 'title'; // title | playing | paused | gameover
    this.money = 250;
    this.health = 100;
    this.wanted = 0;
    this.missionStage = 0;
    this.objectiveText = 'Meet Rico at the Marina — drive or walk to the yellow marker.';
    this.lastMph = 0;
    this.elapsed = 0;
    this.framesRendered = 0;
    this.systems = [];
    this.clockMinutes = 18 * 60 + 42; // sunset: 18:42

    const canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);

    this.world = new World(this.scene);
    this.player = new Player(this.scene, this.world);
    this.vehicles = new VehicleManager(this.scene, this.world);
    this.cameraRig = new CameraRig(this.camera);
    this.hud = new HUD(this.world);
    this.input = new Input(canvas);
    this.audio = new AudioEngine();

    this.registerCoreSystems();
    registerExtraSystems(this);
    this.wireUI();
    this.wireKeys();
    window.addEventListener('resize', () => this.onResize());
    window.game = createGameAPI(this);
    window.__shotReady = false;
    window.__game = this;

    // The player's first car: a Comet parked on the road just ahead of the spawn point.
    this.starterCar = this.vehicles.spawnVehicle('Comet', -8, 0, Math.PI * 0.5);

    if (SHOT) this.stageShot(SHOT);
    this.loop(0);
  }

  // --- systems registry (Builder 2's entry point) ---
  registerSystem(sys) {
    if (!sys || typeof sys.update !== 'function' || !sys.name) throw new Error('system needs { name, update }');
    this.systems.push(sys);
  }

  registerCoreSystems() {
    this.registerSystem({
      name: 'player',
      update: (dt, g) => {
        if (g.player.inCar) { g.player.group.visible = false; return; }
        g.player.update(dt, g.input, g.cameraRig.yaw);
        g.player.health = g.health;
      },
    });
    this.registerSystem({
      name: 'vehicles',
      update: (dt, g) => {
        const car = g.player.inCar;
        g.lastMph = g.vehicles.update(dt, g.input, g.world, car);
        if (car) g.player.pos.copy(car.pos); // keep player pos (= minimap + save) synced to the car
        if (car && car.crashed) {
          g.audio.crash();
          g.takeDamage(4);
          g.hud.toast('Crash! Watch the buildings.');
        }
      },
    });
    this.registerSystem({
      name: 'camera',
      update: (dt, g) => {
        const target = g.player.inCar ? g.player.inCar.pos : g.player.pos;
        g.cameraRig.update(dt, g.input, target, !!g.player.inCar);
      },
    });
    this.registerSystem({
      name: 'mission-hook',
      update: (dt, g) => {
        // Core mission hook: reaching the Marina marker pays out once.
        if (g.missionStage === 0) {
          const dx = g.player.pos.x - g.world.missionMarker.x;
          const dz = g.player.pos.z - g.world.missionMarker.z;
          if (dx * dx + dz * dz < 64) {
            g.missionStage = 1;
            g.addMoney(500);
            g.setObjective('Rico paid you $500. Lay low — more jobs coming from the Marina.', 1);
            g.hud.toast('JOB DONE — Rico paid $500');
            g.audio.pickupBlip();
            g.saveNow();
          }
        }
      },
    });
    this.registerSystem({
      name: 'hud',
      update: (dt, g) => {
        g.hud.setHealth(g.health);
        g.hud.setMoney(g.money);
        g.hud.setWanted(g.wanted);
        g.hud.setSpeed(g.lastMph, g.player.inCar ? g.player.inCar.model.name : '', !!g.player.inCar);
        g.hud.drawMinimap(g);
        g.elapsed += dt;
        if (g.elapsed > 5) { g.elapsed = 0; g.clockMinutes = (g.clockMinutes + 1) % 1440; }
        const hh = String(Math.floor(g.clockMinutes / 60)).padStart(2, '0');
        const mm = String(g.clockMinutes % 60).padStart(2, '0');
        document.getElementById('clock').textContent = `SOLMAR BAY · ${hh}:${mm}`;
      },
    });
    this.registerSystem({
      name: 'audio',
      update: (dt, g) => {
        const car = g.player.inCar;
        g.audio.setEngineSpeed(car ? Math.abs(car.speed) / car.model.topSpeed : 0, !!car);
      },
    });
  }

  // --- state helpers (used by HUD, API, Builder 2) ---
  setWanted(n) {
    this.wanted = Math.max(0, Math.min(5, Math.round(n)));
    this.hud.setWanted(this.wanted);
    if (this.wanted >= 3) this.audio.startSiren(); else this.audio.stopSiren();
  }

  addMoney(n) { this.money = Math.max(0, this.money + n); this.hud.setMoney(this.money); }

  setObjective(text, stage) {
    this.objectiveText = text;
    if (typeof stage === 'number') this.missionStage = stage;
    this.hud.setObjective(text);
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.player.health = this.health;
    if (this.health <= 0) this.gameOver('Mara went down in the streets of Solmar Bay.');
  }

  toast(text) { this.hud.toast(text); }
  getSaveData() { return getSaveData(this); }
  loadSaveData() { const d = loadSaveData(); return d ? applySaveData(this, d) : false; }
  saveNow() { return saveGame(this); }

  gameOver(reason) {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    this.audio.setEngineSpeed(0, false);
    document.getElementById('gameover-text').textContent = reason + ' Mara dusts herself off and starts again.';
    document.getElementById('gameover-screen').classList.remove('hidden');
    this.hud.hide();
  }

  startGame() {
    this.audio.ensure();
    this.audio.click();
    if (hasSave() && !this._saveApplied) {
      this._saveApplied = true;
      if (this.loadSaveData()) this.hud.toast('Save loaded — welcome back to Solmar Bay.');
    }
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    this.hud.show();
    this.state = 'playing';
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      document.getElementById('pause-screen').classList.remove('hidden');
      this.saveNow();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      document.getElementById('pause-screen').classList.add('hidden');
    }
  }

  restart() {
    this.health = 100; this.player.health = 100;
    this.money = Math.max(250, this.money);
    this.setWanted(0);
    this.player.inCar = null;
    this.player.pos.copy(this.world.playerSpawn);
    this.player.pos.y = 0;
    this.cameraRig.snapBehind(this.player.pos, this.player.yaw);
    this.cameraRig.first = true;
    this.state = 'playing';
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    this.hud.show();
  }

  // --- enter / exit car ---
  tryEnterExitCar() {
    if (this.player.inCar) {
      const car = this.player.inCar;
      car.speed = 0;
      this.player.inCar = null;
      // Step out on the driver's side.
      const side = new THREE.Vector3(-Math.cos(car.angle), 0, Math.sin(car.angle));
      this.player.pos.copy(car.pos).addScaledVector(side, 2.2);
      this.player.pos.y = 0;
      this.player.yaw = car.angle;
      this.cameraRig.snapBehind(this.player.pos, this.player.yaw);
      this.audio.blip(440, 0.07);
    } else {
      const car = this.vehicles.nearestTo(this.player.pos.x, this.player.pos.z, 4.5);
      if (car) {
        this.player.inCar = car;
        this.player.pos.copy(car.pos);
        this.cameraRig.snapBehind(car.pos, car.angle);
        this.audio.blip(660, 0.07);
        this.hud.toast(`You took the ${car.model.name} — W to drive, Space to handbrake.`);
      } else {
        this.hud.toast('No car close enough — walk up to one and press E.');
      }
    }
  }

  wireKeys() {
    this.input.onKey = (code, down) => {
      if (!down) return;
      if (code === 'KeyE' && this.state === 'playing') this.tryEnterExitCar();
      if ((code === 'KeyP' || code === 'Escape') && (this.state === 'playing' || this.state === 'paused')) this.togglePause();
      if (code === 'KeyM') { this.audio.ensure(); this.audio.setMuted(!this.audio.muted); this.hud.toast(this.audio.muted ? 'Muted' : 'Sound on'); }
      if (code === 'KeyF' && this.player.inCar) {
        const car = this.player.inCar;
        car.setHeadlights(!car.headlights);
      }
    };
  }

  wireUI() {
    document.getElementById('start-btn').addEventListener('click', () => this.startGame());
    document.getElementById('resume-btn').addEventListener('click', () => this.togglePause());
    document.getElementById('restart-btn').addEventListener('click', () => { this.restart(); });
    document.getElementById('retry-btn').addEventListener('click', () => { this.restart(); });
    document.getElementById('quit-btn').addEventListener('click', () => {
      this.saveNow();
      this.state = 'title';
      document.getElementById('pause-screen').classList.add('hidden');
      document.getElementById('start-screen').classList.remove('hidden');
      this.hud.hide();
    });
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --- deterministic shot staging for the verifier's screenshots ---
  stageShot(shot) {
    this.audio.ensure?.();
    document.getElementById('start-screen').classList.add('hidden');
    this.hud.show();
    this.state = 'playing';
    if (shot === 'drive') {
      // Downtown, behind the wheel, wanted 2, mid-chase feel.
      const car = this.vehicles.spawnVehicle('Marina GT', 0, 40, Math.PI); // mid-road, heading north
      this.player.inCar = car;
      this.player.pos.copy(car.pos);
      this.setWanted(2);
      this.setObjective('Lose the heat — outrun the patrols and reach the Marina.', 0);
      this.cameraRig.yaw = car.angle;
      this.cameraRig.pitch = 0.3;
      car.speed = 14;
    } else if (shot === 'street') {
      // On foot on a busy downtown street, starter car beside her.
      this.player.pos.set(-6, 0, -2);
      this.player.yaw = Math.PI * 0.9;
      this.setWanted(0);
      this.cameraRig.yaw = this.player.yaw;
      this.cameraRig.pitch = 0.28;
      // Two pedestrians walking up the street ahead of her, in frame.
      if (this.peds) {
        const spots = [[-6, -14, -6, -34], [-1, -18, -1, -38]];
        this.peds.list.slice(0, 2).forEach((p, i) => {
          p.pos.set(spots[i][0], 0, spots[i][1]);
          p.group.position.copy(p.pos);
          p.target.set(spots[i][2], 0, spots[i][3]);
          p.state = 'walk';
          p.waitT = 0;
        });
      }
    } else if (shot === 'overlook') {
      // High overlook of the whole city + beach + ocean at sunset.
      this.player.pos.set(0, 0, 0);
      this.cameraRig.overlook = true;
      this.setWanted(1);
    } else if (shot === 'chase') {
      // Builder 2: full pursuit — 3 stars, Solmar PD patrols close in, traffic around.
      const car = this.vehicles.spawnVehicle('Marina GT', 0, 40, Math.PI); // mid-road, heading north
      this.player.inCar = car;
      this.player.pos.copy(car.pos);
      this.setWanted(3);
      this.setObjective('Lose the heat — three stars and Solmar PD is on your tail.', 0);
      this.cameraRig.yaw = car.angle;
      this.cameraRig.pitch = 0.3;
      car.speed = 16;
      // One patrol car ahead, in frame, lights flashing — it turns to chase.
      if (this.police) this.police.spawnCarAt(0, 12, 0);
    } else if (shot === 'mission') {
      // Builder 2: mission 2 (Three Drops) active — first package 24 m ahead,
      // close enough that its yellow beam reads in frame.
      const car = this.vehicles.spawnVehicle('Comet', 44, -64, Math.PI);
      this.player.inCar = car;
      this.player.pos.copy(car.pos);
      this.missionStage = 2;
      this.setWanted(0);
      this.cameraRig.yaw = car.angle;
      this.cameraRig.pitch = 0.3;
      car.speed = 8;
    }
    this.cameraRig.first = true;
  }

  loop = (t) => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (t - (this._lastT ?? t)) / 1000 || 0.016);
    this._lastT = t;
    if (this.state === 'playing') {
      const ctx = this;
      for (const sys of this.systems) {
        try { sys.update(dt, ctx); } catch (err) { console.error('system failed:', sys.name, err); }
      }
    } else if (this.state === 'title') {
      // Slow cinematic orbit behind the title screen.
      this.cameraRig.yaw += dt * 0.03;
      this.cameraRig.update(dt, this.input, this.player.pos, false);
    }
    this.renderer.render(this.scene, this.camera);
    this.framesRendered++;
    if (SHOT && this.framesRendered >= 3) window.__shotReady = true;
    if (!SHOT && this.state === 'playing' && this.framesRendered >= 3) window.__shotReady = true;
  };
}

new Game();
