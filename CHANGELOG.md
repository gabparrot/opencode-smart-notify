# Changelog

## Unreleased

- Clicking a notification opens the Zed agent panel for that session (`zed://agent?session=…`), and falls back to launching `zed`
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
