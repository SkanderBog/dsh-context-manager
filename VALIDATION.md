# Validation — 0.1.4

## Isolated update validation

Version 0.1.4 was tested on 2026-10-02 in a separate checkout with Node.js 22.23.2 and Harness 0.2.0-rc.2. The active desktop, its profile, and the linked installed plugin were left untouched.

- The new browser regression first failed against 0.1.3: with exactly one eligible older exchange, “Summarize older groups” left it set to Keep. It passes after removing the extra exclusion; the locked latest exchange still stays Keep, and “Keep all” resets the selection.
- All **26 tests** passed against the rebuilt host entry and browser source.
- All **26 tests** also passed against the host and browser files extracted from `dsh-context-manager-0.1.4.tgz`, with dependencies from a separate clean installation.
- Summary request coverage now checks the last routed provider/model, rather than an unsent composer selection, and the `compaction` purpose recognized by host routing middleware. Third-party routing plugins were source-reviewed; live interoperability was not tested.

The following live desktop observations belong to the earlier 0.1.3 release. No new desktop installation, restart, or live model test was performed for 0.1.4.

## Previous 0.1.3 validation

Verified on 2026-10-02 with Node.js 22.23.2 and DeepSeek Harness 0.2.0-rc.2.

## Automated checks

A fresh dependency installation passed all **26 tests**, exercising the compiled host entry plus the browser client. Tests use real Harness Session, AgentLoop, command, projection, invariant, token-meter, and JSONL persistence implementations, with a controlled model response.

Coverage includes balanced tool exchanges, preserved reasoning signatures, protected latest exchanges and Harness instruction snapshots, selective and repeated compaction, preview cancellation and expiry, stale-session rejection, empty/truncated/oversized summaries, persistence failures, partial commit reporting, and replay without this plugin. Browser checks cover controls, review confirmation, stale/failed application, and successful refresh.

## Live desktop check

The plugin loaded in the community Linux desktop using its standard Harness plugin interface. A disposable synthetic conversation used DeepSeek-V41-Flash with High reasoning. Only this test conversation was compacted.

1. The Context button displayed the live percentage. The panel correctly protected system instructions, runtime context, skill catalogs, and the latest exchange.
2. One deliberately repetitive older user message was summarized. Its estimated size fell from **2,017 to 238 tokens**; total context fell from **19,968 to 18,189 tokens**. The exact checkpoint was reviewed before Apply.
3. The next model reply correctly recalled all three test facts: project **LANTERN**, reference **420**, and next step **draw a blue square**. It did not perform the fictional action.
4. The original message remained visible in chat and present in the persisted log. A read-only check of that log confirmed the standard compaction start, summary, checkpoint, and end events.
5. The context and existing PDF plugins both survived a desktop restart when installed from permanent project folders. Their local dependencies were resolved against the installed Harness runtime.

## Installation finding and limits

This desktop build incorrectly treats local archive dependencies as missing directories and removes them on startup. The linked-folder workaround is documented in README. Updating an installed module can also require restarting Harness; toggling the component alone did not clear the old module cache in this installation.

This is a small functional test, not a general benchmark of model summary quality. Token estimates are approximate. Native Windows and macOS desktops were not tested. The plugin targets DeepSeek Harness, not the separate consumer DeepSeek chat app. Keep is per operation; permanent pinning and one-click undo are not implemented.
