import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { posix } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../src/composables/useFileSystem.ts', import.meta.url), 'utf8')
// 仅替换 Tauri 依赖，文件名解析及暂存流程执行实际源码。
const executable = stripTypeScriptTypes(
  source.replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
    .replace('export function useFileSystem', 'function useFileSystem'),
  { mode: 'strip' },
)
const tempDir = '/app/temp/processes'
const plain = value => JSON.parse(JSON.stringify(value))

function createHarness() {
  const files = new Map()
  const directories = new Set()
  const reads = []
  const context = vm.createContext({
    console: { error() {}, log() {} },
    appDataDir: async () => '/app',
    downloadDir: async () => '/downloads',
    join: async (...parts) => posix.join(...parts),
    exists: async path => files.has(path) || directories.has(path),
    mkdir: async path => { directories.add(path) },
    writeTextFile: async (path, content) => { files.set(path, content) },
    readTextFile: async path => {
      reads.push(path)
      if (!files.has(path)) throw new Error('文件不存在')
      return files.get(path)
    },
    readDir: async directory => [...files.keys()]
      .filter(path => posix.dirname(path) === directory)
      .map(path => ({ name: posix.basename(path), isFile: true })),
    remove: async path => { files.delete(path) },
    save: async () => null,
  })
  vm.runInContext(`${executable}\nthis.fileSystem = useFileSystem()`, context)
  return { api: context.fileSystem, files, reads }
}

for (const type of ['eyes', 'xray', 'halt-hass']) {
  for (const isEdit of [false, true]) {
    test(`${type} 的连字符名称和版本暂存后可列出、加载及删除（${isEdit ? '修改' : '编辑'}）`, async () => {
      const { api, files } = createHarness()
      const data = { name: '检查-复核', version: 'v1-beta', boardModelId: 7, json: { steps: ['保留步骤'] } }
      const processId = isEdit ? 15 : undefined
      const mode = isEdit ? '修改~15' : '编辑'
      const fileName = `${type}-7-检查-复核-v1-beta-${mode}.json`
      assert.equal(await api.saveTempProcess(type, 7, data.name, data.version, isEdit, processId, data), true)
      assert.deepEqual([...files.keys()], [`${tempDir}/${fileName}`])
      const info = { fileName, type, name: data.name, version: data.version, boardModelId: 7, mode: isEdit ? '修改' : '编辑' }
      if (isEdit) info.processId = 15

      assert.deepEqual(plain(await api.getTempProcessList(type)), [info])
      assert.deepEqual(plain(api.parseTempFileName(fileName, data)), info)
      assert.deepEqual(plain(await api.loadTempProcess(fileName)), data)
      assert.equal(await api.deleteTempProcess(fileName), true)
      assert.equal(files.size, 0)
      assert.deepEqual(plain(await api.getTempProcessList(type)), [])
    })
  }
}

test('简单旧文件名仍直接列出，不要求额外读取 JSON', async () => {
  const { api, files, reads } = createHarness()
  const fileName = 'eyes-7-检查-v1-修改~15.json'
  const data = { name: '检查', version: 'v1', boardModelId: 7, json: { steps: [] } }
  files.set(`${tempDir}/${fileName}`, JSON.stringify(data))
  const info = { fileName, type: 'eyes', name: '检查', version: 'v1', boardModelId: 7, mode: '修改', processId: 15 }
  assert.deepEqual(plain(api.parseTempFileName(fileName)), info)
  assert.deepEqual(plain(await api.getTempProcessList('eyes')), [info])
  assert.deepEqual(reads, [])
  assert.deepEqual(plain(await api.loadTempProcess(fileName)), data)
})

test('HALT-HASS 未选板组且名称为空的草稿保留 unnamed 文件名及修改状态', async () => {
  const { api, files } = createHarness()
  const data = { name: '', version: 'v1-beta', boardModelId: -1, json: { schemaVersion: 2, testFlow: {}, cycleFlow: {} } }
  const fileName = 'halt-hass--1-unnamed-v1-beta-修改~23.json'
  assert.equal(await api.saveTempProcess('halt-hass', -1, 'unnamed', data.version, true, 23, data), true)
  assert.equal(files.has(`${tempDir}/${fileName}`), true)
  const info = { fileName, type: 'halt-hass', name: 'unnamed', version: 'v1-beta', boardModelId: -1, mode: '修改', processId: 23 }
  assert.deepEqual(plain(await api.getTempProcessList('halt-hass')), [info])
  assert.deepEqual(plain(api.parseTempFileName(fileName, data)), info)
  assert.deepEqual(plain(await api.loadTempProcess(fileName)), data)
})

test('直接解析时不接受与文件名板组不一致的 JSON 元数据', () => {
  const { api } = createHarness()
  assert.equal(api.parseTempFileName('halt-hass-7-检查-v1-修改~15.json', {
    name: '检查', version: 'v1', boardModelId: 8, json: {},
  }), null)
})

test('损坏 JSON 或板组不匹配的草稿不会隐藏其他有效文件', async () => {
  const { api, files } = createHarness()
  files.set(`${tempDir}/eyes-7-损坏-草稿-v1-编辑.json`, '{')
  files.set(`${tempDir}/eyes-7-错组-草稿-v1-编辑.json`, JSON.stringify({
    name: '错组-草稿', version: 'v1', boardModelId: 8, json: {},
  }))
  files.set(`${tempDir}/eyes-7-错型-草稿-v1-编辑.json`, JSON.stringify({
    name: '错型-草稿', version: 'v1', boardModelId: '7', json: {},
  }))
  const fileName = 'eyes-7-有效-草稿-v1-beta-编辑.json'
  const data = { name: '有效-草稿', version: 'v1-beta', boardModelId: 7, json: {} }
  files.set(`${tempDir}/${fileName}`, JSON.stringify(data))
  const before = [...files.entries()]
  assert.deepEqual(plain(await api.getTempProcessList('eyes')), [{
    fileName, type: 'eyes', name: data.name, version: data.version, boardModelId: 7, mode: '编辑',
  }])
  assert.deepEqual(plain(await api.getTempProcessList('xray')), [])
  assert.deepEqual([...files.entries()], before)
})
