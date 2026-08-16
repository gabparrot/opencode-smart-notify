import type { Plugin } from "@opencode-ai/plugin"
import { spawnSync } from "node:child_process"

const SETTLE_MS = 250
const MAX_TRACKED = 256

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

export const OpencodeSmartNotify: Plugin = async ({ project, directory }) => {
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
      }, SETTLE_MS),
    )
  }

  return {
    event: async ({ event }) => {
      if (event.type === "permission.asked") {
        const props = event.properties as {
          id?: string
          permission?: string
          patterns?: string[]
        }
        if (!props.id) return
        const extra = props.patterns?.join(", ") ?? ""
        queue(props.id, [props.permission ?? "permission", extra].filter(Boolean).join(" "))
        return
      }

      if (event.type === "permission.updated") {
        const props = event.properties as { id?: string; type?: string; title?: string }
        if (!props.id) return
        queue(props.id, [props.type ?? "permission", props.title ?? ""].filter(Boolean).join(" "))
        return
      }

      if (event.type === "permission.replied") {
        const props = event.properties as { permissionID?: string; requestID?: string }
        const id = props.permissionID ?? props.requestID
        if (id) {
          cancel(id)
          replied.set(id, true)
          retract(id)
        }
        return
      }

      if (event.type === "session.error") {
        const props = event.properties as {
          error?: { name?: string; data?: { message?: string; name?: string } }
        }
        if (isAbortedError(props.error)) return
        const message = props.error?.data?.message ?? "An error occurred"
        send("opencode error", `${projectName}: ${message}`.slice(0, 240), "critical")
        return
      }

      if (event.type === "message.part.updated") {
        const part = (event.properties as { part?: { type?: string; tool?: string; id?: string; state?: { status?: string }; input?: { questions?: Array<{ question?: string }> } } }).part
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
