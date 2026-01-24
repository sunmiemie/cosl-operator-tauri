<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import ModalLayout from '@/layouts/ModalLayout.vue'
import XrayCropCalibration from './components/XrayCropCalibration.vue'
import { useTheme } from '@/composables/useTheme'
import { useConfig } from '@/composables/useConfig'
import { useCamera, type CameraDevice } from '@/composables/useCamera'
import { useAppLock } from '@/composables/useAppLock'
import { ThemeMode } from '@/enums'
import { http } from '@/services/http'
import { cacheApi, type CacheSizes } from '@/services/process'
import { ElMessage, ElMessageBox } from 'element-plus'
// 注意: 如果需要目录选择功能，需要安装 @tauri-apps/plugin-dialog
// 当前使用输入框手动输入作为临时方案

const { themeMode, setTheme, initTheme } = useTheme()
const { initConfig, setConfigItem, getConfigPath, config } = useConfig()
const camera = useCamera()

// 后端地址
const backendUrl = ref('http://localhost:60034')
const isSaving = ref(false)
const saveSuccess = ref(false)
const configPath = ref('')

// 连接测试状态
const isTestingConnection = ref(false)
const connectionStatus = ref<'idle' | 'success' | 'error'>('idle')

// 密码验证（管理员）
const ADMIN_PASSWORD = '123456coslX$'  // 管理员密码
const showPasswordDialog = ref(false)
const passwordInput = ref('')
const passwordError = ref('')
const pendingAction = ref<(() => void) | null>(null)

// 锁定密码设置
const { verifyPassword: verifyLockerPassword, changePassword: changeLockerPassword } = useAppLock()
const oldPassword = ref('')
const newPassword = ref('')
const passwordUnlocked = ref(false)
const lockPasswordError = ref('')

// 设备设置
const cameraList = ref<CameraDevice[]>([])
const microDevice = ref<number>(-1)
const planeDevice = ref<number>(-1)
const xrayDevice = ref<number>(-1)
const isLoadingCameras = ref(false)
const isRestartingCameras = ref(false)

// 离线功能设置
const dataDir = ref('')
const autoSave = ref(true)
const autoReUpload = ref(true)

// 通用设置
const language = ref('zh-CN')
const autoStart = ref(false)

// 缓存管理
const cacheSizes = ref<CacheSizes>({ process: 0, temp: 0, feedback: 0, report: 0, total: 0 })
const isLoadingCache = ref(false)
const isClearingCache = ref(false)

// 摄像头预览
const previewDevice = ref<string | null>(null)
const isPreviewOpen = ref(false)
const previewVideo = ref<HTMLVideoElement | null>(null)
const previewCanvasRef = ref<HTMLCanvasElement | null>(null)
let previewAnimationId: number | null = null

// X-Ray 区域校准
const showXrayCropCalibration = ref(false)

// 侧边栏菜单配置
const router = useRouter()
const hiddenMenus = ref<string[]>([])

// 可配置的菜单项接口
interface MenuConfigItem {
  path: string
  title: string
}

// 从路由配置中动态提取可配置的菜单项（排除仪表盘和设置）
const configurableMenus = computed<MenuConfigItem[]>(() => {
  // 获取原始路由配置
  const routes = router.options.routes
  
  // 查找主布局路由（path 为 '/'）
  const mainLayoutRoute = routes.find(r => r.path === '/')
  if (!mainLayoutRoute?.children) return []
  
  // 提取所有子路由（排除首页仪表盘）
  return mainLayoutRoute.children
    .filter(child => {
      // 排除仪表盘（首页，path 为空字符串）
      if (!child.path || child.path === '') return false
      return true
    })
    .map(child => {
      // 构建完整路径
      const fullPath = child.path.startsWith('/') ? child.path : '/' + child.path
      // 获取标题（从 meta.title 或 name）
      const title = (child.meta?.title as string) || (child.name as string) || child.path
      return { path: fullPath, title }
    })
})

// 检查菜单项是否隐藏
function isMenuHidden(path: string): boolean {
  return hiddenMenus.value.includes(path)
}

// 切换菜单项显示/隐藏
async function toggleMenuVisibility(path: string) {
  const index = hiddenMenus.value.indexOf(path)
  if (index > -1) {
    hiddenMenus.value.splice(index, 1)
  } else {
    hiddenMenus.value.push(path)
  }
  await setConfigItem('hiddenMenus', [...hiddenMenus.value])
}

// 判断是否启用了 X-Ray 裁剪预览
const isXrayPreviewWithCrop = computed(() => {
  return previewDevice.value === 'xray' && config.value.xrayCropArea?.enabled
})

// 配置是否已加载（防止 watch 在初始化时触发保存）
const configLoaded = ref(false)

