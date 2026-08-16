# Changelog

## 0.1.0

- Notify only when a permission request is still pending after the settle window
- Retract an on-screen request popup when a reply arrives
- Ignore `MessageAbortedError` instead of treating cancel as an error
- Deduplicate v1 `permission.updated` and v2 `permission.asked` for the same request
- Configurable `settleMs`, notify flags, and urgency
- Linux `notify-send` backend
