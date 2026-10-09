# 构建与验证

[← 回到 README](../README.md)

## 三条命令

```sh
npm run build          # extract + build（只重写 lib/client.js）
npm test               # 宿主半边：路由处理器、版本比较、apply() 的接线（纯 node，无需浏览器）
npm run test:harness   # 浏览器里跑真实插件：15 个用例 / 54 条断言（自动起静态服务器）
```

`npm run verify` 把三件事串起来（build → check → test → harness）。构建是**幂等**的：
`npm run build` 之后再 `git diff --exit-code -- lib/client.js` 必须是空的，CI 就在盯这件事。

## 浏览器套件（`scripts/harness/`）

把**真实的 index.html**（从 app.asar 取出的 web-frontend dist）用 DSH 自己的行渲染器
（`scripts/harness/render-rows.mjs`）套上**插件自己产出的行**，再用无头浏览器跑。

拿不到真实页面时（新克隆、没装 DSH）会自动退回仓里的 `scripts/harness/fallback.html`：
断言会弱一些，但套件仍然可跑 —— 这是把它提交进仓的意义。也可以用 `DSH_550C_PAGE=<path>` 指定页面、
`DSH_550C_BROWSER=<path>` 指定浏览器；找不到任何浏览器时套件会**跳过并退出 0**，宿主测试才是硬门。

| 用例 | 断言 |
|---|---|
| `simple · plugin rows` | 首帧早于任何插件代码、退役与挂载同一任务、`data-caption=windows` |
| `simple · rows withheld` / `off · plugin rows` | 对照组：没有行 / 关闭档时首帧与遮罩都不出现 |
| `full · plugin rows` | 完整档 HUD 在、浏览器里预留塌成 0 |
| `darwin · window drag guard` | 有守卫 `none`、抽掉守卫 `no-drag`（对照）、插回 `none`、官方 `[data-window-drag]` 行仍 `drag` |
| `darwin · HUD reserve` | 让位 `76px`；HUD **没有**被标 `data-window-drag`（shadow 里标了也没用） |
| `… fullscreen before/after mount` | 全屏时让位塌成 `0px`，宿主元素同步到 `data-fullscreen`（挂载前后两条路径） |
| `family bundle · marker collision` | 家族包的 `[data-dsh-boot-splash]` 规则与 shield 都碰不到我们：z-index 仍是 2147483000、`pointer-events:auto`、背景是本片头底色、拖拽带 `drag`、点击跳过仍有效 |
| `caption · transparent strip` | 桌面 preload 探针：底色 `rgba(0,0,0,0)`、符号 `rgb(232,160,32)`，而 app 自己的 token 原样不动 |
| `failure card · cover retires itself` | shell 的失败卡片不会被首帧盖住 |
| 4 张截图 | 有行时纯黑首帧、抽掉行时 HARNESS 卡片可见、简易/完整档播放中 |

## 真实 GUI

`scripts/verify.mjs` 用 DevTools 协议驱动真实浏览器，可以在**精确时刻**、**指定模式**下截图并读取
遮罩层的内部状态。普通 `--screenshot` 做不到：模式存在 localStorage 里，而且新 profile 的引导弹窗
挡在整个 shell 前面，不点掉它插件的槽位根本不存在。

```sh
node scripts/verify.mjs --url 'http://127.0.0.1:3080/?token=…' --mode simple --at 2600
node scripts/verify.mjs --url '…' --mode full  --at 7000
node scripts/verify.mjs --url '…' --mode off   --at 1000 --settings   # 设置行巡检
node scripts/verify.mjs --url '…' --mode full  --at 3000 --skip       # 跳过验证
```

已实测通过的项（web profile，`link:` 安装）：

| 项 | 证据 |
|---|---|
| 简易模式播放 | 2.6s 截图：logo 正在逐路径书写，红 0 已发光，`550C SYSTEM BOOT` 打字机 |
| 简易模式收尾 | 7s 时 `host: false`，屏幕顶层元素变回 DSH 输入框 |
| 完整模式播放 | 7s 时 `appInShadow: true`、63 行日志、47 节点全部 `done` |
| 完整模式收尾 | 15s 时 `host: false`，遮罩已卸载 |
| 关闭档 | `--mode off` 时 `host: false`，遮罩从不挂载 |
| 通用设置行 | 行标题、三档 `["关闭","简易","完整"]`、当前档高亮、`预览` 按钮在 |
| Esc 跳过 | 3s 时 `hostBefore: true` → Esc 后 `hostAfterEsc: false` |

