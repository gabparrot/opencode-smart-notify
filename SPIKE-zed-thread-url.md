# Spike: open an existing Zed ACP thread from a URL

You are working in the **Zed** repo (`zed-industries/zed`), not this plugin. Spike the smallest Zed change that lets an external tool deep-link to an **already open / already imported** agent thread.

Do not publish. Do not redesign the agent panel. Prove the URL works, then stop.

## Why

`opencode-smart-notify` (Linux desktop notifications for OpenCode) can click-through to Zed. It knows the OpenCode/ACP `sessionId` (example: `ses_fe43bc70cffe6SAOgThHLLV2ju`).

Today Zed only accepts:

- `zed://agent` — opens the agent panel and **starts a new thread**
- `zed://agent?prompt=…` — same, plus seeds the composer

`zed://` / `zed://open` only focuses the app.

So the plugin **must not** send `zed://agent` on click. It currently sends `zed://` (focus only). We need Zed to grow a URL that **selects the existing thread** for that ACP session.

## Target URL (pick this shape unless you find an existing one)

```
zed://agent?session=<acp-session-id>
```

Optional extras if cheap:

```
zed://agent?session=<id>&agent=OpenCode
zed://agent/session/<id>
```

Keep `?prompt=` working. If both `session` and `prompt` are present, prefer `session` (open that thread; do not create a new one).

## What already exists in Zed

Read these before writing code.

| Piece | Where |
| --- | --- |
| URL parse | `crates/zed/src/zed/open_listener.rs` — `OpenRequest::parse`, `parse_agent_url`, `OpenRequestKind::AgentPanel` |
| Tests for current URLs | same file: `test_parse_agent_url`, `test_parse_agent_url_with_prompt`, trailing-slash / empty-prompt tests |
| Linux socket (what the plugin uses) | `listen_for_cli_connections` in that file — datagram to `$XDG_DATA_HOME/zed/zed-{channel}.sock` or Flatpak `~/.var/app/dev.zed.Zed/data/zed/zed-stable.sock` |
| Open existing thread by ACP session | `crates/agent_ui/src/agent_panel.rs` — `AgentPanel::open_thread(session_id, work_dirs, title, …)` |
| Open by Zed thread UUID | same file — `load_agent_thread(agent, thread_id, …)` |
| Session ↔ thread map | `crates/agent_ui/src/thread_metadata_store.rs` — `ThreadMetadata { thread_id, session_id, agent_id, … }`, `entry_by_session` |
| DB | `sidebar_threads` in the app db (`db/0-stable/db.sqlite`). `session_id` is the ACP/OpenCode id. |
| Click-to-thread (in-process only) | `crates/agent_ui/src/conversation_view.rs` — `AgentNotificationEvent::Accepted` calls `load_agent_thread` |

`open_thread` already does the right thing if a metadata row exists: look up `thread_id` via `entry_by_session`, then `load_agent_thread`. If there is no row it goes through `external_thread_by_session` (may spawn a new connection). For this spike, **only handle a session that already has a `sidebar_threads` row**. If missing: focus the agent panel and do **not** create a thread. Toast is fine.

## Required behavior

1. `zed zed://agent?session=ses_…` (or the equivalent datagram to `zed-stable.sock`) focuses the existing window.
2. Reveals / focuses the agent panel.
3. Switches to the thread whose `sidebar_threads.session_id` matches.
4. Does **not** create a new thread when the session is known.
5. Does **not** create a new thread when the session is unknown (focus panel or no-op + toast).
6. Bare `zed://agent` and `zed://agent?prompt=` stay as they are (new-thread / prompt paths).

## Suggested implementation

1. Extend `OpenRequestKind::AgentPanel` (or add a sibling kind) to carry `session_id: Option<String>` (and keep `external_source_prompt`).
2. In `parse_agent_url`, parse `session` from the query string. Ignore unknown keys.
3. Find `handle_open_request` / the `AgentPanel` open path (search `OpenRequestKind::AgentPanel`). When `session_id` is `Some`, resolve via `ThreadMetadataStore::entry_by_session` and call `load_agent_thread` / `open_thread`. When `None`, keep current behavior.
4. Add unit tests next to `test_parse_agent_url`:
   - `zed://agent?session=ses_abc` → kind has that session, no prompt
   - `zed://agent?prompt=hi` → unchanged
   - `zed://agent?session=ses_abc&prompt=hi` → session wins
5. If there is an existing agent-panel test harness, add one test: given a stored session row, opening the URL activates that thread and does not increment thread count.

## How to verify manually

1. In Zed, have at least two OpenCode ACP threads. Note the OpenCode session id (ACP logs, `dev: open acp logs`, or `sidebar_threads.session_id` in the db).
2. Focus some other thread (or another project).
3. From a terminal:

```sh
zed 'zed://agent?session=ses_YOUR_ID'
```

On Flatpak Linux, if the CLI cannot see the socket:

```sh
python3 -c 'import socket,sys;s=socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM);s.connect(sys.argv[1]);s.send(sys.argv[2].encode())' \
  "$HOME/.var/app/dev.zed.Zed/data/zed/zed-stable.sock" \
  'zed://agent?session=ses_YOUR_ID'
```

4. Pass: existing thread is selected, no new thread in the sidebar.
5. Also check `zed://agent` still creates a new thread (regression).

## Out of scope

- macOS/Windows notification backends
- Action buttons (Accept / Reject)
- Changing OpenCode or `opencode-smart-notify` (plugin will send `zed://agent?session=` once this lands)
- Importing a session that was never in Zed
- Creating worktrees / switching projects unless that is required to show the thread

## Return

In your final message only:

```
SPIKE
URL: <exact scheme you implemented>
Files: <paths>
Behavior: known session → … ; unknown session → … ; prompt-only → …
Tests: <what you ran>
Manual: <pass/fail + one line>
Risk: <one line>
```

If you discover Zed already has a hidden URL for this, use it and document it. Do not invent a second scheme.
