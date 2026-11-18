// api.js — the public window.game API Builder 2 (and the verifier) use.
// Every function here is safe to call from any system or from the console.
export function createGameAPI(game) {
  return {
    // --- state ---
    getState: () => ({
      state: game.state,
      money: game.money,
      health: game.health,
      wanted: game.wanted,
      missionStage: game.missionStage,
      objective: game.objectiveText,
      player: { x: game.player.pos.x, y: game.player.pos.y, z: game.player.pos.z, yaw: game.player.yaw },
      driving: !!game.player.inCar,
      car: game.player.inCar ? game.player.inCar.model.name : null,
      speedMph: game.lastMph || 0,
      cars: game.vehicles.vehicles.length,
      buildings: game.world.buildings.length,
    }),
    // --- wanted level (display only in core; police logic lands in Builder 2) ---
    setWanted: (n) => game.setWanted(n),
    getWanted: () => game.wanted,
    // --- money / health ---
    addMoney: (n) => game.addMoney(n),
    setHealth: (h) => { game.health = Math.max(0, Math.min(100, h)); game.player.health = game.health; },
    // --- objectives / missions hook ---
    setObjective: (text, stage) => game.setObjective(text, stage),
    // --- vehicles ---
    spawnVehicle: (modelName, x, z, angle) => game.vehicles.spawnVehicle(modelName, x, z, angle),
    nearestVehicle: (x, z, maxDist) => game.vehicles.nearestTo(x, z, maxDist),
    // --- save ---
    getSaveData: () => game.getSaveData(),
    loadSaveData: () => game.loadSaveData(),
    save: () => game.saveNow(),
    // --- systems registry (Builder 2) ---
    registerSystem: (sys) => game.registerSystem(sys),
    systems: () => game.systems.map((s) => s.name),
    // --- misc ---
    toast: (text) => game.hud.toast(text),
    gameOver: (reason) => game.gameOver(reason),
    teleport: (x, z) => {
      game.player.pos.set(x, 0, z);
      if (game.player.inCar) { game.player.inCar.pos.set(x, 0, z); }
    },
    world: game.world,
    player: game.player,
    vehicles: game.vehicles,
    version: 'solmar-bay-core-1.0',
  };
}
