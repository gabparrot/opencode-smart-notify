# Roadmap

Work is ordered so later items can rely on earlier ones. Do not skip a phase unless the next item explicitly says it can land in parallel.

## 1. Fix the core heuristic

The settle window is the product. Make it correct before adding surface area.

- [x] Track replied IDs, not only pending timers, so a `permission.replied` that arrives before `permission.asked` / `permission.updated` still suppresses the popup
- [x] Retract a request notification that is already on screen when `permission.replied` fires (replace-id / CloseNotification — not just cancel the timer)
- [x] Ignore `MessageAbortedError` (ESC / user cancel) instead of treating it as `opencode error`
- [x] Bound or expire the `asked` set so long sessions do not leak memory
- [x] Deduplicate v1 `permission.updated` and v2 `permission.asked` when both fire for the same request
- [x] Make `SETTLE_MS` a named, documented constant (config comes in phase 3)

## 2. Make the repo a real package

Needed before tests, npm, or a public GitHub page.

- [x] Add `tsconfig.json` and `@opencode-ai/plugin` as a devDependency so the plugin typechecks
- [x] Fill `package.json`: `repository`, `bugs`, `homepage`, `engines`, `exports`
- [x] Decide the publish shape: ship TypeScript (OpenCode/Bun) or a built `dist/` — pick one and set `main` / `opencode.entry` accordingly
- [x] Add npm install instructions to the README (`"plugin": ["opencode-smart-notify"]`)
- [x] Initial commit

## 3. Config

Everything after this should read from one options object instead of more hardcoding.

- [x] Load `~/.config/opencode/opencode-smart-notify.json` with defaults
- [x] Support plugin tuple options in `opencode.json` (`["opencode-smart-notify", { ... }]`)
- [ ] First knobs: `settleMs`, `notifyRequests`, `notifyQuestions`, `notifyErrors`, `notifyIdle`, `urgency`

## 4. Tests

Lock the heuristic before platforms and extra events multiply cases.

- [x] Unit-test settle / cancel / replied-before-asked / abort-as-non-error / dedup
- [x] Fake `notify-send` (do not require a desktop session)
- [ ] CI: typecheck + tests on push

## 5. Feature-complete on Linux

Parity with what people expect from a notify plugin, still Linux-only.

- [ ] Session done / idle notification (the “look back” signal)
- [ ] Optional suppress-when-focused (fail open if focus cannot be detected)
- [ ] Close an already-shown notification when the OpenCode terminal becomes focused or the prompt is no longer waiting
- [ ] Skip or separately gate subagent / child-session events
- [ ] Sanitize notification bodies (truncate, strip likely secrets) so lock-screen / notification history leak less
- [ ] Use `spawn` instead of `spawnSync` so the event hook does not block
- [ ] Stop marking every event `critical`; map urgency per event type

## 6. Cross-platform

Only after Linux behavior and config are stable.

- [ ] macOS backend (Notification Center / `osascript`)
- [ ] Windows backend (toast / PowerShell)
- [ ] Shared notifier interface; `notify-send` becomes the Linux adapter
- [ ] README setup per OS; drop “Linux only”

## 7. Publish

- [ ] `npm publish` as `opencode-smart-notify`
- [ ] Pin a version in the README (avoid `@latest` cache confusion)
- [ ] Optional: PR onto the OpenCode ecosystem plugin list
- [ ] Changelog / GitHub releases

## Out of scope for v1

Action buttons (Accept / Always / Reject), sounds, quiet hours, and custom command hooks. Revisit after phase 7 if the core plugin is actually used.
