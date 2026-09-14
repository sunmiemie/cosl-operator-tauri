import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('设备检测兼容远端自定义列表和 HALT-HASS 可选设备', () => {
  const source = readFileSync(new URL('../src/components/visual-test/DeviceCheckOverlay.vue', import.meta.url), 'utf8')
  const body = source.match(/const displayItems = computed\(\(\) => \{([\s\S]*?)\n\}\)/)[1]
  const display = new Function('props', body)
  const props = { scannerOk: true, cameraOk: false, showCamera: false, showService: true, serviceOk: true, serviceLabel: 'Flojoy' }
  assert.deepEqual(display(props), [{ label: '扫码枪', ok: true }, { label: 'Flojoy', ok: true }])
  assert.deepEqual(display({ ...props, items: [{ label: '远端设备', ok: false }] }), [{ label: '远端设备', ok: false }])
})

test('关闭窗口先确认业务收尾，再登出并关闭本地服务', () => {
  const source = readFileSync(new URL('../src/components/layout/AppHeader.vue', import.meta.url), 'utf8')
  assert.equal((source.match(/async function closeWindow\(/g) || []).length, 1)
  const body = source.slice(source.indexOf('async function closeWindow()'), source.indexOf('// 监听窗口关闭请求'))
  assert.ok(body.indexOf('await confirmWindowClose()') < body.indexOf('await logout()'))
  assert.ok(body.indexOf('await logout()') < body.indexOf('await stopFlojoyBackend()'))
  assert.ok(body.indexOf('await stopFlojoyBackend()') < body.indexOf('await appWindow.destroy()'))
  assert.match(source, /requestActiveSafeExit\('application-close'\)/)
})
