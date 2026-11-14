import * as THREE from 'three'

const BUCKET_VOLUME = 0.8
const TONNES_PER_BUCKET = BUCKET_VOLUME * 1.7
const CUT_RATE = 1.5
const FULL_DEPTH = 0.35
const POUR_RATE = 0.8
const GRAINS_PER_BUCKET = 450
const GRAIN_POOL = 900
const GRAIN_SIZE = 0.09
const POUR_WIDTH = 1.0
const POUR_PUSH = 0.8
const GRAVITY = -9.81
const ON_MOUND = 0.05

function capacityAtTilt(mouthUpness) {
  return THREE.MathUtils.clamp(mouthUpness + 0.5, 0, 1)
}

function jitter(size) {
  return new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(size),
    THREE.MathUtils.randFloatSpread(size),
    THREE.MathUtils.randFloatSpread(size),
  )
}

function createGrains(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(GRAIN_SIZE),
    new THREE.MeshStandardMaterial({ color: 0xb8945a, roughness: 1, flatShading: true }),
    GRAIN_POOL,
  )
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false
  mesh.castShadow = true
  scene.add(mesh)

  const grains = Array.from({ length: GRAIN_POOL }, () => ({
    alive: false,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
  }))
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
  const matrix = new THREE.Matrix4()
  let next = 0
  let owed = 0

  function emit(pour, amount) {
    owed += amount * GRAINS_PER_BUCKET
    while (owed >= 1) {
      owed -= 1
      const grain = grains[next]
      next = (next + 1) % GRAIN_POOL
      grain.alive = true
      grain.position
        .copy(pour.origin)
        .addScaledVector(pour.widthAxis, THREE.MathUtils.randFloatSpread(POUR_WIDTH))
        .add(jitter(0.08))
      grain.velocity
        .copy(pour.carrier)
        .multiplyScalar(0.6)
        .addScaledVector(pour.outward, POUR_PUSH * Math.random())
        .add(jitter(0.3))
    }
  }

  function update(dt, floorAt) {
    grains.forEach((grain, index) => {
      if (grain.alive) {
        grain.velocity.y += GRAVITY * dt
        grain.position.addScaledVector(grain.velocity, dt)
        if (grain.position.y < floorAt(grain.position.x, grain.position.z)) {
          grain.alive = false
        }
      }
      if (grain.alive) {
        mesh.setMatrixAt(index, matrix.makeTranslation(grain.position))
      } else {
        mesh.setMatrixAt(index, hidden)
      }
    })
    mesh.instanceMatrix.needsUpdate = true
  }

  return { emit, update }
}

export function createDigJob({ scene, excavator, sites }) {
  const grains = createGrains(scene)
  const bucket = {
    mouthCenter: new THREE.Vector3(),
    mouthNormal: new THREE.Vector3(),
    teeth: new THREE.Vector3(),
    lip: new THREE.Vector3(),
    widthAxis: new THREE.Vector3(),
  }
  const previousMouth = new THREE.Vector3()
  const mouthVelocity = new THREE.Vector3()
  const pourPoint = new THREE.Vector3()
  const stats = { load: 0, delivered: 0, spilled: 0 }
  let hasPrevious = false
  let fill = 0

  function floorAt(x, z) {
    const hopper = sites.hopperAt(x, z)
    if (hopper) {
      return hopper.surfaceHeight()
    }
    return sites.surfaceAt(x, z)
  }

  function cut(capacity, dt) {
    const { x, z } = bucket.mouthCenter
    const depth = sites.surfaceAt(x, z) - bucket.mouthCenter.y
    const faceFirstSpeed = mouthVelocity.dot(bucket.mouthNormal)
    if (sites.pileAt(x, z) <= 0 || depth <= 0 || faceFirstSpeed <= 0 || fill >= capacity) {
      return
    }
    const wanted = Math.min(capacity - fill, CUT_RATE * faceFirstSpeed * Math.min(1, depth / FULL_DEPTH) * dt)
    const removed = sites.take(x, z, wanted * BUCKET_VOLUME)
    fill += removed / BUCKET_VOLUME
  }

  function land(amount) {
    const { x, z } = pourPoint
    const hopper = sites.hopperAt(x, z)
    if (hopper) {
      hopper.receive(amount)
      stats.delivered += amount * TONNES_PER_BUCKET
      return
    }
    if (sites.pileAt(x, z) > ON_MOUND) {
      sites.add(x, z, amount * BUCKET_VOLUME)
      return
    }
    stats.spilled += amount * TONNES_PER_BUCKET
  }

  function pour(capacity, dt) {
    if (fill <= capacity) {
      return
    }
    const amount = Math.min(fill - capacity, POUR_RATE * dt)
    fill -= amount
    if (bucket.teeth.y < bucket.lip.y) {
      pourPoint.copy(bucket.teeth)
    } else {
      pourPoint.copy(bucket.lip)
    }
    grains.emit({ origin: pourPoint, carrier: mouthVelocity, outward: bucket.mouthNormal, widthAxis: bucket.widthAxis }, amount)
    land(amount)
  }

  function update(dt) {
    excavator.readBucket(bucket)
    if (hasPrevious) {
      mouthVelocity.subVectors(bucket.mouthCenter, previousMouth).divideScalar(dt)
    }
    previousMouth.copy(bucket.mouthCenter)
    hasPrevious = true

    const capacity = capacityAtTilt(bucket.mouthNormal.y)
    cut(capacity, dt)
    pour(capacity, dt)

    excavator.setLoad(fill)
    grains.update(dt, floorAt)
    stats.load = fill
  }

  return { update, stats }
}
