import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  extractHighTempPressureCurveAttachments,
  resolveBackendAttachmentEndpoint,
} from '../src/views/high-temp-pressure/utils/reportCurves.ts'

test('优先读取报告曲线附件并按曲线序号排序', () => {
  const report = {
    attachments: [
      { field: 'tester_signature', file_url: '/media/sign.png' },
      { field: 'testing_curve', file_url: '/media/two.png', curve_index: 2, curve_title: '保压曲线' },
      { type: 'testing_curve', file_url: '/media/one.png', curve_index: 1, curve_title: '升压曲线' },
    ],
    report_json: {},
  }
  assert.deepEqual(
    extractHighTempPressureCurveAttachments(report).map((item) => [item.index, item.title, item.fileUrl]),
    [
      [1, '升压曲线', '/media/one.png'],
      [2, '保压曲线', '/media/two.png'],
    ]
  )
})

test('兼容报告JSON中的曲线列表和旧版单曲线地址并去重', () => {
  const report = {
    attachments: [],
    report_json: {
      curve_chart_url: '/media/one.png',
      paper_report: {
        attachments: {
          testing_curve: {
            file_url: '/media/one.png',
            items: [
              { index: 1, title: '全程曲线', file_url: '/media/one.png', range_start: 'start', range_end: 'end' },
              { index: 2, title: '保压曲线', file_url: '/media/two.png' },
            ],
          },
        },
      },
    },
  }
  const curves = extractHighTempPressureCurveAttachments(report)
  assert.equal(curves.length, 2)
  assert.deepEqual(curves.map((item) => item.fileUrl), ['/media/one.png', '/media/two.png'])
  assert.equal(curves[0].rangeStart, 'start')
  assert.equal(curves[0].rangeEnd, 'end')
})

test('附件地址只允许当前后端或相对媒体地址', () => {
  assert.equal(resolveBackendAttachmentEndpoint('/media/curve.png', 'http://127.0.0.1:8000'), '/media/curve.png')
  assert.equal(
    resolveBackendAttachmentEndpoint('http://127.0.0.1:8000/media/curve.png?x=1', 'http://127.0.0.1:8000'),
    '/media/curve.png?x=1'
  )
  assert.equal(resolveBackendAttachmentEndpoint('https://other.example/curve.png', 'http://127.0.0.1:8000'), '')
})

test('损坏附件条目不影响有效曲线和旧版报告的展示', () => {
  const report = {
    attachments: [null, undefined, 12, [], 'invalid', { field: 'testing_curve' },
      { field: 'testing_curve', file_url: '/media/valid.png' }],
    report_json: {
      paper_report: { attachments: { testing_curve: { items: [null, [], { file_url: '/media/legacy.png' }] } } },
    },
  }
  assert.deepEqual(extractHighTempPressureCurveAttachments(report).map(item => item.fileUrl),
    ['/media/valid.png', '/media/legacy.png'])
})

test('协议相对地址和反斜杠地址不能绕过后端来源校验', () => {
  const backend = 'https://api.example/api/'
  for (const fileUrl of ['//other.example/media/a.png', '\\\\other.example\\media\\a.png',
    'javascript:alert(1)', 'data:image/png;base64,AA', 'file:///tmp/image.png',
    'https://user:password@api.example/media/a.png']) {
    assert.equal(resolveBackendAttachmentEndpoint(fileUrl, backend), '')
  }
  assert.equal(resolveBackendAttachmentEndpoint('//api.example/media/a.png?download=1', backend), '/media/a.png?download=1')
  assert.equal(resolveBackendAttachmentEndpoint('media/a.png', backend), '/media/a.png')
  assert.equal(resolveBackendAttachmentEndpoint('/media/a.png', 'invalid backend'), '')
})

test('报告中心在客户端创建横向分页打印页面', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../src/views/high-temp-pressure/components/ReportListPanel.vue'),
    'utf8'
  )
  assert.match(source, /打印全部曲线/)
  assert.match(source, /@page \{ size: A4 landscape;/)
  assert.match(source, /page-break-after: always/)
  assert.match(source, /printWindow\.print\(\)/)
})
