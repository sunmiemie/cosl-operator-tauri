<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useWindow } from '@/composables/useWindow'
import { useConfig } from '@/composables/useConfig'

const route = useRoute()
const { openSettingsWindow } = useWindow()
const { config, initConfig } = useConfig()

// 初始化配置
onMounted(async () => {
  await initConfig()
})

// 侧边栏折叠状态
const isCollapsed = ref(false)

// 展开的菜单组
const expandedGroups = ref<string[]>(['test-bench', 'scale-well-cluster'])

// 菜单项接口
interface MenuItem {
  icon: string
  activeIcon: string
  label: string
  to: any
  exact?: boolean
  children?: MenuItem[]
}

// 菜单组接口
interface MenuGroup {
  id: string
  icon: string
  label: string
  children: MenuItem[]
}

// 顶级菜单项（一级目录，无子菜单）
const topLevelItems: MenuItem[] = [
  { icon: 'mdi:view-dashboard-outline', activeIcon: 'mdi:view-dashboard', label: '仪表盘', to: '/', exact: true },
]

// 菜单组配置（带子菜单的一级目录）
const menuGroups: MenuGroup[] = [
  {
    id: 'test-bench',
    icon: 'mdi:test-tube',
    label: '测试台检测',
    children: [
      { icon: 'mdi:play-box-outline', activeIcon: 'mdi:play-box', label: 'HALT-HASS测试', to: '/halt-hass-test' },
      { icon: 'mdi:gas-burner', activeIcon: 'mdi:gas-burner', label: '高温高压井', to: '/high-temp-pressure' },
      { icon: 'mdi:vibrate', activeIcon: 'mdi:vibrate', label: '振动台', to: '/vibration' },
      { icon: 'mdi:water-sync', activeIcon: 'mdi:water-sync', label: '水循环', to: '/water-cycle' },
      { icon: 'mdi:thermometer-high', activeIcon: 'mdi:thermometer-high', label: '高温箱', to: '/high-temp-box' },
      {
        icon: 'mdi:pipe',
        activeIcon: 'mdi:pipe',
        label: '模拟井',
        to: '/simulation-well',
        children: [
          { icon: 'mdi:oil', activeIcon: 'mdi:oil', label: '下井作业', to: '/simulation-well?view=downhole-work' },
          { icon: 'mdi:file-document-outline', activeIcon: 'mdi:file-document-outline', label: '测试报告', to: '/simulation-well?view=test-report' }
        ]
      },
    ]
  },
  {
    id: 'scale-well-cluster',
    icon: 'mdi:radioactive',
    label: '刻度井群',
    children: [
      { icon: 'mdi:calendar-clock', activeIcon: 'mdi:calendar-clock', label: '工单排程', to: '/scale-well-cluster/data-board' },
      { icon: 'mdi:flask-outline', activeIcon: 'mdi:flask', label: '伽马刻度流程', to: '/scale-well-cluster/calibration' },
      { icon: 'mdi:file-document-outline', activeIcon: 'mdi:file-document', label: '刻度报告', to: '/scale-well-cluster/report' },
    ]
  },
  {
    id: 'visual-test',
    icon: 'mdi:eye-outline',
    label: '视觉检测',
    children: [
      { icon: 'mdi:radioactive', activeIcon: 'mdi:radioactive', label: 'X-Ray测试', to: '/xray-test' },
      { icon: 'mdi:eye-check-outline', activeIcon: 'mdi:eye-check', label: '目检测试', to: '/visual-inspection' },
    ]
  },
  {
    id: 'process-edit',
    icon: 'mdi:cog-transfer-outline',
    label: '工艺编辑',
    children: [
      { icon: 'mdi:eye-check-outline', activeIcon: 'mdi:eye-check', label: '目检工艺', to: '/process/eyes' },
      { icon: 'mdi:radioactive', activeIcon: 'mdi:radioactive', label: 'X-Ray工艺', to: '/process/xray' },
      { icon: 'mdi:chart-timeline-variant', activeIcon: 'mdi:chart-timeline-variant', label: 'HALT HASS工艺', to: '/process/halt-hass' },
    ]
  },
]

