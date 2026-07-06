# Block Reference Enhancer

English documentation is available in [README.md](./README.md).

插件支持 Obsidian 使用低粒度的块引用块嵌入，也能把基于 UUID 的块引用、块嵌入，在 Obsidian 里变得清楚、可读、可点开、可继续使用，同时兼容 Logseq 块引用、块嵌入语法风格在 Obsidian 渲染与使用。

<img alt="ChatGPT Image 2026年7月4日 13_39_35" src="https://github.com/user-attachments/assets/c204ef39-3c4f-4280-8443-8ba05e6ca3f6" />


它是一个“显示增强器”和“渲染器”（同时它也能建立和自动检测块引用块嵌入的增删）：
- `((uuid))` 会显示源块完整的第一行摘要
- `{{embed ((uuid))}}` 会显示成完整块嵌入和可折叠的子级大纲
- 原始 Markdown 不会被改写
- 插件会维护自己的本地块索引，不依赖 Obsidian 自带搜索索引

> [!NOTE]
> 插件显示名：`Block Reference Enhancer`  
> 插件 ID 和安装文件夹名：`block-reference-enhancer`  
> GitHub 仓库保留 `obsidian-` 前缀，仅用于仓库命名，不是插件 ID。<br>
> 更推荐使用 Obsidian 默认主题或 Minimal；插件会持续维护对这两个主题的兼容性。其他主题不保证能正常显示或正常交互。

<img alt="演示-20260702001852" src="https://github.com/user-attachments/assets/335cb127-b120-44fa-b23b-267ec4962072" />

### 界面语言

插件会自动跟随 Obsidian 的界面语言。内置英文和简体中文；包括 `zh-TW` 在内的中文语言环境统一使用简体中文，其他未支持的语言回退为英文。

## ✨ 这个插件能做什么

如果你的笔记已经是 UUID 风格的块结构，这个插件可以让它们在 Obsidian 里更自然地工作，而不用你重写整套笔记格式。

你可以直接得到：
- `((uuid))` 的完整第一行摘要显示
- `{{embed ((uuid))}}` 的完整块嵌入显示和子级大纲折叠
- 渲染后的块引用、块嵌入可通过悬浮出现的 `Back` 按钮跳回源块
- 源块旁的引用次数数字 badge
- 点击数字后展开的引用位置弹窗
- 输入 `((` 后的块自动补全
- 复制当前块引用或块嵌入的命令和右键菜单入口
- 将框选区域里的 UUID 块引用、块嵌入复制为可读 Markdown 大纲文本的右键菜单
- 可隐藏 Logseq 风格大纲属性行，例如 `id::`、`collapsed::`、`hl-*::`
- 面向无序列表块的右键大纲强化功能
- 通过白名单手动同步 Logseq 页属性与 Obsidian YAML 页头的实验功能
- 源块内容保存后，已有块引用和块嵌入会自动同步刷新
- 在块引用、块嵌入非常密集的页面里，会复用布局测量并通过有上限的队列继续渲染，避免滚动和切页时反复全页扫描
- 面向大库的本地索引和缓存

## 👀 适合谁用

- 从 Logseq 风格 UUID 笔记迁移到 Obsidian 的用户
- 主要写大纲型 Markdown 笔记的用户
- 需要在大库里稳定查看块引用、块嵌入的用户
- 希望 Live Preview 和 Reading Mode 都能正常显示的用户

## 🚀 安装方式

### 社区插件市场安装

1. 打开 `设置` -> `第三方插件`
2. 搜索 `Block Reference Enhancer`
3. 安装
4. 启用

### 手动安装

1. 从最新 GitHub Release 下载 `main.js`、`manifest.json`、`styles.css`
2. 打开你的 Obsidian 库目录
3. 进入 `.obsidian/plugins/`
4. 新建文件夹 `block-reference-enhancer`
5. 把这三个文件放进去
6. 回到 Obsidian 启用插件

## 📝 笔记里的原始语法样式

### 源块

