// hud.js — HUD DOM (health, money, wanted stars, speed, objective) + 2D minimap.
export class HUD {
  constructor(world) {
    this.world = world;
    this.el = {
      hud: document.getElementById('hud'),
      healthFill: document.getElementById('health-fill'),
      money: document.getElementById('money-val'),
      stars: document.querySelectorAll('#wanted .star'),
      speedo: document.getElementById('speedo'),
      speed: document.getElementById('speed-val'),
      carName: document.getElementById('car-name'),
      objective: document.getElementById('objective-text'),
      toast: document.getElementById('toast'),
      map: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.map.getContext('2d');
    this.toastTimer = null;
    this.lastMoney = -1;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  setHealth(h) {
    this.el.healthFill.style.width = `${Math.max(0, Math.min(100, h))}%`;
    this.el.healthFill.classList.toggle('low', h <= 30);
  }

  setMoney(m) {
    if (m === this.lastMoney) return;
    this.lastMoney = m;
    this.el.money.textContent = m.toLocaleString('en-US');
  }

  setWanted(n) {
    this.el.stars.forEach((s, i) => s.classList.toggle('lit', i < n));
  }

  setObjective(text) { this.el.objective.textContent = text; }

  setSpeed(mph, carName, driving) {
    this.el.speedo.classList.toggle('hidden', !driving);
    if (driving) {
      this.el.speed.textContent = Math.round(mph);
      this.el.carName.textContent = carName || '';
    }
  }

  toast(text, ms = 2600) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), ms);
  }

  /** Top-down minimap: roads, buildings, beach, mission marker, cars, player arrow. */
  drawMinimap(game) {
    const ctx = this.mapCtx, S = 180, C = S / 2;
    const scale = S / 560; // world -280..280 maps to the disc
    const px = (x) => C + x * scale;
    const pz = (z) => C + z * scale;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.clip();
    // Ground + ocean.
    ctx.fillStyle = '#233026'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#2a7fa8'; ctx.fillRect(px(242), 0, S, S);
    ctx.fillStyle = '#e8cf9e'; ctx.fillRect(px(236), 0, px(242) - px(236), S);
    // Buildings.
    ctx.fillStyle = '#5a6a80';
    for (const b of this.world.buildings) {
      ctx.fillRect(px(b.minX), pz(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
    }
    // Roads.
    ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = 13 * scale;
    for (const r of this.world.roads) {
      ctx.beginPath();
      if (r.axis === 'x') { ctx.moveTo(0, pz(r.at)); ctx.lineTo(S, pz(r.at)); }
      else { ctx.moveTo(px(r.at), 0); ctx.lineTo(px(r.at), S); }
      ctx.stroke();
    }
    // Mission marker (pulsing yellow diamond).
    const pulse = 4 + Math.sin(performance.now() / 300) * 1.5;
    ctx.fillStyle = '#ffd23e';
    const mx = px(this.world.missionMarker.x), my = pz(this.world.missionMarker.z);
    ctx.beginPath();
    ctx.moveTo(mx, my - pulse - 3); ctx.lineTo(mx + pulse, my); ctx.lineTo(mx, my + pulse + 3); ctx.lineTo(mx - pulse, my);
    ctx.closePath(); ctx.fill();
    // Cars (white dots).
    ctx.fillStyle = '#ffffff';
    for (const v of game.vehicles.vehicles) {
      ctx.beginPath(); ctx.arc(px(v.pos.x), pz(v.pos.z), 2.2, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow (rotates with heading).
    const p = game.player.pos;
    const yaw = game.player.inCar ? game.player.inCar.angle : game.player.yaw;
    ctx.save();
    ctx.translate(px(p.x), pz(p.z));
    ctx.rotate(Math.atan2(Math.sin(yaw), Math.cos(yaw)) * -1 + Math.PI);
    ctx.fillStyle = '#ff5a3d';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    // North tick.
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.font = 'bold 11px sans-serif'; ctx.fillText('N', C - 4, 12);
  }
}
