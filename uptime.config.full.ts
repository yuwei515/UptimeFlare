import { MaintenanceConfig, PageConfig, WorkerConfig } from './types/config'

const pageConfig: PageConfig = {
  // 状态页标题
  title: "yuwei's Status Page",

  // 状态页顶部显示的链接；可以将 highlight 设置为 true 来突出显示某个链接
  links: [
    { link: 'https://linkding.myuwei.dpdns.org', label: 'GitHub' },
    { link: 'https://rin.wocaoleya.ccwu.cc', label: 'Blog' },
    { link: 'https://omnimodel.dpdns.org', label: 'OmniModel', highlight: true },
  ],

  // 【可选】对监控项目进行分组
  // 如果不设置，所有监控项目将显示在同一个列表中
  // 如果设置了分组，项目将按照分组及其顺序显示
  // 没有列入分组的项目不会显示在状态页中，但仍然会继续接受监控
  // https://linkding.myuwei.dpdns.org
  group: {
    '🌐 公开服务': ['yuwei_blog', 'yuwei_api', 'more monitor ids...'],
    '🔐 私有服务': ['yuwei_linkding'],
  },

  // 【可选】自定义网站图标路径；默认使用 '/favicon.png'
  // favicon: 'https://example.com/favicon.ico',

  // 【可选】自定义网站 Logo 路径；默认使用 '/logo.svg'
  // logo: 'https://example.com/logo.svg',

  // 【可选】维护公告相关设置
  maintenances: {
    // 【可选】即将开始的维护公告颜色，默认为灰色
    // 已经开始的维护公告始终使用 MaintenanceConfig 中指定的颜色
    upcomingColor: 'gray',
  },

  // 【可选】自定义页脚 HTML 内容
  // customFooter: '',
}

const workerConfig: WorkerConfig = {
  // 除非监控状态发生变化，否则每 N 分钟最多写入一次 KV；默认值为 3
  kvWriteCooldownMinutes: 3,

  // 取消下面一行的注释即可启用 HTTP Basic 身份验证，保护状态页和 API
  // 格式为“用户名:密码”
  passwordProtection: 'yuwei:admin123',

  // 在这里定义所有需要监控的项目
  monitors: [
        {
      // Blog
      id: 'yuweu_blog',
      name: 'Blog',
      method: 'GET',

      // TODO：替换为你真实的官网地址
      target: 'https://rin.wocaoleya.ccwu.cc/',

      statusPageLink: 'https://rin.wocaoleya.ccwu.cc/',
      expectedCodes: [200],
      timeout: 10000,
    },
    {
      // OmniModel API
      id: 'yuwei_api',
      name: 'OmniModel',
      method: 'GET',

      // TODO：替换为真正可公开访问的健康检查接口
      target: 'https://omnimodel.dpdns.org',

      expectedCodes: [200],
      timeout: 10000,
    },
    {
      // UptimeFlare 状态页
      id: 'yuwei_linkding',
      name: 'UptimeFlare 状态页',
      method: 'GET',

      // TODO：替换为 Cloudflare 控制台显示的真实地址
      target: 'https://linkding.myuwei.dpdns.org/',

      expectedCodes: [200],
      timeout: 10000,
    },
    // // HTTP 监控示例
    // {
    //   // 每个监控项目的 id 必须唯一
    //   // 只要 id 保持不变，系统就可以继续保留该项目的历史记录
    //   id: 'foo_monitor',

    //   // 监控名称会显示在状态页和通知消息中
    //   name: '我的 API 监控',

    //   // 使用有效的 HTTP 请求方法，例如 GET、POST、HEAD 等
    //   method: 'POST',

    //   // 需要监控的目标 URL
    //   target: 'https://omnimodel.dpdns.org',

    //   // 【可选】鼠标悬停在状态页项目上时显示的提示信息
    //   tooltip: '这是该监控项目的提示信息',

    //   // 【可选】设置状态页项目点击后打开的链接
    //   statusPageLink: 'https://omnimodel.dpdns.org',

    //   // 【可选】设为 true 可以隐藏该项目的响应延迟图表
    //   hideLatencyChart: false,

    //   // 【可选】可接受的 HTTP 响应状态码；默认接受 2xx 状态码
    //   expectedCodes: [200],

    //   // 【可选】请求超时时间，单位为毫秒；默认值为 10000
    //   timeout: 10000,

    //   // 【可选】发送给目标服务器的 HTTP 请求头
    //   headers: {
    //     'User-Agent': 'Uptimeflare',
    //     Authorization: 'Bearer YOUR_TOKEN_HERE',
    //   },

    //   // 【可选】发送给目标服务器的请求正文
    //   body: 'Hello, world!',

    //   // 【可选】如果设置了此项，响应内容必须包含指定关键词才会被判定为正常
    //   responseKeyword: 'success',

    //   // 【可选】如果响应内容包含指定关键词，则会被判定为异常
    //   responseForbiddenKeyword: 'bad gateway',

    //   // 【可选】通过代理执行监控，主要用于需要从特定地区进行检查的场景
    //   // 配置说明：
    //   // https://github.com/lyc8503/UptimeFlare/wiki/Check-proxy-setup
    //   // 当前支持 worker://、globalping:// 和 http(s):// 类型的代理
    //   checkProxy: 'https://xxx.example.com OR worker://weur',

    //   // 【可选】如果设为 true，当指定代理不可用时，回退到本地执行监控
    //   checkProxyFallback: true,
    // },

    // // TCP 端口监控示例
    // {
    //   id: 'test_tcp_monitor',

    //   name: 'TCP 端口监控示例',

    //   // TCP 监控必须使用 TCP_PING 方法
    //   method: 'TCP_PING',

    //   // TCP 监控的目标格式为“主机名或 IP:端口”
    //   target: '1.2.3.4:22',

    //   tooltip: '生产服务器 SSH 端口',

    //   statusPageLink: 'https://example.com',

    //   timeout: 5000,
    // },
  ],

  // 【可选】通知设置
  notification: {
    // 【可选】通知 Webhook 设置；不配置时不会发送通知
    // 详细说明：
    // https://github.com/lyc8503/UptimeFlare/wiki/Setup-notification
    webhook: {
      // 【必填】Webhook 地址，以下使用 Telegram Bot API 作为示例
      url: 'https://api.telegram.org/bot123456:ABCDEF/sendMessage',

      // 【可选】HTTP 请求方法
      // payloadType 为 param 时，默认使用 GET；其他情况下默认使用 POST
      method: 'POST',

      // 【可选】发送给 Webhook 的请求头
      headers: {
        foo: 'bar',
      },

      // 【必填】指定通知内容的编码方式
      // 可选值：param、json、x-www-form-urlencoded
      // param：将 URL 编码后的参数追加到请求 URL 中
      // json：将 JSON 数据作为请求正文发送，并设置 application/json
      // x-www-form-urlencoded：以表单 URL 编码格式发送请求正文
      payloadType: 'x-www-form-urlencoded',

      // 【必填】发送给 Webhook 的参数
      // $MSG 会被替换为可读的通知消息
      payload: {
        chat_id: 12345678,
        text: '$MSG',
      },

      // 【可选】调用 Webhook 的超时时间，单位为毫秒；默认值为 5000
      timeout: 10000,
    },

    // 【可选】通知消息使用的时区；默认值为 Etc/GMT
    timeZone: 'Asia/Shanghai',

    // 【可选】发送故障通知前的宽限时间，单位为分钟
    // 首次检测到故障后，只有连续 N 次检查仍然失败才发送通知
    // 如果不设置该项，则会立即发送通知
    gracePeriod: 5,

    // 【可选】指定哪些监控项目不发送通知
    skipNotificationIds: ['foo_monitor', 'bar_monitor'],

    // 【可选】设为 true 后，同一故障事件中的错误原因发生变化时，不额外发送通知
    // 默认值为 false
    skipErrorChangeNotification: true,
  },

  // 【可选】自定义回调函数
  callbacks: {
    onStatusChange: async (
      env: any,
      monitor: any,
      isUp: boolean,
      timeIncidentStart: number,
      timeNow: number,
      reason: string
    ) => {
      // 当任何监控项目的状态发生变化时调用
      // 可以在这里编写自己的 TypeScript 逻辑
      // 此回调不会遵循上面的通知宽限时间，而是在状态变化时立即调用
      // 如果需要宽限时间，必须在回调函数内部自行实现
    },

    onIncident: async (
      env: any,
      monitor: any,
      timeIncidentStart: number,
      timeNow: number,
      reason: string
    ) => {
      // 当任何监控项目处于持续故障状态时，每分钟调用一次
      // 可以在这里编写自己的 TypeScript 逻辑
    },
  },
}

