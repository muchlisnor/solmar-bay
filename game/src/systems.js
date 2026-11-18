// systems.js — EXTENSION POINT for Builder 2 (traffic, police, missions, combat).
// main.js imports this file and calls registerExtraSystems(game) after the core
// systems are registered. Each extra system is one file, one job:
//   effects      — particles, skids, dust, shake, damage flash
//   traffic      — moving AI cars on the road grid
//   pedestrians  — walking city folk who flee and get run over
//   police       — wanted level, Solmar PD patrols + officers, BUSTED
//   combat       — fists, pistol, ammo, health regen
//   missions     — story chain, taxi fares, checkpoint runs
//
// A system is { name: string, update(dt, ctx) } where ctx is the game object:
//   ctx.player, ctx.vehicles (VehicleManager), ctx.world, ctx.cameraRig,
//   ctx.hud, ctx.audio, ctx.input, ctx.money, ctx.health, ctx.wanted,
//   ctx.setWanted(n), ctx.addMoney(n), ctx.toast(text), ctx.gameOver(reason)
// Systems run every frame while state === 'playing', in registration order.
// Keep each system cheap: SwiftShader software WebGL punishes heavy per-frame work.
import { createEffectsSystem } from './effects.js';
import { createTrafficSystem } from './traffic.js';
import { createPedestriansSystem } from './pedestrians.js';
import { createPoliceSystem } from './police.js';
import { createCombatSystem } from './combat.js';
import { createMissionsSystem } from './missions.js';

export function registerExtraSystems(game) {
  game.registerSystem(createEffectsSystem(game));
  game.registerSystem(createTrafficSystem(game));
  game.registerSystem(createPedestriansSystem(game));
  game.registerSystem(createPoliceSystem(game));
  game.registerSystem(createCombatSystem(game));
  game.registerSystem(createMissionsSystem(game));
}
