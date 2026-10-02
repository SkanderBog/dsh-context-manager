# Changelog

## 0.1.4 — 2026-10-02

- Fix “Summarize older groups” skipping the newest eligible older exchange; with only one eligible exchange it previously selected nothing. The latest exchange remains protected by the host's group metadata.
- Clarify summary-model routing and remove misleading “selected model” text from the progress message.
- Add regression coverage for bulk selection and the summary request's route and compaction purpose. Allow the client suite to run against a packed release.
- Document complementary plugin approaches and distinguish tested behavior from future improvements.

## 0.1.3 — 2026-10-02

First public version, following local development builds.

- Live Context button, estimated usage breakdown, and `/context-manager` entry.
- Keep, summarize, or omit older balanced history groups, with separate handling of recorded tool/file outputs.
- Tool-free summaries exclude old reasoning; retained native messages keep their original reasoning and provider metadata.
- Exact replacement preview and review confirmation before applying standard Harness checkpoints.
- Guards for protected instructions and the latest exchange, running agents, stale or cancelled previews, persistence errors, and uncertain partial application.
- Twenty-six automated tests and a live model recall check; see [VALIDATION.md](VALIDATION.md).
