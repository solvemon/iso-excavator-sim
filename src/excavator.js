import * as THREE from 'three'
import { FINISHES, SAND_DETAIL, worldScaleBoxUVs, worldScaleUVs } from './textures.js'

const JOINTS = {
  swing: { min: -Infinity, max: Infinity, speed: 0.7, response: 1.5, braking: 5, initial: 0 },
  boom: { min: -0.55, max: 1.05, speed: 0.55, response: 8, braking: 8, initial: 0.8 },
  stick: { min: -2.6, max: -0.45, speed: 0.8, response: 8, braking: 8, initial: -2.3 },
  bucket: { min: -2.05, max: 0.6, speed: 1.4, response: 8, braking: 8, initial: -0.6 },
}

const TRACK = { min: -Infinity, max: Infinity, speed: 2.2, response: 2.5, braking: 6 }
const TRACK_GAUGE = 2.5
const TRACK_LENGTH = 4.2
const TRACK_HEIGHT = 0.8
const TRACK_WIDTH = 0.9
const FOOTPRINT = { halfLength: 2.1, halfWidth: 1.7 }
const CONTACT = { halfLength: 1.7, halfGauge: TRACK_GAUGE / 2 }
const SUSPENSION = { stiffness: 70, damping: 9, lurch: 0.015, maxLurch: 0.06 }
const BELT = 1
const ROLLER_COUNT = 4

const GROUND_CLEARANCE = 0.03
const GROUND_PUSH_SPEED = 0.6
const GROUND_PUSH_TRIES = 5

const BUCKET_OUTLINE = [[0.2, -0.45], [0, 0.1], [1.1, 0.1], [1.35, -0.35], [1.25, -0.85]]
const BUCKET_HALF_WIDTH = 0.55
const PLATE = 0.08
const LOAD_ANCHOR = [1.0, -0.05]
const HEAPED_SCALE = 1.18
const SAND = 0xc8a46a

const BOOM_BEAMS = [
  { from: [0, 0], to: [2.6, 0.9], thickness: 0.5, depth: 0.45 },
  { from: [2.6, 0.9], to: [4.6, 0], thickness: 0.45, depth: 0.45 },
]
const STICK_BEAMS = [{ from: [-0.8, 0], to: [2.75, 0], thickness: 0.35, depth: 0.35 }]

const CYLINDER_OVERLAP = 0.62
const UP = new THREE.Vector3(0, 1, 0)

let uvSeed = 1

function box(width, height, depth, finish, position) {
  const geometry = worldScaleBoxUVs(new THREE.BoxGeometry(width, height, depth), width, height, depth, uvSeed++)
  const mesh = new THREE.Mesh(geometry, FINISHES[finish]())
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function beamShape({ from, to, thickness, depth }) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  return {
    center: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, 0],
    half: [Math.hypot(dx, dy) / 2, thickness / 2, depth / 2],
    angle: Math.atan2(dy, dx),
  }
}

function boxMesh(shape, finish) {
  const [hx, hy, hz] = shape.half
  const mesh = box(hx * 2, hy * 2, hz * 2, finish, shape.center)
  mesh.rotation.z = shape.angle
  return mesh
}

function outlineCentroid() {
  const sum = BUCKET_OUTLINE.reduce(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0])
  return [sum[0] / BUCKET_OUTLINE.length, sum[1] / BUCKET_OUTLINE.length]
}

function outwardNormal(from, to, centroid) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  let nx = (to[1] - from[1]) / length
  let ny = -(to[0] - from[0]) / length
  const towardCentroid = (centroid[0] - (from[0] + to[0]) / 2) * nx + (centroid[1] - (from[1] + to[1]) / 2) * ny
  if (towardCentroid > 0) {
    nx = -nx
    ny = -ny
  }
  return [nx, ny]
}

function outlineShape(points) {
  return new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)))
}

