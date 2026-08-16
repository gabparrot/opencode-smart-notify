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

## Install

Add the plugin to `~/.config/opencode/opencode.json` or `opencode.jsonc`:

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

1. `permission.asked` / `permission.updated` starts a 250ms timer.
2. `permission.replied` cancels that timer and records the ID, so a reply that arrives first still suppresses the popup.
3. If the timer fires, the request is still waiting on you, so a notification is sent.

That covers `opencode --auto`, the TUI auto-approve toggle, and any other path that replies before you need to look.

## Requirements

- OpenCode
- `notify-send` on `PATH` (`libnotify-bin` on Debian/Ubuntu)

## License

[MIT](./LICENSE)
