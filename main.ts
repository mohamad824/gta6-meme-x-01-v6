// gta6-meme-x-01 v6 — Doctor's sick note / prescription for launch week.
// Draws the meme PNG (1024x1024) deterministically with Node built-ins only
// (no network, no randomness, no timestamps) and copies POST.json to /output.
// main.ts is the entrypoint: it does both jobs in one run.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join } from "node:path";

const W = 1024;
const H = 1024;
const px = Buffer.alloc(W * H * 4); // RGBA

type RGB = [number, number, number];
const PAPER: RGB = [255, 253, 246];
const INK: RGB = [17, 17, 17];
const NAVY: RGB = [18, 40, 75];
const TEAL: RGB = [0, 166, 166];
const TEAL_DARK: RGB = [0, 112, 112];
const MAGENTA: RGB = [230, 0, 126];
const MAGENTA_DARK: RGB = [193, 0, 96];
const PINK: RGB = [255, 233, 243];
const WHITE: RGB = [255, 255, 255];

// ---- pixel helpers -------------------------------------------------------
function setPixel(x: number, y: number, c: RGB, a = 255): void {
  // Round FIRST: a fractional x/y would combine with W=1024 into a valid
  // integer buffer index at a shifted position (the bump circles' thirds
  // did exactly that, drawing stray discs far from the ghost).
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = a;
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPixel(xx, yy, c);
  }
}
function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  cx = Math.round(cx);
  cy = Math.round(cy);
  r = Math.round(r);
  const r2 = r * r;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    const dx = Math.floor(Math.sqrt(Math.max(0, r2 - dy * dy)));
    for (let xx = cx - dx; xx <= cx + dx; xx++) setPixel(xx, cy + dy, c);
  }
}
function ring(cx: number, cy: number, r: number, t: number, c: RGB): void {
  // Clean annulus: fill the band between the outer and inner circles.
  const rO2 = r * r;
  const rI = r - t;
  const rI2 = rI * rI;
  for (let dy = -r; dy <= r; dy++) {
    const dxO = Math.floor(Math.sqrt(Math.max(0, rO2 - dy * dy)));
    const dxI = Math.floor(Math.sqrt(Math.max(0, rI2 - dy * dy)));
    for (let xx = cx - dxO; xx < cx - dxI; xx++) setPixel(xx, cy + dy, c);
    for (let xx = cx + dxI + 1; xx <= cx + dxO; xx++) setPixel(xx, cy + dy, c);
  }
}
function pointInPoly(x: number, y: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function fillStar(cx: number, cy: number, rO: number, rI: number, c: RGB): void {
  const poly: Array<[number, number]> = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 === 0 ? rO : rI;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    poly.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const x0 = Math.floor(cx - rO), x1 = Math.ceil(cx + rO);
  const y0 = Math.floor(cy - rO), y1 = Math.ceil(cy + rO);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (pointInPoly(x + 0.5, y + 0.5, poly)) setPixel(x, y, c);
    }
  }
}
function fillSparkle(cx: number, cy: number, r: number, c: RGB): void {
  // Four-pointed sparkle: a tall thin diamond crossed with a wide thin one.
  const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
  const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = Math.abs(x - cx) / r;
      const dy = Math.abs(y - cy) / r;
      if (dx / 0.30 + dy <= 1 || dx + dy / 0.30 <= 1) setPixel(x, y, c);
    }
  }
}

