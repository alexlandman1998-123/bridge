import assert from 'node:assert/strict'
import { activateAnchorOnSpace } from '../src/lib/keyboardActivation.js'

function createEvent(key) {
  const calls = { clicked: 0, prevented: 0 }
  return {
    key,
    defaultPrevented: false,
    currentTarget: {
      click() {
        calls.clicked += 1
      },
    },
    preventDefault() {
      calls.prevented += 1
      this.defaultPrevented = true
    },
    calls,
  }
}

const spaceEvent = createEvent(' ')
activateAnchorOnSpace(spaceEvent)
assert.equal(spaceEvent.calls.prevented, 1, 'Space should prevent default scrolling')
assert.equal(spaceEvent.calls.clicked, 1, 'Space should activate the anchor')

const legacySpaceEvent = createEvent('Spacebar')
activateAnchorOnSpace(legacySpaceEvent)
assert.equal(legacySpaceEvent.calls.prevented, 1, 'Legacy Spacebar should prevent default scrolling')
assert.equal(legacySpaceEvent.calls.clicked, 1, 'Legacy Spacebar should activate the anchor')

const enterEvent = createEvent('Enter')
activateAnchorOnSpace(enterEvent)
assert.equal(enterEvent.calls.prevented, 0, 'Enter should keep native anchor behavior')
assert.equal(enterEvent.calls.clicked, 0, 'Enter should not be duplicated')

const repeatedSpaceEvent = createEvent(' ')
repeatedSpaceEvent.repeat = true
activateAnchorOnSpace(repeatedSpaceEvent)
assert.equal(repeatedSpaceEvent.calls.prevented, 1, 'Repeated Space keydown should still block scrolling')
assert.equal(repeatedSpaceEvent.calls.clicked, 0, 'Repeated Space keydown should not activate again')

const preventedEvent = createEvent(' ')
preventedEvent.defaultPrevented = true
activateAnchorOnSpace(preventedEvent)
assert.equal(preventedEvent.calls.prevented, 0, 'Handled events should be left alone')
assert.equal(preventedEvent.calls.clicked, 0, 'Handled events should not activate again')

console.log('keyboard activation tests passed')
