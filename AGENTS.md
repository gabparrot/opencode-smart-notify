# Agent instructions

## Context

This is an [OpenCode](https://opencode.ai) plugin. OpenCode still emits permission events when `--auto` or **Enable auto-approve permissions** is on. Other notifiers pop on every ask. This plugin waits a short settle window and only notifies if the request is still waiting.

Current state: Linux (`gdbus` / `notify-send`), macOS (`osascript`), Windows (inbox PowerShell toast). Published as `opencode-smart-notify` on npm. Configurable via `~/.config/opencode/opencode-smart-notify.json` or plugin tuple options. Unit tests via `bun test`. Default export is `{ id, server }`. Do not load it alongside `opencode-notify`.

Read [README.md](./README.md) for behavior and [ROADMAP.md](./ROADMAP.md) for ordered work. Follow the roadmap phase order. Do not skip a phase unless the next item says it can land in parallel.

## Goal

Notify only when a human still needs to look: pending permission, question, or real error. Stay silent when auto-approve, a prior reply, focus, or cancel already handled it. Retract a notification that is no longer relevant (replied or window focused).

v1 is Linux-correct, configurable, tested, then cross-platform, then npm. Action buttons, sounds, quiet hours, and custom command hooks are out of scope until after publish.

## Standards

- Match existing style: no comments unless asked, argv-form `spawn`/`spawnSync` (never a shell string), best-effort notify (never throw into OpenCode).
- Default export `{ id, server }`. Keep the public name `opencode-smart-notify`.
- Handle both v1 (`permission.updated`, `permissionID`) and v2 (`permission.asked`, `requestID`) events. Dedup the same request.
- Treat `MessageAbortedError` as cancel, not an error notification.
- Notification bodies can appear on a lock screen. Truncate. Do not put secrets, tokens, or raw command lines in popups when sanitization exists; until then, keep payloads short.
- Fail open: if focus or close-notification is unavailable, still notify rather than swallow events.
- Do not add extra events, action buttons, or npm publish until the matching roadmap phase.
- Do not commit unless the user asks.

## Verify

Run `bun run typecheck` and `bun test`. Manual check: with `--auto` on, a bash/edit ask must not leave a desktop popup; a real pending ask must notify; reply or focus must dismiss it.
