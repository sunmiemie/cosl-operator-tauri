import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import { load } from '@tauri-apps/plugin-store'

// 路由配置
const routes: RouteRecordRaw[] = [
  // 登录页面
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', requiresAuth: false }
  },
  // 主窗口路由（需要登录）
  {
    path: '/',
    component: DefaultLayout,
    meta: { requiresAuth: true },
    children: [
      // 测试台检测
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '仪表盘', requiresAuth: true }
      },
      {
        path: 'halt-hass',
        name: 'HaltHass',
        component: () => import('@/views/halt-hass/index.vue'),
        meta: { title: 'Halt-Hass', requiresAuth: true }
      },
      {
        path: 'high-temp-pressure',
        name: 'HighTempPressure',
        component: () => import('@/views/high-temp-pressure/index.vue'),
        meta: { title: '高温高压井', requiresAuth: true }
      },
      {
        path: 'vibration',
        name: 'Vibration',
        component: () => import('@/views/vibration/index.vue'),
        meta: { title: '振动台', requiresAuth: true }
      },
      {
        path: 'water-cycle',
        name: 'WaterCycle',
        component: () => import('@/views/water-cycle/index.vue'),
        meta: { title: '水循环', requiresAuth: true }
      },
      {
        path: 'high-temp-box',
        name: 'HighTempBox',
        component: () => import('@/views/high-temp-box/index.vue'),
        meta: { title: '高温箱', requiresAuth: true }
      },
      {
        path: 'simulation-well',
        name: 'SimulationWell',
        component: () => import('@/views/simulation-well/index.vue'),
        meta: { title: '模拟井', requiresAuth: true }
      },
      // 视觉检测
      {
        path: 'xray-test',
        name: 'XrayTest',
        component: () => import('@/views/xray-test/index.vue'),
        meta: { title: 'X-Ray测试', requiresAuth: true }
      },
      {
        path: 'visual-inspection',
        name: 'VisualInspection',
        component: () => import('@/views/visual-inspection/index.vue'),
        meta: { title: '目检测试', requiresAuth: true }
      },
      // 工艺编辑
      {
        path: 'process/eyes',
        name: 'ProcessEyes',
        component: () => import('@/views/process-visual/index.vue'),
        props: { processType: 'eyes' },
        meta: { title: '目检工艺编辑', requiresAuth: true }
      },
      {
        path: 'process/xray',
        name: 'ProcessXray',
        component: () => import('@/views/process-visual/index.vue'),
        props: { processType: 'xray' },
        meta: { title: 'X-Ray工艺编辑', requiresAuth: true }
      },
      {
        path: 'process/halt-hass',
        name: 'ProcessHaltHass',
        component: () => import('@/views/process-halt-hass/index.vue'),
        meta: { title: 'HALT HASS工艺', requiresAuth: true }
      },
    ]
  },
  // 模态窗口路由 - 设置
  {
    path: '/modal-settings',
    name: 'ModalSettings',
    component: () => import('@/views/settings/index.vue'),
    meta: { title: '设置', requiresAuth: true }
  },
  // 报告预览窗口
  {
    path: '/report-preview',
    name: 'ReportPreview',
    component: () => import('@/views/report-preview/index.vue'),
    meta: { title: '报告详情', requiresAuth: true }
  }
]

// 创建路由实例
const router = createRouter({
  history: createWebHistory(),
  routes
})

// Token 存储键
const TOKEN_KEY = 'auth-token'

// 获取 token（从 store 读取）
async function getToken(): Promise<string | null> {
  try {
    const store = await load('auth.json')
    return await store.get<string>(TOKEN_KEY) || null
  } catch {
    return null
  }
}

// 路由守卫：认证检查 + 设置页面标题
router.beforeEach(async (to, _from, next) => {
  // 设置页面标题
  const title = to.meta.title as string
  document.title = title ? `${title} - COSL Operator` : 'COSL Operator'

  // 检查是否需要认证
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth !== false)

  if (requiresAuth) {
    // 从 store 检查 token
    const token = await getToken()

    if (!token) {
      // 没有 token，重定向到登录页
      next({ name: 'Login', query: { redirect: to.fullPath } })
      return
    }
  }

  // 如果已登录且访问登录页，重定向到首页
  if (to.name === 'Login') {
    const token = await getToken()
    if (token) {
      next({ path: '/' })
      return
    }
  }

  next()
})

export default router