// 初始化
onMounted(async () => {
  await initTheme()
  await initConfig()
  
  // 加载配置
  backendUrl.value = config.value.backendUrl
  microDevice.value = config.value.microDevice ?? -1
  planeDevice.value = config.value.planeDevice ?? -1
  xrayDevice.value = config.value.xrayDevice ?? -1
  dataDir.value = config.value.dataDir ?? ''
  autoSave.value = config.value.autoSave ?? true
  autoReUpload.value = config.value.autoReUpload ?? true
  language.value = config.value.language ?? 'zh-CN'
  autoStart.value = config.value.autoStart ?? false
  hiddenMenus.value = [...(config.value.hiddenMenus ?? [])]
  
  // 获取配置文件路径
  configPath.value = await getConfigPath()
  
  // 加载摄像头列表
  await loadCameraList()
  
  // 加载缓存大小
  await loadCacheSizes()
  
  // 标记配置已加载，此后 watch 才会真正保存
  configLoaded.value = true
  
  console.log('设置页面初始化完成:', {
    microDevice: microDevice.value,
    planeDevice: planeDevice.value,
    xrayDevice: xrayDevice.value,
    cameraList: cameraList.value
  })
})

// 加载摄像头列表
async function loadCameraList() {
  isLoadingCameras.value = true
  try {
    cameraList.value = await camera.getDeviceList()
    console.log('摄像头列表:', cameraList.value)
  } catch (e) {
    console.error('加载摄像头列表失败:', e)
  } finally {
    isLoadingCameras.value = false
  }
}

// ==================== 缓存管理 ====================

// 加载缓存大小
async function loadCacheSizes() {
  isLoadingCache.value = true
  try {
    cacheSizes.value = await cacheApi.getAllSizes()
  } catch (e) {
    console.error('加载缓存大小失败:', e)
  } finally {
    isLoadingCache.value = false
  }
}

// 格式化缓存大小显示
function formatCacheSize(size: number): string {
  if (size < 0.01) return '0 B'
  if (size < 1) return `${(size * 1024).toFixed(0)} KB`
  return `${size.toFixed(2)} MB`
}