// ---- 5x7 bitmap font (rows are 5-bit values, bit 4 = leftmost column) -----
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31], "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8], ":": [0, 12, 12, 0, 12, 12, 0],
  ";": [0, 12, 12, 0, 12, 4, 8], "-": [0, 0, 0, 14, 0, 0, 0],
  "'": [4, 4, 8, 0, 0, 0, 0], "$": [4, 15, 20, 14, 5, 30, 4],
  "%": [25, 26, 2, 4, 8, 11, 19], "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8], "/": [1, 2, 2, 4, 8, 8, 16],
  "+": [0, 4, 4, 31, 4, 4, 0], "&": [12, 18, 20, 8, 21, 18, 13],
  "!": [4, 4, 4, 4, 4, 0, 4], "?": [14, 17, 1, 2, 4, 0, 4],
  "#": [10, 10, 31, 10, 31, 10, 10], "=": [0, 0, 31, 0, 31, 0, 0],
  ">": [8, 4, 2, 1, 2, 4, 8],
  "•": [0, 0, 12, 12, 12, 0, 0],
};
function normChar(ch: string): string {
  if (ch === "×") return "X";
  if (ch === "·") return "•";
  if (ch === "—" || ch === "–") return "-";
  return ch.toUpperCase();
}
function textW(text: string, s: number): number {
  return [...text].length * 6 * s;
}
function drawText(text: string, x: number, y: number, s: number, c: RGB, bold = false): void {
  let cx = x;
  for (const raw of text) {
    const g = FONT[normChar(raw)];
    if (g) {
      for (let row = 0; row < 7; row++) {
        const bits = g[row];
        for (let col = 0; col < 5; col++) {
          if (bits & (16 >> col)) {
            fillRect(cx + col * s, y + row * s, s, s, c);
            if (bold) fillRect(cx + col * s + 1, y + row * s, s, s, c);
          }
        }
      }
    }
    cx += 6 * s;
  }
}
function centerText(text: string, cx: number, y: number, s: number, c: RGB, bold = false): void {
  drawText(text, Math.round(cx - textW(text, s) / 2), y, s, c, bold);
}
function rightText(text: string, rx: number, y: number, s: number, c: RGB, bold = false): void {
  drawText(text, rx - textW(text, s), y, s, c, bold);
}

// ---- make.fun ghost (white, thick black outline, sparkle eyes, no mouth) --
function ghostShape(cx: number, top: number, w: number, h: number, c: RGB): void {
  cx = Math.round(cx);
  top = Math.round(top);
  w = Math.round(w);
  h = Math.round(h);
  const r = Math.round(w / 2);
  const bumpR = Math.max(3, Math.round(w / 6));
  const bodyTop = top + r;
  const bodyBot = top + h - bumpR;
  fillCircle(cx, top + r, r, c);
  fillRect(cx - r, bodyTop, w, bodyBot - bodyTop, c);
  fillCircle(cx - w / 3, bodyBot, bumpR, c);
  fillCircle(cx, bodyBot, bumpR, c);
  fillCircle(cx + w / 3, bodyBot, bumpR, c);
}
function drawGhost(cx: number, top: number, h: number): void {
  const w = Math.round(h * 0.62);
  const out = 5;
  ghostShape(cx, top - out, w + out * 2, h + out * 2, INK); // outline
  ghostShape(cx, top, w, h, WHITE); // body
  // sparkle eyes
  const eyeY = top + Math.round(h * 0.30);
  const eyeR = Math.round(w * 0.13);
  fillSparkle(cx - Math.round(w * 0.19), eyeY, eyeR, INK);
  fillSparkle(cx + Math.round(w * 0.19), eyeY, eyeR, INK);
  // round little hand holding the magenta star coin
  const handX = cx + Math.round(w * 0.44);
  const handY = top + Math.round(h * 0.56);
  const coinX = cx + Math.round(w * 0.56);
  const coinY = top + Math.round(h * 0.64);
  const coinR = Math.round(w * 0.17);
  fillCircle(coinX, coinY, coinR + 3, INK);
  fillCircle(coinX, coinY, coinR, MAGENTA);
  fillStar(coinX, coinY, coinR * 0.72, coinR * 0.30, WHITE);
  fillCircle(handX, handY, Math.round(w * 0.085) + 3, INK);
  fillCircle(handX, handY, Math.round(w * 0.085), WHITE);
}

// ---- draw the meme -------------------------------------------------------
// paper + magenta frame
fillRect(0, 0, W, H, PAPER);
fillRect(0, 0, W, 16, MAGENTA);
fillRect(0, H - 16, W, 16, MAGENTA);
fillRect(0, 0, 16, H, MAGENTA);
fillRect(W - 16, 0, 16, H, MAGENTA);

