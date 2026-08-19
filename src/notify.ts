import { spawn as nodeSpawn, spawnSync } from "node:child_process"
import { activate, type ActivateTarget } from "./activate"

export type SpawnSyncFn = (
  command: string,
  args: string[],
  options?: { encoding?: BufferEncoding; stdio?: "ignore"; timeout?: number },
) => { status?: number | null; error?: Error; stdout?: string | Buffer }

export type SpawnFn = (
  command: string,
  args: string[],
  options?: { encoding?: BufferEncoding },
) => {
  stdout?: { on(event: "data", cb: (chunk: string | Buffer) => void): void }
  on?(event: "error" | "exit", cb: (...args: unknown[]) => void): void
  kill?(): void
}

export type SendExtra = {
  sessionId?: string
  onId?: (id: number) => void
}

export type Notifier = {
  send(title: string, body: string, urgency?: string, extra?: SendExtra): number | undefined
  close(id: number): void
}

export type NotifierInput = {
  spawn?: SpawnSyncFn
  watch?: SpawnFn
  activate?: (target: ActivateTarget) => void
  clickCommand?: string[]
}

const ACTION_RE = /ActionInvoked \(uint32 (\d+),\s*'([^']*)'\)/g

function gvariantString(value: string) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
}

function urgencyByte(urgency: string) {
  if (urgency === "low") return 0
  if (urgency === "critical") return 2
  return 1
}

function parseNotifyId(stdout: string | Buffer | undefined) {
  const text = String(stdout ?? "").trim()
  const gdbus = text.match(/uint32\s+(\d+)/)
  const raw = gdbus?.[1] ?? text
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function createNotifier(input: NotifierInput | SpawnSyncFn = {}): Notifier {
  const options: NotifierInput = typeof input === "function" ? { spawn: input } : input
  const spawn = options.spawn ?? spawnSync
  const watch = options.watch ?? nodeSpawn
  const clicks = new Map<number, string | undefined>()
  let watching = false

  function runActivate(sessionId?: string) {
    try {
      if (options.activate) {
        options.activate({ sessionId, clickCommand: options.clickCommand })
        return
      }
      activate({ sessionId, clickCommand: options.clickCommand }, spawn)
    } catch {
    }
  }

  function remember(id: number | undefined, extra?: SendExtra) {
    if (id === undefined) return
    clicks.set(id, extra?.sessionId)
    extra?.onId?.(id)
  }

  function ensureWatch() {
    if (watching) return
    watching = true
    try {
      const child = watch("gdbus", ["monitor", "--session", "--dest", "org.freedesktop.Notifications"], {
        encoding: "utf8",
      })
      child.stdout?.on("data", (chunk) => {
        const text = String(chunk)
        ACTION_RE.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = ACTION_RE.exec(text))) {
          const id = Number.parseInt(match[1] ?? "", 10)
          if (!Number.isFinite(id) || !clicks.has(id)) continue
          const sessionId = clicks.get(id)
          clicks.delete(id)
          runActivate(sessionId)
        }
      })
      child.on?.("error", () => {})
    } catch {
    }
  }

  return {
    send(title: string, body: string, urgency = "normal", extra?: SendExtra) {
      const hints = `{'urgency': <byte ${urgencyByte(urgency)}>, 'desktop-entry': <'dev.zed.Zed'>}`
      try {
        ensureWatch()
        const printed = spawn(
          "gdbus",
          [
            "call",
            "--session",
            "--dest",
            "org.freedesktop.Notifications",
            "--object-path",
            "/org/freedesktop/Notifications",
            "--method",
            "org.freedesktop.Notifications.Notify",
            "opencode",
            "0",
            "dialog-information-symbolic",
            gvariantString(title),
            gvariantString(body),
            "['default', 'Open']",
            hints,
            "0",
          ],
          { encoding: "utf8", timeout: 5000 },
        )
        if (!printed.error && printed.status === 0) {
          const id = parseNotifyId(printed.stdout)
          remember(id, extra)
          if (id !== undefined) return id
        }
      } catch {
      }
      const args = [
        "-u",
        urgency,
        "-a",
        "opencode",
        "-i",
        "dialog-information-symbolic",
        "-h",
        "string:desktop-entry:dev.zed.Zed",
        title,
        body,
      ]
      try {
        const printed = spawn("notify-send", ["-p", ...args], { encoding: "utf8", timeout: 5000 })
        if (!printed.error && printed.status === 0) {
          const id = parseNotifyId(printed.stdout)
          remember(id, extra)
          return id
        }
        spawn("notify-send", args, { stdio: "ignore", timeout: 5000 })
      } catch {
      }
    },
    close(id: number) {
      clicks.delete(id)
      const attempts: Array<[string, string[]]> = [
        [
          "gdbus",
          [
            "call",
            "--session",
            "--dest",
            "org.freedesktop.Notifications",
            "--object-path",
            "/org/freedesktop/Notifications",
            "--method",
            "org.freedesktop.Notifications.CloseNotification",
            String(id),
          ],
        ],
        [
          "busctl",
          [
            "--user",
            "call",
            "org.freedesktop.Notifications",
            "/org/freedesktop/Notifications",
            "org.freedesktop.Notifications",
            "CloseNotification",
            "u",
            String(id),
          ],
        ],
      ]
      for (const [cmd, argv] of attempts) {
        try {
          const result = spawn(cmd, argv, { stdio: "ignore", timeout: 5000 })
          if (!result.error && result.status === 0) return
        } catch {
        }
      }
    },
  }
}
