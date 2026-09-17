import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { createRouter, createMemoryHistory } from 'vue-router'

const root = resolve(import.meta.dirname, '..')
const read = path => readFileSync(resolve(root, path), 'utf8')
const context = { exports: {}, require: createRequire(import.meta.url) }
vm.createContext(context)
vm.runInContext(ts.transpileModule(read('src/composables/useSimulationWellNavigationLock.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context)
const lock = context.exports
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/simulation-well', component: {} }, { path: '/', component: {} },
  { path: '/login', name: 'Login', component: {} }, { path: '/vibration', component: {} },
] })
const warnings = []
const routerSource = read('src/router/index.ts')
const guard = routerSource.slice(routerSource.indexOf('router.beforeEach('), routerSource.indexOf('\nexport default router'))
Object.assign(context, lock, { router, document: {}, ElMessage: { warning: message => warnings.push(message) }, getToken: async () => 'token' })
vm.runInContext(ts.transpile(guard), context)
router.afterEach((to, from, failure) => {
  if (!failure) lock.syncSimulationWellNavigationLock(to.fullPath,
    to.path === '/simulation-well' && ['active-test', 'test-monitor'].includes(String(to.query.view)))
})
await router.push('/simulation-well?view=downhole-work')
await router.push('/simulation-well?view=active-test&workNo=W1')
const active = router.currentRoute.value.fullPath
for (const target of ['/', '/vibration', '/simulation-well', '/simulation-well?view=downhole-work', '/simulation-well?view=test-report', '/simulation-well?view=active-test&workNo=W2']) {
  await router.push(target)
  assert.equal(router.currentRoute.value.fullPath, active)
}
// 返回到历史列表同样被实际路由守卫拦截。
const back = new Promise(resolve => router.afterEach((to, from, failure) => resolve(failure)))
router.back()
assert.ok(await back)
assert.equal(router.currentRoute.value.fullPath, active)
assert.ok(lock.canNavigateSimulationWell(active))
await lock.allowSimulationWellNavigation('/vibration', async () => {
  assert.equal(lock.checkSimulationWellNavigation('/'), false, '放行不能复用于其他目标')
  assert.equal(lock.checkSimulationWellNavigation('/vibration'), true)
  assert.equal(lock.checkSimulationWellNavigation('/vibration'), false, '只能使用一次')
})
await assert.rejects(lock.allowSimulationWellNavigation('/vibration', async () => { throw new Error('failed') }))
assert.equal(lock.checkSimulationWellNavigation('/vibration'), false, '失败不遗留放行')
const monitorTarget = '/simulation-well?view=test-monitor&workNo=W1&monitorSession=S1'
await lock.allowSimulationWellNavigation(monitorTarget, () => router.replace(monitorTarget))
await router.push('/simulation-well?view=test-monitor&workNo=W1&monitorSession=S2')
assert.equal(router.currentRoute.value.fullPath, monitorTarget)
await router.push('/simulation-well?view=test-report')
assert.equal(router.currentRoute.value.fullPath, monitorTarget)

// 使用菜单的实际捕获处理器检查鼠标与键盘拦截，展开按钮不受影响。
const aside = read('src/components/layout/AppAside.vue')
const menuGuard = aside.slice(aside.indexOf('function guardMenuNavigation('), aside.indexOf('const { openSettingsWindow }'))
vm.runInContext(ts.transpile(menuGuard), context)
for (const type of ['click', 'keydown']) {
  let prevented = false, stopped = false
  context.event = { type, target: { closest: () => ({ getAttribute: () => '/' }) }, preventDefault: () => { prevented = true }, stopPropagation: () => { stopped = true } }
  vm.runInContext('guardMenuNavigation(event)', context)
  assert.ok(prevented && stopped)
}
context.event = { target: { closest: () => null }, preventDefault: () => { throw new Error('不应阻止展开') } }
vm.runInContext('guardMenuNavigation(event)', context)
assert.match(aside, /@click\.capture="guardMenuNavigation".*@keydown\.enter\.capture="guardMenuNavigation"/)

// 结束失败保留采集和锁；停止成功后才触发正常报告导航。
const monitor = read('src/views/simulation-well/test-monitor.vue')
const finishCode = monitor.slice(monitor.indexOf('async function stopSession()'), monitor.indexOf('onMounted(', monitor.indexOf('async function stopSession()')))
Object.assign(context, { ending: { value: false }, snapshot: { value: { sampleCount: 1 } }, props: { sessionId: 'S1' },
  ElMessage: { error: () => {}, warning: message => warnings.push(message) },
  stopSimulatedWellMonitorSession: async () => { throw new Error('stop failed') },
  emit: () => { throw new Error('失败不应进入报告') },
})
vm.runInContext('let sessionStopped = false; let allowLeave = false;\n' + ts.transpile(finishCode), context)
await vm.runInContext('finishTest()', context)
assert.equal(vm.runInContext('sessionStopped || allowLeave', context), false)
assert.equal(lock.canNavigateSimulationWell('/'), false)
context.snapshot.value.sampleCount = 0
context.ElMessageBox = { confirm: async () => { throw new Error('cancel') } }
context.stopSimulatedWellMonitorSession = async () => { throw new Error('取消后不应调用停止') }
await vm.runInContext('finishTest()', context)
assert.equal(vm.runInContext('sessionStopped || allowLeave', context), false)
assert.equal(lock.canNavigateSimulationWell('/'), false, '取消结束后仍锁定')
context.snapshot.value.sampleCount = 1
context.stopSimulatedWellMonitorSession = async () => ({ sessionId: 'S1' })
let finished = false
context.emit = () => { finished = true }
await vm.runInContext('finishTest()', context)
assert.ok(finished)
assert.equal(vm.runInContext('sessionStopped && allowLeave', context), true)
assert.doesNotMatch(monitor, /结束并离开|onBeforeRouteLeave/)
const report = '/simulation-well?view=test-report&workNo=W1'
await lock.allowSimulationWellNavigation(report, () => router.replace(report))
await router.push('/vibration')
assert.equal(router.currentRoute.value.path, '/vibration')
await router.push('/simulation-well?view=active-test&workNo=W1')
const list = '/simulation-well?view=downhole-work'
await lock.allowSimulationWellNavigation(list, () => router.replace(list))
assert.equal(lock.simulationWellLockedPath.value, '')
lock.syncSimulationWellNavigationLock(active, true)
lock.clearSimulationWellNavigationLock()
assert.ok(lock.canNavigateSimulationWell('/'))
const page = read('src/views/simulation-well/index.vue')
assert.match(page, /onBeforeUnmount\(clearSimulationWellNavigationLock\)/)
assert.match(page, /@click="abortActiveTest"/)
assert.match(page, /function handleMonitorFinished[\s\S]*navigateTestFlow/)
console.log('PASS: real router guards, back navigation, menu mouse/keyboard, one-use permits, stop failure/success and unlock')
