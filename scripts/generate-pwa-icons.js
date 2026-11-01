import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicDir = path.resolve('public');
const logoSvgPath = path.join(publicDir, 'logo.svg');
const svgBuffer = fs.readFileSync(logoSvgPath);

async function generate() {
  console.log('Generating PWA icons from logo.svg...');

  // Standard 192x192
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));

  // Standard 512x512
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  // Apple touch icon 180x180
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  // Maskable 512x512 with safe area margin (80% scale centered on background #002B49 or white)
  // Maskable icons require safe zone (10% padding on all sides)
  const innerSize = Math.round(512 * 0.8);
  const innerBuffer = await sharp(svgBuffer)
    .resize(innerSize, innerSize)
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 43, b: 73, alpha: 1 } // Navy brand color #002B49
    }
  })
    .composite([{ input: innerBuffer, gravity: 'center' }])
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));

  // Also make sure icon.svg exists
  fs.copyFileSync(logoSvgPath, path.join(publicDir, 'icon.svg'));

  console.log('PWA icons generated successfully:');
  console.log('- public/pwa-192x192.png');
  console.log('- public/pwa-512x512.png');
  console.log('- public/pwa-maskable-512x512.png');
  console.log('- public/apple-touch-icon.png');
  console.log('- public/icon.svg');
}

generate().catch(err => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