```md
- 机会成本
  id:: 68a92328-da50-46cc-aa45-73dec00ca8ce
```

空无序列表项也可以作为源块。它的块引用摘要会显示为 `[块源为空]`，块嵌入仍会显示该块下面的软换行内容和子级：

```md
-
  id:: 699c3044-2c70-4199-9115-de5460941dd5
  > 软换行内容仍属于该块嵌入。
```

插件新建 UUID 时，会使用“当前列表项原有前导缩进 + 两个空格”写入 `id::`。列表子级本身的 Tab 层级不会被修改；历史笔记中缩进更宽的 `id::` 仍然兼容，也不会被自动重写。

### 普通块引用

```md
((68a92328-da50-46cc-aa45-73dec00ca8ce))
```

### 块嵌入

```md
{{embed ((68a92328-da50-46cc-aa45-73dec00ca8ce))}}
```

## 🎯 启用插件后的效果

### 普通块引用

`((uuid))` 会显示目标块完整的第一行。第一行较长时会正常换行，不再用省略号截断。

鼠标悬浮、聚焦或点击到渲染后的引用上时，会出现并保持显示一个小的 `Back` 按钮，用来跳回源块。

当光标离开这个块引用后，它也会在短时间内自动恢复为渲染状态。

如果页面里有很多已经渲染好的块引用，插件会复用横向布局测量，并通过有上限的渲染队列继续处理剩余内容，不再为每一批引用重新扫描整个页面。渲染造成的垂直行高变化不会清空全部宽度缓存；主题、字体、列表缩进或编辑器宽度真正变化时仍会重新测量。这样可以降低滚动、切页和快速切换焦点时的 CPU 与布局压力，同时使列表缩进在 Obsidian 默认主题与 Minimal 下保持稳定。

### 块嵌入

`{{embed ((uuid))}}` 会显示目标块本身和它的子级内容。

块嵌入根节点和所有拥有子级的嵌入大纲节点，都会用紧凑的圆形三角按钮替代额外的列表圆点，用来折叠或展开该节点的子级。每一处块嵌入独立保存折叠状态，在 Live Preview 与 Reading Mode 之间切换时会保持同步，重启 Obsidian 后仍会保留。某处嵌入被删除或位置、UUID 发生变化时，旧状态会被清理；删除插件数据后，所有嵌入默认恢复为展开。

折叠只影响视图，不会修改 Markdown 或缓存一份旧内容。源块保存后，所有块引用和块嵌入仍会同步最新索引内容，包括当前处于折叠状态的分支。

鼠标悬浮、聚焦或点击到渲染后的嵌入上时，也会出现并保持显示同样的 `Back` 按钮，用来跳回源块。

`Back`、`Delete` 和源块数字 badge 统一只显示一套 Obsidian 风格悬浮提示，不再重复出现浏览器原生提示。

### 源块右侧数字

当某个源块已经被引用时，插件会在源块旁显示一个数字 badge。这个数字会在以下两种模式里都出现：
- Live Preview
- Reading Mode

点击这个数字，可以打开一个紧凑的引用弹窗。弹窗会显示：
- 文件名
- 行号
- 引用类型
- 父级、当前行和子级上下文预览，其中 UUID 语法会转换成可读的源块摘要
- 标题栏折叠按钮，可以把列表收起为仅显示引用类型和文件名

如果同一个 UUID 在多个文件里同时作为活动源块存在，每个活动源位置都会显示相同的引用计数 badge。

当源块内容保存后，已有块引用和块嵌入会自动刷新到最新源内容。如果同一个 UUID 同时存在多个活动源块，插件会以“最近一次被修改的活动源块”为准，统一当前显示内容。

## 🧭 常用命令

### `((` 自动补全

输入：

```md
((
```

会打开块自动补全。选择结果或按 `Enter` 会插入 `((uuid))`；鼠标悬浮结果并点击 `Go to`，会清除当前 `((` 查询并直接跳到对应源块。

