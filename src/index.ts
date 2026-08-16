import type { Plugin } from "@opencode-ai/plugin"
import { spawnSync } from "node:child_process"

const SETTLE_MS = 250

function send(title: string, body: string, urgency = "normal") {
  try {
    spawnSync(
      "notify-send",
      ["-u", urgency, "-a", "opencode", "-i", "dialog-information-symbolic", title, body],
      { stdio: "ignore", timeout: 5000 },
    )
  } catch {
  }
}

export const OpencodeSmartNotify: Plugin = async ({ project, directory }) => {
  const projectName =
    (project as { name?: string } | undefined)?.name ??
    (directory ? directory.split("/").filter(Boolean).pop() : null) ??
    "opencode"

  const pending = new Map<string, ReturnType<typeof setTimeout>>()
  const asked = new Set<string>()
  const replied = new Set<string>()

  function cancel(id: string) {
    const timer = pending.get(id)
    if (timer) clearTimeout(timer)
    pending.delete(id)
  }

  function queue(id: string, body: string) {
    if (replied.has(id) || asked.has(id)) return
    asked.add(id)
    cancel(id)
    pending.set(
      id,
      setTimeout(() => {
        pending.delete(id)
        if (replied.has(id)) return
        send("opencode request", `${projectName}: ${body}`.slice(0, 240), "critical")
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
          replied.add(id)
        }
        return
      }

      if (event.type === "session.error") {
        const props = event.properties as { error?: { data?: { message?: string } } }
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
        asked.add(id)
        const question = part.input?.questions?.[0]?.question ?? "question"
        send("opencode question", `${projectName}: ${question}`.slice(0, 240), "critical")
      }
    },
  }
}

export default OpencodeSmartNotify
