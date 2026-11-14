import { layeredNoise, seededRandom, valueNoise } from './noise.js'

export const PLAY_HALF = 150
export const TERRAIN_HALF = 300
export const TERRAIN_CELL = 2.5
export const TERRAIN_SEGMENTS = (TERRAIN_HALF * 2) / TERRAIN_CELL
const ROW = TERRAIN_SEGMENTS + 1

const HILLS = [
  { wavelength: 90, amplitude: 5 },
  { wavelength: 35, amplitude: 1.6 },
  { wavelength: 14, amplitude: 0.4 },
]

const SITE_COUNT = 10
const SITE_SPACING = 38
const FIRST_SITE_DISTANCE = 30
const SITE_EDGE_MARGIN = 25
const PAD_FLAT_RADIUS = 11
const PAD_BLEND_RADIUS = 20
const PILE_OFFSET = 6
const PLACEMENT_ATTEMPTS = 4000

export const HOPPER = { half: 1.5, wall: 0.25, rim: 1.5 }
const HOPPER_BLOCK_RADIUS = HOPPER.half + HOPPER.wall + 0.4

const TREE_CLUSTERS = 9
const BOULDERS = 35
const OBSTACLE_SPACING = 3
const KEEP_CLEAR_OF_PADS = PAD_BLEND_RADIUS - 4

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function mapSeed() {
  const match = location.hash.match(/seed=(\d+)/)
  if (match) {
    return Number(match[1])
  }
  const seed = Math.floor(Math.random() * 1e9)
  history.replaceState(null, '', `#seed=${seed}`)
  return seed
}

export function startNewMap() {
  location.hash = `seed=${Math.floor(Math.random() * 1e9)}`
  location.reload()
}

function farEnoughFrom(points, x, z, spacing) {
  return points.every((point) => Math.hypot(point.x - x, point.z - z) >= spacing)
}

function placeSites(random) {
  const spawn = { x: 0, z: 0 }
  const pads = []
  const firstAngle = random() * Math.PI * 2
  pads.push({ x: Math.cos(firstAngle) * FIRST_SITE_DISTANCE, z: Math.sin(firstAngle) * FIRST_SITE_DISTANCE })
  const reach = PLAY_HALF - SITE_EDGE_MARGIN
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS && pads.length < SITE_COUNT; attempt++) {
    const x = (random() * 2 - 1) * reach
    const z = (random() * 2 - 1) * reach
    if (farEnoughFrom([spawn, ...pads], x, z, SITE_SPACING)) {
      pads.push({ x, z })
    }
  }
  return pads.map((pad) => {
    const angle = random() * Math.PI * 2
    const dx = Math.cos(angle) * PILE_OFFSET
    const dz = Math.sin(angle) * PILE_OFFSET
    return { pad, pile: { x: pad.x + dx, z: pad.z + dz }, hopper: { x: pad.x - dx, z: pad.z - dz } }
  })
}

function buildHeights(seed, pads) {
  for (const pad of pads) {
    pad.base = layeredNoise(pad.x, pad.z, seed, HILLS)
  }
  const heights = new Float32Array(ROW * ROW)
  for (let i = 0; i < heights.length; i++) {
    const x = -TERRAIN_HALF + (i % ROW) * TERRAIN_CELL
    const z = -TERRAIN_HALF + Math.floor(i / ROW) * TERRAIN_CELL
    let height = layeredNoise(x, z, seed, HILLS)
    for (const pad of pads) {
      const flatness = 1 - smoothstep(PAD_FLAT_RADIUS, PAD_BLEND_RADIUS, Math.hypot(x - pad.x, z - pad.z))
      height += (pad.base - height) * flatness
    }
    heights[i] = height
  }
  return heights
}