function cheekMesh(side) {
  const geometry = new THREE.ExtrudeGeometry(outlineShape(BUCKET_OUTLINE), { depth: PLATE, bevelEnabled: false })
  geometry.translate(0, 0, side * (BUCKET_HALF_WIDTH + PLATE / 2) - PLATE / 2)
  const mesh = new THREE.Mesh(worldScaleUVs(geometry), FINISHES.darkSteel())
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function buildLoad() {
  const [cx, cy] = outlineCentroid()
  const inset = BUCKET_OUTLINE.map(([x, y]) => [cx + (x - cx) * 0.9, cy + (y - cy) * 0.9])
  const depth = 2 * (BUCKET_HALF_WIDTH - 0.03)
  const geometry = new THREE.ExtrudeGeometry(outlineShape(inset), { depth, bevelEnabled: false })
  geometry.translate(-LOAD_ANCHOR[0], -LOAD_ANCHOR[1], -depth / 2)

  const { map, bumpMap } = SAND_DETAIL()
  const mesh = new THREE.Mesh(
    worldScaleUVs(geometry),
    new THREE.MeshStandardMaterial({ color: SAND, map, bumpMap, bumpScale: 3, roughness: 1, flatShading: true }),
  )
  mesh.position.set(LOAD_ANCHOR[0], LOAD_ANCHOR[1], 0)
  mesh.castShadow = true
  mesh.visible = false
  return mesh
}

function pin(radius, depth) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 16), FINISHES.chrome())
  mesh.rotation.x = Math.PI / 2
  return mesh
}

function addMarker(parent, point) {
  const marker = new THREE.Object3D()
  marker.position.set(...point)
  parent.add(marker)
  return marker
}

function boxCorners(shape) {
  const [cx, cy] = shape.center
  const [hx, hy, hz] = shape.half
  const cos = Math.cos(shape.angle)
  const sin = Math.sin(shape.angle)
  const corners = []
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = cx + sx * hx * cos - sy * hy * sin
      const y = cy + sx * hx * sin + sy * hy * cos
      corners.push([x, y, hz], [x, y, -hz])
    }
  }
  return corners
}

function trackOutline() {
  const radius = TRACK_HEIGHT / 2
  const straight = TRACK_LENGTH / 2 - radius
  const outline = new THREE.Shape()
  outline.moveTo(-straight, 0)
  outline.lineTo(straight, 0)
  outline.absarc(straight, radius, radius, -Math.PI / 2, Math.PI / 2, false)
  outline.lineTo(-straight, TRACK_HEIGHT)
  outline.absarc(-straight, radius, radius, Math.PI / 2, (Math.PI * 3) / 2, false)
  return outline
}

function scrollableTrackMaterial() {
  const material = FINISHES.tracks().clone()
  material.map = material.map.clone()
  material.roughnessMap = material.roughnessMap.clone()
  material.bumpMap = material.bumpMap.clone()
  return material
}

