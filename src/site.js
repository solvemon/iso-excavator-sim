import * as THREE from 'three'
import { FINISHES, SAND_DETAIL, worldScaleBoxUVs } from './textures.js'
import { HOPPER } from './world.js'

const SAND = 0xc8a46a
const FULL_LEVEL = HOPPER.rim - 0.15
export const BUCKETS_TO_COMPLETE = 6
const SINK = 0.3
const FLAG_COLOR = 0x3ddc84

function wall(group, center, size, seed) {
  const mesh = new THREE.Mesh(worldScaleBoxUVs(new THREE.BoxGeometry(...size), ...size, seed), FINISHES.hopper())
  mesh.position.set(...center)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
}

function buildWalls(group) {
  const { half, rim, wall: thickness } = HOPPER
  const height = rim + SINK
  const middle = (rim - SINK) / 2
  const span = half * 2
  wall(group, [-half - thickness / 2, middle, 0], [thickness, height, span], 101)
  wall(group, [half + thickness / 2, middle, 0], [thickness, height, span], 102)
  wall(group, [0, middle, half + thickness / 2], [span + thickness * 2, height, thickness], 103)
  wall(group, [0, middle, -half - thickness / 2], [span + thickness * 2, height, thickness], 104)
}

function buildContents(group) {
  const span = HOPPER.half * 2
  const { map, bumpMap } = SAND_DETAIL()
  const contents = new THREE.Mesh(
    worldScaleBoxUVs(new THREE.BoxGeometry(span, 1, span), span, 1, span, 105),
    new THREE.MeshStandardMaterial({ color: SAND, map, bumpMap, bumpScale: 3, roughness: 1 }),
  )
  contents.receiveShadow = true
  group.add(contents)
  return contents
}

function buildFlag(group) {
  const flag = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 8), FINISHES.chrome())
  pole.position.y = 1.5
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.03), new THREE.MeshStandardMaterial({ color: FLAG_COLOR, emissive: FLAG_COLOR, emissiveIntensity: 0.3 }))
  cloth.position.set(0.47, 2.7, 0)
  flag.add(pole, cloth)
  flag.position.set(HOPPER.half + HOPPER.wall, HOPPER.rim, HOPPER.half + HOPPER.wall)
  flag.visible = false
  group.add(flag)
  return flag
}

export function createHopper(scene, center, base) {
  const group = new THREE.Group()
  group.position.set(center.x, base, center.z)
  buildWalls(group)
  const contents = buildContents(group)
  const flag = buildFlag(group)
  scene.add(group)

  let stored = 0

  function level() {
    return Math.min(FULL_LEVEL, (stored / BUCKETS_TO_COMPLETE) * FULL_LEVEL)
  }

  function contains(x, z) {
    return Math.abs(x - center.x) < HOPPER.half && Math.abs(z - center.z) < HOPPER.half
  }

  function receive(buckets) {
    stored += buckets
  }

  function isComplete() {
    return stored >= BUCKETS_TO_COMPLETE
  }

  function update() {
    const height = Math.max(0.01, level())
    contents.scale.y = height
    contents.position.y = height / 2
    flag.visible = isComplete()
  }

  return {
    contains,
    surfaceHeight: () => base + level(),
    receive,
    update,
    isComplete,
    filled: () => Math.min(stored, BUCKETS_TO_COMPLETE),
  }
}