// header band: teal, hospital name + medical cross
fillRect(16, 16, W - 32, 142, TEAL);
fillCircle(84, 87, 42, WHITE);
fillRect(74, 57, 20, 60, MAGENTA);
fillRect(54, 77, 60, 20, MAGENTA);
drawText("LEONIDA GENERAL HOSPITAL", 140, 52, 5, WHITE, true);
drawText("DEPARTMENT OF WAITING - EST. 2013", 140, 108, 3, WHITE);

// title
centerText("DOCTOR'S NOTE", 512, 182, 7, NAVY, true);
centerText("SICK NOTE - LAUNCH WEEK - VICE CITY", 512, 248, 3, MAGENTA_DARK, true);
fillRect(48, 288, 928, 4, NAVY);

// patient block
drawText("PATIENT: ONE VERY PATIENT GAMER", 48, 308, 4, NAVY, true);
drawText("AGE: 15 -> 28 - AGED DURING TREATMENT", 48, 348, 3, TEAL_DARK);

// diagnosis box
fillRect(48, 388, 928, 112, PINK);
fillRect(48, 388, 928, 6, MAGENTA);
fillRect(48, 494, 928, 6, MAGENTA);
fillRect(48, 388, 6, 112, MAGENTA);
fillRect(970, 388, 6, 112, MAGENTA);
drawText("DIAGNOSIS: ACUTE VICE CITY FEVER", 68, 408, 4, NAVY, true);
drawText("CAUGHT IN 2013. THE GAME ONLY CAUGHT UP TODAY.", 68, 454, 3, INK);

// unfit for work
drawText("UNFIT FOR WORK: 19-23 NOV 2026", 48, 524, 4, NAVY, true);
drawText("BOSS ALSO OUT OF OFFICE (LEONIDA) UNTIL MONDAY.", 48, 562, 3, TEAL_DARK);

// prescription
drawText("RX PRESCRIPTION", 48, 600, 4, MAGENTA_DARK, true);
rightText("TAKE WITH 214 GB OF WATER", 976, 606, 2, TEAL_DARK);
fillRect(48, 634, 928, 3, NAVY);
const rxLines = [
  "1 X GTA VI - $79.99 - TAKE ONCE, 13 YEARS LATE",
  "214 GB - DOWNLOAD OVERNIGHT - BAR STUCK AT 99%",
  "2 X DELAYS - ALREADY TAKEN - SIDE EFFECT: GREW UP",
  "1 X CHILDHOOD - NON-REFUNDABLE - EXPIRED WAITING",
  "0 X PATIENCE LEFT - REFILL DENIED",
];
rxLines.forEach((line, i) => drawText(line, 48, 650 + i * 34, 3, INK));

// pharmacy / payout box: the punchline is the make.fun payout
fillRect(48, 826, 928, 124, MAGENTA);
drawText("PHARMACY: make.fun - PAID IN FULL +$250.00", 64, 842, 3, WHITE, true);
drawText("MY AI AGENT WON IT WHILE I WAITED.", 64, 876, 3, WHITE);
drawText("PICK UP THE GAME, NOT A BILL.", 64, 910, 3, WHITE);
// ghost as the make.fun pharmacist, inside a white stamp badge —
// enlarged so the ghost (and its star coin) still read at 480x480
fillCircle(910, 888, 56, WHITE);
ring(910, 888, 56, 4, INK);
drawGhost(896, 842, 94);

// footer: insurer + signing doctor + validity
centerText("INSURER: make.fun HEALTH PLAN - SIGNED: DR. G. HOST, MD - make.fun CLINIC", 512, 966, 2, NAVY);

// ---- PNG encode (deterministic: no ancillary chunks, fixed deflate) -------
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0; // filter: none
  px.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

// ---- outputs --------------------------------------------------------------
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "out";
mkdirSync(outDir, { recursive: true });
const postJson = readFileSync(join(process.cwd(), "POST.json"));
writeFileSync(join(outDir, "POST.json"), postJson);
writeFileSync(join(outDir, "meme.png"), png);
console.log(`meme.png ${png.length} bytes, POST.json ${postJson.length} bytes -> ${outDir}`);
