import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const outDir = path.join(root, 'assets', 'screenshots')
const userDataDir = path.join(root, 'qa', 'chrome-screenshot-profile')
const baseUrl = 'http://127.0.0.1:5177'
const port = 9227

fs.mkdirSync(outDir, { recursive: true })
fs.mkdirSync(userDataDir, { recursive: true })

const pages = [
  {
    url: `${baseUrl}/`,
    file: 'operator-dashboard.png',
    title: '测试操作台总览',
  },
  {
    url: `${baseUrl}/high-temp-pressure`,
    file: 'operator-high-temp-pressure.png',
    title: '高温高压井测试执行',
  },
  {
    url: `${baseUrl}/vibration`,
    file: 'operator-vibration.png',
    title: '振动台测试执行',
  },
  {
    url: `${baseUrl}/process/halt-hass`,
    file: 'operator-process-editor.png',
    title: 'HALT-HASS工艺编辑',
  },
]

const mockSource = String.raw`
(() => {
  const userInfo = {
    id: 1,
    username: 'demo',
    nickName: '测试工程师',
    roles: ['operator', 'admin'],
    introduction: 'COSL测试操作台演示账号',
    avatar: ''
  };
  const storeData = {
    'auth-token': 'demo-token',
    'user-info': userInfo,
    backendUrl: 'http://127.0.0.1:5177/mock-api',
    themeMode: 'light',
    language: 'zh-CN',
    autoStart: false,
    microDevice: -1,
    planeDevice: -1,
    xrayDevice: -1,
    xrayCropArea: { w: [0, 1920], h: [0, 1080], enabled: false },
    dataDir: 'D:\\COSL\\data',
    downloadDir: 'D:\\COSL\\download',
    highTempPressureDownloadDir: 'D:\\COSL\\高温高压井',
    vibrationDownloadDir: 'D:\\COSL\\振动台',
    autoSave: true,
    autoReUpload: true,
    hiddenMenus: [],
    lockerPassword: '25d55ad283aa400af464c76d713c07ad',
    flojoyPythonPath: '',
    flojoyEnvInitialized: true
  };
  let callbackId = 1;
  window.__TAURI_INTERNALS__ = {
    callbacks: {},
    plugins: { path: { sep: '\\', delimiter: ';' } },
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' }
    },
    transformCallback(callback, once = false) {
      const id = callbackId++;
      this.callbacks[id] = { callback, once };
      return id;
    },
    unregisterCallback(id) {
      delete this.callbacks[id];
    },
    runCallback(id, payload) {
      const item = this.callbacks[id];
      if (!item) return;
      item.callback(payload);
      if (item.once) delete this.callbacks[id];
    },
    convertFileSrc(filePath) {
      return String(filePath || '');
    },
    async invoke(cmd, args = {}) {
      if (cmd === 'plugin:store|load') return 1;
      if (cmd === 'plugin:store|get_store') return 1;
      if (cmd === 'plugin:store|get') return [storeData[args.key] ?? null, Object.prototype.hasOwnProperty.call(storeData, args.key)];
      if (cmd === 'plugin:store|set') { storeData[args.key] = args.value; return null; }
      if (cmd === 'plugin:store|delete') { delete storeData[args.key]; return null; }
      if (cmd === 'plugin:store|has') return Object.prototype.hasOwnProperty.call(storeData, args.key);
      if (cmd === 'plugin:store|keys') return Object.keys(storeData);
      if (cmd === 'plugin:store|values') return Object.values(storeData);
      if (cmd === 'plugin:store|entries') return Object.entries(storeData);
      if (cmd === 'plugin:store|length') return Object.keys(storeData).length;
      if (cmd.startsWith('plugin:store|')) return null;
      if (cmd.startsWith('plugin:event|listen')) return Math.floor(Math.random() * 100000);
      if (cmd.startsWith('plugin:event|')) return null;
      if (cmd.startsWith('plugin:path|')) return 'D:\\COSL';
      if (cmd.startsWith('plugin:dialog|')) return null;
      if (cmd.startsWith('plugin:fs|')) return null;
      if (cmd === 'get_camera_list') return [];
      if (cmd === 'scan_devices') return [];
      if (cmd === 'get_flojoy_status') return { running: false, port: 5397 };
      return null;
    }
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener() {}
  };

  function json(data, init = {}) {
    return new Response(JSON.stringify(data), {
      status: init.status || 200,
      headers: { 'content-type': 'application/json', ...(init.headers || {}) }
    });
  }

  const dashboardOrders = [
    { testunit_id: 101, testunit_name: '高温高压井压力保持测试', process_type: '功能性测试', testunit_status: '1', testunit_type: 0, board_serialnumber: 'HTP-202606-001', version: 'V1.0' },
    { testunit_id: 102, testunit_name: '振动台预实验', process_type: '3D检测', testunit_status: '2', testunit_type: 0, board_serialnumber: 'VIB-202606-012', version: 'V2.1' },
    { testunit_id: 103, testunit_name: 'X-Ray检测流程', process_type: 'X-Ray测试', testunit_status: '8', testunit_type: 1, board_serialnumber: 'XR-202606-006', version: 'V1.3' },
    { testunit_id: 104, testunit_name: '目检缺陷复核', process_type: '2D留存', testunit_status: '4', testunit_type: 0, board_serialnumber: 'VI-202606-028', version: 'V3.0' }
  ];

  const highTempOrders = [
    {
      id: 1, task_number: 'HTP-20260609001', table_no: 'Y-WY-001', applicant: '测试中心',
      test_application_unit: '中海油服', project_name: '高温高压井性能验证', work_order_number: 'COSL-HTP-001',
      use_device: '高温高压井测试台', test_type: '压力保持 / 温度循环', target_temp: '150', target_pressure: '35MPa',
      project_members: '张工、李工', status: 1, status_text: '已创建', created_at: '2026-06-09 09:20:00',
      instruments: [
        { id: 11, instrument_name: '压力传感器', instrument_sn: 'P-1024', test_type: '压力采集', quantity: 1, instrument_status: 0 },
        { id: 12, instrument_name: '温度传感器', instrument_sn: 'T-2048', test_type: '温度采集', quantity: 1, instrument_status: 1 }
      ]
    },
    {
      id: 2, task_number: 'HTP-20260609002', table_no: 'Y-WY-002', applicant: '实验室',
      test_application_unit: '中海油服', project_name: '井下工具密封验证', work_order_number: 'COSL-HTP-002',
      use_device: '高温高压釜', test_type: '密封测试', target_temp: '120', target_pressure: '28MPa',
      project_members: '王工', status: 2, status_text: '测试中', created_at: '2026-06-09 10:10:00',
      instruments: [
        { id: 21, instrument_name: '压力表', instrument_sn: 'P-3030', test_type: '压力采集', quantity: 1, instrument_status: 1 }
      ]
    }
  ];

  const vibrationOrders = [
    {
      id: 31, order_no: 'VIB-20260609001', order_type: '正式实验', applicant: '测试中心',
      test_application_unit: '中海油服', project_name: '振动响应测试', task_number: 'RW-VIB-001',
      table_no: 'ZD-001', test_type: '振动台测试', test_purpose: '扫频响应', test_date: '2026-06-09',
      equipment_list: '振动台、加速度计、控制器', instrument_combination: '三轴加速度计',
      status: 1, status_text: '待排程', created_at: '2026-06-09 08:30:00',
      instruments: [
        { id: 311, instrument_name: '加速度传感器', instrument_sn: 'A-1001', code: 'A01', model: 'ACC-3A', quantity: 1, instrument_status: 0 },
        { id: 312, instrument_name: '控制器', instrument_sn: 'C-2100', code: 'C01', model: 'CTRL-V', quantity: 1, instrument_status: 1 }
      ]
    },
    {
      id: 32, order_no: 'VIB-20260609002', order_type: '预实验', applicant: '装备组',
      test_application_unit: '中海油服', project_name: '振动耐久预检', task_number: 'RW-VIB-002',
      table_no: 'ZD-002', test_type: '预实验', test_purpose: '参数确认', test_date: '2026-06-09',
      equipment_list: '振动台、摄像头', instrument_combination: '视频识别',
      status: 2, status_text: '测试中', created_at: '2026-06-09 11:30:00',
      instruments: [
        { id: 321, instrument_name: '摄像头', instrument_sn: 'CAM-001', code: 'CAM', model: 'HD', quantity: 1, instrument_status: 1 }
      ]
    }
  ];

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : input.url);
    if (url.includes('/login/info')) return json({ code: 0, msg: 'ok', data: userInfo });
    if (url.includes('/login/logout')) return json({ code: 0, msg: 'ok' });
    if (url.includes('/test/getoperatororder')) return json({ code: 0, msg: 'ok', data: dashboardOrders });
    if (url.includes('/test/high-temp-pressure/order/list/')) {
      const status = new URL(url).searchParams.get('status');
      const list = status ? highTempOrders.filter(item => String(item.status) === status) : highTempOrders;
      return json({ code: 0, msg: 'ok', data: { list, total: list.length, page: 1, pageSize: 20 } });
    }
    if (url.includes('/test/vibration-table/order/list/')) {
      const status = new URL(url).searchParams.get('status');
      const list = status ? vibrationOrders.filter(item => String(item.status) === status) : vibrationOrders;
      return json({ code: 0, msg: 'ok', data: { list, total: list.length, page: 1, pageSize: 20 } });
    }
    if (url.includes('/test/halt-hass/list/')) return json({ code: 0, msg: 'ok', data: [] });
    if (url.includes('/equipment/board-group/list/')) return json({ code: 0, msg: 'ok', data: [
      { id: 1, name: '随钻测井板组', board_group_name: '随钻测井板组', children: [] },
      { id: 2, name: '压力控制板组', board_group_name: '压力控制板组', children: [] }
    ] });
    if (url.includes('/test/halt-hass/myjob/')) return json({ code: 0, msg: 'ok', data: [] });
    return json({ code: 0, msg: 'ok', data: [] });
  };
})();
`

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForChrome() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) return await res.json()
    } catch {}
    await sleep(250)
  }
  throw new Error('Chrome remote debugging endpoint did not start')
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.id = 1
    this.pending = new Map()
    this.events = []
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
      this.ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)
          this.pending.delete(msg.id)
          if (msg.error) reject(new Error(JSON.stringify(msg.error)))
          else resolve(msg.result || {})
        } else {
          this.events.push(msg)
        }
      })
    })
  }
  send(method, params = {}, sessionId) {
    const id = this.id++
    const message = { id, method, params }
    if (sessionId) message.sessionId = sessionId
    this.ws.send(JSON.stringify(message))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP timeout: ${method}`))
        }
      }, 15000)
    })
  }
  close() {
    this.ws.close()
  }
}

async function capturePage(cdp, pageInfo) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', width: 1440, height: 900 })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Runtime.enable', {}, sessionId)
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Network.enable', {}, sessionId)
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  }, sessionId)
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: mockSource }, sessionId)
  await cdp.send('Page.navigate', { url: pageInfo.url }, sessionId)
  await sleep(4500)
  await cdp.send('Runtime.evaluate', {
    expression: "document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true",
    awaitPromise: true
  }, sessionId).catch(() => undefined)
  await sleep(1000)
  const bodyText = await cdp.send('Runtime.evaluate', {
    expression: "document.body ? document.body.innerText.slice(0, 800) : ''",
    returnByValue: true
  }, sessionId)
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true
  }, sessionId)
  const outPath = path.join(outDir, pageInfo.file)
  fs.writeFileSync(outPath, Buffer.from(screenshot.data, 'base64'))
  await cdp.send('Target.closeTarget', { targetId })
  return { ...pageInfo, outPath, body: bodyText.result?.value || '' }
}

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  '--window-size=1440,900',
  'about:blank'
], {
  stdio: 'ignore',
  windowsHide: true
})

try {
  const version = await waitForChrome()
  const cdp = new Cdp(version.webSocketDebuggerUrl)
  await cdp.open()
  await cdp.send('Target.setDiscoverTargets', { discover: true })
  const results = []
  for (const pageInfo of pages) {
    results.push(await capturePage(cdp, pageInfo))
  }
  cdp.close()
  fs.writeFileSync(path.join(outDir, 'screenshots-manifest.json'), JSON.stringify(results, null, 2), 'utf8')
  console.log(JSON.stringify(results.map(({ title, outPath, body }) => ({ title, outPath, bodyPreview: body.slice(0, 120) })), null, 2))
} finally {
  chrome.kill()
}
