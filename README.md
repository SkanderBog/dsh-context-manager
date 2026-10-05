# DSH Context Manager

A standalone plugin for DeepSeek Harness 0.2.0-rc.2 or later. Adds a **Context** button beside the conversation title, plus `/context-manager` in the command menu. No desktop source changes, extra background server, or model tool is required.

## Use

1. Open **Context** in an existing conversation.
2. Inspect estimated context usage and its composition: instructions, user messages, answers, stored reasoning, tool/file outputs, tool definitions, and attachment references.
3. Choose **Keep**, **Summarize**, or **Omit** for older history groups. The latest exchange, system/developer instructions, Harness instruction/catalog/runtime snapshots, and incomplete tool exchanges are protected.
4. Choose whether summaries should summarize, retain the original text of, or omit recorded tool/file outputs.
5. Generate a preview. Review the exact replacement text and estimated token change, check the review box, and apply.

Summary requests start with the conversation's most recently routed model and may incur normal model usage. A host plugin can reroute requests marked `purpose: 'compaction'` to a dedicated summarizer. Changing an unsent composer selection alone does not set the summary model. An omission-only preview does not call the model. A preview makes no change to active context. It expires after ten minutes, a new preview, plugin reload, or a change to the conversation. Apply is permitted only while the agent is idle.

**Keep applies to this operation. It is not a permanent pin against Harness's automatic compaction.** Existing automatic compaction is left in place.

## Why balanced history groups?

Model adapters can require reasoning signatures and complete tool-call/result pairs when replaying previous assistant messages. Removing only reasoning from those native messages can invalidate the conversation. This plugin keeps selected exchanges intact or replaces entire balanced ranges with ordinary text checkpoints. It never edits the reasoning or provider metadata of retained messages.

Summary input is a fresh, tool-free text transcript. It excludes reasoning, labels document content as data, and asks the model to preserve goals, decisions, constraints, verified results, paths, and unresolved work. As with any model summary, details may be lost or misrepresented: review the preview before applying.

## Files, PDFs, images, and original history

- Tool output includes text returned by file readers, PDF plugins, terminal commands, and other tools. The output option applies to all recorded tool output; it does not infer which text came from a PDF.
- “Keep original text” retains the recorded output text inside the checkpoint. It does not reread the file or retain image pixels.
- Attached images are not visually summarized. Keep the containing group to retain the original attachment.
- Files on disk are never changed or deleted by this plugin.
- Original messages remain in Harness's append-only log and chat transcript. Compaction changes the model's active context, not the original transcript. There is no one-click undo in this version.
- Checkpoints use standard Harness events and continue to work after the plugin is uninstalled.

The context total uses Harness's token meter. Category estimates use its fixed text heuristic and do not necessarily sum to the total. CJK text, tool schemas, image pricing, provider accounting, and framing can differ. The header percentage follows Harness's existing live context projection; it is absent before the model reports enough information. The panel still shows estimates when the context limit is unavailable.

## Install a packaged release

```sh
dsh plugin --profile tauri add /absolute/path/dsh-context-manager-0.1.4.tgz
```

Use your actual Harness profile name. The community Linux desktop uses `tauri` on the tested installation. Other Harness desktop distributions may use `desktop`; quit that desktop before changing its reserved profile. Restart Harness after updating the plugin: reloading the frontend or toggling a component can leave the previously imported host module cached.

Some community desktop builds incorrectly remove local `.tgz` installs during startup, treating the archive as a missing directory. On those builds, keep this project in a permanent folder, run `npm ci` and `npm run build` there, then install the folder with `dsh plugin --profile tauri add /absolute/path/dsh-context-manager`. Keep the folder while the plugin is installed. This workaround requires no desktop source changes.

This targets **DeepSeek Harness's plugin runtime**, not the separate DeepSeek consumer chat app. The host and browser APIs are standard Harness APIs. The tested host is Harness **0.2.0-rc.2** inside the community Linux desktop; another official desktop build must supply the same APIs. No claim of native macOS or Windows desktop testing is made.

## Development and validation

Requires Node.js 22.19+ and the matching Harness packages. The plugin has no additional production dependency beyond host-supplied peer packages. Browser React is supplied by Harness. The host entry is bundled into one small module so plugin updates reload its helpers together.

```sh
npm ci
npm run check
npm run test:package
npm pack
```

Tests use Harness's real Session, token meter, compaction invariant companion, AgentLoop, command registry, and JSONL persistence with synthetic history and a controlled model. They cover retained reasoning, balanced tool pairs, selective ranges, read-only preview, cancellation, stale plans, save failures, and replay without the plugin. The package check validates the archive's exact public file list and reruns the host and browser suites against its extracted entries. They do not measure the quality of a real model's summary.

Control commands use Harness's existing authenticated command route. Their records stay outside model context. While installed, the plugin hides inspection/preview payloads from ordinary chat cards and displays a short successful-compaction record. Original control records remain in the session log.

## Failure handling

Apply checks persistence before changing context and flushes again afterward. A final disk error is reported as **changed in memory, saving failed**. A multi-range append failure reports how many ranges were applied. The preview is consumed once committing starts so an uncertain operation is never automatically retried. Refresh and inspect the current session after such an error.

## Related plugins and improvement directions

Source review on 2026-10-02 identified useful complementary approaches:

- [dsh-auxiliary](https://github.com/dsh-plugins/dsh-auxiliary/blob/main/src/compact-router.ts) routes `purpose: 'compaction'` requests to a separate model. This plugin already marks summary calls that way; its automated tests check the marker and original route. Live interoperability with that router has not been tested.
- [Context Compression Selector](https://github.com/WilliamShi666/dsh-context-compression-selector) offers automatic tool-output reduction and model-specific token accounting. Its explicit distinction between tokenizer counts, estimates, and unavailable counts is a useful direction for improving this panel's approximate breakdown. No tokenizer or reducer from that project is bundled here.
- [dsh-context-management](https://github.com/overact/dsh-context-management) provides history recall and session notes alongside automatic compaction. Read-only retrieval of original messages would be a useful future addition here; retaining the log does not currently give the model a recall tool.

These are separate capabilities, not a tested compatibility matrix. This plugin remains a manual, reviewed compaction interface. Automatic policy, precise provider accounting, permanent pins, history recall tools, and undo remain future work.
