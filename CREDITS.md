# 致谢 / Credits

## 本仓库是一个 fork

本仓库是 **[yannicksong0106/dsh-550c-boot](https://github.com/yannicksong0106/dsh-550c-boot)** 的定制分支：
上游的插件工程、动画移植、文档与验证脚手架**全部保留**，本分支只做三件事——开头字标换成 DeepSeek、
片内 `550C` 文案改为 `DSH`、完整档结尾追加一段片尾视频。改写清单见
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 的定点改写表（第 9–13 条）。上游的 git 历史与 v0.3.x 标签
一并保留，`upstream` remote 仍指向原仓库。

## 550C 片头动画与 HTML 源码 —— Voidpoket

这个插件的动画不是重写的，是**移植**的：`assets/550C-source.html` 是 **Voidpoket**（GitHub:
[@Voidpoket](https://github.com/Voidpoket)）提供的 550C 片头页面原稿，本仓库的 `scripts/extract.mjs`
只对它做定点改写（`:host` 作用域、可取消定时器、去掉页面级监听等），样式表、DOM 结构与动画脚本逐字保真。
配色（琥珀 CRT 阶梯）、面板布局、时间线节奏都出自这份原稿。

- 原稿：`assets/550C-source.html`（归档，构建的输入）
- 改写清单与理由：见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 的表格

> 若版权方希望采用不同的署名方式或许可条款，开个 issue 说明即可，这里按你的意思改。

## 本插件

插件工程（宿主半边首帧注入、遮罩层挂载策略、内容增强层、设置行、验证脚手架）由
**Ziyang Song**（[@yannicksong0106](https://github.com/yannicksong0106)）编写，MIT 许可。

## 依本文档之外的第三方

- 移植后的动画代码不引入任何运行时依赖；`react` 只是客户端插件可选的 external（设置行用）。
- `lib/media/intro.mp4` 是 **Steam 创意工坊**作品《4K120FPS-DeepSeek专业工作模式》的副本，
  版权归其作者，**不属于本仓库的 MIT 许可范围**；本仓库只是个人定制的留档。
- `docs/preview-*.png` 由本分支自己的构建产物截取（DeepSeek 字标 / DSH 文案），不是上游原稿的截图。
- `assets/orbitron-latin.woff2` 是 **Orbitron** 字体（Copyright 2018 The Orbitron Project Authors，
  SIL Open Font License 1.1，全文见同目录 `orbitron-OFL.txt`）。开场字标用它排版；构建时以 data: URL
  内联进客户端 bundle（由 `lib/client.js` 在文档级注册），因此**不在本仓库的 MIT 许可范围内**，
  随附 OFL 全文。