// 清理指定类型缓存
async function clearCacheByType(type: 'process' | 'temp' | 'feedback' | 'report') {
  const typeNames: Record<string, string> = {
    process: '工艺缓存',
    temp: '临时工单缓存',
    feedback: '反馈记录缓存',
    report: '报告缓存'
  }
  
  try {
    await ElMessageBox.confirm(
      `确定要清理${typeNames[type]}吗？清理后需要重新下载数据。`,
      '清理确认',
      {
        confirmButtonText: '确定清理',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return  // 用户取消
  }
  
  isClearingCache.value = true
  try {
    const success = await cacheApi.clear(type)
    if (success) {
      ElMessage.success(`${typeNames[type]}已清理`)
      await loadCacheSizes()
    } else {
      ElMessage.error('清理失败')
    }
  } catch (e) {
    console.error('清理缓存失败:', e)
    ElMessage.error('清理缓存失败')
  } finally {
    isClearingCache.value = false
  }
}

// 清理所有缓存
async function clearAllCache() {
  try {
    await ElMessageBox.confirm(
      '确定要清理所有缓存吗？清理后需要重新下载所有数据。',
      '清理确认',
      {
        confirmButtonText: '确定清理',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return  // 用户取消
  }
  
  isClearingCache.value = true
  try {
    const success = await cacheApi.clearAll()
    if (success) {
      ElMessage.success('所有缓存已清理')
      await loadCacheSizes()
    } else {
      ElMessage.error('清理失败')
    }
  } catch (e) {
    console.error('清理缓存失败:', e)
    ElMessage.error('清理缓存失败')
  } finally {
    isClearingCache.value = false
  }
}

// 获取摄像头索引（确保返回数字）
function getCameraIndex(cam: CameraDevice): number {
  if (cam.index !== undefined && cam.index !== null) {
    return cam.index
  }
  const parsed = parseInt(cam.deviceId, 10)
  return isNaN(parsed) ? 0 : parsed
}

// 重启摄像头驱动
async function restartCameras() {
  isRestartingCameras.value = true
  try {
    const success = await camera.restartCameraDriver()
    if (success) {
      await loadCameraList()
    }
  } finally {
    isRestartingCameras.value = false
  }
}

// 保存后端地址
// 请求密码验证
function requirePassword(action: () => void) {
  pendingAction.value = action
  passwordInput.value = ''
  passwordError.value = ''
  showPasswordDialog.value = true
}

// 验证密码
function verifyPassword() {
  if (passwordInput.value === ADMIN_PASSWORD) {
    showPasswordDialog.value = false
    if (pendingAction.value) {
      pendingAction.value()
      pendingAction.value = null
    }
  } else {
    passwordError.value = '密码错误'
  }
}

// 取消密码验证
function cancelPasswordDialog() {
  showPasswordDialog.value = false
  passwordInput.value = ''
  passwordError.value = ''
  pendingAction.value = null
}

// 保存后端地址（需要密码验证）
function saveBackendUrl() {
  requirePassword(doSaveBackendUrl)
}

// 实际执行保存后端地址
async function doSaveBackendUrl() {
  isSaving.value = true
  saveSuccess.value = false
  
  try {
    await setConfigItem('backendUrl', backendUrl.value)
    http.setBaseUrl(backendUrl.value)
    saveSuccess.value = true
    setTimeout(() => {
      saveSuccess.value = false
    }, 2000)
  } catch (error) {
    console.error('保存后端地址失败:', error)
  } finally {
    isSaving.value = false
  }
}

// 测试连接
async function testConnection() {
  isTestingConnection.value = true
  connectionStatus.value = 'idle'
  
  try {
    http.setBaseUrl(backendUrl.value)
    const result = await http.testConnection()
    connectionStatus.value = result.success ? 'success' : 'error'
  } catch {
    connectionStatus.value = 'error'
  } finally {
    isTestingConnection.value = false
    setTimeout(() => {
      connectionStatus.value = 'idle'
    }, 3000)
  }
}

// 保存设备配置
async function saveDeviceSetting(type: 'micro' | 'plane' | 'xray', value: number) {
  const key = `${type}Device` as 'microDevice' | 'planeDevice' | 'xrayDevice'
  await setConfigItem(key, value)
}

// 选择数据存储目录（使用手动输入）
const isEditingDataDir = ref(false)
const tempDataDir = ref('')

function startEditDataDir() {
  tempDataDir.value = dataDir.value
  isEditingDataDir.value = true
}

async function saveDataDir() {
  dataDir.value = tempDataDir.value
  await setConfigItem('dataDir', tempDataDir.value)
  isEditingDataDir.value = false
}

function cancelEditDataDir() {
  isEditingDataDir.value = false
}

// 保存离线设置
async function saveOfflineSetting(key: 'autoSave' | 'autoReUpload', value: boolean) {
  await setConfigItem(key, value)
}

// 锁定密码验证和修改
function handlePasswordUnlock() {
  if (passwordUnlocked.value) {
    // 如果已解锁，保存新密码（如果有）并锁定
    if (newPassword.value.trim()) {
      saveNewPassword()
    }
    passwordUnlocked.value = false
    oldPassword.value = ''
    newPassword.value = ''
    lockPasswordError.value = ''
  } else {
    // 验证原密码
    if (!oldPassword.value.trim()) {
      lockPasswordError.value = '请输入原密码'
      return
    }
    if (verifyLockerPassword(oldPassword.value)) {
      passwordUnlocked.value = true
      lockPasswordError.value = ''
    } else {
      lockPasswordError.value = '密码错误'
    }
  }
}

async function saveNewPassword() {
  if (!newPassword.value.trim()) return
  
  try {
    await changeLockerPassword(newPassword.value)
    ElMessage.success('密码修改成功')
    newPassword.value = ''
  } catch {
    ElMessage.error('密码保存失败')
  }
}

// 预览摄像头
async function previewCamera(deviceType: 'micro' | 'plane' | 'xray') {
  let deviceIndex = -1
  switch (deviceType) {
    case 'micro':
      deviceIndex = microDevice.value
      break
    case 'plane':
      deviceIndex = planeDevice.value
      break
    case 'xray':
      deviceIndex = xrayDevice.value
      break
  }
  
  if (deviceIndex < 0) {
    console.warn('未选择设备，无法预览')
    return
  }
  
  console.log('预览摄像头:', deviceType, '索引:', deviceIndex)
  previewDevice.value = deviceType
  isPreviewOpen.value = true
  
  // 直接传递数字索引
  const success = await camera.startCamera(deviceIndex)
  if (!success) {
    console.error('启动摄像头失败:', camera.error.value)
  }
  
  // 等待 DOM 更新后绑定 video 元素
  await nextTick()
  if (previewVideo.value) {
    camera.bindVideoElement(previewVideo.value)
  }
  
  // 如果是 X-Ray 且启用了裁剪，启动裁剪绘制循环
  if (deviceType === 'xray' && config.value.xrayCropArea?.enabled) {
    startPreviewCropLoop()
  }
}

// 关闭预览
async function closePreview() {
  stopPreviewCropLoop()
  await camera.stopCamera()
  isPreviewOpen.value = false
  previewDevice.value = null
}

// 启动预览裁剪绘制循环
function startPreviewCropLoop() {
  if (previewAnimationId) return
  drawPreviewCroppedFrame()
}

// 停止预览裁剪绘制循环
function stopPreviewCropLoop() {
  if (previewAnimationId) {
    cancelAnimationFrame(previewAnimationId)
    previewAnimationId = null
  }
}

// 绘制裁剪后的预览帧
function drawPreviewCroppedFrame() {
  if (!isPreviewOpen.value || !isXrayPreviewWithCrop.value) {
    previewAnimationId = null
    return
  }
  
  const canvas = previewCanvasRef.value
  const cropConfig = config.value.xrayCropArea
  const frameData = camera.currentFrame.value
  
  if (canvas && cropConfig && frameData) {
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // 计算裁剪区域
        const wMin = Math.min(cropConfig.w[0], cropConfig.w[1])
        const wMax = Math.max(cropConfig.w[0], cropConfig.w[1])
        const hMin = Math.min(cropConfig.h[0], cropConfig.h[1])
        const hMax = Math.max(cropConfig.h[0], cropConfig.h[1])
        
        let sw = wMax - wMin
        let sh = hMax - hMin
        
        // 如果裁剪区域无效，显示整个画面
        if (sw <= 0 || sh <= 0) {
          canvas.width = img.width
          canvas.height = img.height
          ctx.drawImage(img, 0, 0)
        } else {
          const sx = Math.max(0, Math.min(wMin, img.width))
          const sy = Math.max(0, img.height - Math.min(hMax, img.height))
          sw = Math.min(sw, img.width - sx)
          sh = Math.min(sh, img.height - sy)
          
          canvas.width = sw
          canvas.height = sh
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
        }
      }
    }
    img.src = frameData
  }
  
  previewAnimationId = requestAnimationFrame(drawPreviewCroppedFrame)
}

// 监听摄像头激活状态，绑定 video 元素
watch(() => camera.isActive.value, async (isActive) => {
  if (isActive && isPreviewOpen.value) {
    await nextTick()
    if (previewVideo.value) {
      camera.bindVideoElement(previewVideo.value)
    }
    // 如果是 X-Ray 且启用了裁剪，启动裁剪绘制循环
    if (isXrayPreviewWithCrop.value) {
      startPreviewCropLoop()
    }
  }
})

// 监听设备选择变化 - 只在配置加载完成后才保存
watch(microDevice, (val) => {
  if (configLoaded.value) {
    console.log('保存显微镜设备:', val)
    saveDeviceSetting('micro', val)
  }
})
watch(planeDevice, (val) => {
  if (configLoaded.value) {
    console.log('保存水平仪设备:', val)
    saveDeviceSetting('plane', val)
  }
})
watch(xrayDevice, (val) => {
  if (configLoaded.value) {
    console.log('保存X光机设备:', val)
    saveDeviceSetting('xray', val)
  }
})
watch(autoSave, (val) => {
  if (configLoaded.value) saveOfflineSetting('autoSave', val)
})
watch(autoReUpload, (val) => {
  if (configLoaded.value) saveOfflineSetting('autoReUpload', val)
})

// 主题选项
const themeOptions = [
  { label: '亮色', value: ThemeMode.LIGHT, icon: 'mdi:weather-sunny' },
  { label: '暗色', value: ThemeMode.DARK, icon: 'mdi:weather-night' },
  { label: '系统', value: ThemeMode.SYSTEM, icon: 'mdi:laptop' },
]

// 语言选项
const languageOptions = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
]
</script>

<template>
  <ModalLayout title="设置" icon="mdi:cog">
    <div class="settings-content">
      <!-- 连接设置 -->
      <div class="settings-section">
        <h3 class="section-title">
          <Icon icon="mdi:connection" class="section-icon" />
          连接
        </h3>
        
        <div class="settings-list">
          <div class="settings-item backend-item">
            <span class="item-label">后端地址</span>
            <div class="backend-config">
              <input 
                v-model="backendUrl" 
                type="text" 
                class="backend-input"
                placeholder="http://localhost:8080"
              />
              <button 
                class="action-btn test-btn" 
                :class="{ 
                  testing: isTestingConnection, 
                  success: connectionStatus === 'success',
                  error: connectionStatus === 'error'
                }"
                @click="testConnection"
                :disabled="isTestingConnection"
                title="测试连接"
              >
                <Icon v-if="connectionStatus === 'success'" icon="mdi:check" />
                <Icon v-else-if="connectionStatus === 'error'" icon="mdi:close" />
                <Icon v-else-if="isTestingConnection" icon="mdi:loading" class="spin" />
                <Icon v-else icon="mdi:lan-connect" />
              </button>
              <button 
                class="action-btn save-btn" 
                :class="{ saving: isSaving, success: saveSuccess }"
                @click="saveBackendUrl"
                :disabled="isSaving"
              >
                <Icon v-if="saveSuccess" icon="mdi:check" />
                <Icon v-else-if="isSaving" icon="mdi:loading" class="spin" />
                <span v-else>保存</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 设备设置 -->
      <div class="settings-section">
        <h3 class="section-title">
          <Icon icon="mdi:camera" class="section-icon" />
          设备
          <button 
            class="section-action" 
            @click="restartCameras"
            :disabled="isRestartingCameras"
            title="重新初始化摄像头驱动"
          >
            <Icon 
              :icon="isRestartingCameras ? 'mdi:loading' : 'mdi:refresh'" 
              :class="{ spin: isRestartingCameras }" 
            />
          </button>
        </h3>
        
        <div class="settings-list">
          <!-- 显微镜 -->
          <div class="settings-item">
            <span class="item-label">显微镜摄像头</span>
            <div class="device-selector">
              <select 
                v-model.number="microDevice" 
                class="item-select"
                :disabled="isLoadingCameras"
              >
                <option :value="-1">未选择</option>
                <option 
                  v-for="cam in cameraList" 
                  :key="cam.deviceId" 
                  :value="getCameraIndex(cam)"
                >
                  {{ cam.label }}
                </option>
              </select>
              <button 
                class="preview-btn"
                :disabled="microDevice < 0"
                @click="previewCamera('micro')"
                title="预览"
              >
                <Icon icon="mdi:eye" />
              </button>
            </div>
          </div>
          
          <!-- 水平仪 -->
          <div class="settings-item">
            <span class="item-label">水平仪摄像头</span>
            <div class="device-selector">
              <select 
                v-model.number="planeDevice" 
                class="item-select"
                :disabled="isLoadingCameras"
              >
                <option :value="-1">未选择</option>
                <option 
                  v-for="cam in cameraList" 
                  :key="cam.deviceId" 
                  :value="getCameraIndex(cam)"
                >
                  {{ cam.label }}
                </option>
              </select>
              <button 
                class="preview-btn"
                :disabled="planeDevice < 0"
                @click="previewCamera('plane')"
                title="预览"
              >
                <Icon icon="mdi:eye" />
              </button>
            </div>
          </div>
          
          <!-- X光机 -->
          <div class="settings-item">
            <span class="item-label">X光机摄像头</span>
            <div class="device-selector">
              <select 
                v-model.number="xrayDevice" 
                class="item-select"
                :disabled="isLoadingCameras"
              >
                <option :value="-1">未选择</option>
                <option 
                  v-for="cam in cameraList" 
                  :key="cam.deviceId" 
                  :value="getCameraIndex(cam)"
                >
                  {{ cam.label }}
                </option>
              </select>
              <button 
                class="preview-btn"
                :disabled="xrayDevice < 0"
                @click="previewCamera('xray')"
                title="预览"
              >
                <Icon icon="mdi:eye" />
              </button>
              <button 
                class="preview-btn calibration-btn"
                :disabled="xrayDevice < 0"
                @click="showXrayCropCalibration = true"
                title="区域校准"
              >
                <Icon icon="mdi:crop" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 离线功能设置 -->
      <div class="settings-section">
        <h3 class="section-title">
          <Icon icon="mdi:folder-outline" class="section-icon" />
          离线功能
        </h3>
        
        <div class="settings-list">
          <div class="settings-item">
            <span class="item-label">离线存储目录</span>
            <div class="dir-selector">
              <input 
                v-if="isEditingDataDir"
                v-model="tempDataDir"
                class="dir-input editable"
                placeholder="输入目录路径"
                @keyup.enter="saveDataDir"
                @keyup.escape="cancelEditDataDir"
              />
              <input 
                v-else
                :value="dataDir || '未设置'" 
                readonly 
                class="dir-input"
                @click="startEditDataDir"
              />
              <button 
                v-if="isEditingDataDir" 
                class="browse-btn save" 
                @click="saveDataDir"
                title="保存"
              >
                <Icon icon="mdi:check" />
              </button>
              <button 
                v-if="isEditingDataDir" 
                class="browse-btn" 
                @click="cancelEditDataDir"
                title="取消"
              >
                <Icon icon="mdi:close" />
              </button>
              <button 
                v-if="!isEditingDataDir" 
                class="browse-btn" 
                @click="startEditDataDir"
                title="编辑"
              >
                <Icon icon="mdi:pencil" />
              </button>
            </div>
          </div>
          <div class="settings-item">
            <span class="item-label">测试过程自动保存</span>
            <button class="toggle-btn" :class="{ active: autoSave }" @click="autoSave = !autoSave">
              <span class="toggle-track">
                <span class="toggle-thumb"></span>
              </span>
            </button>
          </div>
          <div class="settings-item">
            <span class="item-label">网络恢复自动回传</span>
            <button class="toggle-btn" :class="{ active: autoReUpload }" @click="autoReUpload = !autoReUpload">
              <span class="toggle-track">
                <span class="toggle-thumb"></span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- 缓存管理 -->
      <div class="settings-section">
        <h3 class="section-title">
          <Icon icon="mdi:cached" class="section-icon" />
          缓存管理
          <button 
            class="section-action"
            @click="loadCacheSizes"
            :disabled="isLoadingCache"
            title="刷新"
          >
            <Icon :icon="isLoadingCache ? 'mdi:loading' : 'mdi:refresh'" :class="{ 'animate-spin': isLoadingCache }" />
          </button>
        </h3>
        
        <div class="settings-list">
          <!-- 缓存总大小 -->
          <div class="settings-item cache-total">
            <span class="item-label">缓存总大小</span>
            <span class="cache-size total">{{ formatCacheSize(cacheSizes.total) }}</span>
          </div>
          
          <!-- 各类缓存 -->
          <div class="settings-item cache-item">
            <div class="cache-info">
              <Icon icon="mdi:file-document-outline" class="cache-icon" />
              <span class="item-label">工艺缓存</span>
              <span class="cache-size">{{ formatCacheSize(cacheSizes.process) }}</span>
            </div>
            <button 
              class="btn btn-ghost btn-sm"
              @click="clearCacheByType('process')"
              :disabled="isClearingCache || cacheSizes.process < 0.01"
              title="清理工艺缓存"
            >
              <Icon icon="mdi:delete-outline" />
            </button>
          </div>
          
          <div class="settings-item cache-item">
            <div class="cache-info">
              <Icon icon="mdi:clock-outline" class="cache-icon" />
              <span class="item-label">临时工单缓存</span>
              <span class="cache-size">{{ formatCacheSize(cacheSizes.temp) }}</span>
            </div>
            <button 
              class="btn btn-ghost btn-sm"
              @click="clearCacheByType('temp')"
              :disabled="isClearingCache || cacheSizes.temp < 0.01"
              title="清理临时工单缓存"
            >
              <Icon icon="mdi:delete-outline" />
            </button>
          </div>
          
          <div class="settings-item cache-item">
            <div class="cache-info">
              <Icon icon="mdi:message-reply-text-outline" class="cache-icon" />
              <span class="item-label">反馈记录缓存</span>
              <span class="cache-size">{{ formatCacheSize(cacheSizes.feedback) }}</span>
            </div>
            <button 
              class="btn btn-ghost btn-sm"
              @click="clearCacheByType('feedback')"
              :disabled="isClearingCache || cacheSizes.feedback < 0.01"
              title="清理反馈记录缓存"
            >
              <Icon icon="mdi:delete-outline" />
            </button>
          </div>
          
          <div class="settings-item cache-item">
            <div class="cache-info">
              <Icon icon="mdi:file-chart-outline" class="cache-icon" />
              <span class="item-label">报告缓存</span>
              <span class="cache-size">{{ formatCacheSize(cacheSizes.report) }}</span>
            </div>
            <button 
              class="btn btn-ghost btn-sm"
              @click="clearCacheByType('report')"
              :disabled="isClearingCache || cacheSizes.report < 0.01"
              title="清理报告缓存"
            >
              <Icon icon="mdi:delete-outline" />
            </button>
          </div>
          
          <!-- 清理全部 -->
          <div class="settings-item cache-clear-all">
            <button 
              class="btn btn-danger btn-block"
              @click="clearAllCache"
              :disabled="isClearingCache || cacheSizes.total < 0.01"
            >
              <Icon :icon="isClearingCache ? 'mdi:loading' : 'mdi:delete-sweep'" :class="{ 'animate-spin': isClearingCache }" />
              清理全部缓存
            </button>
          </div>
        </div>
      </div>

      <!-- 外观设置 -->
      <div class="settings-section">
        <h3 class="section-title">
          <Icon icon="mdi:palette-outline" class="section-icon" />
          外观
        </h3>
        
        <div class="settings-list">
          <div class="settings-item">
            <span class="item-label">主题模式</span>
            <div class="theme-selector">
              <button 
                v-for="option in themeOptions" 
                :key="option.value"
                class="theme-option"
                :class="{ active: themeMode === option.value }"
                @click="setTheme(option.value)"
              >
                <Icon :icon="option.icon" class="option-icon" />
                <span>{{ option.label }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 侧边栏菜单配置 -->
      <div class="settings-section">
        <h3 class="section-title">
          <Icon icon="mdi:menu" class="section-icon" />
          侧边栏菜单
        </h3>
        
        <div class="settings-list">
          <div class="settings-item menu-config-hint">
            <Icon icon="mdi:information-outline" class="hint-icon" />
            <span class="hint-text">控制侧边栏显示的功能模块（仪表盘和设置始终显示）</span>
          </div>
          <div 
            v-for="menu in configurableMenus" 
            :key="menu.path" 
            class="settings-item menu-config-item"
          >
            <div class="menu-info">
              <span class="item-label">{{ menu.title }}</span>
              <span class="menu-path">{{ menu.path }}</span>
            </div>
            <button 
              class="toggle-btn" 
              :class="{ active: !isMenuHidden(menu.path) }"
              @click="toggleMenuVisibility(menu.path)"
            >
              <span class="toggle-track">
                <span class="toggle-thumb"></span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- 安全设置 -->
      <div class="settings-section">
        <h3 class="section-title">
          <Icon icon="mdi:shield-lock-outline" class="section-icon" />
          安全
        </h3>
        
        <div class="settings-list">
          <!-- 锁定密码设置 -->
          <div class="settings-item password-setting">
            <span class="item-label">锁定密码</span>
            <div class="password-form">
              <div class="password-row">
                <input
                  v-model="oldPassword"
                  type="password"
                  class="password-input"
                  placeholder="输入原密码(默认：12345678)"
                  :disabled="passwordUnlocked"
                />
                <button 
                  class="unlock-btn"
                  :class="{ unlocked: passwordUnlocked }"
                  @click="handlePasswordUnlock"
                  :title="passwordUnlocked ? '点击锁定' : '点击解锁以更改'"
                >
                  <Icon :icon="passwordUnlocked ? 'mdi:lock-open-outline' : 'mdi:lock-outline'" />
                </button>
              </div>
              <div class="password-row" v-if="passwordUnlocked">
                <input
                  v-model="newPassword"
                  type="password"
                  class="password-input"
                  placeholder="输入新密码"
                />
              </div>
              <span v-if="passwordError" class="password-error">{{ passwordError }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 通用设置 -->
      <div class="settings-section">
        <h3 class="section-title">
          <Icon icon="mdi:cog-outline" class="section-icon" />
          通用
        </h3>
        
        <div class="settings-list">
          <div class="settings-item">
            <span class="item-label">语言</span>
            <select v-model="language" class="item-select">
              <option v-for="opt in languageOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="settings-item">
            <span class="item-label">开机自启动</span>
            <button class="toggle-btn" :class="{ active: autoStart }" @click="autoStart = !autoStart">
              <span class="toggle-track">
                <span class="toggle-thumb"></span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- 关于 -->
      <div class="settings-section">
        <h3 class="section-title">
          <Icon icon="mdi:information-outline" class="section-icon" />
          关于
        </h3>
        
        <div class="settings-list">
          <div class="settings-item">
            <span class="item-label">版本</span>
            <span class="item-value">0.1.0</span>
          </div>
          <div class="settings-item">
            <span class="item-label">开发团队</span>
            <span class="item-value">Tsinghua University NEVT Lab</span>
          </div>
          <div class="settings-item config-path-item">
            <span class="item-label">配置文件</span>
            <span class="item-value config-path">{{ configPath }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 摄像头预览弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="isPreviewOpen" class="preview-overlay" @click="closePreview">
          <div class="preview-dialog" @click.stop>
            <div class="preview-header">
              <span>摄像头预览 - {{ previewDevice === 'micro' ? '显微镜' : previewDevice === 'plane' ? '水平仪' : 'X光机' }}</span>
              <button class="close-btn" @click="closePreview">
                <Icon icon="mdi:close" />
              </button>
            </div>
            <div class="preview-content">
              <!-- X-Ray 裁剪预览 Canvas -->
              <canvas
                v-if="isXrayPreviewWithCrop && camera.isActive.value"
                ref="previewCanvasRef"
                class="preview-canvas"
              ></canvas>
              <!-- 普通视频预览 -->
              <video 
                v-else-if="camera.isActive.value"
                ref="previewVideo"
                autoplay
                playsinline
                muted
                class="preview-video"
              ></video>
              <div v-else class="preview-placeholder">
                <Icon icon="mdi:camera-off" />
                <span>正在连接摄像头...</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- X-Ray 区域校准对话框 -->
    <XrayCropCalibration 
      v-model:visible="showXrayCropCalibration"
      :xray-device-index="xrayDevice"
    />

    <!-- 密码验证对话框 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showPasswordDialog" class="password-overlay" @click="cancelPasswordDialog">
          <div class="password-dialog" @click.stop>
            <div class="password-header">
              <Icon icon="mdi:lock" class="lock-icon" />
              <span>需要管理员密码</span>
            </div>
            <div class="password-content">
              <input
                v-model="passwordInput"
                type="password"
                class="password-input"
                placeholder="请输入管理员密码"
                @keyup.enter="verifyPassword"
                autofocus
              />
              <p v-if="passwordError" class="password-error">{{ passwordError }}</p>
            </div>
            <div class="password-actions">
              <button class="cancel-btn" @click="cancelPasswordDialog">取消</button>
              <button class="confirm-btn" @click="verifyPassword">确认</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </ModalLayout>
</template>

<style scoped>
.settings-content {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.settings-section {
  margin-bottom: 20px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-icon {
  font-size: 14px;
}

.section-action {
  margin-left: auto;
  padding: 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.section-action:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-accent-blue);
}

.section-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-list {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
}

.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
  gap: 12px;
}

.settings-item:last-child {
  border-bottom: none;
}

/* 缓存管理样式 */
.cache-total {
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  margin-bottom: 8px;
}

.cache-total .cache-size.total {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-accent-blue);
}

.cache-item {
  padding: 10px 14px;
}

.cache-item .cache-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.cache-icon {
  font-size: 16px;
  color: var(--color-text-secondary);
}

.cache-size {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--color-text-secondary);
  margin-left: auto;
  padding-right: 8px;
}

.cache-clear-all {
  padding: 12px 14px;
  border-top: 1px solid var(--color-border);
}

.btn-block {
  width: 100%;
  justify-content: center;
}

.btn-danger {
  background: var(--color-accent-red);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
}

.btn-danger:hover:not(:disabled) {
  filter: brightness(1.15);
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.backend-item {
  flex-wrap: wrap;
}

.item-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
}

.item-value {
  font-size: 13px;
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
}

.config-path-item {
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.config-path {
  font-size: 11px;
  word-break: break-all;
  opacity: 0.8;
}

/* 后端地址配置 */
.backend-config {
  display: flex;
  gap: 6px;
  flex: 1;
  max-width: 400px;
}

.backend-input {
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-family: var(--font-mono);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  min-width: 0;
}

.backend-input:focus {
  outline: none;
  border-color: var(--color-accent-blue);
  box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.15);
}

/* 设备选择器 */
.device-selector {
  display: flex;
  gap: 6px;
  align-items: center;
}

.preview-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.preview-btn:hover:not(:disabled) {
  border-color: var(--color-accent-blue);
  color: var(--color-accent-blue);
}

.preview-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 目录选择器 */
.dir-selector {
  display: flex;
  gap: 6px;
  flex: 1;
  max-width: 400px;
}

.dir-input {
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-family: var(--font-mono);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  min-width: 0;
  cursor: pointer;
}

.dir-input.editable {
  color: var(--color-text-primary);
  cursor: text;
  border-color: var(--color-accent-blue);
}

.dir-input.editable:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.15);
}

