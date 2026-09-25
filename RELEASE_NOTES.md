# 1.3.29

## English

- Address the review's `obsidianmd/no-static-styles-assignment` error at four embedded-image styling sites using Obsidian's `setCssStyles()` helper.
- Preserve image sizing, aspect ratios, image matching, and block reference/embed interaction logic.
- Add regression coverage for embedded-image styles, including width-only, height-only, combined dimensions, and repeated image sources.
- Clarify in the documentation that remote images referenced in notes may generate network requests; block indexing and reference resolution remain local.

The minimum supported Obsidian version remains unchanged. This patch does not migrate the settings UI or change theme compatibility rules.

## 简体中文

- 将嵌入图片的四处静态样式赋值改为 Obsidian 的 `setCssStyles()`，修复审核报告中的 `obsidianmd/no-static-styles-assignment` 错误。
- 保留图片尺寸、宽高比、图片匹配以及块引用／块嵌入的交互逻辑。
- 新增图片样式回归测试，覆盖仅宽度、仅高度、宽高组合及重复图片来源。
- 补充网络行为说明：笔记中的远程图片可能产生网络请求，块索引和引用解析仍在本地进行。

最低支持的 Obsidian 版本保持不变。本次补丁不迁移设置界面，也不调整主题兼容规则。
