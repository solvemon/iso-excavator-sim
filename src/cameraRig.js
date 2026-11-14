import * as THREE from 'three'

const LEAN = {
  yaw: 1.1,
  outTheDoor: 0.8,
  towardBoom: 0.12,
  peekPitch: 0.5,
  peekRise: 0.35,
  peekForward: 0.4,
  sitBackPitch: 0.4,
  sitBack: 0.2,
  settleRate: 10,
}

const ORBIT = {
  turnSpeed: 1.6,
  zoomSpeed: 1.2,
  minDistance: 5,
  maxDistance: 90,
}

function leanTarget(look) {
  const peek = Math.max(0, -look.y)
  const sitBack = Math.max(0, look.y)
  return {
    yaw: -look.x * LEAN.yaw,
    pitch: sitBack * LEAN.sitBackPitch - peek * LEAN.peekPitch,
    forward: peek * LEAN.peekForward - sitBack * LEAN.sitBack,
    rise: peek * LEAN.peekRise,
    sideways: Math.max(0, look.x) * LEAN.towardBoom + Math.min(0, look.x) * LEAN.outTheDoor,
  }
}

const CAMERA_ABOVE_GROUND = 1.5

export function createCameraRig({ orbitCamera, orbitTarget, cabCamera, machine, groundAt }) {
  const lastMachinePosition = machine.position.clone()
  const machineMoved = new THREE.Vector3()
  const cabHome = { position: cabCamera.position.clone(), yaw: cabCamera.rotation.y, pitch: cabCamera.rotation.x }
  const lean = { yaw: 0, pitch: 0, forward: 0, rise: 0, sideways: 0 }
  const offset = new THREE.Vector3()
  const spherical = new THREE.Spherical()

  function updateCab(dt, look) {
    const target = leanTarget(look)
    const blend = 1 - Math.exp(-LEAN.settleRate * dt)
    for (const key of Object.keys(lean)) {
      lean[key] += (target[key] - lean[key]) * blend
    }
    cabCamera.position.set(
      cabHome.position.x + lean.forward,
      cabHome.position.y + lean.rise,
      cabHome.position.z + lean.sideways,
    )
    cabCamera.rotation.y = cabHome.yaw + lean.yaw
    cabCamera.rotation.x = cabHome.pitch + lean.pitch
  }

  function updateOrbit(dt, look) {
    if (look.x === 0 && look.y === 0) {
      return
    }
    offset.subVectors(orbitCamera.position, orbitTarget)
    spherical.setFromVector3(offset)
    spherical.theta += look.x * ORBIT.turnSpeed * dt
    const zoomed = spherical.radius * Math.exp(look.y * ORBIT.zoomSpeed * dt)
    spherical.radius = THREE.MathUtils.clamp(zoomed, ORBIT.minDistance, ORBIT.maxDistance)
    orbitCamera.position.copy(orbitTarget).add(offset.setFromSpherical(spherical))
    orbitCamera.lookAt(orbitTarget)
  }

  function followMachine() {
    machineMoved.subVectors(machine.position, lastMachinePosition)
    lastMachinePosition.copy(machine.position)
    orbitCamera.position.add(machineMoved)
    orbitTarget.add(machineMoved)
  }

  function stayAboveGround() {
    const floor = groundAt(orbitCamera.position.x, orbitCamera.position.z) + CAMERA_ABOVE_GROUND
    if (orbitCamera.position.y < floor) {
      orbitCamera.position.y = floor
      orbitCamera.lookAt(orbitTarget)
    }
  }

  function update(dt, look, inCab) {
    followMachine()
    updateCab(dt, inCab ? look : { x: 0, y: 0 })
    if (!inCab) {
      updateOrbit(dt, look)
      stayAboveGround()
    }
  }

  return { update }
}