.browse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.browse-btn:hover {
  border-color: var(--color-accent-blue);
  color: var(--color-accent-blue);
}

.browse-btn.save {
  background: var(--color-accent-green);
  border-color: var(--color-accent-green);
  color: white;
}

.browse-btn.save:hover {
  background: #3d9a4d;
  border-color: #3d9a4d;
}

.action-btn {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 50px;
}

.test-btn {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.test-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.test-btn.success {
  background: var(--color-accent-green);
  color: white;
  border-color: var(--color-accent-green);
}

.test-btn.error {
  background: var(--color-accent-red);
  color: white;
  border-color: var(--color-accent-red);
}

.save-btn {
  background: var(--color-accent-blue);
  color: white;
}

.save-btn:hover:not(:disabled) {
  background: #4c9aed;
}

.save-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.save-btn.success {
  background: var(--color-accent-green);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 主题选择器 */
.theme-selector {
  display: flex;
  gap: 6px;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 6px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 12px;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.theme-option:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.theme-option.active {
  background: var(--color-accent-blue);
  color: white;
  border-color: var(--color-accent-blue);
}

.option-icon {
  font-size: 14px;
}

/* 菜单配置样式 */
.menu-config-hint {
  justify-content: start !important;
  background: var(--color-bg-tertiary);
  gap: 8px;
}

.hint-icon {
  font-size: 14px;
  color: var(--color-accent-blue);
  flex-shrink: 0;
}

.hint-text {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.menu-config-item {
  padding: 10px 14px;
}

.menu-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.menu-info .menu-path {
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  margin-left: auto;
  padding-right: 12px;
}

/* 下拉选择 */
.item-select {
  padding: 5px 10px;
  border-radius: 6px;
  min-width: 150px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  font-size: 13px;
}

/* 开关按钮 */
.toggle-btn {
  padding: 0;
}

.toggle-track {
  display: block;
  width: 40px;
  height: 22px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 11px;
  position: relative;
  transition: all 0.2s ease;
}

.toggle-btn.active .toggle-track {
  background: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.toggle-btn.active .toggle-thumb {
  transform: translateX(18px);
}

/* 预览弹窗 */
.preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.preview-dialog {
  width: 640px;
  max-width: 90vw;
  background: var(--color-bg-primary);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  font-size: 14px;
  font-weight: 600;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.preview-content {
  aspect-ratio: 16 / 9;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preview-canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #666;
}

.preview-placeholder .iconify {
  font-size: 48px;
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 滚动条 */
.settings-content::-webkit-scrollbar {
  width: 6px;
}

.settings-content::-webkit-scrollbar-track {
  background: transparent;
}

.settings-content::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 3px;
}

/* 密码验证对话框 */
.password-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.password-dialog {
  background: var(--color-bg-secondary);
  border-radius: 12px;
  padding: 24px;
  width: 320px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.password-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  font-size: 16px;
  font-weight: 500;
}

.lock-icon {
  font-size: 20px;
  color: var(--color-accent-red);
}

.password-content {
  margin-bottom: 20px;
}

.password-input {
  width: 100%;
  padding: 12px 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.password-input:focus {
  border-color: var(--color-accent-red);
}

/* 锁定密码设置样式 */
.password-setting {
  flex-direction: column;
  align-items: flex-start !important;
  gap: 8px;
}

.password-setting .item-label {
  margin-bottom: 4px;
}

.password-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.password-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.password-row .password-input {
  flex: 1;
  max-width: 300px;
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  outline: none;
  transition: all 0.2s ease;
}

.password-row .password-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.password-row .password-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.unlock-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.unlock-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.unlock-btn.unlocked {
  background: var(--color-accent-green);
  border-color: var(--color-accent-green);
  color: white;
}

.unlock-btn .iconify {
  font-size: 18px;
}

.password-error {
  color: #ef4444;
  font-size: 12px;
  margin-top: 8px;
  margin-bottom: 0;
}

.password-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.password-actions button {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.cancel-btn:hover {
  background: var(--color-bg-hover);
}

.confirm-btn {
  background: var(--color-accent-red);
  border: none;
  color: white;
}

.confirm-btn:hover {
  background: #dc2626;
}
</style>