function buildTrack(side) {
  const bevel = 0.05
  const geometry = new THREE.ExtrudeGeometry(trackOutline(), {
    depth: TRACK_WIDTH - bevel * 2,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 12,
  })
  geometry.translate(0, 0, -(TRACK_WIDTH - bevel * 2) / 2)
  const sidePlates = FINISHES.darkSteel()
  const mesh = new THREE.Mesh(worldScaleUVs(geometry), [sidePlates, scrollableTrackMaterial()])
  mesh.position.z = side * (TRACK_GAUGE / 2)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function trackWheel(x, y, side, radius) {
  const wheel = pin(radius, TRACK_WIDTH + 0.12)
  wheel.position.set(x, y, side * (TRACK_GAUGE / 2))
  wheel.material = FINISHES.counterweight()
  return wheel
}

function buildUndercarriage() {
  const group = new THREE.Group()
  const tracks = { left: buildTrack(-1), right: buildTrack(1) }
  group.add(tracks.left, tracks.right)
  group.add(box(2.2, 0.5, 1.8, 'darkSteel', [0, 0.6, 0]))
  const wheelX = TRACK_LENGTH / 2 - TRACK_HEIGHT / 2
  for (const z of [1, -1]) {
    for (const x of [-wheelX, wheelX]) {
      group.add(trackWheel(x, TRACK_HEIGHT / 2, z, 0.3))
    }
    for (let i = 1; i <= ROLLER_COUNT; i++) {
      const x = -wheelX + (i * 2 * wheelX) / (ROLLER_COUNT + 1)
      group.add(trackWheel(x, 0.22, z, 0.13))
    }
  }
  return { group, tracks }
}

function scrollTread(track, distance) {
  const material = track.material[BELT]
  for (const map of [material.map, material.roughnessMap, material.bumpMap]) {
    map.offset.x = -distance / 1.5
  }
}

function buildBucket() {
  const bucket = new THREE.Group()
  bucket.position.set(2.9, 0, 0)

  const shellDepth = 2 * (BUCKET_HALF_WIDTH + PLATE)
  for (let i = 0; i < BUCKET_OUTLINE.length - 1; i++) {
    const shape = beamShape({ from: BUCKET_OUTLINE[i], to: BUCKET_OUTLINE[i + 1], thickness: PLATE, depth: shellDepth })
    bucket.add(boxMesh(shape, 'darkSteel'))
  }
  bucket.add(cheekMesh(1), cheekMesh(-1), pin(0.11, 1.3))
  bucket.add(box(0.2, 0.3, 0.3, 'darkSteel', [0.1, 0.22, 0]))

  const lip = BUCKET_OUTLINE[0]
  const tip = BUCKET_OUTLINE[BUCKET_OUTLINE.length - 1]
  for (const z of [-0.4, -0.13, 0.13, 0.4]) {
    bucket.add(box(0.14, 0.18, 0.1, 'darkSteel', [tip[0] - 0.02, tip[1] - 0.06, z]))
  }

  const load = buildLoad()
  bucket.add(load)

  const probePoints = []
  for (const [x, y] of BUCKET_OUTLINE) {
    probePoints.push([x, y - PLATE, BUCKET_HALF_WIDTH + PLATE], [x, y - PLATE, -BUCKET_HALF_WIDTH - PLATE])
  }
  probePoints.push([tip[0], tip[1] - 0.15, 0])

  const [nx, ny] = outwardNormal(tip, lip, outlineCentroid())
  return {
    bucket,
    load,
    probes: probePoints.map((point) => addMarker(bucket, point)),
    teeth: addMarker(bucket, [tip[0], tip[1], 0]),
    lip: addMarker(bucket, [lip[0], lip[1], 0]),
    mouthCenter: addMarker(bucket, [(lip[0] + tip[0]) / 2, (lip[1] + tip[1]) / 2, 0]),
    linkPoint: addMarker(bucket, [0.1, 0.35, 0]),
    mouthNormal: new THREE.Vector3(nx, ny, 0),
  }
}

function buildBeamPart(position, beams) {
  const group = new THREE.Group()
  group.position.set(...position)
  const shapes = beams.map(beamShape)
  for (const shape of shapes) {
    group.add(boxMesh(shape, 'paint'))
  }
  const probes = shapes.flatMap(boxCorners).map((point) => addMarker(group, point))
  return { group, probes }
}

function buildArm() {
  const boom = buildBeamPart([1.0, 1.0, 0.35], BOOM_BEAMS)
  boom.group.add(pin(0.15, 0.6))
  boom.group.add(box(0.3, 0.35, 0.3, 'paint', [2.0, 1.05, 0]))

  const stick = buildBeamPart([4.6, 0, 0], STICK_BEAMS)
  stick.group.add(pin(0.13, 0.55))
  stick.group.add(box(0.3, 0.3, 0.3, 'paint', [0.5, 0.25, 0]))
  boom.group.add(stick.group)

  const bucket = buildBucket()
  stick.group.add(bucket.bucket)

  return {
    boom: boom.group,
    stick: stick.group,
    bucket,
    probes: [...boom.probes, ...stick.probes, ...bucket.probes],
    cylinderMounts: [
      { anchor: null, target: addMarker(boom.group, [1.5, 0.12, 0]), radius: 0.11 },
      { anchor: addMarker(boom.group, [2.0, 1.2, 0]), target: addMarker(stick.group, [-0.75, 0, 0]), radius: 0.1 },
      { anchor: addMarker(stick.group, [0.5, 0.38, 0]), target: bucket.linkPoint, radius: 0.08 },
    ],
  }
}

function buildHouse() {
  const house = new THREE.Group()
  house.position.y = 1.0
  house.add(box(2.8, 0.9, 2.6, 'paint', [-0.1, 0.45, 0]))
  house.add(box(0.7, 1.1, 2.6, 'counterweight', [-1.85, 0.6, 0]))
  house.add(box(1.1, 1.4, 1.0, 'paint', [0.5, 1.6, -0.75]))
  house.add(box(0.12, 0.7, 0.12, 'darkSteel', [-0.9, 1.25, 0.9]))

  const glass = [
    [[0.05, 0.9, 0.85], [1.06, 1.75, -0.75]],
    [[0.75, 0.7, 0.05], [0.55, 1.75, -1.26]],
    [[0.75, 0.7, 0.05], [0.55, 1.75, -0.24]],
  ]
  for (const [size, position] of glass) {
    const pane = box(...size, 'glass', position)
    pane.castShadow = false
    house.add(pane)
  }
  return house
}

export const BUCKET_TEETH = new THREE.Vector3(...BUCKET_OUTLINE[BUCKET_OUTLINE.length - 1], 0)

export const JOINT_LIMITS = Object.fromEntries(
  Object.entries(JOINTS).map(([name, joint]) => [name, { min: joint.min, max: joint.max }]),
)

export function createGhostBucket(material) {
  const ghost = buildBucket()
  ghost.load.removeFromParent()
  ghost.bucket.traverse((part) => {
    if (part.isMesh) {
      part.material = material
      part.castShadow = false
      part.receiveShadow = false
    }
  })
  ghost.bucket.matrixAutoUpdate = false
  return ghost.bucket
}

function buildCabCamera(house) {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 5000)
  camera.position.set(0.6, 1.95, -0.75)
  camera.rotation.order = 'YXZ'
  camera.rotation.y = -Math.PI / 2
  camera.rotation.x = -0.3
  house.add(camera)
  return camera
}

