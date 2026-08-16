import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const WIDTH = 1200
const HEIGHT = 630
const PARTICLE_COUNT = 8_000
const SPHERE_RADIUS = 205
const SPHERE_CENTER_X = WIDTH / 2
const SPHERE_CENTER_Y = 270
const ANGLE = 0.72

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(scriptDirectory, '../public/social-preview.png')

const grid = []
for (let x = 0; x <= WIDTH; x += 40) {
  grid.push(`<path d="M${x} 0V${HEIGHT}"/>`)
}
for (let y = 0; y <= HEIGHT; y += 40) {
  grid.push(`<path d="M0 ${y}H${WIDTH}"/>`)
}

const particles = []
for (let index = 0; index < PARTICLE_COUNT; index += 1) {
  const x =
    SPHERE_CENTER_X +
    Math.sin(index + ANGLE) * Math.sin(index * index) * SPHERE_RADIUS
  const y = SPHERE_CENTER_Y + Math.cos(index * index) * SPHERE_RADIUS
  particles.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="1.6" height="1.6"/>`)
}

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#050505"/>
  <g fill="none" stroke="#f1f1ed" stroke-opacity="0.035">${grid.join('')}</g>
  <path d="M52 48H1148" stroke="#f1f1ed" stroke-opacity="0.32"/>
  <text x="52" y="82" fill="#858585" font-family="monospace" font-size="14" letter-spacing="3">INTERACTIVE AUDIENCE ARTWORK</text>
  <g fill="#f1f1ed">${particles.join('')}</g>
  <path d="M52 535H1148" stroke="#365bd8" stroke-width="2"/>
  <text x="52" y="588" fill="#858585" font-family="monospace" font-size="16" letter-spacing="2">ALPHA INNOVATION LIVE 2026</text>
  <text x="1148" y="588" fill="#f1f1ed" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="700" letter-spacing="-1" text-anchor="end">× eigenvalue:space</text>
</svg>`

await mkdir(dirname(outputPath), { recursive: true })
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outputPath)
console.log(`Generated ${outputPath}`)
