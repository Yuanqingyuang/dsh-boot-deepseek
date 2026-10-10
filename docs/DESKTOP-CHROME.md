# 桌面标题栏与 macOS 拖拽

[← 回到 README](../README.md)

## Windows：那三个原生按钮

桌面壳给 Electron 的是 `titleBarStyle:'hidden'` + `titleBarOverlay`（高 40，宽约 3×46=138，
`color: chromeFallbackFill()` 暗色 `#1b1b1c`，`symbolColor: #f9fafb`），也就是说
**─ □ ✕ 是浏览器进程画在网页之上的**：文档里任何 z-index 都碰不到它，插件也删不掉它（原作自己的
─ □ ✕ 在假窗口标题栏里，那是设计的一部分，与本条无关）。

插件不试图盖它，而是**收编它**：

- **让位**：`#hud-top` 按 `env(titlebar-area-width)` 预留出条带宽度，HUD 自己的 `TIME / ● REC`
  不再被压在按钮底下；普通浏览器标签页没有这个 env，预留自然塌成 0。
- **条带透明**：桌面 preload 会建一个探针元素，把它的 computed `background-color` / `color` 经
  `dsh-desktop:windows-appearance` 交给 `setTitleBarOverlay({color, symbolColor})`，并且 `<head>`
  一变就重量一次。两个值都接受 alpha，所以片头挂载时把探针的底色设成 **`transparent`**
  （preload 用 canvas 归一化成 `rgba(0, 0, 0, 0)`，主进程的颜色校验接受它），符号色设成当前配色 ——
  那几个按钮就**浮在动画上**，不再压着一条不透明的色带；卸载时移除这张样式表，`<head>` 的这次变更
  本身就是重量触发，主题自动还原。

两个实现上的坑（都在真机上量到过）：

1. 颜色必须写在**探针元素自己**身上，不能写 `:root`。探针是 body 级 `<span>`，内联样式读的是
   `var(--dsw-specific-sidebar-fill)` / `var(--dsw-alias-label-primary)`，而 app 把这两个变量定义在
   `body` 上 —— 自定义属性按**最近祖先**解析，`html` 上的 `!important` 压不过 `body` 上的普通声明，
   所以 `:root` 方案在真机上完全没生效（整段片头条带都没变）。
2. 读配色要等增强层样式表挂上之后再读：`--caption-symbol` 由 `src/enhance.js` 定义，早读会静默
   落到兜底值，条带就一直是错的颜色。

## macOS：不吞掉窗口拖拽

官方基础样式表把**每个 body 直接子元素**都算成 `-webkit-app-region: no-drag`，选择器是
`html[data-platform=darwin] body>:not(#root)` —— 平台限定 + 只放过应用自己的根元素。于是铺满视口的
body 级元素会**把整扇窗口从 macOS 可拖拽区域里减掉**：片头在放的时候，标题栏拖不动、双击缩放也
失效。`pointer-events: none` 不豁免这件事，只有元素自己声明才行。

遮罩挂载时，宿主自己往 `<head>` 塞一张
`html[data-platform="darwin"] body>.dsh-deepseek-host{-webkit-app-region:initial !important}`：
`initial` 是初始值（`none`），作用是让元素**退出** app-region 计算，而不是把整块遮罩变成拖拽把手，
所以点击跳过照旧有效；`!important` 是必需的，官方那条选择器权重更高。

**别借 `dsh-web` 全家桶的 `data-dsh-boot-splash` 标记。** 0.1.1–0.1.4 借过，代价是：那个名字不是
豁免而是契约 —— 全家桶会样式化它（不透明底色、`pointer-events:none`、`z-index:9999`、自己的
`transition`），而它的 boot shield 还会 `querySelector('div[data-dsh-boot-splash]')` 找到并**复用**、
约 1.2 秒后 `remove()`。结果是装了全家桶的人：点击跳过被静默关掉、两段式交接被中和、片头一秒出头
被删。现在宿主带自己的 `data-dsh-boot-deepseek`，并用标准的 `aria-hidden="true"` 换取全家桶的同一条
拖拽豁免；几何（`z-index` / `background` / `pointer-events` / `transition`）全部**显式声明在
document 级样式表**里并带 `!important` —— 文档树的普通声明本来就压过 shadow 里的 `:host`，把
宿主的关键属性交给 `:host` 等于交给别人改写。

`.verify` 那套断言已经搬进仓：`npm run test:harness` 的 `darwin · window drag guard` 断言四个
app-region 值，`family bundle · marker collision` 复现全家桶的样式表与 shield 并断言它们碰不到我们。

## macOS：让位、全屏与 HUD 条带

macOS 没有 `titleBarOverlay`（整个 shell 里 `titlebar-area` 零命中），红绿灯由
`titleBarStyle:'hiddenInset'` + `trafficLightPosition{x:16,y:18}` 画，所以 Windows 那套
`env(titlebar-area-width)` 在 mac 上不存在。三处按 shell 自己的数字补齐：

| 项 | 做法 | 依据 |
|---|---|---|
| HUD 让位 | `:host([data-caption="darwin"]) #hud-top{padding-left:76px}` | 16（x）+ 52（shell 自己给红绿灯留的条宽）+ 8 呼吸位 |
| 全屏塌陷 | `[data-fullscreen]` 时 `padding-left/right:0` | 全屏时 macOS 收红绿灯、Windows 收 overlay 按钮；preload 用 `html[data-fullscreen]` 报这件事 |
| 窗口可拖 | document 级拖拽带 `body>.dsh-deepseek-dragband{-webkit-app-region:drag}` | 见下 |

**拖拽带为什么在文档树里，而不是标 `#hud-top`。** 0.1.4 给 shadow root 内的 `#hud-top` 标了
`data-window-drag` —— 看着对，实际什么也不做：官方规则是
`html[data-platform=darwin] [data-window-drag]{-webkit-app-region:drag}`，它和 shell 自己的同步查询
都在**文档树**里，看不见 shadow root 里的属性。所以改成一条 40px 高的文档级横带（`data-window-drag`
+ 显式 `-webkit-app-region:drag`，后者让 Windows 也生效 —— 那条官方规则是 darwin 限定的），挂在遮罩
之上。代价写在明处：**这 40px 里的点击归窗口拖动**，跳过请按 `Esc` 或点条带以下。

全屏标记由 `client.js` 用 `MutationObserver` 盯 `html[data-fullscreen]` 并镜像到宿主元素上，
所以**片头正在放的时候**用户切全屏也跟得上，不是只在挂载那一刻读一次。

darwin 上不再注入标题栏换色：preload 的探针元素只在 win32 创建
（`syncWindowsAppearance()` 在非 win32 直接返回），那边根本没有可改的条带，注入纯属多余的
`<head>` 变更。

全屏标记由 `client.js` 用 `MutationObserver` 盯 `html[data-fullscreen]` 并镜像到宿主元素上，
所以**片头正在放的时候**用户切全屏也跟得上，不是只在挂载那一刻读一次。

`npm run test:harness` 里 HUD 让位那三处由 `darwin · HUD reserve`（76px）、
`…fullscreen before mount`、`…fullscreen after mount`（0px）覆盖；拖拽那条由
`family bundle · marker collision` 断言（`dragBandAppRegion: drag`）。
