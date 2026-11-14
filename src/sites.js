import * as THREE from 'three'
import { createMound, MOUND_REACH } from './mound.js'
import { BUCKETS_TO_COMPLETE, createHopper } from './site.js'

const BEACON_HEIGHT = 60
const BEACON_COLOR = 0xffa020

function createBeacon(scene, pile, base) {
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, BEACON_HEIGHT, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: BEACON_COLOR, transparent: true, opacity: 0.35, depthWrite: false, fog: false }),
  )
  beacon.position.set(pile.x, base + 3 + BEACON_HEIGHT / 2, pile.z)
  scene.add(beacon)
  return beacon
}

export function createSites(scene, world) {
  const sites = world.sites.map((layout) => ({
    layout,
    mound: createMound(scene, layout.pile, layout.pad.base),
    hopper: createHopper(scene, layout.hopper, layout.pad.base),
    beacon: createBeacon(scene, layout.pile, layout.pad.base),
  }))

  function moundNear(x, z) {
    const site = sites.find(({ layout }) => Math.abs(x - layout.pile.x) < MOUND_REACH && Math.abs(z - layout.pile.z) < MOUND_REACH)
    return site?.mound
  }

  function pileAt(x, z) {
    const mound = moundNear(x, z)
    if (!mound) {
      return 0
    }
    return mound.pileAt(x, z)
  }

  function surfaceAt(x, z) {
    return world.groundAt(x, z) + pileAt(x, z)
  }

  function take(x, z, volume) {
    const mound = moundNear(x, z)
    if (!mound) {
      return 0
    }
    return mound.take(x, z, volume)
  }

  function add(x, z, volume) {
    moundNear(x, z)?.add(x, z, volume)
  }

  function hopperAt(x, z) {
    return sites.find((site) => site.hopper.contains(x, z))?.hopper
  }

  function update(dt) {
    for (const site of sites) {
      site.mound.update(dt)
      site.hopper.update()
      site.beacon.visible = !site.hopper.isComplete()
    }
  }

  function nearestOpenSite(position) {
    let nearest = null
    for (const site of sites) {
      if (site.hopper.isComplete()) {
        continue
      }
      const distance = Math.hypot(site.layout.pad.x - position.x, site.layout.pad.z - position.z)
      if (!nearest || distance < nearest.distance) {
        nearest = { distance, filled: site.hopper.filled(), required: BUCKETS_TO_COMPLETE }
      }
    }
    return nearest
  }

  function progress(position) {
    const done = sites.filter((site) => site.hopper.isComplete()).length
    return { done, total: sites.length, nearest: nearestOpenSite(position) }
  }

  return { pileAt, surfaceAt, take, add, hopperAt, update, progress }
}
