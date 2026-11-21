const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const test = require('node:test')
const ts = require('typescript')

function load(file, mocks, extra = '') {
  const exports = {}
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText
  vm.runInNewContext(js, {
    exports, require: (name) => name in mocks ? mocks[name] : require(name),
    process: { platform: 'win32', env: {} }, __dirname: __dirname,
    console: { log() {}, error() {} }, Buffer, setTimeout, clearTimeout
  }, { filename: file })
  return exports
}

function windowHarness(created = false) {
  const calls = []
  let visible = true
  const bounds = { x: 780, y: 890, width: 360, height: 150 }
  const win = {
    isDestroyed: () => false, isVisible: () => visible,
    getBounds: () => bounds,
    setBounds: (value) => calls.push(['bounds', value]),
    hide: () => { visible = false; calls.push(['hide']) },
    showInactive: () => { visible = true; calls.push(['showInactive']) },
    setIgnoreMouseEvents: (value) => calls.push(['ignore', value]),
    on() {},
    loadFile: async () => {},
    setContentProtection: (value) => calls.push(['contentProtection', value]),
    setVisibleOnAllWorkspaces() {},
    setAlwaysOnTop() {},
    webContents: {
      send: (...args) => calls.push(['send', ...args]),
      on() {}, setZoomFactor() {}, setWindowOpenHandler() {},
      setBackgroundThrottling() {}, setFrameRate() {}
    }
    // focus/setFocusable/setOpacity/show/restore deliberately absent.
  }
  const main = load('electron/main.ts', {
    electron: {
      BrowserWindow: function (settings) {
        calls.push(['constructor', settings])
        return win
      },
      app: { whenReady: () => ({ then() {} }) },
      screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) }
    },
    './ipcHandlers': {}, './ProcessingHelper': {}, './ScreenshotHelper': {},
    './shortcuts': {}, './VoiceHelper': {}, './autoUpdater': {}, dotenv: { config() {} }
  }, '\nexport const harness = { createWindow, state, setWindowFocusable, toggleMainWindow, setWindowDimensions, setIgnoreMouseEvents };')
  if (!created) {
    main.harness.state.mainWindow = win
    main.harness.state.isWindowVisible = true
  }
  return { ...main.harness, calls }
}

test('rapid hide/show cycles never activate or mutate opacity', () => {
  const h = windowHarness()
  for (let i = 0; i < 40; i++) h.toggleMainWindow()
  assert.equal(h.state.isWindowVisible, true)
  assert.equal(h.calls.filter(([name]) => name === 'hide').length, 20)
  assert.equal(h.calls.filter(([name]) => name === 'showInactive').length, 20)
  assert.throws(() => h.setWindowFocusable(true), /nonfocusable/)
  h.setWindowFocusable(false)
})

test('closing settings before its resize fires cancels the expansion', async () => {
  const h = windowHarness()
  h.setWindowDimensions(400, 600)
  h.setWindowDimensions(320, 130) // Current native bounds: 360 x 150.
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(h.calls.filter(([name]) => name === 'bounds').length, 0)
})

test('capture bursts stay serial, recover from failure, and select primary display at physical resolution', async () => {
  let active = 0
  let maxActive = 0
  let attempts = 0
  let id = 0
  const options = []
  const helperModule = load('electron/ScreenshotHelper.ts', {
    electron: {
      app: { getPath: () => '/tmp' },
      screen: { getPrimaryDisplay: () => ({ id: 42, size: { width: 1920, height: 1080 }, scaleFactor: 1.5 }) },
      desktopCapturer: { getSources: async (opts) => {
        options.push(opts)
        maxActive = Math.max(maxActive, ++active)
        const attempt = ++attempts
        await new Promise((resolve) => setTimeout(resolve, 2))
        active--
        if (attempt === 2) throw new Error('capture unavailable')
        return [
          { display_id: '99', thumbnail: { isEmpty: () => false, toPNG: () => Buffer.from('wrong') } },
          { display_id: '42', thumbnail: { isEmpty: () => false, toPNG: () => Buffer.from('primary') } }
        ]
      } }
    },
    uuid: { v4: () => String(++id) },
    'child_process': { execFile() { throw new Error('Must not spawn a process on Windows') } },
    'node:fs': {
      existsSync: () => true,
      promises: { writeFile: async (_path, data) => assert.equal(data.toString(), 'primary') },
      unlink: (_path, callback) => callback(null)
    }
  })
  const helper = new helperModule.ScreenshotHelper('solutions')
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => helper.takeScreenshot()))
  assert.equal(maxActive, 1)
  assert.equal(attempts, 10)
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 9)
  assert.equal(results[1].status, 'rejected')
  assert.equal(helper.getScreenshotQueue().length, 2)
  assert.equal(helper.getView(), 'queue')
  assert.equal(options[0].thumbnailSize.width, 2880)
  assert.equal(options[0].thumbnailSize.height, 1620)
})

test('hidden hit-test requests stay click-through and restore on show', () => {
  const h = windowHarness()
  h.toggleMainWindow()
  h.setIgnoreMouseEvents(false)
  assert.deepEqual(h.calls.at(-1), ['ignore', true])
  h.toggleMainWindow()
  assert.equal(h.state.ignoreMouseEvents, false)
  assert.deepEqual(h.calls.at(-2), ['ignore', false])
})

test('window starts hidden and nonfocusable with capture protection before its first inactive show', async () => {
  const h = windowHarness(true)
  await h.createWindow()
  const settings = h.calls.find(([name]) => name === 'constructor')[1]
  assert.equal(settings.show, false)
  assert.equal(settings.focusable, false)
  assert.equal(settings.skipTaskbar, true)
  assert.equal(settings.minimizable, false)
  assert.equal(settings.maximizable, false)
  const protectedAt = h.calls.findIndex(([name, value]) => name === 'contentProtection' && value)
  const shownAt = h.calls.findIndex(([name]) => name === 'showInactive')
  assert.ok(protectedAt >= 0 && shownAt > protectedAt)
  await h.createWindow()
  assert.equal(h.calls.filter(([name]) => name === 'constructor').length, 1)
})

test('missing primary source and empty thumbnails reject without a process fallback, then recover', async () => {
  let attempt = 0
  let writes = 0
  const helperModule = load('electron/ScreenshotHelper.ts', {
    electron: {
      app: { getPath: () => '/tmp' },
      screen: { getPrimaryDisplay: () => ({ id: 42, size: { width: 1920, height: 1080 }, scaleFactor: 1 }) },
      desktopCapturer: { getSources: async () => {
        attempt++
        if (attempt === 1) return []
        return [{ display_id: '42', thumbnail: {
          isEmpty: () => attempt === 2,
          toPNG: () => Buffer.from('primary')
        } }]
      } }
    },
    uuid: { v4: () => String(attempt) },
    'child_process': { execFile() { throw new Error('Unexpected process fallback') } },
    'node:fs': {
      existsSync: () => true,
      promises: { writeFile: async () => { writes++ } }
    }
  })
  const helper = new helperModule.ScreenshotHelper()
  const results = await Promise.allSettled(Array.from({ length: 3 }, () => helper.takeScreenshot()))
  assert.deepEqual(results.map((r) => r.status), ['rejected', 'rejected', 'fulfilled'])
  assert.match(results[0].reason.message, /Primary display capture unavailable/)
  assert.match(results[1].reason.message, /Primary display capture unavailable/)
  assert.equal(writes, 1)
  assert.equal(helper.getScreenshotQueue().length, 1)
})
