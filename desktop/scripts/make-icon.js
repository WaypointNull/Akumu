const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.join(__dirname, '..', '..');
const LOGO = path.join(root, 'client', 'public', 'akumu.png');
const ICON_PNG = path.join(root, 'build', 'icon.png');
const TRAY_ICO = path.join(root, 'desktop', 'assets', 'tray.ico');

// Box-filter downscale: proper area averaging, good for large -> small (1024 -> 16).
function resizeToPng(source, targetSize) {
  const { width: sw, height: sh, data: src } = source;
  const scale = sw / targetSize;
  const png = new PNG({ width: targetSize, height: targetSize });
  const dst = png.data;

  for (let y = 0; y < targetSize; y++) {
    const sy0 = Math.floor(y * scale);
    const sy1 = Math.min(sh, Math.ceil((y + 1) * scale));
    for (let x = 0; x < targetSize; x++) {
      const sx0 = Math.floor(x * scale);
      const sx1 = Math.min(sw, Math.ceil((x + 1) * scale));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const row = sy * sw;
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (row + sx) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          a += src[i + 3];
          count++;
        }
      }
      const di = (y * targetSize + x) * 4;
      dst[di] = Math.round(r / count);
      dst[di + 1] = Math.round(g / count);
      dst[di + 2] = Math.round(b / count);
      dst[di + 3] = Math.round(a / count);
    }
  }
  return PNG.sync.write(png);
}

function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  const chunks = [];
  let offset = 6 + 16 * images.length;
  for (const image of images) {
    const entry = Buffer.alloc(16);
    const dim = image.size >= 256 ? 0 : image.size;
    entry[0] = dim;
    entry[1] = dim;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.data.length;
    entries.push(entry);
    chunks.push(image.data);
  }
  return Buffer.concat([header, ...entries, ...chunks]);
}

function buildFromLogo() {
  const logo = PNG.sync.read(fs.readFileSync(LOGO));
  if (logo.width !== logo.height) {
    throw new Error('akumu.png must be square to use as an app icon.');
  }

  fs.mkdirSync(path.dirname(ICON_PNG), { recursive: true });
  fs.mkdirSync(path.dirname(TRAY_ICO), { recursive: true });

  // electron-builder turns this PNG into the exe/installer .ico.
  fs.writeFileSync(ICON_PNG, fs.readFileSync(LOGO));

  // Downscaled logo entries for the tray icon.
  const sizes = [16, 24, 32, 48];
  const ico = encodeIco(sizes.map((size) => ({ size, data: resizeToPng(logo, size) })));
  fs.writeFileSync(TRAY_ICO, ico);

  console.log(`wrote ${ICON_PNG} (logo, ${logo.width}x${logo.height})`);
  console.log(`wrote ${TRAY_ICO} (logo, sizes ${sizes.join('/')})`);
}

function main() {
  if (fs.existsSync(LOGO)) {
    buildFromLogo();
    return;
  }
  console.error(`Logo not found at ${LOGO}; run \`npm run desktop:icon\` once the client assets exist.`);
  process.exit(1);
}

main();
