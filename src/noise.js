export function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function latticeValue(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return ((h >>> 0) / 4294967295) * 2 - 1
}

function smooth(t) {
  return t * t * (3 - 2 * t)
}

export function valueNoise(x, z, seed) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = smooth(x - ix)
  const fz = smooth(z - iz)
  const top = latticeValue(ix, iz, seed) * (1 - fx) + latticeValue(ix + 1, iz, seed) * fx
  const bottom = latticeValue(ix, iz + 1, seed) * (1 - fx) + latticeValue(ix + 1, iz + 1, seed) * fx
  return top * (1 - fz) + bottom * fz
}

export function layeredNoise(x, z, seed, layers) {
  let total = 0
  layers.forEach(({ wavelength, amplitude }, index) => {
    total += valueNoise(x / wavelength, z / wavelength, seed + index * 101) * amplitude
  })
  return total
}
