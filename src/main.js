import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Sky } from 'three/addons/objects/Sky.js'
import { createExcavator } from './excavator.js'
import { readControls } from './input.js'
import { updateHud } from './hud.js'
import { createBucketTrainer } from './trainer.js'
import { createCameraRig } from './cameraRig.js'
import { createDigJob } from './dig.js'
import { createWorld, mapSeed, startNewMap } from './world.js'
import { createTerrain } from './terrain.js'
import { createProps } from './props.js'
import { createSites } from './sites.js'
import { seededRandom } from './noise.js'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.9
document.body.append(renderer.domElement)

const HORIZON = 0xc4d0d8
const SUN_OFFSET = new THREE.Vector3(12, 20, 8)
const NEW_MAP_BUTTON = 9

function addSky(scene) {
  const sky = new Sky()
  sky.scale.setScalar(4000)
  const uniforms = sky.material.uniforms
  uniforms.turbidity.value = 3
  uniforms.rayleigh.value = 2.5
  uniforms.mieCoefficient.value = 0.004
  uniforms.mieDirectionalG.value = 0.85
  uniforms.sunPosition.value.copy(SUN_OFFSET).normalize()
  scene.add(sky)
}

const scene = new THREE.Scene()
addSky(scene)
scene.fog = new THREE.Fog(HORIZON, 60, 220)
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.5

scene.add(new THREE.HemisphereLight(0xcfe0f0, 0x8a7a5a, 1.1))
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4)
sun.position.copy(SUN_OFFSET)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.normalBias = 0.03
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 })
scene.add(sun, sun.target)

const world = createWorld(mapSeed())
createTerrain(scene, world)
createProps(scene, world, seededRandom(world.seed + 1))
const sites = createSites(scene, world)

const excavator = createExcavator({ groundAt: world.groundAt, solidAt: world.solidAt, footprintBlocked: world.footprintBlocked })
const firstSite = world.sites[0].pad
excavator.root.rotation.y = Math.atan2(-firstSite.z, firstSite.x)
scene.add(excavator.root)

const digJob = createDigJob({ scene, excavator, sites })
const trainer = createBucketTrainer({ scene, excavator, sites })
const spawnHeight = world.groundAt(0, 0)

const orbitCamera = new THREE.PerspectiveCamera(55, 1, 0.1, 5000)
orbitCamera.position.set(1, spawnHeight + 11, 15)
const orbit = new OrbitControls(orbitCamera, renderer.domElement)
orbit.target.set(0, spawnHeight + 1, 0)
orbit.maxPolarAngle = Math.PI * 0.48
orbit.update()

const cameras = [orbitCamera, excavator.cabCamera]
const cameraRig = createCameraRig({ orbitCamera, orbitTarget: orbit.target, cabCamera: excavator.cabCamera, machine: excavator.root, groundAt: world.groundAt })
let activeCamera = 0

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyV') {
    activeCamera = (activeCamera + 1) % cameras.length
  }
  if (event.code === 'KeyT') {
    trainer.toggle()
  }
  if (event.code === 'KeyN') {
    trainer.skip()
  }
  if (event.code === 'KeyM') {
    startNewMap()
  }
  if (event.code === 'Enter' && !completePanel.hidden) {
    startNewMap()
  }
})

const completePanel = document.getElementById('complete')
completePanel.querySelector('button').addEventListener('click', startNewMap)

function showCompletion(progress, pads) {
  if (progress.done < progress.total) {
    return
  }
  completePanel.hidden = false
  if (pads.some((pad) => pad.buttons[NEW_MAP_BUTTON]?.pressed)) {
    startNewMap()
  }
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  for (const camera of cameras) {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
  }
}
window.addEventListener('resize', resize)
resize()

function keepSunOnMachine() {
  sun.target.position.copy(excavator.root.position)
  sun.position.copy(excavator.root.position).add(SUN_OFFSET)
}

function simulate(dt, commands) {
  excavator.update(dt, commands)
  keepSunOnMachine()
  sites.update(dt)
  digJob.update(dt)
}

const clock = new THREE.Clock()

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05)
  const controls = readControls()
  if (dt > 0) {
    simulate(dt, controls.commands)
  }
  const progress = sites.progress(excavator.root.position)
  updateHud(controls, excavator.teethHeight(), digJob.stats, progress)
  showCompletion(progress, controls.pads)
  trainer.update(dt)
  cameraRig.update(dt, controls.look, cameras[activeCamera] === excavator.cabCamera)
  renderer.render(scene, cameras[activeCamera])
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
