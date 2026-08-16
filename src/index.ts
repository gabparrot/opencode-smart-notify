import type { Plugin } from "@opencode-ai/plugin"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export const SETTLE_MS = 250
const MAX_TRACKED = 256

export type Options = {
  settleMs: number
}

export const defaults: Options = {
  settleMs: SETTLE_MS,
}

export function parseOptions(raw: unknown): Partial<Options> {
  if (!raw || typeof raw !== "object") return {}
  const o = raw as Record<string, unknown>
  const out: Partial<Options> = {}
  if (typeof o.settleMs === "number" && Number.isFinite(o.settleMs) && o.settleMs >= 0) {
    out.settleMs = o.settleMs
  }
  return out
}

export function loadFileConfig(): Partial<Options> {
  try {
    const path = join(homedir(), ".config/opencode/opencode-smart-notify.json")
    return parseOptions(JSON.parse(readFileSync(path, "utf8")))
  } catch {
    return {}
  }
}

function createTracked<T>() {
  const items = new Map<string, T>()
  return {
    get(id: string) {
      return items.get(id)
    },
    has(id: string) {
      return items.has(id)
    },
    set(id: string, value: T) {
      if (items.has(id)) items.delete(id)
      items.set(id, value)
      while (items.size > MAX_TRACKED) {
        const oldest = items.keys().next().value
        if (oldest === undefined) break
        items.delete(oldest)
      }
    },
    delete(id: string) {
      items.delete(id)
    },
  }
}

function send(title: string, body: string, urgency = "normal"): number | undefined {
  const args = ["-u", urgency, "-a", "opencode", "-i", "dialog-information-symbolic", title, body]
  try {
    const printed = spawnSync("notify-send", ["-p", ...args], { encoding: "utf8", timeout: 5000 })
    if (!printed.error && printed.status === 0) {
      const parsed = Number.parseInt(printed.stdout?.trim() ?? "", 10)
      return Number.isFinite(parsed) ? parsed : undefined
    }
    spawnSync("notify-send", args, { stdio: "ignore", timeout: 5000 })
  } catch {
  }
}

function requestIds(props: { id?: string; permissionID?: string; requestID?: string }) {
  const ids = new Set<string>()
  if (props.id) ids.add(props.id)
  if (props.permissionID) ids.add(props.permissionID)
  if (props.requestID) ids.add(props.requestID)
  return [...ids]
}

function isAbortedError(error: { name?: string; data?: { name?: string } } | undefined) {
  return error?.name === "MessageAbortedError" || error?.data?.name === "MessageAbortedError"
}

function closeNotification(id: number) {
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
      const result = spawnSync(cmd, argv, { stdio: "ignore", timeout: 5000 })
      if (!result.error && result.status === 0) return
    } catch {
    }
  }
}

export const OpencodeSmartNotify: Plugin = async ({ project, directory }, options) => {
  const config = { ...defaults, ...loadFileConfig(), ...parseOptions(options) }
  const projectName =
    (project as { name?: string } | undefined)?.name ??
    (directory ? directory.split("/").filter(Boolean).pop() : null) ??
    "opencode"

  const pending = new Map<string, ReturnType<typeof setTimeout>>()
  const asked = createTracked<true>()
  const replied = createTracked<true>()
  const shown = createTracked<number>()

  function cancel(id: string) {
    const timer = pending.get(id)
    if (timer) clearTimeout(timer)
    pending.delete(id)
  }

  function retract(id: string) {
    const nid = shown.get(id)
    shown.delete(id)
    if (nid !== undefined) closeNotification(nid)
  }

  function queue(id: string, body: string) {
    if (replied.has(id) || asked.has(id)) return
    asked.set(id, true)
    cancel(id)
    pending.set(
      id,
      setTimeout(() => {
        pending.delete(id)
        if (replied.has(id)) return
        const nid = send("opencode request", `${projectName}: ${body}`.slice(0, 240), "critical")
        if (nid !== undefined) shown.set(id, nid)
      }, config.settleMs),
    )
  }

  return {
    event: async ({ event }) => {
      const type = (event as { type: string }).type
      const properties = (event as { properties?: unknown }).properties ?? {}

      if (type === "permission.asked") {
        const props = properties as {
          id?: string
          permissionID?: string
          requestID?: string
          permission?: string
          patterns?: string[]
        }
        const id = requestIds(props)[0]
        if (!id) return
        const extra = props.patterns?.join(", ") ?? ""
        queue(id, [props.permission ?? "permission", extra].filter(Boolean).join(" "))
        return
      }

      if (type === "permission.updated") {
        const props = properties as {
          id?: string
          permissionID?: string
          requestID?: string
          type?: string
          title?: string
        }
        const id = requestIds(props)[0]
        if (!id) return
        queue(id, [props.type ?? "permission", props.title ?? ""].filter(Boolean).join(" "))
        return
      }

      if (type === "permission.replied") {
        const props = properties as { id?: string; permissionID?: string; requestID?: string }
        for (const id of requestIds(props)) {
          cancel(id)
          replied.set(id, true)
          retract(id)
        }
        return
      }

      if (type === "session.error") {
        const props = properties as {
          error?: { name?: string; data?: { message?: string; name?: string } }
        }
        if (isAbortedError(props.error)) return
        const message = props.error?.data?.message ?? "An error occurred"
        send("opencode error", `${projectName}: ${message}`.slice(0, 240), "critical")
        return
      }

      if (type === "message.part.updated") {
        const part = (properties as { part?: { type?: string; tool?: string; id?: string; state?: { status?: string }; input?: { questions?: Array<{ question?: string }> } } }).part
        if (part?.type !== "tool") return
        if (part.tool?.toLowerCase() !== "askuserquestion") return
        if (part.state?.status !== "pending") return
        const id = part.id ?? "question"
        if (asked.has(id)) return
        asked.set(id, true)
        const question = part.input?.questions?.[0]?.question ?? "question"
        send("opencode question", `${projectName}: ${question}`.slice(0, 240), "critical")
      }
    },
  }
}

export default OpencodeSmartNotify
