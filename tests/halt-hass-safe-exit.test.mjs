import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testPage = fs.readFileSync(
  path.join(repoRoot, 'src/views/halt-hass-test/index.vue'),
  'utf8',
)
const appHeader = fs.readFileSync(
  path.join(repoRoot, 'src/components/layout/AppHeader.vue'),
  'utf8',
)
const safeExitService = fs.readFileSync(
  path.join(repoRoot, 'src/services/active-safe-exit.ts'),
  'utf8',
)

assert.match(
  testPage,
  /onBeforeRouteLeave\(async[\s\S]*requestSafeExit\(\)/,
  '切换路由必须走 HALT-HASS 安全退出确认',
)
assert.match(
  testPage,
  /beforeunload[\s\S]*handleBeforeUnload/,
  '刷新或关闭网页必须显示原生离开警告',
)
assert.match(
  testPage,
  /performSafeExit[\s\S]*gracefulStopCurrentFlowchartRun\([\s\S]*shutdownHardwareForSafeExit\(\)/,
  '安全退出必须停止新节点并等待在途节点释放串口后再执行独立下电',
)
assert.doesNotMatch(
  testPage,
  /performSafeExit[\s\S]*cancelCurrentFlowchartRun\(\)[\s\S]*await wait\(600\)/,
  '安全退出不得再依赖固定 600ms 延时猜测设备连接是否已释放',
)
assert.match(
  testPage,
  /for \(let attempt = 0; attempt < 2; attempt\+\+\)/,
  '安全下电必须自动重试一次，减少偶发串口释放失败',
)
assert.match(
  testPage,
  /confirmForcedExitAfterShutdownFailure[\s\S]*confirmButtonText: '坚持退出'[\s\S]*forceExitConfirmed/,
  '自动安全收尾失败时必须展示原因并允许操作员确认坚持退出',
)
assert.match(
  testPage,
  /powerOffCompleted,[\s\S]*forceExitConfirmed,/,
  '取消场次必须如实上报下电确认状态和强制退出确认',
)
assert.match(
  testPage,
  /HALT-HASS 不允许从中断位置续跑[\s\S]*performSafeExit\(\)/,
  '异常关闭后重新进入时不得续跑，必须安全复位并从头测试',
)
assert.match(
  appHeader,
  /requestActiveSafeExit\('application-close'\)/,
  '关闭客户端窗口必须先调用当前业务页的安全退出处理器',
)
assert.match(
  safeExitService,
  /registerActiveSafeExitHandler[\s\S]*requestActiveSafeExit/,
  '应用与业务页之间必须有统一的安全退出协调器',
)

console.log('HALT-HASS safe exit assertions passed')