如果 Obsidian 已经自动补上结尾的 `))`，自动补全会按当前操作复用或删除这对括号，不会再生成重复括号。

它只支持已经建立“源块”的检索，这是出于长期性能考虑。

如果你要引用的位置还没有建立“源块”，可以先用 Obsidian 自带搜索找到对应位置，再按预期的大纲结构建立源块。

Obsidian 打开命令面板快捷键：
- `Ctrl/Cmd + P`

### `Copy current block reference`

把光标放在一个大纲块上，执行这个命令。

如果当前块还没有 `id:: uuid`，插件会自动补一个，然后把 `((uuid))` 复制到剪贴板。如果当前块已经有 `id:: uuid`，插件会复用已有 ID，不会重新生成。

你也可以在编辑器里对当前大纲块点右键，使用：
- `Copy block reference`

### `Copy current block embed`

把光标放在一个大纲块上，执行这个命令。

如果当前块还没有 `id:: uuid`，插件会自动补一个，然后把 `{{embed ((uuid))}}` 复制到剪贴板。如果当前块已经有 `id:: uuid`，插件会复用已有 ID，不会重新生成。

你也可以在编辑器里对当前大纲块点右键，使用：
- `Copy block embed`

### `Copy selection (UUID blocks as text)`

在 Markdown 编辑器里框选包含已渲染 UUID 块引用或块嵌入的内容，然后右键使用：
- `Copy selection (UUID blocks as text)`

这个操作会复制可读的 Markdown 文本，而不是框选区域里的 `((uuid))` 和 `{{embed ((uuid))}}` 源码：
- 块引用使用与 Live Preview 当前显示一致的摘要
- 独占一行的块嵌入会复制完整源块和子级大纲
- 块嵌入根节点始终只有一个 `- `，不会因为宿主行已经带列表符号而重复
- 框选区域里的普通 Markdown 保持不变
- 不完整 UUID 语法，以及行内代码或围栏代码块里的 UUID 样式文本保持不变

普通 `Ctrl/Cmd + C` 不会被修改，仍然复制原始 Markdown 源码。这个转换菜单只在编辑器存在单个非空框选，并且框选中包含完整 UUID 块语法时出现。

### `Rebuild block reference index`

适合这些情况：
- 你在 Obsidian 之外大量改动了 Markdown 文件
- 你看到部分引用显示成 `[missing block]`
- 你看到部分嵌入显示成 `Missing block`

### `Review missing source blocks`

适合这些情况：
- 源块已经丢失
- 但库里还有地方在引用它

审查窗口可以让你：
- 恢复到恢复页
- 确认删除
- 暂时忽略

默认恢复页：

`pages/Block Recovery.md`

## ⚙️ 属性隐藏设置

插件设置页新增了“隐藏 Logseq 风格属性行”的选项。对新安装用户默认开启，已经保存过设置的老用户会继续保留原来的开关状态。

你可以在：
- `设置 -> 第三方插件 -> Block Reference Enhancer`

里面调整这项功能。

规则说明：
- 设置框里使用 `\\` 作为多个规则之间的分隔符
- 笔记里 `hl:: value` 表示精确 key `hl`
- 笔记里 `hl-*:: value` 表示以 `hl-` 开头的前缀 key
- 在设置框里只填写 key 规则本身，例如 `collapsed\\id\\hl-*`

默认规则已包含常见属性，例如 id、collapsed、hl-*、ls-type。

这个功能会隐藏无序列表块下方匹配规则的属性键值显示，也会对渲染后的块嵌入内容应用相同规则，但不会修改 Markdown 原文。

当这个选项开启时，在 Live Preview 里对一个非空大纲块按 `Enter`：
- 如果当前块已经有直接子列表，会创建一个新的“第一个子块”
- 如果当前块还没有直接子列表，会创建一个新的同级块

无论哪种情况，隐藏属性行和软换行内容都会继续留在原父块下方，不会被迁移到新块里。

## 🧩 大纲强化

插件提供了独立的大纲强化设置：
- `设置 -> 第三方插件 -> Block Reference Enhancer -> 大纲强化 -> 将粘贴内容转换为大纲`

