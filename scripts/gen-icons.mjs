// Generates PWA PNG icons from public/icon-source.svg using sharp.
// Run: npm run icons
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, '../public');
const SRC = path.join(PUBLIC, 'icon-source.svg');

const NAVY = { r: 11, g: 30, b: 54, alpha: 1 };

const targets = [
  { name: 'icon-192.png', size: 192, pad: 0 },
  { name: 'icon-512.png', size: 512, pad: 0 },
  // Maskable needs ~20% safe padding so it isn't clipped by the OS mask.
  { name: 'icon-maskable-512.png', size: 512, pad: 0.18 },
  { name: 'apple-touch-icon-180.png', size: 180, pad: 0 }
];

async function gen({ name, size, pad }) {
  const inner = Math.round(size * (1 - pad * 2));
  const offset = Math.round((size - inner) / 2);
  const logo = await sharp(SRC).resize(inner, inner).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: pad ? NAVY : { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: logo, top: offset, left: offset }])
    .png()
    .toFile(path.join(PUBLIC, name));
  console.log('✓', name, `${size}x${size}`);
}

async function main() {
  for (const t of targets) await gen(t);
  console.log('Icons generated in public/.');
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
