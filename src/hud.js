import { rotateStick, stickRotationDegrees } from './input.js'

const COMMAND_LABELS = {
  stickOut: 'Stick out',
  swingLeft: 'Swing left',
  boomUp: 'Boom up',
  bucketCurl: 'Bucket curl',
  leftTrack: 'Left track',
  rightTrack: 'Right track',
}

const hud = document.getElementById('hud')
const status = document.getElementById('status')
const raw = document.getElementById('raw')
const job = document.getElementById('job')
const next = document.getElementById('next')
const fills = {}

for (const [name, label] of Object.entries(COMMAND_LABELS)) {
  const row = document.createElement('div')
  row.className = 'row'
  row.innerHTML = `<span>${label}</span><div class="track"><div class="fill"></div></div>`
  document.getElementById('bars').append(row)
  fills[name] = row.querySelector('.fill')
}

function bindRotateButton(side) {
  const button = document.getElementById(`rotate-${side}`)
  button.addEventListener('click', () => rotateStick(side))
}
bindRotateButton('left')
bindRotateButton('right')

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyH') {
    hud.hidden = !hud.hidden
  }
})

function drawBar(fill, value) {
  const halfWidth = Math.abs(value) * 50
  fill.style.width = `${halfWidth}%`
  if (value >= 0) {
    fill.style.left = '50%'
  } else {
    fill.style.left = `${50 - halfWidth}%`
  }
}

function describeConnection(controls) {
  if (controls.pads.length === 0) {
    return 'No gamepad yet. Press a button on each Joy-Con.'
  }
  if (!controls.rightConnected) {
    return `Only one stick found (${controls.layout}). Press a button on the other Joy-Con.`
  }
  return `Connected: ${controls.layout}`
}

function describePads(pads) {
  return pads
    .map((pad) => {
      const axes = pad.axes.map((value) => value.toFixed(2).padStart(5)).join(' ')
      const pressed = pad.buttons.flatMap((button, index) => (button.pressed ? [index] : [])).join(' ')
      return `${pad.id.slice(0, 34)}\n  axes ${axes}\n  buttons ${pressed}`
    })
    .join('\n')
}

function describeNextPile(nearest) {
  if (!nearest) {
    return 'All piles done'
  }
  const hopper = `hopper ${Math.floor(nearest.filled)}/${nearest.required} buckets`
  if (nearest.distance > 15) {
    return `Nearest pile ${Math.round(nearest.distance)} m (follow the orange beacon) · ${hopper}`
  }
  return `This pile: ${hopper}`
}

export function updateHud(controls, teethHeight, digStats, progress) {
  const load = Math.round(digStats.load * 100)
  job.textContent = `Piles ${progress.done}/${progress.total} · Load ${load}% · Spilled ${digStats.spilled.toFixed(1)} t`
  next.textContent = describeNextPile(progress.nearest)
  status.textContent = describeConnection(controls)
  for (const [name, fill] of Object.entries(fills)) {
    drawBar(fill, controls.commands[name])
  }
  const rotation = `L stick ${stickRotationDegrees('left')}° · R stick ${stickRotationDegrees('right')}°`
  raw.textContent = `${describePads(controls.pads)}\n${rotation}\nTeeth height ${teethHeight.toFixed(2)} m`
}
