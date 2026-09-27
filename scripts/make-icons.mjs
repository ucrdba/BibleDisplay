// Generates raster app icons from build/icon.svg.
//
// Outputs:
//   build/icon.png       (512x512, used as the general app icon source)
//   build/icon.ico        (16/24/32/48/64/128/256, used by electron-builder for Windows/NSIS)
//   resources/icon.png   (256x256, used as the runtime BrowserWindow icon)
//
// Run with: npm run icons

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const SVG_PATH = join(rootDir, 'build', 'icon.svg')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const ALL_SIZES = [...new Set([...ICO_SIZES, 512])].sort((a, b) => a - b)

async function renderPng(svg, size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
  })
  const rendered = resvg.render()
  return rendered.asPng()
}

async function main() {
  const svg = await readFile(SVG_PATH, 'utf8')

  const buildDir = join(rootDir, 'build')
  const resourcesDir = join(rootDir, 'resources')
  await mkdir(buildDir, { recursive: true })
  await mkdir(resourcesDir, { recursive: true })

  const pngBySize = new Map()
  for (const size of ALL_SIZES) {
    pngBySize.set(size, await renderPng(svg, size))
  }

  // build/icon.png (512)
  await writeFile(join(buildDir, 'icon.png'), pngBySize.get(512))

  // resources/icon.png (256), used as the runtime window icon
  await writeFile(join(resourcesDir, 'icon.png'), pngBySize.get(256))

  // build/icon.ico (16, 24, 32, 48, 64, 128, 256)
  const icoBuffers = ICO_SIZES.map(size => pngBySize.get(size))
  const ico = await pngToIco(icoBuffers)
  await writeFile(join(buildDir, 'icon.ico'), ico)

  console.log(`Generated icons for sizes: ${ALL_SIZES.join(', ')}`)
  console.log('  build/icon.png')
  console.log('  build/icon.ico')
  console.log('  resources/icon.png')
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