function createGroundSampler(heights) {
  return function groundAt(x, z) {
    const gx = clamp((x + TERRAIN_HALF) / TERRAIN_CELL, 0, TERRAIN_SEGMENTS - 0.001)
    const gz = clamp((z + TERRAIN_HALF) / TERRAIN_CELL, 0, TERRAIN_SEGMENTS - 0.001)
    const ix = Math.floor(gx)
    const iz = Math.floor(gz)
    const fx = gx - ix
    const fz = gz - iz
    const i = iz * ROW + ix
    const top = heights[i] * (1 - fx) + heights[i + 1] * fx
    const bottom = heights[i + ROW] * (1 - fx) + heights[i + ROW + 1] * fx
    return top * (1 - fz) + bottom * fz
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function createObstaclePlacer(random, pads) {
  const obstacles = []
  const limit = PLAY_HALF - 4

  function canPlace(x, z) {
    const inside = Math.abs(x) < limit && Math.abs(z) < limit
    return inside && farEnoughFrom(pads, x, z, KEEP_CLEAR_OF_PADS) && farEnoughFrom(obstacles, x, z, OBSTACLE_SPACING)
  }

  function place(obstacle) {
    if (canPlace(obstacle.x, obstacle.z)) {
      obstacles.push({ ...obstacle, turn: random() * Math.PI * 2 })
    }
  }

  return { obstacles, place }
}

function placeObstacles(random, seed, pads, sites) {
  const { obstacles, place } = createObstaclePlacer(random, pads)
  const pick = (min, max) => min + random() * (max - min)

  for (let cluster = 0; cluster < TREE_CLUSTERS; cluster++) {
    const cx = pick(-PLAY_HALF, PLAY_HALF)
    const cz = pick(-PLAY_HALF, PLAY_HALF)
    const count = 4 + Math.floor(random() * 5)
    for (let i = 0; i < count; i++) {
      const size = pick(0.8, 1.25)
      place({ kind: 'tree', x: cx + pick(-12, 12), z: cz + pick(-12, 12), radius: 0.35 * size, height: 5 * size, size })
    }
  }

  for (const site of sites) {
    const angle = random() * Math.PI * 2
    const distance = pick(PAD_BLEND_RADIUS - 3, PAD_BLEND_RADIUS)
    place({ kind: 'lamppost', x: site.pad.x + Math.cos(angle) * distance, z: site.pad.z + Math.sin(angle) * distance, radius: 0.2, height: 6.5, size: 1 })
  }

  for (let attempt = 0; attempt < BOULDERS * 6 && obstacles.filter((o) => o.kind === 'boulder').length < BOULDERS; attempt++) {
    const x = pick(-PLAY_HALF, PLAY_HALF)
    const z = pick(-PLAY_HALF, PLAY_HALF)
    if (rockiness(x, z, seed) > 0.2 || random() < 0.15) {
      const size = pick(0.5, 1.4)
      place({ kind: 'boulder', x, z, radius: size, height: size * 0.8, size })
    }
  }
  return obstacles
}

export function rockiness(x, z, seed) {
  return valueNoise(x / 28, z / 28, seed + 7)
}

export function groundMix(x, z, seed, height, pads) {
  const nearestPad = Math.min(...pads.map((pad) => Math.hypot(x - pad.x, z - pad.z)))
  const worksite = 1 - smoothstep(PAD_FLAT_RADIUS, PAD_BLEND_RADIUS, nearestPad)
  const keepNatural = 1 - worksite
  const rock = smoothstep(0.15, 0.35, rockiness(x, z, seed)) * keepNatural
  const grass = smoothstep(0.1, 0.4, valueNoise(x / 19, z / 19, seed + 13)) * keepNatural
  const lowGround = smoothstep(-2.5, -4.5, height + valueNoise(x / 9, z / 9, seed + 17) * 1.2)
  const mud = Math.max(lowGround, smoothstep(0.45, 0.6, valueNoise(x / 15, z / 15, seed + 19))) * keepNatural
  return { rock, grass, mud, speckle: valueNoise(x / 1.7, z / 1.7, seed + 23) }
}

function rectangleTouchesCircle(footprint, x, z, radius) {
  const dx = x - footprint.x
  const dz = z - footprint.z
  const cos = Math.cos(footprint.heading)
  const sin = Math.sin(footprint.heading)
  const along = dx * cos - dz * sin
  const across = dx * sin + dz * cos
  const outsideAlong = Math.max(0, Math.abs(along) - footprint.halfLength)
  const outsideAcross = Math.max(0, Math.abs(across) - footprint.halfWidth)
  return outsideAlong * outsideAlong + outsideAcross * outsideAcross < radius * radius
}

function leavesPlayArea(footprint) {
  const reach = Math.hypot(footprint.halfLength, footprint.halfWidth)
  return Math.abs(footprint.x) + reach > PLAY_HALF || Math.abs(footprint.z) + reach > PLAY_HALF
}

export function createWorld(seed) {
  const random = seededRandom(seed)
  const sites = placeSites(random)
  const spawnPad = { x: 0, z: 0 }
  const pads = [spawnPad, ...sites.map((site) => site.pad)]
  const heights = buildHeights(seed, pads)
  const groundAt = createGroundSampler(heights)
  const obstacles = placeObstacles(random, seed, pads, sites)
  const hoppers = sites.map((site) => ({ ...site.hopper, base: site.pad.base }))

  function solidAt(x, z) {
    let height = groundAt(x, z)
    for (const hopper of hoppers) {
      const reach = HOPPER.half + HOPPER.wall
      if (Math.abs(x - hopper.x) < reach && Math.abs(z - hopper.z) < reach) {
        height = Math.max(height, hopper.base + HOPPER.rim)
      }
    }
    for (const obstacle of obstacles) {
      if (Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius) {
        height = Math.max(height, groundAt(obstacle.x, obstacle.z) + obstacle.height)
      }
    }
    return height
  }

  function footprintBlocked(footprint) {
    if (leavesPlayArea(footprint)) {
      return true
    }
    const hitsHopper = hoppers.some((hopper) => rectangleTouchesCircle(footprint, hopper.x, hopper.z, HOPPER_BLOCK_RADIUS))
    const hitsObstacle = obstacles.some((obstacle) => rectangleTouchesCircle(footprint, obstacle.x, obstacle.z, obstacle.radius))
    return hitsHopper || hitsObstacle
  }

  return {
    seed,
    heights,
    pads,
    sites,
    obstacles,
    groundAt,
    solidAt,
    footprintBlocked,
    mixAt: (x, z, height) => groundMix(x, z, seed, height, pads),
  }
}
