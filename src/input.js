const DEAD_ZONE = 0.12
const LEFT_HAND_BUTTONS = { look: 12, trackForward: 4, trackReverse: 6 }
const RIGHT_HAND_BUTTONS = { look: 2, trackForward: 5, trackReverse: 7 }
const LOOK_KEYS = {
  x: { positive: 'ArrowRight', negative: 'ArrowLeft' },
  y: { positive: 'ArrowDown', negative: 'ArrowUp' },
}
const RESPONSE_CURVE = 1.6
const ROTATION_STORAGE_KEY = 'excavator-stick-rotation'

const KEY_BINDINGS = {
  stickOut: { positive: 'KeyW', negative: 'KeyS' },
  swingLeft: { positive: 'KeyA', negative: 'KeyD' },
  boomUp: { positive: 'KeyK', negative: 'KeyI' },
  bucketCurl: { positive: 'KeyJ', negative: 'KeyL' },
  leftTrack: { positive: 'KeyQ', negative: 'KeyZ' },
  rightTrack: { positive: 'KeyE', negative: 'KeyC' },
}

const heldKeys = new Set()
window.addEventListener('keydown', (event) => heldKeys.add(event.code))
window.addEventListener('keyup', (event) => heldKeys.delete(event.code))
window.addEventListener('blur', () => heldKeys.clear())

function loadRotation() {
  try {
    const stored = JSON.parse(localStorage.getItem(ROTATION_STORAGE_KEY))
    if (stored) {
      return stored
    }
  } catch {
    return { left: 0, right: 0 }
  }
  return { left: 0, right: 0 }
}

const quarterTurns = loadRotation()

export function rotateStick(side) {
  quarterTurns[side] = (quarterTurns[side] + 1) % 4
  try {
    localStorage.setItem(ROTATION_STORAGE_KEY, JSON.stringify(quarterTurns))
  } catch {
    return quarterTurns[side]
  }
  return quarterTurns[side]
}

export function stickRotationDegrees(side) {
  return quarterTurns[side] * 90
}

function rotate(stick, turns) {
  let { x, y } = stick
  for (let i = 0; i < turns; i++) {
    const previousX = x
    x = -y
    y = previousX
  }
  return { x, y }
}

function shape(value) {
  const magnitude = Math.abs(value)
  if (magnitude < DEAD_ZONE) {
    return 0
  }
  const rescaled = Math.min(1, (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE))
  return Math.sign(value) * Math.pow(rescaled, RESPONSE_CURVE)
}

function axisPair(pad, xIndex, yIndex) {
  return { x: pad.axes[xIndex] ?? 0, y: pad.axes[yIndex] ?? 0 }
}

function isPressed(pad, index) {
  return Boolean(pad?.buttons[index]?.pressed)
}

function readHand(pad, buttons) {
  let track = 0
  if (isPressed(pad, buttons.trackForward)) {
    track += 1
  }
  if (isPressed(pad, buttons.trackReverse)) {
    track -= 1
  }
  return { look: isPressed(pad, buttons.look), track }
}

function findSticks(pads) {
  const leftPad = pads.find((pad) => pad.id.includes('(L)'))
  const rightPad = pads.find((pad) => pad.id.includes('(R)'))
  if (leftPad || rightPad) {
    return {
      left: leftPad && axisPair(leftPad, 0, 1),
      right: rightPad && axisPair(rightPad, 0, 1),
      leftPad,
      rightPad,
      layout: 'separate Joy-Cons',
    }
  }

  const combined = pads.find((pad) => pad.axes.length >= 4)
  if (combined) {
    return {
      left: axisPair(combined, 0, 1),
      right: axisPair(combined, 2, 3),
      leftPad: combined,
      rightPad: combined,
      layout: `combined: ${combined.id}`,
    }
  }

  return {
    left: pads[0] && axisPair(pads[0], 0, 1),
    right: pads[1] && axisPair(pads[1], 0, 1),
    leftPad: pads[0],
    rightPad: pads[1],
    layout: 'first two gamepads',
  }
}

function keyAxis(binding) {
  let value = 0
  if (heldKeys.has(binding.positive)) {
    value += 1
  }
  if (heldKeys.has(binding.negative)) {
    value -= 1
  }
  return value
}

function clampUnit(value) {
  return Math.max(-1, Math.min(1, value))
}

export function readControls() {
  const pads = navigator.getGamepads().filter(Boolean)
  const sticks = findSticks(pads)

  const left = rotate(sticks.left ?? { x: 0, y: 0 }, quarterTurns.left)
  const right = rotate(sticks.right ?? { x: 0, y: 0 }, quarterTurns.right)

  const leftHand = readHand(sticks.leftPad, LEFT_HAND_BUTTONS)
  const rightHand = readHand(sticks.rightPad, RIGHT_HAND_BUTTONS)

  const leftStickLooks = rightHand.look
  const rightStickLooks = leftHand.look
  const machineLeft = leftStickLooks ? { x: 0, y: 0 } : left
  const machineRight = rightStickLooks ? { x: 0, y: 0 } : right
  const fromPads = {
    stickOut: -shape(machineLeft.y),
    swingLeft: -shape(machineLeft.x),
    boomUp: shape(machineRight.y),
    bucketCurl: -shape(machineRight.x),
    leftTrack: leftHand.track,
    rightTrack: rightHand.track,
  }

  const look = { x: keyAxis(LOOK_KEYS.x), y: keyAxis(LOOK_KEYS.y) }
  if (leftStickLooks) {
    look.x += shape(left.x)
    look.y += shape(left.y)
  }
  if (rightStickLooks) {
    look.x += shape(right.x)
    look.y += shape(right.y)
  }

  const commands = {}
  for (const [name, binding] of Object.entries(KEY_BINDINGS)) {
    commands[name] = clampUnit(fromPads[name] + keyAxis(binding))
  }

  return {
    commands,
    look: { x: clampUnit(look.x), y: clampUnit(look.y) },
    pads,
    layout: pads.length > 0 ? sticks.layout : 'none',
    leftConnected: Boolean(sticks.left),
    rightConnected: Boolean(sticks.right),
  }
}