// 根据配置过滤后的菜单组（隐藏被配置为隐藏的菜单项）
const filteredMenuGroups = computed(() => {
  const hidden = config.value.hiddenMenus || []
  
  return menuGroups
    .map(group => ({
      ...group,
      // 过滤掉被隐藏的子菜单项
      children: group.children.filter(item => !hidden.includes(String(item.to)))
    }))
    // 过滤掉没有子菜单的组
    .filter(group => group.children.length > 0)
})

// 判断菜单项是否激活
function isItemActive(item: MenuItem) {
  const to = item.to
  if (typeof to === 'string') {
    if (to.includes('?')) return route.fullPath === to
    if (item.exact) return route.path === to
    return route.path.startsWith(to)
  }
  if (to && typeof to === 'object') {
    const pathOk = route.path === (to.path || '')
    if (!pathOk) return false
    const q = to.query || {}
    return Object.keys(q).every((k) => String(route.query[k] || '') === String(q[k]))
  }
  return false
}

// 判断菜单组是否有激活项
function isGroupActive(group: MenuGroup) {
  return group.children.some(item => isItemActive(item))
}

// 判断菜单组是否展开
function isGroupExpanded(groupId: string) {
  return expandedGroups.value.includes(groupId)
}

// 切换菜单组展开状态
function toggleGroup(groupId: string) {
  const index = expandedGroups.value.indexOf(groupId)
  if (index > -1) {
    expandedGroups.value.splice(index, 1)
  } else {
    expandedGroups.value.push(groupId)
  }
}

// 获取菜单图标
function getIcon(item: MenuItem) {
  return isItemActive(item) ? item.activeIcon : item.icon
}

const expandedItems = ref<string[]>([])
function isItemExpanded(key: string) {
  return expandedItems.value.includes(key)
}
function toggleItem(key: string) {
  const idx = expandedItems.value.indexOf(key)
  if (idx > -1) expandedItems.value.splice(idx, 1)
  else expandedItems.value.push(key)
}


function toggleSidebar() {
  isCollapsed.value = !isCollapsed.value
}

// 打开设置窗口
async function handleOpenSettings() {
  await openSettingsWindow()
}
</script>

