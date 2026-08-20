import type { Options } from "./config"
import type { SendExtra } from "./notify"
import { createTracked } from "./tracked"

export type { SendExtra }
export type SendFn = (title: string, body: string, urgency?: string, extra?: SendExtra) => number | undefined
export type CloseFn = (id: number) => void

export type Engine = {
  handle(event: { type: string; properties?: unknown }): void
}

export type EngineInput = {
  projectName: string
  options: Options
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

export function sessionIdOf(props: { sessionID?: string } | object) {
  const sessionID = (props as { sessionID?: unknown }).sessionID
  return typeof sessionID === "string" && sessionID ? sessionID : undefined
}

export function createEngine(input: EngineInput): Engine {
  const setTimer = input.setTimeout ?? ((fn: () => void, ms?: number) => setTimeout(fn, ms))
  const clearTimer = input.clearTimeout ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>))
  const pending = new Map<string, unknown>()
  const asked = createTracked<true>()
  const replied = createTracked<true>()
  const shown = createTracked<number>()
  const active = createTracked<true>()
  const suppressIdle = createTracked<true>()
  const idleNotified = createTracked<true>()
  const lastUser = createTracked<string>()

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

  function remember(id: string, nid: number | undefined) {
    if (nid !== undefined) shown.set(id, nid)
  }

  function beginTurn(sessionId: string) {
    suppressIdle.delete(sessionId)
    idleNotified.delete(sessionId)
    active.set(sessionId, true)
  }

  function markBusy(sessionId?: string) {
    if (!sessionId) return
    if (idleNotified.has(sessionId) || suppressIdle.has(sessionId)) return
    active.set(sessionId, true)
  }

  function notifyIdle(sessionId?: string) {
    if (!sessionId || !active.has(sessionId)) return
    active.delete(sessionId)
    if (suppressIdle.has(sessionId)) return
    if (!input.options.notifyIdle) return
    if (idleNotified.has(sessionId)) return
    idleNotified.set(sessionId, true)
    input.send("opencode idle", `${input.projectName}: finished`.slice(0, 240), input.options.urgency, {
      sessionId,
    })
  }

  function queue(id: string, body: string, sessionId?: string) {
    if (!input.options.notifyRequests) return
    if (replied.has(id) || asked.has(id)) return
    asked.set(id, true)
    cancel(id)
    pending.set(
      id,
      setTimer(() => {
        pending.delete(id)
        if (replied.has(id)) return
        remember(
          id,
          input.send("opencode request", `${input.projectName}: ${body}`.slice(0, 240), input.options.urgency, {
            sessionId,
            onId: (nid) => shown.set(id, nid),
          }),
        )
      }, input.options.settleMs),
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
          sessionID?: string
        }
        const id = requestIds(props)[0]
        if (!id) return
        const extra = props.patterns?.join(", ") ?? ""
        queue(id, [props.permission ?? "permission", extra].filter(Boolean).join(" "), sessionIdOf(props))
        return
      }

      if (type === "permission.updated") {
        const props = properties as {
          id?: string
          permissionID?: string
          requestID?: string
          type?: string
          title?: string
          sessionID?: string
        }
        const id = requestIds(props)[0]
        if (!id) return
        queue(id, [props.type ?? "permission", props.title ?? ""].filter(Boolean).join(" "), sessionIdOf(props))
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
          sessionID?: string
          error?: { name?: string; data?: { message?: string; name?: string } }
        }
        const sessionId = sessionIdOf(props)
        if (sessionId) suppressIdle.set(sessionId, true)
        if (isAbortedError(props.error)) return
        if (!input.options.notifyErrors) return
        const message = props.error?.data?.message ?? "An error occurred"
        input.send("opencode error", `${input.projectName}: ${message}`.slice(0, 240), input.options.urgency, {
          sessionId,
        })
        return
      }

      if (type === "session.idle") {
        notifyIdle(sessionIdOf(properties as { sessionID?: string }))
        return
      }

      if (type === "session.status") {
        const props = properties as { sessionID?: string; status?: { type?: string } }
        const sessionId = sessionIdOf(props)
        if (props.status?.type === "busy" || props.status?.type === "retry") {
          markBusy(sessionId)
          return
        }
        if (props.status?.type === "idle") notifyIdle(sessionId)
        return
      }

      if (type === "message.updated") {
        const props = properties as { sessionID?: string; info?: { id?: string; role?: string; sessionID?: string } }
        const sessionId = sessionIdOf(props) ?? sessionIdOf(props.info ?? {})
        const id = props.info?.id
        if (!sessionId || props.info?.role !== "user" || !id) return
        if (lastUser.get(sessionId) === id) return
        lastUser.set(sessionId, id)
        beginTurn(sessionId)
        return
      }

      if (type === "message.part.updated") {
        const part = (
          properties as {
            part?: {
              type?: string
              tool?: string
              id?: string
              sessionID?: string
              state?: { status?: string }
              input?: { questions?: Array<{ question?: string }> }
            }
          }
        ).part
        if (part?.type !== "tool") return
        if (part.tool?.toLowerCase() !== "askuserquestion") return
        if (part.state?.status !== "pending") return
        if (!input.options.notifyQuestions) return
        const id = part.id ?? "question"
        if (asked.has(id)) return
        asked.set(id, true)
        const question = part.input?.questions?.[0]?.question ?? "question"
        input.send("opencode question", `${input.projectName}: ${question}`.slice(0, 240), input.options.urgency, {
          sessionId: sessionIdOf(part),
        })
      }
    },
  }
}
