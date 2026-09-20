const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function harness() {
  const area = { x: -800, y: 20, width: 800, height: 600 }
  const win = {
    bounds: { x: -750, y: 40, width: 520, height: 380 }, visible: false, shows: 0, resizes: 0,
    isDestroyed: () => false,
    getBounds() { return this.bounds },
    setBounds(bounds) { this.bounds = bounds; this.resizes++ },
    setPosition(x, y) { this.bounds = { ...this.bounds, x, y } },
    hide() { this.visible = false },
    show() { this.visible = true; this.shows++ },
    showInactive() { this.visible = true; this.shows++ },
    setIgnoreMouseEvents() {}, setFocusable() {}, setAlwaysOnTop() {}, setVisibleOnAllWorkspaces() {}, setContentProtection() {}
  }
  const source = fs.readFileSync('electron/main.ts', 'utf8') + '\nexports.testing = { state, takeScreenshot, toggleMainWindow, setWindowDimensions, moveWindowHorizontal, moveWindowVertical };'
  const context = {
    exports: {}, process, console, setTimeout,
    require(name) {
      if (name === 'electron') return { app: { whenReady: () => ({ then() {} }) }, screen: { getDisplayMatching: () => ({ workArea: area }) } }
      if (name === 'path') return require('node:path')
      return {}
    }
  }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
  const api = context.exports.testing
  api.state.mainWindow = win
  api.state.screenshotHelper = { async takeScreenshot(hide, restore) { hide(); restore(); return 'capture.png' } }
  return { ...api, win, area }
}

test('capture keeps a hidden window hidden', async () => {
  const h = harness()
  await h.takeScreenshot()
  assert.equal(h.win.shows, 0)
  assert.equal(h.state.isWindowVisible, false)
})

test('capture restores visible window after failure', async () => {
  const h = harness()
  h.toggleMainWindow()
  h.state.screenshotHelper.takeScreenshot = async hide => { hide(); throw Error('capture failed') }
  await assert.rejects(h.takeScreenshot(), /capture failed/)
  assert.equal(h.win.visible, true)
  assert.equal(h.state.captureInProgress, false)
})

test('hide during capture wins over automatic restoration and overlapping captures are rejected', async () => {
  const h = harness()
  h.toggleMainWindow()
  let finish
  h.state.screenshotHelper.takeScreenshot = async hide => { hide(); await new Promise(resolve => { finish = resolve }); return 'capture.png' }
  const capture = h.takeScreenshot()
  await assert.rejects(h.takeScreenshot(), /already in progress/)
  h.toggleMainWindow()
  finish()
  await capture
  assert.equal(h.win.visible, false)
})

test('show during capture waits for completion', async () => {
  const h = harness()
  let finish
  h.state.screenshotHelper.takeScreenshot = async hide => { hide(); await new Promise(resolve => { finish = resolve }); return 'capture.png' }
  const capture = h.takeScreenshot()
  h.toggleMainWindow()
  assert.equal(h.win.visible, false)
  finish()
  await capture
  assert.equal(h.win.visible, true)
})

test('long content fits negative-coordinate monitor, repeated dimensions do not jitter', () => {
  const h = harness()
  h.state.view = 'solutions'
  h.setWindowDimensions(3000, 5000)
  assert.deepEqual(JSON.parse(JSON.stringify(h.win.bounds)), h.area)
  h.setWindowDimensions(3000, 5000)
  assert.equal(h.win.resizes, 1)
  h.moveWindowHorizontal(x => x + 9999)
  h.moveWindowVertical(y => y - 9999)
  assert.equal(h.win.bounds.x, h.area.x)
  assert.equal(h.win.bounds.y, h.area.y)
  h.setWindowDimensions(NaN, Infinity)
  assert.equal(h.win.resizes, 1)
})