这个开关默认关闭。

开启后，在编辑器里对一个无序列表块点右键，包括空列表项，也会出现：
- `Paste clipboard as outline`
- `Copy current level and children`

它的行为边界是：
- 只有你显式点击这个右键菜单项时才会执行
- 只对无序列表块生效
- 像 `-` 或 `- ` 这样的空无序列表项也支持
- 不会拦截或改写普通 `Ctrl/Cmd + V`
- 当剪贴板里的 HTML 或纯文本结构足够可靠时，会把它转成子级大纲块
- 当网页或 ChatGPT 内容里出现“正文引出后续列表”的结构时，会更谨慎地恢复层级关系
- 会删除普通空白分隔行，保证生成的无序列表连续不中断
- 剪贴板里的空格缩进只用于识别原始层级；每一级新生成的子列表都会严格规范成一个 `Tab` 后跟 `- `
- fenced code block 内部的空行会保留，避免改变粘贴代码的内容
- `Copy current level and children` 会复制当前级和完整子树的原始 Markdown 文本
- 内容较大但仍在安全上限内时，只会询问 `Process` 或 `Cancel`；确认后按短时间片处理，并在右上角持续显示进度
- 开始处理前会记录原文件与大纲位置；即使处理中切换页面，结果仍写回原位置
- 如果处理中原目标被删除或无法唯一定位，会取消写入，不会误贴到其他位置
- 超过硬安全上限的内容会直接拒绝，且不会插入半成品

## 🔄 Logseq ↔ Obsidian 页头属性双写同步（实验性）

插件设置页提供了独立的实验功能区：
- `Logseq ↔ Obsidian page properties (Experimental)`
- 主开关 `Keep Logseq and Obsidian page properties in sync` 默认关闭

它可以让同一篇 Markdown 同时保留：

```md
---
aliases:
  - 示例别名
---

alias:: 示例别名
```

这个功能以白名单为唯一处理边界。默认规则只有：

```text
alias<->aliases
```

规则说明：
- 每行填写一条规则
- `alias<->aliases` 表示 Logseq 使用 `alias`，YAML 使用 `aliases`
- 单独填写 `tags` 表示两边都使用 `tags`
- 内置 alias 映射支持字符串列表；自定义规则只处理单行字符串
- `id`、`collapsed`、`created-at`、`updated-at` 等块级属性受到保护，不能加入同步
- 不在白名单里的 Logseq 和 YAML 属性不会被修改

使用方式：
- `Sync current file`：只处理当前 Markdown 文件
- `Selected folders`：每行填写一个库内相对文件夹，`.` 表示整个库
- `Scan and sync selected folders…`：先扫描并显示摘要，确认后才批量写入
- 批量任务可取消；已经改变的文件会保留，尚未处理的文件不会继续写入

当 YAML 和 Logseq 两侧都被修改且无法可靠判断先后顺序时，插件不会静默覆盖，而是要求逐个选择：
- `Use Obsidian YAML`
- `Use Logseq properties`
- `Skip`

如果 Logseq 把文件顶部的 YAML 错误转换成无序列表，主开关开启后，插件会在所选文件夹内对打开或修改的文件做严格检测。只有候选 YAML 可以安全解析、命中白名单且正文不会被改变时才自动修复；不确定的文件只会被跳过。

安全退出区提供 `Remove safe YAML and disable sync…`：
- 只有 YAML 的全部内容都已由等价 Logseq 页属性表达时才会删除 YAML
- 有 YAML 独有键、复杂值、解析错误或冲突的文件会保持不变并出现在报告中
- 操作后会关闭同步功能，并保留最近三次安全清理的恢复记录

这是会修改 Markdown 原文的实验功能。首次批量使用前应备份笔记库；首版不支持通配符、嵌套 YAML、自动保存时双向同步或强制删除不安全 YAML。

## 📦 首次启动与索引

这个插件会维护自己的一套块索引。它不是 Obsidian 自带搜索索引的一部分。

