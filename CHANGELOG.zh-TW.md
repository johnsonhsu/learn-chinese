# Changelog

所有對本專案的显著更動都會記錄在此。

## [Unreleased]

### Added

- 新增免費主题：**90s Retro**（registry id：`retro`）。
- Retro 主题专用样式：书写画布、模块、字块适配。
- 闭合 issue 循环：合并后关联 issue 自动关闭，重复 task 扫描连接失败给出额外提示，并移除超过 21 天的重复项。

### Changed

- 文件和主题注册表同步更新，包含主题文件、说明以及架构说明。

### Fixed

- 在 CI artifacts checkout 重试有限次失败后给出明确错误，不再静默继续。
- 在 reconnect diagnostics 未发现成功连接历史时阻止重复任务继续修改对应 issue。
- 仅能在 runOnCompletion 设为 true 时标记重复任务为已完成。

## [0.8.0] - 2025-05-15

### Added

- PWA 离线支持及 Service Worker 预缓存。
- 支持头像的个人选择器。
- 本地备份与恢复。
- Copybook 模组及 Gemini Generate。

### Changed

- 将书写挑战重构为共享句库。
- 优化笔顺编辑器性能与体验。

## [0.7.0] - 2025-03-22

### Added

- 阅读导向模组首次公开预览。
- 新使用者引导流程。

### Fixed

- 练习模式笔顺校验边界条件。

[Unreleased]: https://github.com/johnsonhsu/learn-chinese/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/johnsonhsu/learn-chinese/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/johnsonhsu/learn-chinese/releases/tag/v0.7.0