function createCylinder(parent, anchor, target, radius) {
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 14), FINISHES.paint())
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, 1, 12), FINISHES.chrome())
  barrel.castShadow = true
  rod.castShadow = true
  parent.add(barrel, rod)

  const from = new THREE.Vector3()
  const to = new THREE.Vector3()
  const direction = new THREE.Vector3()
  let barrelLength = 0
  let rodLength = 0

  function place(mesh, length, start, sign) {
    mesh.scale.set(1, length, 1)
    mesh.quaternion.setFromUnitVectors(UP, direction)
    mesh.position.copy(start).addScaledVector(direction, (sign * length) / 2)
  }

  function update() {
    parent.worldToLocal(anchor.getWorldPosition(from))
    parent.worldToLocal(target.getWorldPosition(to))
    const distance = from.distanceTo(to)
    direction.subVectors(to, from).normalize()
    if (barrelLength === 0) {
      barrelLength = distance * CYLINDER_OVERLAP
      rodLength = distance * CYLINDER_OVERLAP
    }
    place(barrel, barrelLength, from, 1)
    place(rod, rodLength, to, -1)
  }

  return update
}

function createJointState() {
  const state = {}
  for (const [name, joint] of Object.entries(JOINTS)) {
    state[name] = { angle: joint.initial, velocity: 0 }
  }
  return state
}

function isSlowingDown(velocity, targetVelocity) {
  const reversing = Math.sign(targetVelocity) !== Math.sign(velocity)
  return reversing || Math.abs(targetVelocity) < Math.abs(velocity)
}

function stepJoint(state, joint, command, dt) {
  const targetVelocity = command * joint.speed
  let rate = joint.response
  if (isSlowingDown(state.velocity, targetVelocity)) {
    rate = joint.braking
  }
  const blend = Math.min(1, dt * rate)
  state.velocity += (targetVelocity - state.velocity) * blend

  const next = state.angle + state.velocity * dt
  const clamped = THREE.MathUtils.clamp(next, joint.min, joint.max)
  if (clamped !== next) {
    state.velocity = 0
  }
  state.angle = clamped
}

function springTowards(spring, target, dt) {
  const acceleration = SUSPENSION.stiffness * (target - spring.value) - SUSPENSION.damping * spring.velocity
  spring.velocity += acceleration * dt
  spring.value += spring.velocity * dt
}

