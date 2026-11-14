import * as THREE from 'three'
import { GROUND_DETAIL, planarWorldUVs } from './textures.js'
import { PLAY_HALF, TERRAIN_HALF, TERRAIN_SEGMENTS } from './world.js'

const DIRT = new THREE.Color(0xb59a6a)
const GRASS = new THREE.Color(0x8c8a50)
const ROCK = new THREE.Color(0x8d8a84)
const MUD = new THREE.Color(0x5b4831)
const SPECKLE = 0.07
const DETAIL_TILE = 4

const BARRIER = { length: 3, height: 0.9, thickness: 0.5, gap: 0.3 }

function groundColor(target, mix) {
  target.copy(DIRT)
  target.lerp(GRASS, mix.grass * 0.8)
  target.lerp(ROCK, mix.rock)
  target.lerp(MUD, mix.mud * 0.85)
  return target.multiplyScalar(1 + mix.speckle * SPECKLE)
}

function buildTerrainMesh(world) {
  const geometry = new THREE.PlaneGeometry(TERRAIN_HALF * 2, TERRAIN_HALF * 2, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS).rotateX(-Math.PI / 2)
  planarWorldUVs(geometry, (point) => point, DETAIL_TILE)
  const positions = geometry.attributes.position
  const colors = new Float32Array(positions.count * 3)
  const color = new THREE.Color()
  for (let i = 0; i < positions.count; i++) {
    const height = world.heights[i]
    positions.setY(i, height)
    groundColor(color, world.mixAt(positions.getX(i), positions.getZ(i), height))
    color.toArray(colors, i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()

  const { map, bumpMap } = GROUND_DETAIL()
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, map, bumpMap, bumpScale: 1.5, roughness: 1 }),
  )
  mesh.receiveShadow = true
  return mesh
}

function barrierPlacements(world) {
  const step = BARRIER.length + BARRIER.gap
  const placements = []
  for (let along = -PLAY_HALF; along < PLAY_HALF; along += step) {
    const middle = along + step / 2
    placements.push([middle, -PLAY_HALF, 0], [middle, PLAY_HALF, 0], [-PLAY_HALF, middle, Math.PI / 2], [PLAY_HALF, middle, Math.PI / 2])
  }
  return placements.map(([x, z, turn]) => ({ x, z, turn, y: world.groundAt(x, z) }))
}

function buildBoundary(world) {
  const placements = barrierPlacements(world)
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(BARRIER.length, BARRIER.height, BARRIER.thickness),
    new THREE.MeshStandardMaterial({ color: 0xd9652b, roughness: 0.7 }),
    placements.length,
  )
  const matrix = new THREE.Matrix4()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const position = new THREE.Vector3()
  placements.forEach(({ x, y, z, turn }, index) => {
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn)
    position.set(x, y + BARRIER.height / 2 - 0.1, z)
    mesh.setMatrixAt(index, matrix.compose(position, rotation, scale))
  })
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export function createTerrain(scene, world) {
  scene.add(buildTerrainMesh(world), buildBoundary(world))
}
