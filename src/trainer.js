import * as THREE from 'three'
import { BUCKET_TEETH, createGhostBucket } from './excavator.js'

const TARGET_RANGES = {
  swing: [0, Math.PI * 2],
  boom: [-0.3, 1.0],
  stick: [-2.4, -0.6],
  bucket: [-1.8, 0.4],
}
const MIN_CLEARANCE = 0.15
const MIN_REACH = 3.5
const ABOVE_MOUND = 0.4
const MIN_MOVE = 2.5
const MATCH_DISTANCE = 0.3
const FAR_DISTANCE = 1.8
const HOLD_SECONDS = 0.5
const CELEBRATE_SECONDS = 0.6
const SAMPLE_ATTEMPTS = 200

const NEAR = new THREE.Color(0x3ddc84)
const MIDDLE = new THREE.Color(0xffd23f)
const FAR = new THREE.Color(0x4aa3ff)

const panel = document.getElementById('training')
const feedback = panel.querySelector('.feedback')

function randomIn([min, max]) {
  return min + Math.random() * (max - min)
}

function closenessColor(target, distance) {
  const t = THREE.MathUtils.clamp((distance - MATCH_DISTANCE) / FAR_DISTANCE, 0, 1)
  if (t < 0.5) {
    return target.lerpColors(NEAR, MIDDLE, t * 2)
  }
  return target.lerpColors(MIDDLE, FAR, (t - 0.5) * 2)
}

export function createBucketTrainer({ scene, excavator, sites }) {
  const material = new THREE.MeshStandardMaterial({
    color: FAR,
    emissive: FAR,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  })
  const ghost = createGhostBucket(material)
  ghost.visible = false
  scene.add(ghost)

  const targetPivot = new THREE.Vector3()
  const targetTeeth = new THREE.Vector3()
  const currentPivot = new THREE.Vector3()
  const currentTeeth = new THREE.Vector3()
  const state = { active: false, held: 0, celebrating: 0 }

  function pivotAndTeeth(matrix, pivot, teeth) {
    pivot.setFromMatrixPosition(matrix)
    teeth.copy(BUCKET_TEETH).applyMatrix4(matrix)
  }

  function isGoodTarget(pose) {
    pivotAndTeeth(pose.matrix, targetPivot, targetTeeth)
    const base = excavator.root.position
    const reach = Math.hypot(targetPivot.x - base.x, targetPivot.z - base.z)
    const clearOfMound =
      targetPivot.y - sites.surfaceAt(targetPivot.x, targetPivot.z) > ABOVE_MOUND &&
      targetTeeth.y - sites.surfaceAt(targetTeeth.x, targetTeeth.z) > ABOVE_MOUND
    pivotAndTeeth(excavator.bucketMatrix(), currentPivot, currentTeeth)
    const farEnoughAway = targetPivot.distanceTo(currentPivot) > MIN_MOVE
    return pose.clearance > MIN_CLEARANCE && reach > MIN_REACH && clearOfMound && farEnoughAway
  }

  function pickTarget() {
    for (let attempt = 0; attempt < SAMPLE_ATTEMPTS; attempt++) {
      const angles = Object.fromEntries(Object.entries(TARGET_RANGES).map(([name, range]) => [name, randomIn(range)]))
      const pose = excavator.bucketPoseFor(angles)
      if (isGoodTarget(pose)) {
        ghost.matrix.copy(pose.matrix)
        pivotAndTeeth(pose.matrix, targetPivot, targetTeeth)
        state.held = 0
        state.celebrating = 0
        return
      }
    }
  }

  function toggle() {
    state.active = !state.active
    panel.hidden = !state.active
    ghost.visible = state.active
    if (state.active) {
      pickTarget()
    }
  }

  function skip() {
    if (state.active) {
      pickTarget()
    }
  }

  function celebrate(dt) {
    state.celebrating -= dt
    material.opacity = 0.45 + 0.4 * Math.abs(Math.sin(state.celebrating * 20))
    if (state.celebrating <= 0) {
      material.opacity = 0.45
      pickTarget()
    }
  }

  function update(dt) {
    if (!state.active) {
      return
    }
    if (state.celebrating > 0) {
      celebrate(dt)
      return
    }

    pivotAndTeeth(excavator.bucketMatrix(), currentPivot, currentTeeth)
    const distance = Math.max(currentPivot.distanceTo(targetPivot), currentTeeth.distanceTo(targetTeeth))
    closenessColor(material.color, distance)
    material.emissive.copy(material.color)

    if (distance > MATCH_DISTANCE) {
      state.held = 0
      feedback.textContent = `${distance.toFixed(1)} m off · N for a new target`
      return
    }

    state.held += dt
    feedback.textContent = 'Hold it…'
    if (state.held >= HOLD_SECONDS) {
      feedback.textContent = 'Nice!'
      state.celebrating = CELEBRATE_SECONDS
    }
  }

  return { toggle, skip, update }
}
