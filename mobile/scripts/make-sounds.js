/* Renders the rest-timer tones (same notes as the web app: 587 Hz countdown beeps, 1175 Hz "go") to WAV.
   Run from mobile/:  node scripts/make-sounds.js */
const fs = require("fs");
const path = require("path");
const RATE = 22050;
function tone(freq, secs, vol) {
  const n = Math.floor(RATE * secs), buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / RATE, sq = Math.sin(2 * Math.PI * freq * t) >= 0 ? 1 : -1;       // square wave, like the web
    const sm = Math.sin(2 * Math.PI * freq * t) * 0.6 + sq * 0.4;                    // softened so it isn't harsh
    const env = Math.min(1, t / 0.01) * Math.min(1, (secs - t) / 0.04);              // fade in/out, no clicks
    buf.writeInt16LE(Math.round(sm * env * vol * 32767), 44 + i * 2);
  }
  return buf;
}
const out = path.join(__dirname, "..", "assets", "sounds");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "beep.wav"), tone(587, 0.18, 0.5));
fs.writeFileSync(path.join(out, "go.wav"), tone(1175, 0.75, 0.5));
console.log("wrote assets/sounds/beep.wav and go.wav");