截图存在 `.verify/shots/`；README 顶部那三张对外预览在 [`docs/`](.)。
`.verify/` 整个目录已 gitignore —— 里面有从 app.asar 取出的 DSH 包文件，不该进仓库。

## 本机定制（DeepSeek 版）的验证记录

上游那套断言照跑；下面是这次移植**额外**验到的，全部可复现：

| 项 | 证据 |
|---|---|
| 字标几何 | `verify.mjs` 的 `wordmark` 探针：`count=8`、`text="DeepSeek"`、`centered=400`（800 视口正中）、`overlap=false`、`caption="DEEPSEEK SYSTEM BOOT"` |
| 开场书写 | `simple --settle 500` 截图：`Deep` 已填满，`p` 只画出轮廓、`S` 刚画一半 —— 轮廓先行、填充随后，与参考页一致 |
| 开场定格 | `simple --settle 1200 --at 1400` 截图：字标整体蓝色 + 辉光，tagline「探索未至之境」与底部字幕各就各位 |
| 全片文案 | 产物里 `[DSH]` 43 处、`[DSH-INFER]` 12 处、HUD `◢ DSH // UAV-BS-07`、`CA_DSH_ROOT`、`DSH-CTRL` 各 1 处；区分大小写搜 `550C` 只剩 4 处，全是标识符与生成横幅（`CSS_550C` ×2、`assets/550C-source.html` 出处 ×2） |
| 完整链路 | `full --timeline` 采样表：10.5s `#final` 亮起 → **11.4s 视频开播**（`paused=false ready=4 3840x2160 err=null`）→ 18.9s `t=7.05` 自然播完 → 19.7s 遮罩卸载 |
| 结尾画面 | `--finale-shot` 在轮询中发现视频确实在播时自动抓帧（`.verify/shots/finale-live.png`），确认 `object-fit:cover` 铺满 |
| 视频中跳过 | `full @14000ms --skip`：跳过前 `videoBefore={t:3.47, paused:false}`，Esc 后 900ms `hostAfterEsc=false` —— 取消链路会暂停视频并结算 promise，不会卡到 30s 看门狗 |
| 宿主媒体路由 | `npm test` 新增 15 条：200 全长 / 206 三种 range（`4-7`、`8-`、`-4`）/ 416 / 404（资产缺失）/ 405 / HEAD 无 body / 只读一次并缓存 / 换片后重读 / 未变仍缓存 |
| 已安装的那一份 | 从 `profiles/desktop/node_modules/dsh-550c-boot`（junction）导入宿主半边并直接驱动：HEAD `200 video/mp4`、GET 同长、`bytes=0-99` 回 `206 …/<总长>` |
| 无 CSP 拦截 | 全文扫 `app.asar`：所有 CSP 都在隔离上下文（沙箱文件服务、文档预览 iframe、登录小页、Electron 本地页），shell 主页面没有 CSP，同源 `<video>` 不会被拦 |
| 换片不需要重启（回归） | 媒体验字节按 size+mtime 作缓存键；新增「换片后重读」「未变仍缓存」两条断言。起因是实测到的真实现象：重启后路由已上线、磁盘上是新片，`content-length` 却仍是换片前那份的字节数（进程内存里的旧副本） |

**两个部署事实**

1. 媒体路由由宿主半边注册，而运行中的宿主进程**不会**因为文件变化而重新导入模块
   （实测：插件管理器「禁用→启用」重跑了 `apply()`，但 ESM 模块缓存未失效，路由仍是空 body 404）。
   所以改完宿主半边的**代码**必须**重启 DSH**；客户端半边只要硬刷新即可（bundle URL 带进程 nonce）。
2. 换**素材**（`lib/media/intro.mp4`）在修复后不再需要重启（缓存按 size+mtime 失效）；
   但这条修复生效之前启动的进程仍会吐内存里的旧副本，需要重启一次才能拿到新素材。

> web profile 首次启动会串联几个引导弹窗（内测声明 → API Key），它们盖在整个 shell 之上，
> 所以全新 profile 下动画会被弹窗挡住。桌面 profile 的引导已经走完，不存在这个问题。
