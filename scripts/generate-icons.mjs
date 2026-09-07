// Генератор PWA-иконок из public/logo.png без внешних зависимостей.
// Запуск: npm run icons (см. package.json). Выход: public/pwa-icons/*.png.
// Логотип — квадрат с белым кругом и прозрачными углами, поэтому канва
// иконки остаётся прозрачной, а белое поле само образует «подложку».
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logoPath = join(root, 'public', 'logo.png');
const outDir = join(root, 'public', 'pwa-icons');

// Доля стороны канвы, занимаемая рисунком: для «any» крупнее,
// для maskable сознательно меньше — безопасная зона вокруг круга.
const ICONS = [
  { file: 'icon-192.png', size: 192, purpose: 'any', scale: 0.8 },
  { file: 'icon-512.png', size: 512, purpose: 'any', scale: 0.8 },
  { file: 'maskable-192.png', size: 192, purpose: 'maskable', scale: 0.6 },
  { file: 'maskable-512.png', size: 512, purpose: 'maskable', scale: 0.6 },
];

function decodeRgbaPng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('logo.png не является PNG-файлом');
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatParts = [];
  while (pos + 12 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + length;
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(
      `ожидается RGBA PNG (8 бит), получено: bitDepth=${bitDepth}, colorType=${colorType}`,
    );
  }
  const raw = inflateSync(Buffer.concat(idatParts));
  const bpp = 4;
  const pixels = Buffer.alloc(height * width * bpp);

  // Adam7: параметры проходов (xStart, yStart, xStep, yStep).
  const passes = [
    [0, 0, 8, 8],
    [4, 0, 8, 8],
    [0, 4, 4, 8],
    [2, 0, 4, 4],
    [0, 2, 2, 4],
    [1, 0, 2, 2],
    [0, 1, 1, 2],
  ];

  // Разворачивает один проход (фильтры ссылаются только на строки того же прохода).
  const unfilterPass = (offset, passWidth, passHeight) => {
    const stride = passWidth * bpp;
    const out = Buffer.alloc(passHeight * stride);
    const previous = Buffer.alloc(stride);
    for (let y = 0; y < passHeight; y++) {
      const lineStart = offset + y * (stride + 1);
      const filter = raw[lineStart];
      const line = raw.subarray(lineStart + 1, lineStart + 1 + stride);
      const current = out.subarray(y * stride, (y + 1) * stride);
      for (let x = 0; x < stride; x++) {
        const left = x >= bpp ? current[x - bpp] : 0;
        const up = previous[x];
        const upLeft = x >= bpp ? previous[x - bpp] : 0;
        let value = line[x];
        if (filter === 1) {
          value += left;
        } else if (filter === 2) {
          value += up;
        } else if (filter === 3) {
          value += Math.floor((left + up) / 2);
        } else if (filter === 4) {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        }
        current[x] = value & 0xff;
      }
      previous.set(current);
    }
    return { out, nextOffset: offset + passHeight * (stride + 1) };
  };

  if (interlace === 0) {
    const { out } = unfilterPass(0, width, height);
    out.copy(pixels);
  } else if (interlace === 1) {
    let offset = 0;
    for (const [xStart, yStart, xStep, yStep] of passes) {
      const passWidth = Math.ceil((width - xStart) / xStep);
      const passHeight = Math.ceil((height - yStart) / yStep);
      if (passWidth <= 0 || passHeight <= 0) {
        continue;
      }
      const { out, nextOffset } = unfilterPass(offset, passWidth, passHeight);
      offset = nextOffset;
      for (let y = 0; y < passHeight; y++) {
        for (let x = 0; x < passWidth; x++) {
          const from = (y * passWidth + x) * bpp;
          const to = ((yStart + y * yStep) * width + xStart + x * xStep) * bpp;
          out.copy(pixels, to, from, from + bpp);
        }
      }
    }
  } else {
    throw new Error(`неизвестный метод interlace: ${interlace}`);
  }
  return { pixels, width, height };
}

function resizeBilinear(src, srcWidth, srcHeight, dstWidth, dstHeight) {
  const dst = Buffer.alloc(dstWidth * dstHeight * 4);
  const xRatio = srcWidth / dstWidth;
  const yRatio = srcHeight / dstHeight;
  for (let y = 0; y < dstHeight; y++) {
    const sy = (y + 0.5) * yRatio - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(srcHeight - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < dstWidth; x++) {
      const sx = (x + 0.5) * xRatio - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(srcWidth - 1, x0 + 1);
      const fx = sx - x0;
      const i00 = (y0 * srcWidth + x0) * 4;
      const i01 = (y0 * srcWidth + x1) * 4;
      const i10 = (y1 * srcWidth + x0) * 4;
      const i11 = (y1 * srcWidth + x1) * 4;
      const o = (y * dstWidth + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = src[i00 + c] * (1 - fx) + src[i01 + c] * fx;
        const bottom = src[i10 + c] * (1 - fx) + src[i11 + c] * fx;
        dst[o + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return dst;
}

function composeIcon(logo, logoWidth, logoHeight, size, scale) {
  const canvas = Buffer.alloc(size * size * 4, 0);
  const draw = Math.round(size * scale);
  const scaled = resizeBilinear(logo, logoWidth, logoHeight, draw, draw);
  const offset = Math.floor((size - draw) / 2);
  for (let y = 0; y < draw; y++) {
    const from = y * draw * 4;
    const to = (offset + y) * size * 4 + offset * 4;
    scaled.copy(canvas, to, from, from + draw * 4);
  }
  return canvas;
}

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c;
});

function crc32(buf) {
  let c = -1;
  for (const byte of buf) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 'ascii');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function encodePng(rgba, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const logo = decodeRgbaPng(readFileSync(logoPath));
mkdirSync(outDir, { recursive: true });
for (const icon of ICONS) {
  const canvas = composeIcon(logo.pixels, logo.width, logo.height, icon.size, icon.scale);
  const file = join(outDir, icon.file);
  writeFileSync(file, encodePng(canvas, icon.size, icon.size));
  console.log(`${icon.file}: ${icon.size}x${icon.size}, purpose=${icon.purpose}`);
}