<template>
  <aside class="app-aside" :class="{ collapsed: isCollapsed }">
    <!-- 菜单区域 -->
    <nav class="aside-menu">
      <!-- 顶级菜单项（仪表盘等） -->
      <router-link 
        v-for="item in topLevelItems" 
        :key="String(item.to)" 
        :to="item.to" 
        class="top-menu-item"
        :class="{ active: isItemActive(item) }"
        :title="isCollapsed ? item.label : ''"
      >
        <div class="menu-icon-wrapper">
          <Icon :icon="getIcon(item)" class="menu-icon" />
        </div>
        <span class="menu-label" v-show="!isCollapsed">{{ item.label }}</span>
      </router-link>

      <!-- 分隔线 -->
      <div class="menu-divider" v-show="!isCollapsed"></div>

      <!-- 菜单组（根据配置过滤显示） -->
      <div v-for="group in filteredMenuGroups" :key="group.id" class="menu-group">
        <!-- 菜单组标题 -->
        <button 
          class="group-header" 
          :class="{ active: isGroupActive(group), expanded: isGroupExpanded(group.id) }"
          @click="toggleGroup(group.id)"
          :title="isCollapsed ? group.label : ''"
        >
          <div class="group-icon-wrapper">
            <Icon :icon="group.icon" class="group-icon" />
          </div>
          <span class="group-label" v-show="!isCollapsed">{{ group.label }}</span>
          <Icon 
            v-show="!isCollapsed"
            icon="mdi:chevron-down" 
            class="group-arrow" 
            :class="{ rotated: isGroupExpanded(group.id) }"
          />
        </button>

        <!-- 子菜单项 -->
        <Transition name="submenu">
          <div v-show="isGroupExpanded(group.id) && !isCollapsed" class="submenu">
            <div v-for="item in group.children" :key="item.label">
              <div v-if="item.children?.length" class="menu-item nested-item" :class="{ active: isItemActive(item) }">
                <router-link :to="item.to" class="nested-link">
                  <div class="menu-icon-wrapper">
                    <Icon :icon="getIcon(item)" class="menu-icon" />
                  </div>
                  <span class="menu-label">{{ item.label }}</span>
                </router-link>
                <button class="nested-toggle" @click="toggleItem(item.label)">
                  <Icon icon="mdi:chevron-down" class="group-arrow" :class="{ rotated: isItemExpanded(item.label) }" />
                </button>
              </div>
              <router-link
                v-else
                :to="item.to"
                class="menu-item"
                :class="{ active: isItemActive(item) }"
              >
                <div class="menu-icon-wrapper">
                  <Icon :icon="getIcon(item)" class="menu-icon" />
                </div>
                <span class="menu-label">{{ item.label }}</span>
              </router-link>
              <Transition name="submenu">
                <div v-if="item.children?.length" v-show="isItemExpanded(item.label)" class="submenu nested-submenu">
                  <router-link
                    v-for="sub in item.children"
                    :key="sub.label"
                    :to="sub.to"
                    class="menu-item"
                    :class="{ active: isItemActive(sub) }"
                  >
                    <div class="menu-icon-wrapper">
                      <Icon :icon="getIcon(sub)" class="menu-icon" />
                    </div>
                    <span class="menu-label">{{ sub.label }}</span>
                  </router-link>
                </div>
              </Transition>
            </div>
          </div>
        </Transition>

        <!-- 折叠状态下的子菜单 -->
        <div v-if="isCollapsed && isGroupExpanded(group.id)" class="collapsed-submenu">
          <div class="collapsed-submenu-divider"></div>
          <router-link 
            v-for="item in group.children" 
            :key="String(item.to)" 
            :to="item.to" 
            class="collapsed-menu-item"
            :class="{ active: isItemActive(item) }"
            :title="item.label"
          >
            <Icon :icon="getIcon(item)" class="menu-icon" />
          </router-link>
        </div>
      </div>
    </nav>

    <!-- 底部区域 -->
    <div class="aside-bottom">
      <div class="aside-divider"></div>
      
      <!-- 设置按钮 -->
      <button 
        class="menu-item"
        :title="isCollapsed ? '设置' : ''"
        @click="handleOpenSettings"
      >
        <div class="menu-icon-wrapper">
          <Icon icon="mdi:cog-outline" class="menu-icon" />
        </div>
        <span class="menu-label" v-show="!isCollapsed">设置</span>
      </button>

      <!-- 折叠按钮 -->
      <button class="collapse-btn" @click="toggleSidebar" :title="isCollapsed ? '展开' : '收起'">
        <Icon 
          icon="mdi:chevron-left" 
          class="collapse-icon" 
          :class="{ rotated: isCollapsed }"
        />
      </button>
    </div>
  </aside>
</template>

<style scoped>
.app-aside {
  width: 220px;
  background: var(--color-bg-tertiary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.app-aside.collapsed {
  width: 60px;
}

/* 菜单区域 */
.aside-menu {
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  overflow-x: hidden;
}

/* 顶级菜单项 */
.top-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 10px;
  border-radius: 8px;
  text-decoration: none;
  color: var(--color-text-secondary);
  transition: all 0.2s ease;
  white-space: nowrap;
  position: relative;
  font-size: 14px;
  font-weight: 600;
}

.top-menu-item:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-hover);
}

.top-menu-item.active {
  color: var(--color-accent-blue);
  background: linear-gradient(135deg, rgba(88, 166, 255, 0.15) 0%, rgba(88, 166, 255, 0.08) 100%);
}

