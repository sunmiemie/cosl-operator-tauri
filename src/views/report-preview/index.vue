<script setup lang="ts">
/**
 * 报告预览独立窗口页面
 * 清晰区分：正面/背面、区域、点位
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import WindowLayout from '@/layouts/WindowLayout.vue'
import { reportApi, type ReportData } from '@/services/report'
import { useAuth } from '@/composables/useAuth'

const route = useRoute()
const { getAuthHeaders, initAuth } = useAuth()

// 从 URL 参数获取 mode 和 unitId
const mode = computed(() => Number(route.query.mode) as 0 | 1)
const unitId = computed(() => Number(route.query.unitId))
const displayMode = computed(() => mode.value === 1 ? 'temp' : 'prod')

// 状态
const loading = ref(true)
const data = ref<ReportData | null>(null)
const error = ref<string | null>(null)

// 加载进度
const progress = ref(0)          // 0-100
const loadedBytes = ref(0)       // 已加载字节
const totalBytes = ref(0)        // 总字节

// 图片查看器
const viewerVisible = ref(false)
const viewerUrl = ref('')

// 窗口标题
const windowTitle = computed(() => {
  if (displayMode.value === 'temp') return '临时报告详情'
  return '报告详情'
})

// 格式化文件大小
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// 进度回调
function handleProgress(loaded: number, total: number) {
  loadedBytes.value = loaded
  totalBytes.value = total
  // 如果后端返回了 Content-Length，计算真实进度；否则使用模拟进度
  if (total > 0) {
    progress.value = Math.min(Math.round((loaded / total) * 100), 100)
  } else {
    // 没有 total 时，根据已加载量模拟进度（最大到 90%，完成时跳到 100%）
    progress.value = Math.min(90, Math.round(loaded / 1024))
  }
}

// 加载报告数据
async function loadReport() {
  if (!unitId.value) {
    error.value = '缺少工单ID参数'
    loading.value = false
    return
  }
  
  loading.value = true
  error.value = null
  progress.value = 0
  loadedBytes.value = 0
  totalBytes.value = 0
  
  try {
    const result = await reportApi.download(
      mode.value, 
      unitId.value, 
      getAuthHeaders(),
      handleProgress  // 传递进度回调
    )
    
    // 完成时确保进度为 100%
    progress.value = 100
    
    if (result.success && result.data) {
      data.value = result.data
      console.log('[报告预览] 加载的报告数据:', JSON.stringify(result.data, null, 2))
    } else {
      error.value = result.error || '获取报告失败'
    }
  } catch (err) {
    console.error('获取报告详情失败:', err)
    error.value = '获取报告详情失败'
  } finally {
    loading.value = false
  }
}

// 打开图片查看器
function openViewer(url: string) {
  if (!url) return
  viewerUrl.value = url
  viewerVisible.value = true
}

// 获取状态文本
function getPassText(pass: number): string {
  if (pass === 1) return '通过'
  if (pass === 2) return '不通过'
  if (pass === 3) return '疑问'
  if (pass === 4) return '不通过+疑问'
  return '未知'
}

// 获取状态颜色类
function getPassClass(pass: number): string {
  if (pass === 1) return 'pass-success'
  if (pass === 2) return 'pass-danger'
  if (pass === 3) return 'pass-info'
  if (pass === 4) return 'pass-danger'
  return ''
}

// 检查某项是否有警告标记
function hasWarnMark(warnList: any[] | undefined, itemId: number): boolean {
  if (!warnList) return false
  return warnList.some(w => w.id === itemId)
}

onMounted(async () => {
  /*
    由于独立窗口中没有token，所以需要重新从store中加载token
    独立窗口：先初始化认证状态，从 store 加载 token
   */
  const authOk = await initAuth()
  if (!authOk) {
    error.value = '认证信息无效，请重新登录'
    loading.value = false
    return
  }
  loadReport()
})

// 辅助计算属性
const reportJson = computed(() => data.value?.json)
const isXrayReport = computed(() => reportJson.value?.xray !== undefined)
const hasTwoD = computed(() => reportJson.value?.twoD && reportJson.value.twoD !== '')
const hasPlane = computed(() => reportJson.value?.plane?.leftUrl && reportJson.value.plane.leftUrl !== '')
const hasThreeD = computed(() => reportJson.value?.threeD?.eyes !== undefined)
const hasTempTest = computed(() => reportJson.value?.tempTest && reportJson.value.tempTest.length > 0)
</script>