首次启动后，可以留意右下角状态栏里的 `块索引：...`。`一般设置 -> 显示块索引状态` 默认开启，只控制状态栏是否显示，不会停止后台索引。

常见状态包括：
- `loading cache...`：正在读取本地缓存
- `no cache found, building full index...`：没有缓存，正在做第一次完整建索引
- `cache outdated, rebuilding full index...`：缓存来自旧解析规则或旧格式，正在自动完整重建
- `cache loaded, checking vault changes...`：缓存已加载，正在核对库内文件变化
- `reconciling X/Y files ...`：正在把变更文件和缓存重新对齐
- `ready | F files | B blocks | R refs`：启动期索引已经完成

启动后的正常增删改重命名，通常会静默增量更新，不会一直弹提示。

源块文字内容的变化，在保存后也会走静默增量更新，不需要整库重建；同时也不会在你还在当前编辑器逐字输入时，强行把全库引用做成高成本实时联动。

当插件的解析能力升级，且旧缓存已经不再可靠时，插件会在首次启动自动判定缓存过期，并做一次完整重建；这时不需要手动删除 `data.json` 或先执行 `Rebuild block reference index`。

## 🛟 安全措施：源块丢失时会怎样

如果源块丢失了，但引用还在：
- 行内引用会继续显示最后缓存的摘要
- 块嵌入会继续显示最后缓存的内容
- 插件会把它标记为 stale 状态

恢复默认是写入恢复页，而不是自动尝试插回旧文件和旧行号。这样在大库里更稳，也更容易人工检查。

## 🔎 常见排查

如果你看到 `[missing block]` 或 `Missing block`：
- 先看状态栏是否已经进入 `Block index: ready`
- 执行一次 `Rebuild block reference index`
- 检查源块是否符合预期结构
- 如果源块确实被删了，用 `Review missing source blocks` 处理

如果你在插件关闭期间，用 Logseq、同步工具、git 或外部编辑器改动了很多文件，建议手动重建一次索引。

## 📐 解析规则

这个插件会比较严格地判断什么内容算“源块”。

通常需要同时满足：
- 源行本身是一个无序列表块，例如以 `- ` 开头；空的 `- ` 或裸 `-` 也可以作为源块
- 该块的缩进行里有 `id:: uuid`

`id::` 可以使用当前推荐的两空格 continuation 缩进，也可以继续使用历史上更宽的缩进。插件新建 UUID 时固定使用“列表项原有前导缩进 + 两个空格”。

这样设计是故意的。它能让 UUID 大纲笔记在大库里更可预测，避免把一些松散 Markdown 误识别成错误的源块。

## 🆘 获取帮助

如果你遇到问题：
- 先看 [SUPPORT.md](./SUPPORT.md)
- 先搜索现有 GitHub issues
- 可稳定复现的问题请使用 `Bug report` 模板
- 新功能建议请使用 `Feature request` 模板
- 提交时尽量附上插件版本、Obsidian 版本、模式、复现步骤、控制台报错和最小 Markdown 样本

## 🧩 推荐搭配插件

### 大纲 / 层级编辑

- 🔴 `Outliner`
  功能：增强列表、大纲、缩进、移动、层级编辑体验。
  用途：让 Obsidian 更接近 Logseq / Workflowy / Roam 一类大纲软件的操作手感。
  常用点：`Ctrl + Shift + 上/下` 可以移动大纲块；Logseq 里常见的是 `Alt + Shift + 上/下`。
- 🔴 `Zoom`
  功能：聚焦到某个标题或列表层级。
  用途：在长笔记里只看某一段或某一层级，减少干扰。

### 搜索 / 导航 / 快速定位

- 🔴 `Better Search Views`
  功能：增强搜索、反链和嵌入查询结果的显示方式。
  用途：让搜索结果更像大纲面包屑，便于看上下文。
- 🔴 `Recent Files`
  功能：显示最近打开的文件。
  用途：快速回到刚才编辑或查看过的笔记。

