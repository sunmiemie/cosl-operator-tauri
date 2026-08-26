import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const reportView = readFileSync(resolve(root, 'src/views/simulation-well/test-report.vue'), 'utf8')

assert.match(reportView, /getSimulatedWellReportDetail\(report\.id, getAuthHeaders\(\)\)/, 'report preview should load detail data first')
assert.match(reportView, /报告详情加载失败，已展示列表缓存数据/, 'report preview should fall back to list data when detail loading fails')
assert.match(reportView, /local_path\?: string/, 'attachment type should support legacy local paths')
assert.match(reportView, /function isCurveAttachment[\s\S]*?type\.startsWith\('curve'\) \|\| field\.startsWith\('curve'\)/, 'curve attachments should be grouped by type or field')
assert.match(reportView, /function curveAttachments[\s\S]*?\.filter\(isCurveAttachment\)/, 'curve attachments should be collected together')
assert.match(reportView, /function otherAttachments[\s\S]*?!isCurveAttachment/, 'non-curve attachments should remain individually accessible')
assert.match(reportView, /v-if="curveAttachments\(previewReport\)\.length"[\s\S]*?v-for="\(attachment, index\) in curveAttachments\(previewReport\)"/, 'curve files should remain visible as a read-only group')
assert.doesNotMatch(reportView, /下载原始文件|downloadCurveAttachments|download_simulated_well_curve_archive/, 'curve files should not expose a download action')
assert.doesNotMatch(reportView, /simulated-well-download-progress|cancel_simulated_well_download|revealItemInDir/, 'removed download progress, cancellation, and reveal actions should stay absent')
assert.match(reportView, /v-for="\(attachment, index\) in otherAttachments\(previewReport\)"/, 'other attachments should render one row each')
assert.match(reportView, /isImageAttachment\(attachment\) \? '预览图片' : openingAttachment === attachment \? '打开中\.\.\.' : '打开文件'/, 'images and other files should use distinct actions')
assert.match(reportView, /import \{ openUrl \} from '@tauri-apps\/plugin-opener'/, 'non-image files should use Tauri opener')
assert.match(reportView, /await openUrl\(url\)/, 'non-image files should open through the system default application')
assert.doesNotMatch(reportView, /window\.open\(/, 'report attachments should not rely on WebView popups')
assert.match(reportView, /附件暂无可访问地址/, 'missing attachment URLs should report an actionable warning')
assert.match(reportView, /附件地址无效，无法打开文件/, 'invalid attachment URLs should report an actionable warning')
assert.match(reportView, /文件打开失败/, 'opener failures should be reported to the user')

console.log('simulated well report attachment assertions passed')