<template>
  <WindowLayout :title="windowTitle" icon="mdi:file-document">
    <div class="report-content">
      <!-- 加载状态 -->
      <div v-if="loading" class="state-box loading-state">
        <Icon icon="mdi:file-document-outline" class="loading-icon" />
        <span class="loading-title">正在加载报告...</span>
        
        <!-- 进度条 -->
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progress + '%' }"></div>
          </div>
          <div class="progress-info">
            <span class="progress-percent">{{ progress }}%</span>
            <span v-if="totalBytes > 0" class="progress-size">
              {{ formatBytes(loadedBytes) }} / {{ formatBytes(totalBytes) }}
            </span>
            <span v-else-if="loadedBytes > 0" class="progress-size">
              已加载 {{ formatBytes(loadedBytes) }}
            </span>
          </div>
        </div>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="state-box error">
        <Icon icon="mdi:alert-circle" />
        <span>{{ error }}</span>
        <button class="btn-retry" @click="loadReport">重试</button>
      </div>

      <!-- 无数据 -->
      <div v-else-if="!data || !reportJson" class="state-box">
        <Icon icon="mdi:file-question" />
        <span>暂无报告数据</span>
      </div>

      <!-- 报告内容 -->
      <div v-else class="report-body">
        <!-- 基本信息 -->
        <div class="info-card">
          <div class="info-row">
            <span class="info-label">工单号</span>
            <span class="info-value">{{ data.testunit_id || data.dev_testunit_id || '-' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">序列号</span>
            <span class="info-value">{{ data.board_serialnumber || '-' }}</span>
          </div>
          <span class="badge" :class="displayMode">
            {{ displayMode === 'temp' ? '临时报告' : '正式报告' }}
          </span>
        </div>

        <!-- ==================== 临时报告 ==================== -->
        <template v-if="displayMode === 'temp' && hasTempTest">
          <div class="section-card" v-for="item in reportJson!.tempTest" :key="item.id">
            <div class="section-header temp">
              <Icon icon="mdi:clipboard-check" />
              <span>{{ item.name }}</span>
            </div>
            <div class="section-body">
              <div class="field-row">
                <span class="field-label">状态</span>
                <div class="field-value">
                  <span v-if="item.pass === 1" class="tag success">通过</span>
                  <span v-if="item.pass === 2 || item.pass === 4" class="tag danger">缺陷</span>
                  <span v-if="item.pass === 3 || item.pass === 4" class="tag info">疑问</span>
                  <span v-if="(item as any).warn" class="tag warning">制程警示</span>
                </div>
              </div>
              <div class="field-row">
                <span class="field-label">描述</span>
                <span class="field-value">{{ item.desc || '无描述' }}</span>
              </div>
              <!-- 留存图片 -->
              <div v-if="item.save?.length" class="field-row">
                <span class="field-label">留存图片</span>
                <div class="images-grid">
                  <div v-for="(img, idx) in item.save" :key="idx" class="img-item" @click="openViewer(img)">
                    <img :src="img" /><span>图{{ Number(idx) + 1 }}</span>
                  </div>
                </div>
              </div>
              <!-- 缺陷 -->
              <template v-if="item.error">
                <div class="sub-block error">
                  <div class="sub-title"><Icon icon="mdi:alert" />缺陷信息</div>
                  <p>{{ item.error.desc }}</p>
                  <div v-if="item.error.url?.length" class="images-grid">
                    <div v-for="(img, idx) in item.error.url" :key="idx" class="img-item" @click="openViewer(img)">
                      <img :src="img" /><span>图{{ Number(idx) + 1 }}</span>
                    </div>
                  </div>
                </div>
              </template>
              <!-- 疑问 -->
              <template v-if="item.question">
                <div class="sub-block question">
                  <div class="sub-title"><Icon icon="mdi:help-circle" />疑问信息</div>
                  <p>{{ item.question.desc }}</p>
                  <div v-if="item.question.url?.length" class="images-grid">
                    <div v-for="(img, idx) in item.question.url" :key="idx" class="img-item" @click="openViewer(img)">
                      <img :src="img" /><span>图{{ Number(idx) + 1 }}</span>
                    </div>
                  </div>
                </div>
              </template>
              <!-- 制程警示 -->
              <template v-if="(item as any).warn">
                <div class="sub-block warn">
                  <div class="sub-title"><Icon icon="mdi:alert-octagon" />制程警示</div>
                  <p>{{ (item as any).warn.desc }}</p>
                  <div v-if="(item as any).warn.url?.length" class="images-grid">
                    <div v-for="(img, idx) in (item as any).warn.url" :key="idx" class="img-item" @click="openViewer(img)">
                      <img :src="img" /><span>图{{ Number(idx) + 1 }}</span>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </template>

        <!-- ==================== 正式报告 (非 X-Ray) ==================== -->
        <template v-if="displayMode === 'prod' && !isXrayReport">
          <!-- 2D 留存图 -->
          <div v-if="hasTwoD" class="section-card">
            <div class="section-header twoD">
              <Icon icon="mdi:image-multiple" />
              <span>2D留存图</span>
            </div>
            <div class="section-body">
              <div class="side-block front">
                <div class="side-label"><Icon icon="mdi:arrow-up-bold-box" />正面</div>
                <img :src="reportJson!.twoD" class="full-img" @click="openViewer(reportJson!.twoD!)" />
              </div>
              <div v-if="reportJson!.twoDBak" class="side-block back">
                <div class="side-label"><Icon icon="mdi:arrow-down-bold-box" />背面</div>
                <img :src="reportJson!.twoDBak" class="full-img" @click="openViewer(reportJson!.twoDBak!)" />
              </div>
            </div>
          </div>

          <!-- 弓曲度检测 -->
          <div v-if="hasPlane" class="section-card">
            <div class="section-header plane">
              <Icon icon="mdi:chart-line" />
              <span>弓曲度检测</span>
            </div>
            <div class="section-body">
              <table class="data-table">
                <thead><tr><th>检测项</th><th>结果</th></tr></thead>
                <tbody>
                  <tr>
                    <td>正面弓曲度</td>
                    <td><span :class="getPassClass(reportJson!.plane!.leftPass || 0)">{{ getPassText(reportJson!.plane!.leftPass || 0) }}</span></td>
                  </tr>
                  <tr>
                    <td>背面弓曲度</td>
                    <td><span :class="getPassClass(reportJson!.plane!.rightPass || 0)">{{ getPassText(reportJson!.plane!.rightPass || 0) }}</span></td>
                  </tr>
                </tbody>
              </table>
              <div class="images-row">
                <div class="img-with-label">
                  <img :src="reportJson!.plane!.leftUrl" @click="openViewer(reportJson!.plane!.leftUrl)" />
                  <span>正面</span>
                </div>
                <div class="img-with-label">
                  <img :src="reportJson!.plane!.rightUrl" @click="openViewer(reportJson!.plane!.rightUrl)" />
                  <span>背面</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 3D 检测 -->
          <template v-if="hasThreeD">
            <!-- 正面目检 -->
            <div v-if="reportJson!.threeD!.eyes" class="section-card">
              <div class="section-header front-eyes">
                <Icon icon="mdi:eye" />
                <span>3D检测 - 正面目检</span>
                <span class="side-badge front">正面</span>
              </div>
              <div class="section-body">
                <!-- 整体检测 -->
                <div v-if="reportJson!.threeD!.eyes.total?.stepList?.length" class="level-block total">
                  <div class="level-header"><Icon icon="mdi:checkbox-marked-circle" />整体检测</div>
                  <div class="level-content">
                    <table class="data-table">
                      <thead><tr><th>检测项</th><th>结果</th></tr></thead>
                      <tbody>
                        <tr v-for="step in reportJson!.threeD!.eyes.total.stepList" :key="(step as any).id">
                          <td>{{ (step as any).name }}</td>
                          <td>
                            <span :class="getPassClass((step as any).pass)">{{ getPassText((step as any).pass) }}</span>
                            <span v-if="hasWarnMark((reportJson!.threeD!.eyes.total as any).warnList, (step as any).id)" class="tag warning sm">制程警示</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <!-- picList -->
                    <template v-if="reportJson!.threeD!.eyes.total.picList?.length">
                      <div class="sub-section">
                        <div class="sub-section-title">留存项</div>
                        <div v-for="pic in reportJson!.threeD!.eyes.total.picList" :key="(pic as any).id" class="pic-row">
                          <span class="pic-name">{{ (pic as any).name }}</span>
                          <div class="images-grid">
                            <div v-for="(img, idx) in (pic as any).save" :key="idx" class="img-item" @click="openViewer(img)">
                              <img :src="img" /><span>图{{ Number(idx) + 1 }}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </template>
                    <!-- errorList -->
                    <template v-if="(reportJson!.threeD!.eyes.total as any).errorList?.length">
                      <div class="sub-block error">
                        <div class="sub-title"><Icon icon="mdi:alert" />缺陷汇总</div>
                        <div v-for="err in (reportJson!.threeD!.eyes.total as any).errorList" :key="err.id" class="issue-item">
                          <span class="issue-name">{{ err.name }}</span>
                          <span class="issue-desc">{{ err.error?.desc }}</span>
                          <div v-if="err.error?.url?.length" class="images-grid sm">
                            <div v-for="(img, idx) in err.error.url" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /></div>
                          </div>
                        </div>
                      </div>
                    </template>
                    <!-- questionList -->
                    <template v-if="(reportJson!.threeD!.eyes.total as any).questionList?.length">
                      <div class="sub-block question">
                        <div class="sub-title"><Icon icon="mdi:help-circle" />疑问汇总</div>
                        <div v-for="q in (reportJson!.threeD!.eyes.total as any).questionList" :key="q.id" class="issue-item">
                          <span class="issue-name">{{ q.name }}</span>
                          <span class="issue-desc">{{ q.question?.desc }}</span>
                          <div v-if="q.question?.url?.length" class="images-grid sm">
                            <div v-for="(img, idx) in q.question.url" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /></div>
                          </div>
                        </div>
                      </div>
                    </template>
                    <!-- warnList -->
                    <template v-if="(reportJson!.threeD!.eyes.total as any).warnList?.length">
                      <div class="sub-block warn">
                        <div class="sub-title"><Icon icon="mdi:alert-octagon" />制程警示汇总</div>
                        <div v-for="w in (reportJson!.threeD!.eyes.total as any).warnList" :key="w.id" class="issue-item">
                          <span class="issue-name">{{ w.name }}</span>
                          <span class="issue-desc">{{ w.warn?.desc }}</span>
                          <div v-if="w.warn?.url?.length" class="images-grid sm">
                            <div v-for="(img, idx) in w.warn.url" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /></div>
                          </div>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
                <!-- 区域检测 -->
                <div v-for="area in reportJson!.threeD!.eyes.area" :key="(area as any).id" class="level-block area">
                  <div class="level-header"><Icon icon="mdi:map-marker-radius" />区域 {{ (area as any).id }}</div>
                  <div class="level-content">
                    <!-- 通用检测 -->
                    <div v-if="(area as any).general?.stepList?.length" class="point-block general">
                      <div class="point-header"><Icon icon="mdi:cog" />通用检测</div>
                      <table class="data-table compact">
                        <thead><tr><th>检测项</th><th>结果</th></tr></thead>
                        <tbody>
                          <tr v-for="step in (area as any).general.stepList" :key="step.id">
                            <td>{{ step.name }}</td>
                            <td><span :class="getPassClass(step.pass)">{{ getPassText(step.pass) }}</span></td>
                          </tr>
                        </tbody>
                      </table>
                      <template v-if="(area as any).general.picList?.length">
                        <div v-for="pic in (area as any).general.picList" :key="pic.id" class="pic-row">
                          <span class="pic-name">{{ pic.name }}</span>
                          <div class="images-grid">
                            <div v-for="(img, idx) in pic.save" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /><span>图{{ Number(idx) + 1 }}</span></div>
                          </div>
                        </div>
                      </template>
                    </div>
                    <!-- 点位检测 -->
                    <div v-for="point in (area as any).detail" :key="point.id" class="point-block detail">
                      <div class="point-header"><Icon icon="mdi:crosshairs-gps" />点位 {{ point.name }}</div>
                      <table v-if="point.stepList?.length" class="data-table compact">
                        <thead><tr><th>检测项</th><th>结果</th></tr></thead>
                        <tbody>
                          <tr v-for="step in point.stepList" :key="step.id">
                            <td>{{ step.name }}</td>
                            <td><span :class="getPassClass(step.pass)">{{ getPassText(step.pass) }}</span></td>
                          </tr>
                        </tbody>
                      </table>
                      <template v-if="point.picList?.length">
                        <div v-for="pic in point.picList" :key="pic.id" class="pic-row">
                          <span class="pic-name">{{ pic.name }}</span>
                          <div class="images-grid">
                            <div v-for="(img, idx) in pic.save" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /><span>图{{ Number(idx) + 1 }}</span></div>
                          </div>
                        </div>
                      </template>
                      <!-- 点位的 error/question/warn -->
                      <template v-if="point.errorList?.length">
                        <div class="mini-block error">
                          <span class="mini-label">缺陷:</span>
                          <div v-for="err in point.errorList" :key="err.id" class="inline-issue">
                            <strong>{{ err.name }}</strong> - {{ err.error?.desc }}
                            <div v-if="err.error?.url?.length" class="images-grid sm">
                              <div v-for="(img, idx) in err.error.url" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /></div>
                            </div>
                          </div>
                        </div>
                      </template>
                      <template v-if="point.questionList?.length">
                        <div class="mini-block question">
                          <span class="mini-label">疑问:</span>
                          <div v-for="q in point.questionList" :key="q.id" class="inline-issue">
                            <strong>{{ q.name }}</strong> - {{ q.question?.desc }}
                            <div v-if="q.question?.url?.length" class="images-grid sm">
                              <div v-for="(img, idx) in q.question.url" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /></div>
                            </div>
                          </div>
                        </div>
                      </template>
                      <template v-if="point.warnList?.length">
                        <div class="mini-block warn">
                          <span class="mini-label">制程警示:</span>
                          <div v-for="w in point.warnList" :key="w.id" class="inline-issue">
                            <strong>{{ w.name }}</strong> - {{ w.warn?.desc }}
                            <div v-if="w.warn?.url?.length" class="images-grid sm">
                              <div v-for="(img, idx) in w.warn.url" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /></div>
                            </div>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 背面目检 -->
            <div v-if="reportJson!.threeD!.eyesBak" class="section-card">
              <div class="section-header back-eyes">
                <Icon icon="mdi:eye-outline" />
                <span>3D检测 - 背面目检</span>
                <span class="side-badge back">背面</span>
              </div>
              <div class="section-body">
                <!-- 整体检测 -->
                <div v-if="reportJson!.threeD!.eyesBak.total?.stepList?.length" class="level-block total">
                  <div class="level-header"><Icon icon="mdi:checkbox-marked-circle" />整体检测</div>
                  <div class="level-content">
                    <table class="data-table">
                      <thead><tr><th>检测项</th><th>结果</th></tr></thead>
                      <tbody>
                        <tr v-for="step in reportJson!.threeD!.eyesBak.total.stepList" :key="(step as any).id">
                          <td>{{ (step as any).name }}</td>
                          <td><span :class="getPassClass((step as any).pass)">{{ getPassText((step as any).pass) }}</span></td>
                        </tr>
                      </tbody>
                    </table>
                    <template v-if="reportJson!.threeD!.eyesBak.total.picList?.length">
                      <div class="sub-section">
                        <div class="sub-section-title">留存项</div>
                        <div v-for="pic in reportJson!.threeD!.eyesBak.total.picList" :key="(pic as any).id" class="pic-row">
                          <span class="pic-name">{{ (pic as any).name }}</span>
                          <div class="images-grid">
                            <div v-for="(img, idx) in (pic as any).save" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /><span>图{{ Number(idx) + 1 }}</span></div>
                          </div>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
                <!-- 区域检测 -->
                <div v-for="area in reportJson!.threeD!.eyesBak.area" :key="(area as any).id" class="level-block area">
                  <div class="level-header"><Icon icon="mdi:map-marker-radius" />区域 {{ (area as any).id }}</div>
                  <div class="level-content">
                    <div v-if="(area as any).general?.stepList?.length" class="point-block general">
                      <div class="point-header"><Icon icon="mdi:cog" />通用检测</div>
                      <table class="data-table compact">
                        <thead><tr><th>检测项</th><th>结果</th></tr></thead>
                        <tbody>
                          <tr v-for="step in (area as any).general.stepList" :key="step.id">
                            <td>{{ step.name }}</td>
                            <td><span :class="getPassClass(step.pass)">{{ getPassText(step.pass) }}</span></td>
                          </tr>
                        </tbody>
                      </table>
                      <template v-if="(area as any).general.picList?.length">
                        <div v-for="pic in (area as any).general.picList" :key="pic.id" class="pic-row">
                          <span class="pic-name">{{ pic.name }}</span>
                          <div class="images-grid">
                            <div v-for="(img, idx) in pic.save" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /></div>
                          </div>
                        </div>
                      </template>
                    </div>
                    <div v-for="point in (area as any).detail" :key="point.id" class="point-block detail">
                      <div class="point-header"><Icon icon="mdi:crosshairs-gps" />点位 {{ point.name }}</div>
                      <table v-if="point.stepList?.length" class="data-table compact">
                        <thead><tr><th>检测项</th><th>结果</th></tr></thead>
                        <tbody>
                          <tr v-for="step in point.stepList" :key="step.id">
                            <td>{{ step.name }}</td>
                            <td><span :class="getPassClass(step.pass)">{{ getPassText(step.pass) }}</span></td>
                          </tr>
                        </tbody>
                      </table>
                      <template v-if="point.picList?.length">
                        <div v-for="pic in point.picList" :key="pic.id" class="pic-row">
                          <span class="pic-name">{{ pic.name }}</span>
                          <div class="images-grid">
                            <div v-for="(img, idx) in pic.save" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /></div>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </template>

        <!-- ==================== X-Ray 报告 ==================== -->
        <template v-if="displayMode === 'prod' && isXrayReport">
          <div class="section-card">
            <div class="section-header xray">
              <Icon icon="mdi:radioactive" />
              <span>X-Ray检测</span>
            </div>
            <div class="section-body">
              <!-- 整体检测 -->
              <div v-if="reportJson!.xray!.total?.stepList?.length" class="level-block total">
                <div class="level-header"><Icon icon="mdi:checkbox-marked-circle" />整体检测</div>
                <div class="level-content">
                  <table class="data-table">
                    <thead><tr><th>检测项</th><th>结果</th></tr></thead>
                    <tbody>
                      <tr v-for="step in reportJson!.xray!.total.stepList" :key="(step as any).id">
                        <td>{{ (step as any).name }}</td>
                        <td>
                          <span :class="getPassClass((step as any).pass)">{{ getPassText((step as any).pass) }}</span>
                          <span v-if="hasWarnMark((reportJson!.xray!.total as any).warnList, (step as any).id)" class="tag warning sm">制程警示</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <template v-if="reportJson!.xray!.total.picList?.length">
                    <div class="sub-section">
                      <div class="sub-section-title">留存项</div>
                      <div v-for="pic in reportJson!.xray!.total.picList" :key="(pic as any).id" class="pic-row">
                        <span class="pic-name">{{ (pic as any).name }}</span>
                        <div class="images-grid">
                          <div v-for="(img, idx) in (pic as any).save" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /><span>图{{ Number(idx) + 1 }}</span></div>
                        </div>
                      </div>
                    </div>
                  </template>
                  <!-- errorList -->
                  <template v-if="(reportJson!.xray!.total as any).errorList?.length">
                    <div class="sub-block error">
                      <div class="sub-title"><Icon icon="mdi:alert" />缺陷汇总</div>
                      <div v-for="err in (reportJson!.xray!.total as any).errorList" :key="err.id" class="issue-item">
                        <span class="issue-name">{{ err.name }}</span>
                        <span class="issue-desc">{{ err.error?.desc }}</span>
                        <div v-if="err.error?.url?.length" class="images-grid sm">
                          <div v-for="(img, idx) in err.error.url" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /></div>
                        </div>
                      </div>
                    </div>
                  </template>
                  <template v-if="(reportJson!.xray!.total as any).questionList?.length">
                    <div class="sub-block question">
                      <div class="sub-title"><Icon icon="mdi:help-circle" />疑问汇总</div>
                      <div v-for="q in (reportJson!.xray!.total as any).questionList" :key="q.id" class="issue-item">
                        <span class="issue-name">{{ q.name }}</span>
                        <span class="issue-desc">{{ q.question?.desc }}</span>
                        <div v-if="q.question?.url?.length" class="images-grid sm">
                          <div v-for="(img, idx) in q.question.url" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /></div>
                        </div>
                      </div>
                    </div>
                  </template>
                  <template v-if="(reportJson!.xray!.total as any).warnList?.length">
                    <div class="sub-block warn">
                      <div class="sub-title"><Icon icon="mdi:alert-octagon" />制程警示汇总</div>
                      <div v-for="w in (reportJson!.xray!.total as any).warnList" :key="w.id" class="issue-item">
                        <span class="issue-name">{{ w.name }}</span>
                        <span class="issue-desc">{{ w.warn?.desc }}</span>
                        <div v-if="w.warn?.url?.length" class="images-grid sm">
                          <div v-for="(img, idx) in w.warn.url" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /></div>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
              <!-- 区域检测 -->
              <div v-for="area in reportJson!.xray!.area" :key="(area as any).id" class="level-block area">
                <div class="level-header"><Icon icon="mdi:map-marker-radius" />区域 {{ (area as any).id }}</div>
                <div class="level-content">
                  <div v-if="(area as any).general?.stepList?.length" class="point-block general">
                    <div class="point-header"><Icon icon="mdi:cog" />通用检测</div>
                    <table class="data-table compact">
                      <thead><tr><th>检测项</th><th>结果</th></tr></thead>
                      <tbody>
                        <tr v-for="step in (area as any).general.stepList" :key="step.id">
                          <td>{{ step.name }}</td>
                          <td><span :class="getPassClass(step.pass)">{{ getPassText(step.pass) }}</span></td>
                        </tr>
                      </tbody>
                    </table>
                    <template v-if="(area as any).general.picList?.length">
                      <div v-for="pic in (area as any).general.picList" :key="pic.id" class="pic-row">
                        <span class="pic-name">{{ pic.name }}</span>
                        <div class="images-grid">
                          <div v-for="(img, idx) in pic.save" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /><span>图{{ Number(idx) + 1 }}</span></div>
                        </div>
                      </div>
                    </template>
                  </div>
                  <div v-for="point in (area as any).detail" :key="point.id" class="point-block detail">
                    <div class="point-header"><Icon icon="mdi:crosshairs-gps" />点位 {{ point.name }}</div>
                    <table v-if="point.stepList?.length" class="data-table compact">
                      <thead><tr><th>检测项</th><th>结果</th></tr></thead>
                      <tbody>
                        <tr v-for="step in point.stepList" :key="step.id">
                          <td>{{ step.name }}</td>
                          <td><span :class="getPassClass(step.pass)">{{ getPassText(step.pass) }}</span></td>
                        </tr>
                      </tbody>
                    </table>
                    <template v-if="point.picList?.length">
                      <div v-for="pic in point.picList" :key="pic.id" class="pic-row">
                        <span class="pic-name">{{ pic.name }}</span>
                        <div class="images-grid">
                          <div v-for="(img, idx) in pic.save" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /><span>图{{ Number(idx) + 1 }}</span></div>
                        </div>
                      </div>
                    </template>
                    <!-- 点位 error/question/warn -->
                    <template v-if="point.errorList?.length">
                      <div class="mini-block error">
                        <span class="mini-label">缺陷:</span>
                        <div v-for="err in point.errorList" :key="err.id" class="inline-issue">
                          <strong>{{ err.name }}</strong> - {{ err.error?.desc }}
                          <div v-if="err.error?.url?.length" class="images-grid sm">
                            <div v-for="(img, idx) in err.error.url" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /></div>
                          </div>
                        </div>
                      </div>
                    </template>
                    <template v-if="point.questionList?.length">
                      <div class="mini-block question">
                        <span class="mini-label">疑问:</span>
                        <div v-for="q in point.questionList" :key="q.id" class="inline-issue">
                          <strong>{{ q.name }}</strong> - {{ q.question?.desc }}
                          <div v-if="q.question?.url?.length" class="images-grid sm">
                            <div v-for="(img, idx) in q.question.url" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /></div>
                          </div>
                        </div>
                      </div>
                    </template>
                    <template v-if="point.warnList?.length">
                      <div class="mini-block warn">
                        <span class="mini-label">制程警示:</span>
                        <div v-for="w in point.warnList" :key="w.id" class="inline-issue">
                          <strong>{{ w.name }}</strong> - {{ w.warn?.desc }}
                          <div v-if="w.warn?.url?.length" class="images-grid sm">
                            <div v-for="(img, idx) in w.warn.url" :key="idx" class="img-item" @click="openViewer(img)"><img :src="img" /></div>
                          </div>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

  </WindowLayout>

  <!-- 图片查看器 - 在 ModalLayout 外部，不遮挡 header -->
  <div v-if="viewerVisible" class="viewer-overlay" @click="viewerVisible = false">
    <div class="viewer-box" @click.stop>
      <img :src="viewerUrl" />
      <button class="viewer-close" @click="viewerVisible = false"><Icon icon="mdi:close" /></button>
    </div>
  </div>
</template>

<style scoped>
.report-content { padding: 16px; height: 100%; overflow-y: auto; }

/* 状态盒子 */
.state-box { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: var(--color-text-secondary); font-size: 14px; }
.state-box.error { color: var(--color-accent-red); }
.state-box .iconify { font-size: 36px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.btn-retry { padding: 8px 20px; background: var(--color-accent-blue); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }

/* 加载状态增强 */
.loading-state { gap: 16px; padding: 80px 40px; }
.loading-icon { font-size: 48px; color: var(--color-accent-blue); animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(0.95); } }
.loading-title { font-size: 16px; font-weight: 500; color: var(--color-text-primary); }

/* 进度条容器 */
.progress-container { width: 100%; max-width: 320px; display: flex; flex-direction: column; gap: 8px; }
.progress-bar { height: 8px; background: var(--color-bg-tertiary); border-radius: 4px; overflow: hidden; position: relative; }
.progress-fill { 
  height: 100%; 
  background: linear-gradient(90deg, var(--color-accent-blue), var(--color-accent-purple)); 
  border-radius: 4px; 
  transition: width 0.15s ease-out;
  position: relative;
}
.progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }

/* 进度信息 */
.progress-info { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
.progress-percent { font-weight: 600; color: var(--color-accent-blue); font-family: var(--font-mono); }
.progress-size { color: var(--color-text-muted); font-family: var(--font-mono); }

/* 信息卡片 */
.info-card { display: flex; align-items: center; gap: 24px; padding: 12px 16px; background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: 10px; margin-bottom: 16px; }
.info-row { display: flex; flex-direction: column; gap: 2px; }
.info-label { font-size: 11px; color: var(--color-text-tertiary); text-transform: uppercase; }
.info-value { font-size: 14px; font-weight: 600; font-family: var(--font-mono); }
.badge { margin-left: auto; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; }
.badge.prod { background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(37, 99, 235, 0.1)); color: rgb(37, 99, 235); }
.badge.temp { background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(180, 83, 9, 0.1)); color: rgb(180, 83, 9); }

