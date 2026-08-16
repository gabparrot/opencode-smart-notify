# opencode-smart-notify

Desktop notifications for [OpenCode](https://opencode.ai) that stay quiet when auto-approve already handled the request.

`--auto` and **Enable auto-approve permissions** still emit permission events. Other notifiers pop on every ask. This plugin waits a short settle window and only notifies if the request is still waiting.

[npm](https://www.npmjs.com/package/opencode-smart-notify) · [changelog](./CHANGELOG.md)

Linux only (`notify-send`). Use **0.1.1 or later** — 0.1.0 does not load.

## What it notifies

| Event | Notification |
| --- | --- |
| Permission request still pending after the settle window | `opencode request` |
| Auto-approved / already-replied request | none |
| User question (`askuserquestion`) | `opencode question` |
| Session error | `opencode error` |
| ESC / `MessageAbortedError` | none |

A request popup already on screen is retracted when `permission.replied` arrives.

The package ships TypeScript. OpenCode loads it with Bun; there is no `dist/` build.

## Install

### npm

Add the plugin to `~/.config/opencode/opencode.json` or `opencode.jsonc`:

See the npm install example above for tuple options.

OpenCode installs it from the [npm registry](https://www.npmjs.com/package/opencode-smart-notify) on startup.

With options:

```jsonc
{
  "plugin": [["opencode-smart-notify@0.1.2", { "notifyErrors": false }]]
}
```

Restart OpenCode after changing plugin config.

Do not run this alongside `opencode-notify` or you will get duplicate popups.

### GitHub

```jsonc
{
  "plugin": ["github:gabparrot/opencode-smart-notify#v0.1.2"]
}
```

Local checkout:

```jsonc
{
  "plugin": ["file:///absolute/path/to/opencode-smart-notify/src/index.ts"]
}
```

Do not copy only `src/index.ts` into `~/.config/opencode/plugins/` — the plugin is several files.

## How it works

1. `permission.asked` / `permission.updated` starts a 250ms settle timer. Both events are the same request when they share an ID.
2. `permission.replied` cancels that timer, records the ID (so a late ask stays silent), and retracts a popup already on screen.
3. If the timer fires, the request is still waiting on you, so a notification is sent.
4. `MessageAbortedError` is ignored. It is not an `opencode error` popup.

That covers `opencode --auto`, the TUI auto-approve toggle, and any other path that replies before you need to look.

## Config

Optional `~/.config/opencode/opencode-smart-notify.json`. Plugin tuple options in `opencode.json` override the file.

| Option | Default | Meaning |
| --- | --- | --- |
| `settleMs` | `250` | Wait this long before a permission popup |
| `notifyRequests` | `true` | Permission requests |
| `notifyQuestions` | `true` | `askuserquestion` |
| `notifyErrors` | `true` | Session errors (not cancel) |
| `notifyIdle` | `true` | Reserved for session-idle notifications |
| `urgency` | `"critical"` | `low`, `normal`, or `critical` |

```jsonc
{
  "plugin": [["opencode-smart-notify@0.1.2", { "notifyErrors": false }]]
}
```

## Requirements

- OpenCode
- `notify-send` on `PATH` (`libnotify-bin` on Debian/Ubuntu)

## License

[MIT](./LICENSE)