export function createExcavator({ groundAt, solidAt, footprintBlocked }) {
  const root = new THREE.Group()
  root.rotation.order = 'YZX'
  const undercarriage = buildUndercarriage()
  root.add(undercarriage.group)
  const trackStates = { left: { angle: 0, velocity: 0 }, right: { angle: 0, velocity: 0 } }
  const suspension = {
    height: { value: 0, velocity: 0 },
    pitch: { value: 0, velocity: 0 },
    roll: { value: 0, velocity: 0 },
  }
  let previousDriveSpeed = 0

  const house = buildHouse()
  root.add(house)

  const arm = buildArm()
  house.add(arm.boom)

  const cabCamera = buildCabCamera(house)
  const joints = createJointState()
  const scratch = new THREE.Vector3()

  arm.cylinderMounts[0].anchor = addMarker(house, [1.3, 0.55, 0.35])
  const cylinders = arm.cylinderMounts.map(({ anchor, target, radius }) => createCylinder(house, anchor, target, radius))

  function applyPose() {
    house.rotation.y = joints.swing.angle
    arm.boom.rotation.z = joints.boom.angle
    arm.stick.rotation.z = joints.stick.angle
    arm.bucket.bucket.rotation.z = joints.bucket.angle
    root.updateMatrixWorld(true)
  }

  function updateCylinders() {
    for (const update of cylinders) {
      update()
    }
  }

  function deepestPenetration() {
    let deepest = -Infinity
    for (const probe of arm.probes) {
      probe.getWorldPosition(scratch)
      deepest = Math.max(deepest, solidAt(scratch.x, scratch.z) + GROUND_CLEARANCE - scratch.y)
    }
    return deepest
  }

  function digsIn(penetrationBefore) {
    const penetrationAfter = deepestPenetration()
    return penetrationAfter > 0 && penetrationAfter > penetrationBefore
  }

  function groundPushesBoomUp(penetrationBefore, dt) {
    const boom = joints.boom
    const boomBefore = boom.angle
    const push = (GROUND_PUSH_SPEED * dt) / GROUND_PUSH_TRIES
    for (let i = 0; i < GROUND_PUSH_TRIES && boom.angle < JOINTS.boom.max; i++) {
      boom.angle = Math.min(JOINTS.boom.max, boom.angle + push)
      applyPose()
      if (!digsIn(penetrationBefore)) {
        return true
      }
    }
    boom.angle = boomBefore
    applyPose()
    return false
  }

  function moveJoint(name, command, dt) {
    const state = joints[name]
    const penetrationBefore = deepestPenetration()
    const angleBefore = state.angle

    stepJoint(state, JOINTS[name], command, dt)
    applyPose()

    if (!digsIn(penetrationBefore)) {
      return
    }
    if (name !== 'boom' && groundPushesBoomUp(penetrationBefore, dt)) {
      return
    }
    state.angle = angleBefore
    state.velocity = 0
    applyPose()
  }

  function blockedWhereItStands() {
    return footprintBlocked({ x: root.position.x, z: root.position.z, heading: root.rotation.y, ...FOOTPRINT })
  }

  function groundUnderTracks() {
    const heading = root.rotation.y
    const cos = Math.cos(heading)
    const sin = Math.sin(heading)
    const sample = (along, across) =>
      groundAt(root.position.x + cos * along + sin * across, root.position.z - sin * along + cos * across)
    const { halfLength, halfGauge } = CONTACT
    const frontLeft = sample(halfLength, -halfGauge)
    const frontRight = sample(halfLength, halfGauge)
    const rearLeft = sample(-halfLength, -halfGauge)
    const rearRight = sample(-halfLength, halfGauge)
    const front = (frontLeft + frontRight) / 2
    const rear = (rearLeft + rearRight) / 2
    const left = (frontLeft + rearLeft) / 2
    const right = (frontRight + rearRight) / 2
    return {
      height: (front + rear) / 2,
      pitch: Math.atan2(front - rear, halfLength * 2),
      roll: -Math.atan2(right - left, halfGauge * 2),
    }
  }

  function settleSuspension() {
    const ground = groundUnderTracks()
    for (const name of Object.keys(suspension)) {
      suspension[name].value = ground[name]
      suspension[name].velocity = 0
    }
  }

  function updateSuspension(dt) {
    const driveSpeed = (trackStates.left.velocity + trackStates.right.velocity) / 2
    const acceleration = (driveSpeed - previousDriveSpeed) / dt
    previousDriveSpeed = driveSpeed
    const lurch = THREE.MathUtils.clamp(acceleration * SUSPENSION.lurch, -SUSPENSION.maxLurch, SUSPENSION.maxLurch)
    const ground = groundUnderTracks()
    springTowards(suspension.height, ground.height, dt)
    springTowards(suspension.pitch, ground.pitch + lurch, dt)
    springTowards(suspension.roll, ground.roll, dt)
    root.position.y = suspension.height.value
    root.rotation.z = suspension.pitch.value
    root.rotation.x = suspension.roll.value
  }

  function stopTracks(before) {
    root.position.copy(before.position)
    root.rotation.y = before.heading
    trackStates.left.angle = before.left
    trackStates.right.angle = before.right
    trackStates.left.velocity = 0
    trackStates.right.velocity = 0
    applyPose()
  }

  function drive(dt, commands) {
    const before = {
      position: root.position.clone(),
      heading: root.rotation.y,
      left: trackStates.left.angle,
      right: trackStates.right.angle,
    }
    const penetrationBefore = deepestPenetration()
    stepJoint(trackStates.left, TRACK, commands.leftTrack, dt)
    stepJoint(trackStates.right, TRACK, commands.rightTrack, dt)
    const leftDistance = trackStates.left.angle - before.left
    const rightDistance = trackStates.right.angle - before.right
    if (leftDistance === 0 && rightDistance === 0) {
      return
    }

    const forward = (leftDistance + rightDistance) / 2
    const turn = (rightDistance - leftDistance) / TRACK_GAUGE
    const heading = root.rotation.y + turn / 2
    root.position.x += Math.cos(heading) * forward
    root.position.z -= Math.sin(heading) * forward
    root.rotation.y += turn
    applyPose()

    const armStuck = digsIn(penetrationBefore) && !groundPushesBoomUp(penetrationBefore, dt)
    if (blockedWhereItStands() || armStuck) {
      stopTracks(before)
      return
    }
    scrollTread(undercarriage.tracks.left, trackStates.left.angle)
    scrollTread(undercarriage.tracks.right, trackStates.right.angle)
  }

  function update(dt, commands) {
    drive(dt, commands)
    updateSuspension(dt)
    applyPose()
    moveJoint('swing', commands.swingLeft, dt)
    moveJoint('boom', commands.boomUp, dt)
    moveJoint('stick', commands.stickOut, dt)
    moveJoint('bucket', -commands.bucketCurl, dt)
    updateCylinders()
  }

  function teethHeight() {
    arm.bucket.teeth.getWorldPosition(scratch)
    return scratch.y - groundAt(scratch.x, scratch.z)
  }

  function readBucket(target) {
    arm.bucket.mouthCenter.getWorldPosition(target.mouthCenter)
    arm.bucket.teeth.getWorldPosition(target.teeth)
    arm.bucket.lip.getWorldPosition(target.lip)
    target.mouthNormal.copy(arm.bucket.mouthNormal).transformDirection(arm.bucket.bucket.matrixWorld)
    target.widthAxis.set(0, 0, 1).transformDirection(arm.bucket.bucket.matrixWorld)
    return target
  }

  function setLoad(fill) {
    arm.bucket.load.visible = fill > 0.02
    const scale = Math.cbrt(fill) * HEAPED_SCALE
    arm.bucket.load.scale.set(scale, scale, 1)
  }

  function currentAngles() {
    return Object.fromEntries(Object.entries(joints).map(([name, state]) => [name, state.angle]))
  }

  function setAngles(angles) {
    for (const [name, angle] of Object.entries(angles)) {
      joints[name].angle = angle
    }
    applyPose()
  }

  function bucketPoseFor(angles) {
    const saved = currentAngles()
    setAngles(angles)
    const pose = { matrix: arm.bucket.bucket.matrixWorld.clone(), clearance: -deepestPenetration() }
    setAngles(saved)
    return pose
  }

  function bucketMatrix() {
    return arm.bucket.bucket.matrixWorld
  }

  settleSuspension()
  updateSuspension(1 / 60)
  applyPose()
  updateCylinders()
  return { root, cabCamera, update, teethHeight, readBucket, setLoad, bucketPoseFor, bucketMatrix, currentAngles }
}
