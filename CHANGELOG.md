# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- New free theme: **90s Retro** (registry id: `retro`) in the theme picker.
- Retro-specific styling for the writing canvas, modules, and tiles.
- Recurring task + issue automation: close stale linked issues after merges, track loopback failures, and remove dated items.

### Changed

- Living docs updated to include retro theme coverage in `themes.ts`, `README.md`, and `ARCHITECTURE.md`.

### Fixed

- Resolve stale payloads during CI artifacts checkout by retrying limited checkout attempts.
- Block loopback issue task updates when reconnect diagnostics indicate no successful scan history.
- Only mark recurring tasks complete when `runOnCompletion` is active.

## [0.8.0] - 2025-05-15

### Added

- PWA offline support and service worker caching.
- New profile picker with avatar support.
- Local backup and restore in Settings.
- Copybook module with optional Gemini Generate.

### Changed

- Refactor writing challenge to use shared sentence bank.
- Improve stroke editor performance and UX.

## [0.7.0] - 2025-03-22

### Added

- Initial public preview of read-focused modules.
- New onboarding flow for first-time learners.

### Fixed

- Stroke validation edge cases in practice mode.

[Unreleased]: https://github.com/johnsonhsu/learn-chinese/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/johnsonhsu/learn-chinese/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/johnsonhsu/learn-chinese/releases/tag/v0.7.0
