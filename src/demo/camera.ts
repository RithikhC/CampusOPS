/**
 * Stand-in cameras for the phones inside the demo page, since a laptop webcam can't see things
 * drawn on the same screen.
 *   - guard phone: a dark gate, and a phone holding up a pass
 *   - student phone: the back of a room door, with the room's tag on it
 * The scanner reads them exactly like a real camera feed (same decoding, same checks).
 * Opened on their own on a real phone, both pages use the real camera instead.
 */
import QRCode from "qrcode";

const W = 480;
const H = 640;
const SLIDE_MS = 280;

type Style = "pass" | "tag";

interface Shown {
  modules: { size: number; get(row: number, col: number): number | boolean };
  style: Style;
  shownAt: number;
  hideAt: number;
}

const ease = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);

export function installFakeCamera(scene: "gate" | "room"): void {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  let shown: Shown | null = null;

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawQr(x: number, y: number, size: number, modules: Shown["modules"]) {
    const quiet = 2;
    const scale = size / (modules.size + quiet * 2);
    ctx.fillStyle = "#000000";
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.get(row, col)) ctx.fillRect(x + (col + quiet) * scale, y + (row + quiet) * scale, Math.ceil(scale), Math.ceil(scale));
      }
    }
  }

  function drawBackground() {
    const glow = ctx.createRadialGradient(W * 0.75, H * 0.12, 20, W * 0.5, H * 0.55, H);
    if (scene === "gate") {
      glow.addColorStop(0, "#39445c");
      glow.addColorStop(0.45, "#141a27");
      glow.addColorStop(1, "#05070b");
    } else {
      glow.addColorStop(0, "#6b5a45");
      glow.addColorStop(0.5, "#3a2f24");
      glow.addColorStop(1, "#1a140f");
    }
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    if (scene === "gate") {
      // Gate bars.
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      for (let x = 20; x < W; x += 60) ctx.fillRect(x, 0, 10, H);
    } else {
      // Door panels.
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 3;
      ctx.strokeRect(50, 40, W - 100, H * 0.42);
      ctx.strokeRect(50, H * 0.42 + 70, W - 100, H * 0.42);
    }
  }

  function draw() {
    const now = performance.now();
    drawBackground();

    if (shown) {
      const enter = ease((now - shown.shownAt) / SLIDE_MS);
      const leave = ease((now - shown.hideAt) / SLIDE_MS);
      if (leave >= 1) {
        shown = null;
      } else if (shown.style === "pass") {
        // A phone held up to the camera.
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
        roundRect(-card / 2, -ph / 2 + 100, card, card + 36, 18);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        drawQr(-card / 2 + 13, -ph / 2 + 113, card - 26, shown.modules);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "15px sans-serif";
        ctx.fillText("NightPass", -card / 2 + 16, -ph / 2 + 100 + card + 22);
        ctx.restore();
      } else {
        // The tag stuck to the door: the student's phone moves closer to it.
        const zoom = 0.72 + 0.28 * enter - 0.25 * leave;
        ctx.save();
        ctx.translate(W / 2, H / 2 - 10);
        ctx.rotate(0.03);
        ctx.scale(zoom, zoom);
        ctx.globalAlpha = Math.max(0, enter - leave);
        const card = 300;
        roundRect(-card / 2, -card / 2 - 20, card, card + 64, 14);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        drawQr(-card / 2 + 14, -card / 2 - 6, card - 28, shown.modules);
        ctx.fillStyle = "#334155";
        ctx.font = "600 18px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("NightPass room tag", 0, card / 2 + 24);
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
    show(code: string, holdMs = 1800, style: Style = "pass") {
      const { modules } = QRCode.create(code, { errorCorrectionLevel: "M" });
      const now = performance.now();
      shown = { modules, style, shownAt: now, hideAt: now + holdMs };
    },
  };
}
