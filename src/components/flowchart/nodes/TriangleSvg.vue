<script setup lang="ts">
/**
 * SVG 三角形组件
 * 用于 Math 和 CtrlFlow 节点的特殊形状
 * 对齐 Flojoy Studio 格式
 */

interface Props {
  width?: number
  height?: number
  operator?: string
  strokeColor?: string
  fillColor?: string
  selected?: boolean
}

withDefaults(defineProps<Props>(), {
  width: 120,
  height: 120,
  operator: '',
  strokeColor: '#f59e0b',
  fillColor: 'transparent',
  selected: false,
})

// 运算符映射
const operatorMap: Record<string, string> = {
  // 数学运算符
  ADD: '+',
  SUBTRACT: '-',
  MULTIPLY: '\u00D7',
  DIVIDE: '\u00F7',
  MODULO: '%',
  POWER: '^',
  INTEGRAL: '\u222B',
  DERIVATIVE: '\u2202',
  ABS: '|x|',
  SQRT: '\u221A',
  LOG: 'log',
  LOG10: 'lg',
  EXP: 'e\u02E3',
  SIN: 'sin',
  COS: 'cos',
  TAN: 'tan',
  // 条件运算符
  GREATER_THAN: '>',
  LESS_THAN: '<',
  EQUAL: '=',
  NOT_EQUAL: '\u2260',
  GREATER_EQUAL: '\u2265',
  LESS_EQUAL: '\u2264',
  AND: '&',
  OR: '|',
  NOT: '!',
  // 默认
  DEFAULT: 'f',
}

// 获取显示的运算符符号
function getOperatorSymbol(op: string): string {
  // 如果 operator 本身就是符号，直接使用
  if (op.length <= 3 && !op.match(/^[A-Z_]+$/)) {
    return op
  }
  // 否则从映射中获取
  return operatorMap[op.toUpperCase()] || operatorMap.DEFAULT
}
</script>

<template>
  <svg
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    class="triangle-svg"
    :class="{ 'is-selected': selected }"
  >
    <!-- 三角形路径 - 指向右边 -->
    <path
      :d="`M 10 ${height * 0.15}
          L ${width - 10} ${height / 2}
          L 10 ${height * 0.85}
          Z`"
      :fill="fillColor"
      :stroke="strokeColor"
      stroke-width="2"
      stroke-linejoin="round"
    />

    <!-- 运算符文字 -->
    <text
      v-if="operator"
      :x="width * 0.38"
      :y="height / 2 + 6"
      text-anchor="middle"
      dominant-baseline="middle"
      class="operator-text"
      :fill="strokeColor"
    >
      {{ getOperatorSymbol(operator) }}
    </text>
  </svg>
</template>

<style scoped>
.triangle-svg {
  display: block;
}

.triangle-svg.is-selected path {
  filter: drop-shadow(0 0 4px currentColor);
}

.operator-text {
  font-size: 28px;
  font-weight: bold;
  font-family: 'Courier New', Courier, monospace;
}
</style>
