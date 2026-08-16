# opencode-smart-notify

Desktop notifications for [OpenCode](https://opencode.ai) that stay quiet when auto-approve already handled the request.

`--auto` and **Enable auto-approve permissions** still emit permission events. Other notifiers pop on every ask. This plugin waits a short settle window and cancels the popup if OpenCode already replied.

## What it notifies

| Event | Notification |
| --- | --- |
| Permission request that is still pending | `opencode request` |
| Auto-approved / already-replied request | none |
| User question (`askuserquestion`) | `opencode question` |
| Session error | `opencode error` |

Uses `notify-send` (libnotify). Linux only for now.

The package ships TypeScript. OpenCode loads it with Bun; there is no `dist/` build.

## Install

From npm, add the plugin to `~/.config/opencode/opencode.json` or `opencode.jsonc`:

```jsonc
{
  "plugin": ["opencode-smart-notify"]
}
```

For a local checkout, use a `file://` path:

```jsonc
{
  "plugin": [
    "file:///absolute/path/to/opencode-smart-notify/src/index.ts"
  ]
}
```

Or copy / symlink `src/index.ts` into `~/.config/opencode/plugins/` — files there load automatically.

Restart OpenCode after changing plugin config.

Do not run this alongside `opencode-notify` or you will get duplicate popups.

## How it works

1. `permission.asked` / `permission.updated` starts a `SETTLE_MS` (250ms) timer. Both events are treated as the same request when they share an ID.
2. `permission.replied` cancels that timer, records the ID (so a late ask is still suppressed), and retracts a popup already on screen.
3. If the timer fires, the request is still waiting on you, so a notification is sent.
4. `MessageAbortedError` (ESC / cancel) is ignored. It is not an `opencode error` popup.

That covers `opencode --auto`, the TUI auto-approve toggle, and any other path that replies before you need to look.

## Config

Optional `~/.config/opencode/opencode-smart-notify.json`:

```json
{
  "settleMs": 250
}
```

## Requirements

- OpenCode
- `notify-send` on `PATH` (`libnotify-bin` on Debian/Ubuntu)

## License

[MIT](./LICENSE)
