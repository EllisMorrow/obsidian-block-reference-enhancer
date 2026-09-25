# 1.3.30

## English

- Use the official npm registry for all 42 locked dependency download URLs instead of the mirror, improving dependency installation portability for source review.
- Keep dependency versions and integrity checks unchanged. No plugin functionality or minimum supported Obsidian version changes.
- The source-review preview for commit `8bdae07` completed without the previous dependency-installation error. Formal release review is separate.
- The built `main.js` is byte-for-byte identical to version 1.3.29, retaining its embedded-image styling fix.

## 简体中文

- 将锁文件中全部 42 个依赖下载地址从镜像源改为 npm 官方源，改善源码审核环境的依赖安装兼容性。
- 依赖版本、完整性校验值、插件功能和最低支持的 Obsidian 版本保持不变。
- 提交 `8bdae07` 的源码预览扫描已完成，之前的依赖安装错误不再出现；正式版本审核仍需单独完成。
- 构建后的 `main.js` 与 1.3.29 逐字节一致，保留上一版的嵌入图片样式修复。

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
