# Changelog

## Unreleased

- Notify when an agent finishes (`session.status` idle / `session.idle` → `opencode idle`)
- Stay silent on idle after ESC / `MessageAbortedError`, a real error, or an idle with no prior busy turn
- Do not retract or re-send an idle popup when title or background work sets the session busy
- Start the next idle turn on a new user message, not on generic busy
- Treat a new user message as a busy turn so idle still fires if `session.status` busy is missing
- Focus Zed on click under GNOME/Wayland: use the activation token, line-buffer `gdbus monitor`, and do not let `desktop-entry` swallow the click

## 0.2.0

- macOS Notification Center backend (`osascript`)
- Windows toast backend via inbox `powershell.exe` (Windows 10/11, no extra install)
- Shared notifier interface; Linux keeps `gdbus` / `notify-send`
- Resolve Windows directory paths when naming the project
- Clicking a notification focuses the running Zed window (`zed://`)
- Do not send `zed://agent` on click — that starts a new thread
- Optional `clickCommand` argv if you need a different click handler

## 0.1.2

- Document install, config options, and the 0.1.1 load fix

## 0.1.1

- Default-export a v1 `{ id, server }` module so OpenCode can load the plugin

## 0.1.0

- Notify only when a permission request is still pending after the settle window
- Retract an on-screen request popup when a reply arrives
- Ignore `MessageAbortedError` instead of treating cancel as an error
- Deduplicate v1 `permission.updated` and v2 `permission.asked` for the same request
- Configurable `settleMs`, notify flags, and urgency
- Linux `notify-send` backend
