import { spawn as nodeSpawn, spawnSync } from "node:child_process"
import { activate, type ActivateTarget } from "./activate"

export type SpawnSyncFn = (
  command: string,
  args: string[],
  options?: { encoding?: BufferEncoding; stdio?: "ignore"; timeout?: number; env?: NodeJS.ProcessEnv },
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
  platform?: string
}

const ACTION_RE = /ActionInvoked \(uint32 (\d+),\s*['"]([^'"]*)['"]\)/g
const TOKEN_RE = /ActivationToken \(uint32 (\d+),\s*['"]([^'"]*)['"]\)/g
const WIN_APP_ID = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe"
const WIN_GROUP = "opencode-smart-notify"

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
  const platform = options.platform ?? process.platform
  if (platform === "darwin") return createDarwinNotifier(options)
  if (platform === "win32") return createWin32Notifier(options)
  return createLinuxNotifier(options)
}

function createLinuxNotifier(options: NotifierInput): Notifier {
  const spawn = options.spawn ?? spawnSync
  const watch = options.watch ?? nodeSpawn
  const clicks = new Map<number, string | undefined>()
  const tokens = new Map<number, string>()
  let watching = false

  function runActivate(sessionId?: string, activationToken?: string) {
    try {
      if (options.activate) {
        options.activate({ sessionId, clickCommand: options.clickCommand, activationToken })
        return
      }
      activate({ sessionId, clickCommand: options.clickCommand, activationToken }, spawn)
    } catch {
    }
  }

  function remember(id: number | undefined, extra?: SendExtra) {
    if (id === undefined) return
    clicks.set(id, extra?.sessionId)
    extra?.onId?.(id)
  }

  function fire(id: number) {
    if (!clicks.has(id)) return
    const sessionId = clicks.get(id)
    clicks.delete(id)
    const activationToken = tokens.get(id)
    tokens.delete(id)
    runActivate(sessionId, activationToken)
  }

  function consume(text: string) {
    TOKEN_RE.lastIndex = 0
    ACTION_RE.lastIndex = 0
    const ids = new Set<number>()
    let match: RegExpExecArray | null
    while ((match = TOKEN_RE.exec(text))) {
      const id = Number.parseInt(match[1] ?? "", 10)
      if (!Number.isFinite(id) || !clicks.has(id)) continue
      tokens.set(id, match[2] ?? "")
      ids.add(id)
    }
    while ((match = ACTION_RE.exec(text))) {
      const id = Number.parseInt(match[1] ?? "", 10)
      if (!Number.isFinite(id) || !clicks.has(id)) continue
      ids.add(id)
    }
    for (const id of ids) fire(id)
  }

  function takeWatch(command: string, args: string[], onError?: () => void) {
    try {
      const child = watch(command, args, { encoding: "utf8" })
      let dropped = false
      child.stdout?.on("data", (chunk) => consume(String(chunk)))
      child.on?.("error", () => {
        if (dropped) return
        dropped = true
        if (onError) onError()
        else watching = false
      })
      child.on?.("exit", () => {
        if (dropped) return
        watching = false
      })
      return true
    } catch {
      return false
    }
  }

  function ensureWatch() {
    if (watching) return
    watching = true
    const dest = ["monitor", "--session", "--dest", "org.freedesktop.Notifications"]
    const takeGdbus = () => {
      if (!takeWatch("gdbus", dest)) watching = false
    }
    if (!takeWatch("stdbuf", ["-oL", "gdbus", ...dest], takeGdbus)) takeGdbus()
  }

  return {
    send(title: string, body: string, urgency = "normal", extra?: SendExtra) {
      const hints = `{'urgency': <byte ${urgencyByte(urgency)}>}`
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
      tokens.delete(id)
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

function createDarwinNotifier(options: NotifierInput): Notifier {
  const spawn = options.spawn ?? spawnSync
  return {
    send(title: string, body: string) {
      const script = `display notification ${appleString(body)} with title ${appleString(title)}`
      try {
        spawn("osascript", ["-e", script], { stdio: "ignore", timeout: 5000 })
      } catch {
      }
      return undefined
    },
    close() {},
  }
}

function createWin32Notifier(options: NotifierInput): Notifier {
  const spawn = options.spawn ?? spawnSync
  let nextId = 1
  return {
    send(title: string, body: string, _urgency?: string, extra?: SendExtra) {
      const id = nextId++
      const tag = `${WIN_GROUP}-${id}`
      try {
        const result = spawn("powershell.exe", winArgs(winShowScript(title, body, tag)), {
          stdio: "ignore",
          timeout: 8000,
        })
        if (!result.error && result.status === 0) {
          extra?.onId?.(id)
          return id
        }
      } catch {
      }
    },
    close(id: number) {
      try {
        spawn("powershell.exe", winArgs(winCloseScript(`${WIN_GROUP}-${id}`)), { stdio: "ignore", timeout: 8000 })
      } catch {
      }
    },
  }
}

function appleString(value: string): string {
  const flat = value.replace(/[\r\n]+/g, " ")
  return `"${flat.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function psSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function encodePs(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64")
}

function winArgs(script: string): string[] {
  return ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodePs(script)]
}

function winShowScript(title: string, body: string, tag: string): string {
  const xml = `<toast><visual><binding template="ToastGeneric"><text>${xmlEscape(title)}</text><text>${xmlEscape(body)}</text></binding></visual></toast>`
  return [
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null",
    "$xml = New-Object Windows.Data.Xml.Dom.XmlDocument",
    `$xml.LoadXml(${psSingleQuote(xml)})`,
    "$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)",
    `$toast.Tag = ${psSingleQuote(tag)}`,
    `$toast.Group = ${psSingleQuote(WIN_GROUP)}`,
    `$app = ${psSingleQuote(WIN_APP_ID)}`,
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show($toast)",
  ].join("; ")
}

function winCloseScript(tag: string): string {
  return [
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
    `$app = ${psSingleQuote(WIN_APP_ID)}`,
    `[Windows.UI.Notifications.ToastNotificationManager]::History.Remove(${psSingleQuote(tag)}, ${psSingleQuote(WIN_GROUP)}, $app)`,
  ].join("; ")
}