// 可以定义多个计划维护事件
// 在维护期间，状态页会显示维护公告
// 对应的故障通知也会被跳过
// 如果不需要维护公告，可以将数组留空
// const maintenances: MaintenanceConfig[] = []

const maintenances: MaintenanceConfig[] = [
  {
    // 【可选】指定受本次维护影响的监控项目 ID
    monitors: ['foo_monitor', 'bar_monitor'],

    // 【可选】维护标题；默认标题为 Scheduled Maintenance
    title: '测试维护公告',

    // 维护说明，将显示在状态页上
    body: '服务器软件升级维护',

    // 维护开始时间，可以使用 Unix 时间戳或 ISO 8601 格式
    start: '2025-04-27T00:00:00+08:00',

    // 【可选】维护结束时间，可以使用 Unix 时间戳或 ISO 8601 格式
    // 如果不设置，则视为持续进行中的维护
    end: '2025-04-30T00:00:00+08:00',

    // 【可选】维护公告颜色，默认值为黄色
    color: 'blue',
  },

  // 由于此配置文件是 TypeScript 文件，也可以使用立即调用函数表达式生成计划维护事件
  // 以下示例用于生成每月 15 日凌晨 2 点至 4 点（UTC+8）的维护计划
  // 注意：这种方式可能存在风险，生成过多维护事件会导致性能问题
  // 非确定性的输出也可能造成错误或意外行为
  // 如果不熟悉调试，请谨慎使用此方式
  ...(function () {
    const schedules = []
    const today = new Date()

    for (let i = -1; i <= 1; i++) {
      // JavaScript 的 Date 对象会自动处理年份跨越
      const date = new Date(today.getFullYear(), today.getMonth() + i, 15)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')

      schedules.push({
        title: `${year}/${parseInt(month)} - 每月计划维护`,
        monitors: ['foo_monitor'],
        body: '每月定期维护',
        start: `${year}-${month}-15T02:00:00.000+08:00`,
        end: `${year}-${month}-15T04:00:00.000+08:00`,
      })
    }

    return schedules
  })(),
]

// 不要删除以下导出语句，否则可能导致编译失败
export { maintenances, pageConfig, workerConfig }
