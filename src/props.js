import * as THREE from 'three'

const LEAF_COLORS = [0x4f6b32, 0x5c7a38, 0x435e2c]

const materials = {
  bark: new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1 }),
  leaves: LEAF_COLORS.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true })),
  pole: new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.6, roughness: 0.45 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe2a0, emissiveIntensity: 0.6 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x8b8882, roughness: 0.95, flatShading: true }),
}

const geometries = {
  trunk: new THREE.CylinderGeometry(0.18, 0.3, 3, 8).translate(0, 1.5, 0),
  canopy: new THREE.IcosahedronGeometry(1.6, 0),
  pole: new THREE.CylinderGeometry(0.08, 0.13, 6.5, 10).translate(0, 3.25, 0),
  lampArm: new THREE.BoxGeometry(1.2, 0.08, 0.08),
  lampHead: new THREE.BoxGeometry(0.6, 0.15, 0.3),
  boulder: new THREE.DodecahedronGeometry(1, 0),
}

function shaded(mesh) {
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function buildTree(obstacle, random) {
  const tree = new THREE.Group()
  tree.add(shaded(new THREE.Mesh(geometries.trunk, materials.bark)))
  const blobs = 2 + Math.floor(random() * 2)
  for (let i = 0; i < blobs; i++) {
    const leaves = materials.leaves[Math.floor(random() * materials.leaves.length)]
    const canopy = shaded(new THREE.Mesh(geometries.canopy, leaves))
    canopy.position.set((random() - 0.5) * 1.4, 3.4 + random() * 1.4, (random() - 0.5) * 1.4)
    canopy.scale.setScalar(0.8 + random() * 0.5)
    canopy.rotation.set(random() * 3, random() * 3, 0)
    tree.add(canopy)
  }
  tree.scale.setScalar(obstacle.size)
  return tree
}

function buildLamppost() {
  const post = new THREE.Group()
  post.add(shaded(new THREE.Mesh(geometries.pole, materials.pole)))
  const arm = shaded(new THREE.Mesh(geometries.lampArm, materials.pole))
  arm.position.set(0.55, 6.4, 0)
  const head = new THREE.Mesh(geometries.lampHead, materials.lamp)
  head.position.set(1.1, 6.32, 0)
  post.add(arm, head)
  return post
}

function buildBoulder(obstacle, random) {
  const boulder = shaded(new THREE.Mesh(geometries.boulder, materials.rock))
  boulder.scale.set(obstacle.size * (0.9 + random() * 0.4), obstacle.size * (0.6 + random() * 0.3), obstacle.size * (0.9 + random() * 0.4))
  boulder.rotation.set(random() * 0.4, random() * 3, random() * 0.4)
  boulder.position.y = obstacle.size * 0.15
  const holder = new THREE.Group()
  holder.add(boulder)
  return holder
}

const BUILDERS = { tree: buildTree, lamppost: buildLamppost, boulder: buildBoulder }

export function createProps(scene, world, random) {
  for (const obstacle of world.obstacles) {
    const prop = BUILDERS[obstacle.kind](obstacle, random)
    prop.position.set(obstacle.x, world.groundAt(obstacle.x, obstacle.z) - 0.05, obstacle.z)
    prop.rotation.y = obstacle.turn
    scene.add(prop)
  }
}
