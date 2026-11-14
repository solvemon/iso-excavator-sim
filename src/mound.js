import * as THREE from 'three'
import { GROUND_DETAIL, planarWorldUVs } from './textures.js'

const SIZE = 8
const SEGMENTS = 56
const PEAK = 2
const FOOT_RADIUS = 3.2
const REGROW_RATE = 0.025
const SCOOP_RADIUS = 0.45
const REACH = SCOOP_RADIUS * 3

const SAND = new THREE.Color(0xc8a46a)
const GROUND = new THREE.Color(0xb59a6a)
const BLEND_HEIGHT = 0.12
const FRESH_CUT = new THREE.Color(0x9c7c48)
const FRESH_CUT_DEPTH = 0.4
const DETAIL_TILE = 4

const CELL = SIZE / SEGMENTS
const ROW = SEGMENTS + 1

function restingShape(dx, dz) {
  const t = 1 - Math.hypot(dx, dz) / FOOT_RADIUS
  if (t <= 0) {
    return 0
  }
  return PEAK * t * t * (3 - 2 * t)
}

function offsetX(index) {
  return -SIZE / 2 + (index % ROW) * CELL
}

function offsetZ(index) {
  return -SIZE / 2 + Math.floor(index / ROW) * CELL
}

export const MOUND_REACH = SIZE / 2

export function createMound(scene, center, base) {
  const vertexX = (index) => center.x + offsetX(index)
  const vertexZ = (index) => center.z + offsetZ(index)

  const resting = new Float32Array(ROW * ROW)
  const heights = new Float32Array(ROW * ROW)
  for (let i = 0; i < resting.length; i++) {
    resting[i] = restingShape(offsetX(i), offsetZ(i))
    heights[i] = resting[i]
  }

  const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS).rotateX(-Math.PI / 2)
  planarWorldUVs(geometry, (point) => point.set(point.x + center.x, 0, point.z + center.z), DETAIL_TILE)
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ROW * ROW * 3), 3))
  const { map, bumpMap } = GROUND_DETAIL()
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map,
      bumpMap,
      bumpScale: 1.5,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  )
  mesh.position.set(center.x, base + 0.005, center.z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  scene.add(mesh)

  let dirty = true

  const color = new THREE.Color()

  function redraw() {
    const positions = geometry.attributes.position
    const colors = geometry.attributes.color
    for (let i = 0; i < heights.length; i++) {
      positions.setY(i, heights[i])
      color.lerpColors(GROUND, SAND, Math.min(1, heights[i] / BLEND_HEIGHT))
      color.lerp(FRESH_CUT, Math.min(1, (resting[i] - heights[i]) / FRESH_CUT_DEPTH) * 0.7)
      colors.setXYZ(i, color.r, color.g, color.b)
    }
    positions.needsUpdate = true
    colors.needsUpdate = true
    geometry.computeVertexNormals()
    dirty = false
  }

  function pileAt(x, z) {
    const gx = (x - center.x + SIZE / 2) / CELL
    const gz = (z - center.z + SIZE / 2) / CELL
    if (gx < 0 || gz < 0 || gx >= SEGMENTS || gz >= SEGMENTS) {
      return 0
    }
    const ix = Math.floor(gx)
    const iz = Math.floor(gz)
    const fx = gx - ix
    const fz = gz - iz
    const i = iz * ROW + ix
    const top = heights[i] * (1 - fx) + heights[i + 1] * fx
    const bottom = heights[i + ROW] * (1 - fx) + heights[i + ROW + 1] * fx
    return top * (1 - fz) + bottom * fz
  }

  function weightsAround(x, z) {
    const weights = []
    let total = 0
    for (let i = 0; i < heights.length; i++) {
      const distance = Math.hypot(vertexX(i) - x, vertexZ(i) - z)
      if (distance < REACH) {
        const weight = Math.exp(-(distance * distance) / (2 * SCOOP_RADIUS * SCOOP_RADIUS))
        weights.push([i, weight])
        total += weight
      }
    }
    return { weights, total: total * CELL * CELL }
  }

  function take(x, z, volume) {
    const { weights, total } = weightsAround(x, z)
    if (total === 0) {
      return 0
    }
    let removed = 0
    for (const [i, weight] of weights) {
      const cut = Math.min(heights[i], (volume * weight) / total)
      heights[i] -= cut
      removed += cut * CELL * CELL
    }
    dirty = true
    return removed
  }

  function add(x, z, volume) {
    const { weights, total } = weightsAround(x, z)
    if (total === 0) {
      return
    }
    for (const [i, weight] of weights) {
      heights[i] += (volume * weight) / total
    }
    dirty = true
  }

  function update(dt) {
    const growth = REGROW_RATE * dt
    for (let i = 0; i < heights.length; i++) {
      if (heights[i] < resting[i]) {
        heights[i] = Math.min(resting[i], heights[i] + growth)
        dirty = true
      }
    }
    if (dirty) {
      redraw()
    }
  }

  redraw()
  return { pileAt, take, add, update }
}
