import { createTracked } from "./tracked"

export type SendFn = (title: string, body: string, urgency?: string) => number | undefined
export type CloseFn = (id: number) => void

export type Engine = {
  handle(event: { type: string; properties?: unknown }): void
}

export type EngineInput = {
  projectName: string
  settleMs: number
  send: SendFn
  close: CloseFn
  setTimeout?: (fn: () => void, ms?: number) => unknown
  clearTimeout?: (id: unknown) => void
}

export function requestIds(props: { id?: string; permissionID?: string; requestID?: string }) {
  const ids = new Set<string>()
  if (props.id) ids.add(props.id)
  if (props.permissionID) ids.add(props.permissionID)
  if (props.requestID) ids.add(props.requestID)
  return [...ids]
}

export function isAbortedError(error: { name?: string; data?: { name?: string } } | undefined) {
  return error?.name === "MessageAbortedError" || error?.data?.name === "MessageAbortedError"
}

export function createEngine(input: EngineInput): Engine {
  const setTimer = input.setTimeout ?? ((fn: () => void, ms?: number) => setTimeout(fn, ms))
  const clearTimer = input.clearTimeout ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>))
  const pending = new Map<string, unknown>()
  const asked = createTracked<true>()
  const replied = createTracked<true>()
  const shown = createTracked<number>()

  function cancel(id: string) {
    const timer = pending.get(id)
    if (timer) clearTimer(timer)
    pending.delete(id)
  }

  function retract(id: string) {
    const nid = shown.get(id)
    shown.delete(id)
    if (nid !== undefined) input.close(nid)
  }

  function queue(id: string, body: string) {
    if (replied.has(id) || asked.has(id)) return
    asked.set(id, true)
    cancel(id)
    pending.set(
      id,
      setTimer(() => {
        pending.delete(id)
        if (replied.has(id)) return
        const nid = input.send("opencode request", `${input.projectName}: ${body}`.slice(0, 240), "critical")
        if (nid !== undefined) shown.set(id, nid)
      }, input.settleMs),
    )
  }

  return {
    handle(event) {
      const type = event.type
      const properties = event.properties ?? {}

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
        input.send("opencode error", `${input.projectName}: ${message}`.slice(0, 240), "critical")
        return
      }

      if (type === "message.part.updated") {
        const part = (
          properties as {
            part?: {
              type?: string
              tool?: string
              id?: string
              state?: { status?: string }
              input?: { questions?: Array<{ question?: string }> }
            }
          }
        ).part
        if (part?.type !== "tool") return
        if (part.tool?.toLowerCase() !== "askuserquestion") return
        if (part.state?.status !== "pending") return
        const id = part.id ?? "question"
        if (asked.has(id)) return
        asked.set(id, true)
        const question = part.input?.questions?.[0]?.question ?? "question"
        input.send("opencode question", `${input.projectName}: ${question}`.slice(0, 240), "critical")
      }
    },
  }
}