/* 区块卡片 */
.section-card { background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: 10px; margin-bottom: 16px; overflow: hidden; }
.section-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; font-size: 15px; font-weight: 600; border-bottom: 1px solid var(--color-border); }
.section-header .iconify { font-size: 20px; }
.section-header.temp { background: linear-gradient(135deg, #fef3c7, #fde68a); color: #92400e; }
.section-header.twoD { background: linear-gradient(135deg, #dbeafe, #bfdbfe); color: #1e40af; }
.section-header.plane { background: linear-gradient(135deg, #d1fae5, #a7f3d0); color: #065f46; }
.section-header.front-eyes { background: linear-gradient(135deg, #c7d2fe, #a5b4fc); color: #3730a3; }
.section-header.back-eyes { background: linear-gradient(135deg, #fce7f3, #fbcfe8); color: #9d174d; }
.section-header.xray { background: linear-gradient(135deg, #fecaca, #fca5a5); color: #991b1b; }
.section-body { padding: 16px; }

/* 正面/背面徽章 */
.side-badge { margin-left: auto; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.side-badge.front { background: rgba(34, 197, 94, 0.2); color: #15803d; }
.side-badge.back { background: rgba(244, 63, 94, 0.2); color: #be123c; }

/* 正面/背面块 */
.side-block { margin-bottom: 16px; padding: 12px; border-radius: 8px; }
.side-block.front { background: rgba(34, 197, 94, 0.05); border-left: 4px solid #22c55e; }
.side-block.back { background: rgba(244, 63, 94, 0.05); border-left: 4px solid #f43f5e; }
.side-label { display: flex; align-items: center; gap: 6px; font-weight: 600; margin-bottom: 10px; font-size: 13px; }
.side-block.front .side-label { color: #15803d; }
.side-block.back .side-label { color: #be123c; }
.full-img { width: 100%; max-height: 300px; object-fit: contain; border-radius: 6px; cursor: pointer; border: 1px solid var(--color-border); }

/* 层级块 */
.level-block { margin-bottom: 16px; border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; }
.level-block.total { border-color: #60a5fa; }
.level-block.area { border-color: #a78bfa; }
.level-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 14px; font-weight: 600; }
.level-block.total .level-header { background: rgba(96, 165, 250, 0.1); color: #2563eb; }
.level-block.area .level-header { background: rgba(167, 139, 250, 0.1); color: #7c3aed; }
.level-content { padding: 12px; }

/* 点位块 */
.point-block { margin-bottom: 12px; padding: 10px 12px; border-radius: 6px; }
.point-block.general { background: rgba(251, 191, 36, 0.08); border-left: 3px solid #fbbf24; }
.point-block.detail { background: rgba(34, 211, 238, 0.08); border-left: 3px solid #22d3ee; }
.point-header { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.point-block.general .point-header { color: #b45309; }
.point-block.detail .point-header { color: #0891b2; }

/* 数据表格 */
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 12px; }
.data-table th, .data-table td { padding: 10px 12px; border: 1px solid var(--color-border); text-align: left; }
.data-table th { background: var(--color-bg-tertiary); font-weight: 500; }
.data-table.compact th, .data-table.compact td { padding: 6px 10px; font-size: 12px; }

/* 通过/不通过状态 */
.pass-success { color: #15803d; font-weight: 500; }
.pass-danger { color: #dc2626; font-weight: 500; }
.pass-info { color: #2563eb; font-weight: 500; }

/* 标签 */
.tag { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
.tag.sm { padding: 2px 6px; font-size: 10px; margin-left: 6px; }
.tag.success { background: rgba(34, 197, 94, 0.15); color: #15803d; }
.tag.danger { background: rgba(239, 68, 68, 0.15); color: #dc2626; }
.tag.info { background: rgba(59, 130, 246, 0.15); color: #2563eb; }
.tag.warning { background: rgba(245, 158, 11, 0.15); color: #b45309; }

/* 图片网格 */
.images-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
.images-grid.sm { gap: 6px; }
.img-item { display: flex; flex-direction: column; align-items: center; cursor: pointer; }
.img-item img { width: 100px; height: 75px; object-fit: cover; border-radius: 6px; border: 2px solid var(--color-border); transition: all 0.2s; }
.images-grid.sm .img-item img { width: 60px; height: 45px; }
.img-item img:hover { border-color: var(--color-accent-blue); transform: scale(1.05); }
.img-item span { font-size: 10px; color: var(--color-text-tertiary); margin-top: 4px; }

.images-row { display: flex; gap: 16px; justify-content: center; margin-top: 12px; }
.img-with-label { display: flex; flex-direction: column; align-items: center; }
.img-with-label img { width: 200px; height: 150px; object-fit: contain; border-radius: 8px; border: 1px solid var(--color-border); cursor: pointer; }
.img-with-label span { margin-top: 6px; font-size: 12px; font-weight: 500; color: var(--color-text-secondary); }

/* 字段行 */
.field-row { display: flex; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.field-row:last-child { border-bottom: none; }
.field-label { width: 80px; flex-shrink: 0; font-size: 12px; color: var(--color-text-secondary); font-weight: 500; }
.field-value { flex: 1; font-size: 13px; }

/* 子区块 */
.sub-block { margin-top: 12px; padding: 12px; border-radius: 8px; }
.sub-block.error { background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); }
.sub-block.question { background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); }
.sub-block.warn { background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); }
.sub-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; margin-bottom: 10px; }
.sub-block.error .sub-title { color: #dc2626; }
.sub-block.question .sub-title { color: #2563eb; }
.sub-block.warn .sub-title { color: #b45309; }

.sub-section { margin-top: 12px; }
.sub-section-title { font-size: 13px; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 8px; }

.pic-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; padding: 8px; background: var(--color-bg-tertiary); border-radius: 6px; }
.pic-name { font-size: 12px; font-weight: 500; color: var(--color-text-secondary); }

.issue-item { padding: 8px 0; border-bottom: 1px dashed var(--color-border); }
.issue-item:last-child { border-bottom: none; }
.issue-name { font-weight: 600; font-size: 13px; }
.issue-desc { display: block; font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; }

/* 迷你块 */
.mini-block { margin-top: 8px; padding: 8px 10px; border-radius: 6px; font-size: 12px; }
.mini-block.error { background: rgba(239, 68, 68, 0.06); }
.mini-block.question { background: rgba(59, 130, 246, 0.06); }
.mini-block.warn { background: rgba(245, 158, 11, 0.06); }
.mini-label { font-weight: 600; }
.mini-block.error .mini-label { color: #dc2626; }
.mini-block.question .mini-label { color: #2563eb; }
.mini-block.warn .mini-label { color: #b45309; }
.inline-issue { margin-top: 4px; }

/* 图片查看器 */
/* 图片查看器 - 不遮挡 header (36px) */
.viewer-overlay { position: fixed; top: 36px; left: 0; right: 0; bottom: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.92); }
.viewer-box { position: relative; max-width: 90%; max-height: calc(100vh - 36px - 40px); }
.viewer-box img { max-width: 100%; max-height: calc(100vh - 36px - 60px); object-fit: contain; border-radius: 8px; }
.viewer-close { position: absolute; top: 8px; right: 8px; width: 36px; height: 36px; border: none; border-radius: 50%; background: rgba(0, 0, 0, 0.6); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px; transition: background 0.2s; }
.viewer-close:hover { background: rgba(0, 0, 0, 0.8); }

/* 滚动条 */
.report-content::-webkit-scrollbar { width: 8px; }
.report-content::-webkit-scrollbar-track { background: transparent; }
.report-content::-webkit-scrollbar-thumb { background: var(--color-scrollbar); border-radius: 4px; }
</style>
