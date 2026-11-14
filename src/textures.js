import * as THREE from 'three'
import { seededRandom } from './noise.js'

const SIZE = 512
const METRES_PER_TILE = 1.5

function canvas(fill) {
  const element = document.createElement('canvas')
  element.width = SIZE
  element.height = SIZE
  const context = element.getContext('2d')
  context.fillStyle = fill
  context.fillRect(0, 0, SIZE, SIZE)
  return { element, context }
}

function wrapAround(draw, x, y, reach) {
  for (const dx of [-SIZE, 0, SIZE]) {
    for (const dy of [-SIZE, 0, SIZE]) {
      const nearX = x + dx > -reach && x + dx < SIZE + reach
      const nearY = y + dy > -reach && y + dy < SIZE + reach
      if (nearX && nearY) {
        draw(x + dx, y + dy)
      }
    }
  }
}

function blob(context, x, y, radius, color, alpha) {
  wrapAround(
    (cx, cy) => {
      const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius)
      gradient.addColorStop(0, `rgba(${color},${alpha})`)
      gradient.addColorStop(1, `rgba(${color},0)`)
      context.fillStyle = gradient
      context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
    },
    x,
    y,
    radius,
  )
}

function line(context, from, to, width, style) {
  wrapAround(
    (x, y) => {
      context.strokeStyle = style
      context.lineWidth = width
      context.beginPath()
      context.moveTo(x, y)
      context.lineTo(x + to[0] - from[0], y + to[1] - from[1])
      context.stroke()
    },
    from[0],
    from[1],
    Math.hypot(to[0] - from[0], to[1] - from[1]),
  )
}

function chip(context, x, y, radius, random, style) {
  const corners = 6
  const points = Array.from({ length: corners }, (_, i) => {
    const angle = (i / corners) * Math.PI * 2
    const reach = radius * (0.5 + random() * 0.6)
    return [Math.cos(angle) * reach, Math.sin(angle) * reach]
  })
  wrapAround(
    (cx, cy) => {
      context.fillStyle = style
      context.beginPath()
      points.forEach(([px, py], i) => {
        if (i === 0) {
          context.moveTo(cx + px, cy + py)
        } else {
          context.lineTo(cx + px, cy + py)
        }
      })
      context.fill()
    },
    x,
    y,
    radius * 1.2,
  )
}

function wearFeatures(seed, wear) {
  const random = seededRandom(seed)
  const pick = (min, max) => min + random() * (max - min)
  const mostlySmall = (min, max) => min + random() * random() * (max - min)
  return {
    random,
    mottles: Array.from({ length: 900 }, () => [pick(0, SIZE), pick(0, SIZE), pick(4, 30), random() < 0.5]),
    dents: Array.from({ length: Math.round(10 * wear) }, () => [pick(0, SIZE), pick(0, SIZE), mostlySmall(10, 90), pick(0.15, 0.6)]),
    dirt: Array.from({ length: Math.round(45 * wear) }, () => [pick(0, SIZE), pick(0, SIZE), pick(10, 55), pick(0.08, 0.25)]),
    streaks: Array.from({ length: Math.round(35 * wear) }, () => [pick(0, SIZE), pick(0, SIZE), pick(40, 220), pick(1, 5)]),
    scratches: Array.from({ length: Math.round(90 * wear) }, () => {
      const x = pick(0, SIZE)
      const y = pick(0, SIZE)
      const angle = pick(0, Math.PI)
      const length = pick(8, 90)
      return [[x, y], [x + Math.cos(angle) * length, y + Math.sin(angle) * length], pick(0.5, 1.6), pick(0.12, 0.4)]
    }),
    chips: Array.from({ length: Math.round(28 * wear) }, () => [pick(0, SIZE), pick(0, SIZE), mostlySmall(1.5, 13), pick(0.25, 0.9)]),
  }
}

function toTexture(element, isColor) {
  const texture = new THREE.CanvasTexture(element)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  if (isColor) {
    texture.colorSpace = THREE.SRGBColorSpace
  }
  return texture
}

function drawWear(features, layers, extraDetail) {
  const { color, rough, bump } = layers
  for (const [x, y, radius, lighter] of features.mottles) {
    blob(color.context, x, y, radius, lighter ? '255,255,255' : '0,0,0', 0.02)
  }
  for (const [x, y, radius, depth] of features.dents) {
    blob(bump.context, x, y, radius, '0,0,0', depth)
    blob(bump.context, x - radius * 0.25, y - radius * 0.25, radius * 0.6, '255,255,255', depth * 0.45)
  }
  extraDetail?.(layers, features.random)
  for (const [x, y, length, width] of features.streaks) {
    const gradient = color.context.createLinearGradient(x, y, x, y + length)
    gradient.addColorStop(0, 'rgba(60,45,30,0.35)')
    gradient.addColorStop(1, 'rgba(60,45,30,0)')
    color.context.fillStyle = gradient
    color.context.fillRect(x, y, width, length)
  }
  for (const [x, y, radius, alpha] of features.dirt) {
    blob(color.context, x, y, radius, '72,58,38', alpha)
    blob(rough.context, x, y, radius, '255,255,255', alpha)
  }
  for (const [from, to, width, opacity] of features.scratches) {
    line(color.context, from, to, width, `rgba(165,163,156,${opacity})`)
    line(rough.context, from, to, width, 'rgba(60,60,60,0.8)')
    line(bump.context, from, to, width, 'rgba(0,0,0,0.6)')
  }
  for (const [x, y, radius, opacity] of features.chips) {
    chip(color.context, x, y, radius, features.random, `rgba(120,118,112,${opacity})`)
    chip(rough.context, x, y, radius, features.random, `rgba(70,70,70,${opacity})`)
    chip(bump.context, x, y, radius, features.random, `rgba(70,70,70,${opacity * 0.6})`)
  }
}

