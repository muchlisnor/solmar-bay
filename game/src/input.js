// input.js — keyboard + mouse-drag look. No pointer lock (safer in headless + embeds).
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.dragYaw = 0;      // accumulated orbit delta this frame (consumed by camera)
    this.dragPitch = 0;
    this.dragging = false;
    this.lastX = 0; this.lastY = 0;
    this.onKey = null;     // (code, down) => void — main.js wires E/P/M/F here
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e.code, true);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (this.onKey) this.onKey(e.code, false);
    });
    canvas.addEventListener('mousedown', (e) => {
      this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.dragYaw -= (e.clientX - this.lastX) * 0.005;
      this.dragPitch -= (e.clientY - this.lastY) * 0.005;
      this.dragPitch = Math.max(-0.9, Math.min(0.9, this.dragPitch));
      this.lastX = e.clientX; this.lastY = e.clientY;
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  /** Forward = W or ArrowUp. Returns -1/0/1 for steering, etc. */
  axis(neg, pos) { return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0); }
  consumeDrag() {
    const d = { yaw: this.dragYaw, pitch: this.dragPitch };
    this.dragYaw = 0; this.dragPitch = 0;
    return d;
  }
}
