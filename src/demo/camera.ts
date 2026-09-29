/**
 * A stand-in camera for the guard phone inside the demo page, since a laptop webcam can't see a
 * phone drawn on the same screen. It draws a dark gate scene and, when asked, a phone showing a
 * pass. The scanner reads it exactly like a real camera feed (same decoding, same checks).
 * Opened on its own on a real phone, the guard page uses the real camera instead.
 */
import QRCode from "qrcode";

const W = 480;
const H = 640;
const SLIDE_MS = 280;

interface Shown {
  modules: { size: number; get(row: number, col: number): number | boolean };
  shownAt: number;
  hideAt: number;
}

const ease = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);

export function installFakeCamera(): void {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  let shown: Shown | null = null;

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function draw() {
    const now = performance.now();
    const glow = ctx.createRadialGradient(W * 0.75, H * 0.12, 20, W * 0.5, H * 0.55, H);
    glow.addColorStop(0, "#39445c");
    glow.addColorStop(0.45, "#141a27");
    glow.addColorStop(1, "#05070b");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Gate bars in the background.
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    for (let x = 20; x < W; x += 60) ctx.fillRect(x, 0, 10, H);

    if (shown) {
      const enter = ease((now - shown.shownAt) / SLIDE_MS);
      const leave = ease((now - shown.hideAt) / SLIDE_MS);
      if (leave >= 1) {
        shown = null;
      } else {
        const offset = (1 - enter) * H * 0.9 + leave * H * 0.9;
        ctx.save();
        ctx.translate(W / 2, H / 2 + 20 + offset);
        ctx.rotate(-0.045);

        const pw = 290;
        const ph = 540;
        roundRect(-pw / 2, -ph / 2, pw, ph, 38);
        ctx.fillStyle = "#101318";
        ctx.fill();
        roundRect(-pw / 2 + 10, -ph / 2 + 10, pw - 20, ph - 20, 30);
        ctx.fillStyle = "#0b1120";
        ctx.fill();

        const card = 250;
        const cx = -card / 2;
        const cy = -ph / 2 + 100;
        roundRect(cx, cy, card, card + 36, 18);
        ctx.fillStyle = "#ffffff";
        ctx.fill();

        const quiet = 2;
        const size = shown.modules.size + quiet * 2;
        const scale = (card - 26) / size;
        ctx.fillStyle = "#000000";
        for (let row = 0; row < shown.modules.size; row++) {
          for (let col = 0; col < shown.modules.size; col++) {
            if (shown.modules.get(row, col)) {
              ctx.fillRect(cx + 13 + (col + quiet) * scale, cy + 13 + (row + quiet) * scale, Math.ceil(scale), Math.ceil(scale));
            }
          }
        }
        ctx.fillStyle = "#94a3b8";
        ctx.font = "15px sans-serif";
        ctx.fillText("NightPass", cx + 16, cy + card + 22);
        ctx.restore();
      }
    }

    // A little sensor noise so it reads as a camera, not a screenshot.
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 70; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }

  setInterval(draw, 40);
  draw();

  const getUserMedia = async () => canvas.captureStream(25);
  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = getUserMedia;
  } else {
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia } });
  }

  window.__nightpassCamera = {
    show(code: string, holdMs = 1800) {
      const { modules } = QRCode.create(code, { errorCorrectionLevel: "M" });
      const now = performance.now();
      shown = { modules, shownAt: now, hideAt: now + holdMs };
    },
  };
}