function trackTreads({ color, bump }) {
  const pitch = SIZE / 6
  for (let x = 0; x < SIZE; x += pitch) {
    color.context.fillStyle = 'rgba(0,0,0,0.45)'
    color.context.fillRect(x, 0, pitch * 0.18, SIZE)
    bump.context.fillStyle = 'rgba(0,0,0,0.9)'
    bump.context.fillRect(x, 0, pitch * 0.18, SIZE)
    bump.context.fillStyle = 'rgba(255,255,255,0.5)'
    bump.context.fillRect(x + pitch * 0.5, 0, pitch * 0.12, SIZE)
  }
}

function wornSurface({ base, seed, wear, roughness, extraDetail }) {
  const layers = {
    color: canvas(base),
    rough: canvas(`rgb(${roughness},${roughness},${roughness})`),
    bump: canvas('rgb(128,128,128)'),
  }
  drawWear(wearFeatures(seed, wear), layers, extraDetail)
  return {
    map: toTexture(layers.color.element, true),
    roughnessMap: toTexture(layers.rough.element, false),
    bumpMap: toTexture(layers.bump.element, false),
  }
}

function groundDetail(seed, pebbleCount) {
  const random = seededRandom(seed)
  const pick = (min, max) => min + random() * (max - min)
  const detail = canvas('rgb(236,236,236)')
  for (let i = 0; i < 2500; i++) {
    blob(detail.context, pick(0, SIZE), pick(0, SIZE), pick(3, 30), random() < 0.5 ? '255,255,255' : '0,0,0', 0.025)
  }
  for (let i = 0; i < pebbleCount; i++) {
    const shade = Math.round(pick(120, 255))
    chip(detail.context, pick(0, SIZE), pick(0, SIZE), pick(1, 4), random, `rgba(${shade},${shade},${shade},0.8)`)
  }
  const map = toTexture(detail.element, true)
  const bumpMap = toTexture(detail.element, false)
  return { map, bumpMap }
}

const cache = new Map()

function cached(name, build) {
  if (!cache.has(name)) {
    cache.set(name, build())
  }
  return cache.get(name)
}

export const FINISHES = {
  paint: () => cached('paint', () => new THREE.MeshStandardMaterial({
    ...wornSurface({ base: '#d99c12', seed: 11, wear: 1, roughness: 150 }),
    metalness: 0.25,
    bumpScale: 0.8,
  })),
  counterweight: () => cached('counterweight', () => new THREE.MeshStandardMaterial({
    ...wornSurface({ base: '#2c2c2a', seed: 23, wear: 1.2, roughness: 170 }),
    metalness: 0.3,
    bumpScale: 1,
  })),
  darkSteel: () => cached('darkSteel', () => new THREE.MeshStandardMaterial({
    ...wornSurface({ base: '#4d4c48', seed: 37, wear: 1.8, roughness: 140 }),
    metalness: 0.6,
    bumpScale: 3,
  })),
  tracks: () => cached('tracks', () => new THREE.MeshStandardMaterial({
    ...wornSurface({ base: '#363532', seed: 41, wear: 1.5, roughness: 180, extraDetail: trackTreads }),
    metalness: 0.5,
    bumpScale: 4,
  })),
  hopper: () => cached('hopper', () => new THREE.MeshStandardMaterial({
    ...wornSurface({ base: '#3d6d8c', seed: 53, wear: 1.4, roughness: 150 }),
    metalness: 0.3,
    bumpScale: 1.2,
  })),
  chrome: () => cached('chrome', () => new THREE.MeshStandardMaterial({ color: 0xd8dcdf, metalness: 0.9, roughness: 0.25 })),
  glass: () => cached('glass', () => new THREE.MeshStandardMaterial({
    color: 0xc4d4dc,
    metalness: 0.1,
    roughness: 0.05,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  })),
}

export const GROUND_DETAIL = () => cached('ground', () => groundDetail(61, 900))
export const SAND_DETAIL = () => cached('sand', () => groundDetail(73, 300))

export function worldScaleBoxUVs(geometry, width, height, depth, seed) {
  const random = seededRandom(seed)
  const faceSizes = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ]
  const uv = geometry.attributes.uv
  const offsets = faceSizes.map(() => [random(), random()])
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4)
    const [faceU, faceV] = faceSizes[face]
    const [offsetU, offsetV] = offsets[face]
    uv.setXY(i, offsetU + (uv.getX(i) * faceU) / METRES_PER_TILE, offsetV + (uv.getY(i) * faceV) / METRES_PER_TILE)
  }
  return geometry
}

export function worldScaleUVs(geometry) {
  const uv = geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) / METRES_PER_TILE, uv.getY(i) / METRES_PER_TILE)
  }
  return geometry
}

export function planarWorldUVs(geometry, toWorld, metresPerTile) {
  const position = geometry.attributes.position
  const uv = geometry.attributes.uv
  const point = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i)
    toWorld(point)
    uv.setXY(i, point.x / metresPerTile, -point.z / metresPerTile)
  }
  return geometry
}

