# PlainMemo

[English](./README.md) | 简体中文

> 一个将碎片笔记保存为独立 Markdown 文件的 Obsidian Memos 插件。

当前稳定版本：[PlainMemo 2.2.1](https://github.com/MMKLN0/plain-memo/releases/tag/2.2.1)

PlainMemo 是 [BanyanSo/knomo](https://github.com/BanyanSo/knomo) 的非官方 fork，基于上游 MIT 许可证继续开发。本仓库不是上游项目的官方发布渠道，也不代表上游作者的观点或支持承诺。

PlainMemo 的目标是让每张卡片都是一个可独立阅读、可用 Obsidian 以外的软件管理的 Markdown 文件，同时保留 Knomo 的卡片浏览、搜索、标签、链接、回顾和移动端输入体验。

## PlainMemo 与上游的区别

| 项目 | 上游 Knomo | PlainMemo |
| --- | --- | --- |
| 存储单位 | Daily Note 中的 memo，并按月维护汇总文件 | 每张 memo 一个 Markdown 文件 |
| 文件组织 | 依赖 Daily Notes 与月度 Memos | 递归扫描一个或多个用户配置的文件夹；无需 Daily Notes |
| 文件名 | 由日记/月度文件承载 | `<正文首行>_YYMMDDHHmm.md`，冲突时加 ` (2)` 等后缀 |
| 内容格式 | 上游 memo 格式及索引流程 | 整条 memo 都是普通 Markdown；没有独立标题字段、YAML frontmatter 或插件私有标记 |
| 导入 | 围绕 Daily Notes/月度文件 | 可原地整理已有 Markdown 文件名，也可导入 Flomo HTML/ZIP |
| 月度归档 | 自动维护 | 已移除 |

这是一项有意的存储模型变更。现有上游 Daily Notes / 月度 Memos 不会被自动拆分成独立文件。整理已有数据前，请先备份 Vault。

## 功能

- 在卡片流中创建、编辑、删除、搜索、筛选和回看独立 Markdown memo；
- 递归扫描多个 Vault 相对文件夹，并为新 memo 单独指定默认保存位置；
- 识别 `#标签` 与 Obsidian WikiLink（如 `[[项目笔记]]`）；
- 在侧栏浏览层级标签，并可重命名标签路径，将修改同步应用到该标签及其子标签；
- 渲染 Markdown 列表、任务、引用、图片和链接；
- 长卡片可按设置的行数阈值折叠；
- 可将重要 memo 置顶到普通卡片流上方，支持设置数量上限并折叠置顶区域；
- 同步服务更新 PlainMemo 插件数据后，置顶状态会自动刷新，无需重启 Obsidian；
- 为已有 Markdown 文件补充可识别的创建时间后缀，不改写正文；
- 导入 Flomo HTML 或 ZIP，并保留时间、标签、网页链接和可选附件；
- 可选的时光浮标：识别正文中的 `@YYYY-MM-DD`；
- 提供桌面端和移动端卡片浏览、编辑、标签补全与 WikiLink 插入控件。

## 文件格式

一条 memo 的正文为：

```text
读完这本书后的一个想法
第二行也可以包含 #阅读 和 [[相关笔记]]。
```

会保存为类似以下文件：

```text
Memos/读完这本书后的一个想法_2607250855.md
```

- PlainMemo 没有独立标题字段。第一行仍属于 Markdown 正文，并会显示在卡片中。
- 新建 memo 时，插件只会将正文第一行安全化后用作文件名主体。
- 末尾 `_YYMMDDHHmm` 记录分钟级创建时间并用于稳定排序；同一分钟发生文件名冲突时，会追加 ` (2)`、` (3)` 等后缀。
- 不写入 YAML frontmatter；Markdown 文件本身是唯一的内容来源。
- 文件名不会作为额外的卡片标题显示。手动修改文件名或正文后，当前文件就是新的事实来源。

## 安装

PlainMemo 目前尚未发布到 Obsidian 社区插件市场。

### 使用 BRAT（推荐）

1. 从 Obsidian 社区插件市场安装并启用 [BRAT](https://github.com/TfTHacker/obsidian42-brat)。
2. 在 BRAT 设置中选择“Add Beta plugin”，输入 `MMKLN0/plain-memo`。
3. 在 Obsidian 的“第三方插件”中启用 PlainMemo。

BRAT 会从 GitHub 最新的稳定 Release 安装和更新 PlainMemo。

### 手动安装

1. 从[最新发行版](https://github.com/MMKLN0/plain-memo/releases/latest)下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 将这三个文件放入 `<Vault>/.obsidian/plugins/plain-memo/`。
3. 重新加载 Obsidian，然后在“第三方插件”中启用 PlainMemo。

## 首次配置

打开 PlainMemo 设置，找到独立 memo 文件设置区域：

1. 全新安装会以 `plain_memo` 作为初始扫描文件夹和默认新建位置，保存第一条 memo 时会自动创建该文件夹。
2. 可添加、删除或修改一个或多个扫描文件夹，路径相对于 Vault 根目录，例如 `Memos` 或 `收集箱/卡片`。
3. 选择“默认新建位置”。新 memo 会写入这里，该文件夹也会自动加入扫描范围。
4. 按需调整长卡片折叠阈值（最小 6 行）、移动端紧凑布局和时光浮标。

默认不预置任何个人路径。PlainMemo 只会把已配置扫描文件夹内的文件视为 memo。

## 导入已有 Markdown 文件

每个已配置的扫描文件夹旁都有一个导入按钮，提示文字是：“给文件名添加时间后缀，让它能被 PlainMemo 识别。”

1. 先把存放 Markdown 文件的文件夹加入扫描范围。
2. 点击该文件夹设置行上的导入按钮，查看预览并确认。
3. PlainMemo 会使用文件在 Vault 中的创建时间（`ctime`），将未识别的 `<原文件名>.md` 重命名为 `<原文件名>_YYMMDDHHmm.md`。

已经符合规则的文件会被跳过。Markdown 正文不会改变；发生重名时会追加数字后缀；重命名通过 Obsidian 文件管理接口完成，因此 Vault 内相关链接可以随之更新。

也可以手工整理文件名。在配置的文件夹中使用 `<名称>_YYMMDDHHmm.md` 或 `<名称>_YYMMDDHHmm (2).md` 即可。

## 导入 Flomo 数据

PlainMemo 设置中还提供“导入 Flomo 数据”：

1. 选择 Flomo 导出的 `.html` 或 `.zip` 文件。
2. 选择 Vault 内的目标文件夹。
3. 默认会跳过 `.m4a` 语音附件；也可以按需要调整语音和图片附件选项。
4. 查看识别到的 memo 与附件数量，然后开始导入。

每条 Flomo memo 都会转换为一个独立的 PlainMemo Markdown 文件。原始正文、第一行、时间、标签和网页链接都会保留。导入的附件保存在 `<目标文件夹>/flomo-attachments`。重复导入时会复用相同内容和附件，避免产生不必要的副本。

## 数据与隐私

所有 memo 都是 Vault 内的普通 Markdown 文件。PlainMemo 不要求账号、不依赖外部服务器，也不会主动上传笔记内容。插件设置、置顶笔记列表及其他界面状态保存在 PlainMemo 的插件 `data.json` 中；笔记正文仍保存在各自的 `.md` 文件中。

## 开发

```powershell
npm install
npm run typecheck
npm test
npm run build
```

开发完成后，将构建产物 `main.js`、`manifest.json`、`styles.css` 复制到测试 Vault 的插件目录。不要覆盖该目录中的 `data.json`，以免覆盖用户自己的设置。

## 致谢与许可证

本仓库基于 [BanyanSo/knomo](https://github.com/BanyanSo/knomo)。感谢上游作者创建 Knomo 并以 MIT 许可证发布。PlainMemo 保留原有版权与许可证声明；详情见 [LICENSE](LICENSE)。
