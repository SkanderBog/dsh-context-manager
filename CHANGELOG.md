# Changelog

## Unreleased

- Separate the local context estimate, last reported model input/output, and preview-generation usage, with explicit unknown and partial-reporting states.
- Read the current conversation's optional `acp_status` tool through Harness's tool and permission pipeline, on demand.
- Inspect paginated compression records and their original visible messages without changing model context; show attribution, checkpoint state, and truncation.
- Preserve explicit reviewed decisions, rejected approaches, risks, and next steps verbatim across later Context Manager summaries and session reloads.
- Label reasoning-bearing groups and retain native reasoning exclusion; validate note limits before any paid summary request.
- Show selected history token totals and whether a preview will call the model; reuse the number formatter across panel renders.
- Focus the review control when a preview is ready and prevent duplicate summary requests until the preview is discarded or the selection changes.
- Remove expired previews and discard late responses to cancelled previews before they can be applied.
- Keep footer actions visible on narrow screens by scrolling the panel body within the dialog's available height.

## 0.1.5

- Preserve adapted-code attribution in `NOTICE.md`, a text artifact recognized by the Store scanner.

- Recheck preview identity and expiry after the initial persistence wait so discarded or expired previews cannot change context.
- Add explicit Store compatibility and permission documentation and a DSH 0.2.1-alpha.2 test lane.

- Validate every selected summary range before the first model request, avoiding wasted requests when a later range is oversized.
- Test packed artifacts on Linux, macOS and Windows, with Node 22/24 and an additional Harness 0.2.1-alpha.1 lane.


- Test the exact packed host and browser entries in CI and reject unexpected release files.
- Keep the MIT license text canonical and move adapted-code attribution into the packaged `NOTICE.md` file.

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
