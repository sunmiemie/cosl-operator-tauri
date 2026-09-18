import assert from 'node:assert/strict'
import test from 'node:test'
import { memoryStorage } from './storage-fixture.mjs'
import { createDefaultHassWorkbenchConfig, saveHassWorkbenchConfig } from '../src/services/hass-workbench-config.ts'
test('空主题前缀和非法端口不会保存为根订阅配置', t => {
  memoryStorage(t)
  for (const port of [true, false, -1, 1.5, 65536, Infinity]) {
    const config = createDefaultHassWorkbenchConfig()
    config.mqtt.port = port; config.mqtt.topicPrefix = ' /// '
    const result = saveHassWorkbenchConfig(config)
    assert.equal(result.mqtt.port, 1883)
    assert.equal(result.mqtt.topicPrefix, 'EDM')
  }
})
test('串口速率只接受有限正整数并兼容数字字符串', t => {
  memoryStorage(t)
  for (const baudrate of [Infinity, 12.5, -1, true]) {
    const config = createDefaultHassWorkbenchConfig()
    config.hardwareProfiles.find(p => p.role === 'pulser').baudrate = baudrate
    assert.equal(saveHassWorkbenchConfig(config).hardwareProfiles.find(p => p.role === 'pulser').baudrate, 9600)
  }
  const config = createDefaultHassWorkbenchConfig()
  config.hardwareProfiles.find(p => p.role === 'pulser').baudrate = '115200'
  assert.equal(saveHassWorkbenchConfig(config).hardwareProfiles.find(p => p.role === 'pulser').baudrate, 115200)
})