.top-menu-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 22px;
  background: linear-gradient(180deg, var(--color-accent-blue) 0%, var(--color-accent-purple) 100%);
  border-radius: 0 3px 3px 0;
  box-shadow: 0 0 8px rgba(88, 166, 255, 0.4);
}

.top-menu-item .menu-icon {
  font-size: 20px;
}

/* 菜单分隔线 */
.menu-divider {
  height: 1px;
  background: var(--color-border);
  margin: 8px 10px;
}

/* 菜单组 */
.menu-group {
  display: flex;
  flex-direction: column;
}

/* 菜单组标题 */
.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  color: var(--color-text-secondary);
  transition: all 0.2s ease;
  white-space: nowrap;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.group-header:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-hover);
}

.group-header.active {
  color: var(--color-accent-blue);
}

.group-icon-wrapper {
  min-width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.group-icon {
  font-size: 20px;
}

.group-label {
  flex: 1;
}

.group-arrow {
  font-size: 16px;
  transition: transform 0.2s ease;
}

.group-arrow.rotated {
  transform: rotate(180deg);
}

/* 子菜单 */
.submenu {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-left: 12px;
  margin-top: 2px;
  overflow: hidden;
}

/* 子菜单动画 */
.submenu-enter-active,
.submenu-leave-active {
  transition: all 0.2s ease;
}

.submenu-enter-from,
.submenu-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.nested-item {
  padding-right: 8px;
}

.nested-link {
  display: flex;
  align-items: center;
  flex: 1;
  text-decoration: none;
  color: inherit;
}

.nested-toggle {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
}

.nested-toggle:hover {
  background: var(--color-bg-hover);
}

.nested-submenu {
  padding-left: 18px;
}

/* 菜单项样式 */
.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 6px;
  text-decoration: none;
  color: var(--color-text-secondary);
  transition: all 0.2s ease;
  white-space: nowrap;
  position: relative;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
  font-size: 13px;
}

.menu-item:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-hover);
}

/* 激活状态 */
.menu-item.active {
  color: var(--color-accent-blue);
  background: linear-gradient(135deg, rgba(88, 166, 255, 0.12) 0%, rgba(88, 166, 255, 0.06) 100%);
}

.menu-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  background: linear-gradient(180deg, var(--color-accent-blue) 0%, var(--color-accent-purple) 100%);
  border-radius: 0 3px 3px 0;
  box-shadow: 0 0 8px rgba(88, 166, 255, 0.4);
}

.menu-icon-wrapper {
  min-width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.menu-icon {
  font-size: 16px;
  transition: transform 0.2s ease;
}

.menu-item.active .menu-icon {
  transform: scale(1.05);
}

.menu-label {
  font-weight: 500;
  transition: opacity 0.2s ease;
}

/* 折叠状态的子菜单 */
.collapsed-submenu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0;
  margin-left: 4px;
  padding-left: 4px;
  border-left: 2px solid var(--color-border);
}

.collapsed-submenu-divider {
  height: 1px;
  background: var(--color-border);
  margin: 2px 8px;
}

.collapsed-menu-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 6px;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: all 0.2s ease;
}

.collapsed-menu-item:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-hover);
}

.collapsed-menu-item.active {
  color: var(--color-accent-blue);
  background: rgba(88, 166, 255, 0.1);
}

.collapsed-menu-item .menu-icon {
  font-size: 16px;
}

/* 底部区域 */
.aside-bottom {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.aside-divider {
  height: 1px;
  background: var(--color-border);
  margin-bottom: 6px;
}

/* 折叠按钮 */
.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 6px;
}

.collapse-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.collapse-icon {
  font-size: 18px;
  transition: transform 0.25s ease;
}

.collapse-icon.rotated {
  transform: rotate(180deg);
}

/* 自定义滚动条 */
.aside-menu::-webkit-scrollbar {
  width: 4px;
}

.aside-menu::-webkit-scrollbar-track {
  background: transparent;
}

.aside-menu::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 2px;
}
</style>