### 图片处理与图片阅读

- 🔴 `Image Converter`
  功能：处理图片粘贴、拖入、转换格式、压缩、重命名和链接格式。
  用途：把图片粘贴后的输出统一成更通用的格式，例如：

  ```md
  ![](../assets/xxx.png)
  ```

### 视觉化 / PDF 阅读

- 🔴 `PDF++`
  功能：增强 PDF 阅读、标注、引用和链接体验。
  用途：把 PDF 资料和 Obsidian 笔记更紧密地连接起来；设置得当时也更方便和 Logseq 协同使用。
- `Excalidraw`
  功能：在 Obsidian 里画图、白板、流程图和草图。
  用途：做结构图、思维图、流程图和视觉化笔记。

### 编辑与阅读体验增强

- 🔴 `Codeblock Customizer`
  功能：美化和增强代码块显示。
  用途：让大纲里的代码块、配置块和长文本块更好读。
- 🔴 `Toggle Readable line length`
  功能：快速切换 Obsidian 的可读行宽。
  用途：在“窄行阅读”和“大屏铺开编辑”之间快速切换。
  常用点：`Ctrl + Shift + E`
- `Simplified Chinese Word Splitting`
  功能：增强中文分词。
  用途：改善中文编辑时的光标移动、选词和删除体验。

### 标签管理

- 🔴 `Tag Wrangler`
  功能：重命名、合并和整理标签。
  用途：避免标签体系变乱，适合后期维护标签结构。
  常用点：可以从标签上右键继续管理对应标签页。

## ⚠️ 已知情况

- 这个插件是 UUID 块引用与块嵌入语法增强器，不是 Logseq 替代品
- 更推荐使用 Obsidian 默认主题或 Minimal；插件会持续维护对这两个主题的兼容性。其他主题不保证能正常显示或正常交互
- 在非常复杂的列表结构或高度定制主题下，Live Preview 仍可能有少量视觉差异
- 源块丢失时恢复策略默认写入恢复页，不会自动按原文件和原行号插回去
- **2026-07-03 — Obsidian 原生折叠问题：**该问题已在 [Obsidian 官方论坛提交](https://forum.obsidian.md/t/lists-folding-hides-content-outside-of-the-fold-when-switching-from-reading-to-edit-mode/103036)。使用 Obsidian 的“折叠所有标题和列表”后，特别是在阅读模式与实时预览之间切换时，部分列表内容可能继续被错误折叠。该问题在关闭全部第三方插件后仍可稳定复现，不是 Block Reference Enhancer 引起的。在 Obsidian 官方修复前，建议用户不要使用“折叠所有标题和列表”；如果已经发生，请执行“展开所有标题和列表”恢复被隐藏的内容。

## 🛠 开发

```bash
npm install
npm run build
```

构建产物：
- `main.js`
- `manifest.json`
- `styles.css`

社区审核兼容性：
- 不可见的 source-anchor widget 现在统一通过 CSS 类设置样式，不再使用内联 style 赋值
- 编辑器 DOM 命中判断优先复用跨窗口安全的 helper，用于右键定位和大纲贴入解析
- TypeScript 标准库声明升级为 ES2020，让社区审核能正确识别代码使用的现代内置 API 类型

发布说明：
- GitHub Release 需要上传 `main.js`、`manifest.json`、`styles.css`
- 面向 Obsidian 社区插件发布时，tag 建议直接使用精确版本号，例如 `1.1.3`
- 每次 GitHub Release 最好补上 release notes

## 🔒 隐私说明

- 插件完全在本地 Obsidian 环境运行
- 不会通过网络发送你的笔记、UUID 或索引数据
- 不包含遥测、广告或账号门槛
- 块索引缓存保存在 Obsidian 的插件数据目录里

## 🗺 路线图

后续方向包括：
- 打磨大纲交互方式：让回车、删除键等交互更贴近专业大纲软件的使用体验
- 在现有索引与缓存基础上继续扩展更多块工作流能力
