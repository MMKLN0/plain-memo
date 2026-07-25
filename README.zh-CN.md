# PlainMemo

[English](./README.md) | 简体中文

> 一个将碎片笔记保存为独立 Markdown 文件的 Obsidian Memos 插件。

PlainMemo 是 [BanyanSo/knomo](https://github.com/BanyanSo/knomo) 的非官方 fork，基于上游 MIT 许可证继续开发。本仓库不是上游项目的官方发布渠道，也不代表上游作者的观点或支持承诺。

PlainMemo 的目标是让每张卡片都是一个可独立阅读、可用 Obsidian 以外的软件管理的 Markdown 文件，同时保留 Knomo 的卡片浏览、搜索、标签、链接、回顾和移动端输入体验。

## 与上游的区别

| 项目 | 上游 Knomo | 此分支 |
| --- | --- | --- |
| 存储单位 | Daily Note 中的 memo，并按月维护汇总文件 | 每张 memo 一个 Markdown 文件 |
| 文件组织 | 依赖 Daily Notes 与月度 Memos | 扫描一个或多个用户配置的文件夹；无需 Daily Notes |
| 文件名 | 由日记/月度文件承载 | `<首行>_YYMMDDHHmm.md`，冲突时加 ` (2)` 等后缀 |
| 内容格式 | 上游 memo 格式及索引流程 | 首行为标题，后续为正文；不写 YAML frontmatter 或插件私有标记 |
| 导入 | 围绕 Daily Notes/月度文件 | 只要文件名符合规则并位于扫描范围，即会被识别；原文件不会被移动或改写 |
| 月度归档 | 自动维护 | 已移除 |

这是一项有意的存储模型变更，现有上游 Daily Notes / 月度 Memos 不会被本分支自动迁移。请先备份，再按下方“导入已有笔记”整理文件。

## 功能

- 在卡片流中创建、编辑、删除、搜索、筛选和回看独立 Markdown memo；
- 递归扫描多个 Vault 相对文件夹，并为新卡片单独指定默认保存位置；
- 识别 `#标签` 与 Obsidian WikiLink（如 `[[项目笔记]]`）；
- 长卡片可按设置的行数阈值折叠；
- 支持 Markdown 列表、任务、引用、图片和链接；
- 可选的时光浮标：识别正文的 `@YYYY-MM-DD`；
- 桌面端与移动端的卡片浏览和输入界面。

## 文件格式

新建内容：

```text
读完这本书后的一个想法
第二行起是正文，也可以包含 #阅读 和 [[相关笔记]]。
```

会保存为类似以下文件：

```text
Memos/读完这本书后的一个想法_2607250855.md
```

规则如下：

- 第一行会作为卡片标题和新建文件名的主体；它是普通文本，不是必须的一级标题。
- 末尾 `_YYMMDDHHmm` 是创建时写入的分钟级时间，用于稳定排序和避免同名冲突。
- 不使用 YAML frontmatter；Markdown 文件本身是唯一的内容来源。
- 手动修改标题或文件名是允许的。插件以当前文件内容与文件路径为准，不会写入第二份标题数据。

## 安装

本 fork 尚未发布到 Obsidian 社区插件市场。手动安装：

1. 从本仓库的 [Releases](https://github.com/MMKLN0/plain-memo/releases) 下载与 Obsidian 版本兼容的发布包；若没有 Release，可在源码目录运行 `npm install` 和 `npm run build`。
2. 将 `main.js`、`manifest.json` 和 `styles.css` 放入 Vault 的 `.obsidian/plugins/plain-memo/`。
3. 在 Obsidian 的“第三方插件”中启用 PlainMemo。

## 首次配置

打开 PlainMemo 设置，在“PlainMemo 独立卡片文件”中：

1. 添加一个或多个扫描文件夹，路径相对于 Vault 根目录，例如 `Memos` 或 `收集箱/卡片`。
2. 选择“默认新建位置”。新卡片只会写入这里，并会自动纳入扫描范围。
3. 按需要调整长卡片折叠阈值（最小 6 行）、移动端紧凑布局和时光浮标。

默认不预置任何个人路径或文件夹。未配置扫描目录前，插件不会把你的已有文件当作 memo。

## 导入已有笔记

PlainMemo 暂不执行导入或迁移操作，而是按规则读取文件：

1. 将笔记放入已配置扫描范围内的文件夹；可保留子文件夹。
2. 将文件命名为 `<标题>_YYMMDDHHmm.md`，例如 `周末想做的事_2607250855.md`。
3. 在文件第一行写入标题，后续行写正文。
4. 重新打开 PlainMemo 或等待 Vault 文件变更完成刷新。

若同一分钟出现同标题，可使用 `标题_2607250855 (2).md`。不符合上述文件名规则的 Markdown 文件不会作为 memo 卡片显示，原文件也不会受到影响。

## 数据与隐私

所有 memo 都是 Vault 内的普通 Markdown 文件。PlainMemo 不要求账号、不依赖外部服务器，也不会主动上传笔记内容。插件的设置和可重建的本地状态仅用于界面与功能；你的笔记正文仍保存在各自的 `.md` 文件中。

## 开发

```powershell
npm install
npm run typecheck
npm test
npm run build
```

开发完成后，将构建产物 `main.js`、`manifest.json`、`styles.css` 复制到测试 Vault 的插件目录。不要覆盖该目录中的 `data.json`，以免覆盖用户自己的设置。

## 致谢与许可证

本仓库基于 [BanyanSo/knomo](https://github.com/BanyanSo/knomo)。感谢上游作者创建 Knomo 并以 MIT 许可证发布。本 fork 保留原有版权与许可证声明；详情见 [LICENSE](LICENSE)。
