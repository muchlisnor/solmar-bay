// save.js — localStorage save/load. Tiny, versioned, no network.
const KEY = 'solmar-bay-save-v1';

export function getSaveData(game) {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    player: { x: game.player.pos.x, z: game.player.pos.z, yaw: game.player.yaw },
    money: game.money,
    health: game.health,
    wanted: game.wanted,
    mission: game.missionStage || 0,
    objective: game.objectiveText || '',
  };
}

export function saveGame(game) {
  try {
    localStorage.setItem(KEY, JSON.stringify(getSaveData(game)));
    return true;
  } catch { return false; }
}

export function loadSaveData() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function applySaveData(game, data) {
  if (!data || data.version !== 1) return false;
  if (data.player) {
    game.player.pos.x = data.player.x ?? game.player.pos.x;
    game.player.pos.z = data.player.z ?? game.player.z;
    game.player.yaw = data.player.yaw ?? 0;
  }
  if (typeof data.money === 'number') game.money = data.money;
  if (typeof data.health === 'number') game.health = data.health;
  if (typeof data.wanted === 'number') game.setWanted(data.wanted);
  if (typeof data.mission === 'number') game.missionStage = data.mission;
  return true;
}

export function hasSave() { return loadSaveData() !== null; }
