import { describe, expect, test } from "bun:test"
import { createEngine, isAbortedError, requestIds } from "../src/engine"

type Sent = { title: string; body: string; urgency?: string }

function createClock() {
  let now = 0
  let nextId = 1
  const pending = new Map<number, { fn: () => void; at: number }>()
  return {
    setTimeout(fn: () => void, ms?: number) {
      const id = nextId++
      pending.set(id, { fn, at: now + (ms ?? 0) })
      return id as unknown as ReturnType<typeof setTimeout>
    },
    clearTimeout(id: unknown) {
      pending.delete(id as number)
    },
    advance(ms: number) {
      now += ms
      const due = [...pending.entries()].filter(([, item]) => item.at <= now)
      for (const [id, item] of due) {
        pending.delete(id)
        item.fn()
      }
    },
  }
}

function setup(settleMs = 250) {
  const sent: Sent[] = []
  const closed: number[] = []
  let nextNid = 1
  const clock = createClock()
  const engine = createEngine({
    projectName: "demo",
    settleMs,
    send(title, body, urgency) {
      const id = nextNid++
      sent.push({ title, body, urgency })
      return id
    },
    close(id) {
      closed.push(id)
    },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  })
  return { engine, sent, closed, advance: clock.advance }
}

describe("requestIds", () => {
  test("collects unique id fields in preference order", () => {
    expect(requestIds({})).toEqual([])
    expect(requestIds({ id: "a", permissionID: "b", requestID: "c" })).toEqual(["a", "b", "c"])
    expect(requestIds({ permissionID: "p", requestID: "p" })).toEqual(["p"])
  })
})

describe("isAbortedError", () => {
  test("detects MessageAbortedError on name or nested data", () => {
    expect(isAbortedError(undefined)).toBe(false)
    expect(isAbortedError({ name: "UnknownError" })).toBe(false)
    expect(isAbortedError({ name: "MessageAbortedError" })).toBe(true)
    expect(isAbortedError({ data: { name: "MessageAbortedError" } })).toBe(true)
  })
})

describe("createEngine", () => {
  test("notifies after the settle window", () => {
    const { engine, sent, advance } = setup()
    engine.handle({ type: "permission.asked", properties: { id: "p1", permission: "bash", patterns: ["ls"] } })
    expect(sent).toEqual([])
    advance(249)
    expect(sent).toEqual([])
    advance(1)
    expect(sent).toEqual([{ title: "opencode request", body: "demo: bash ls", urgency: "critical" }])
  })

  test("cancels a pending timer on reply", () => {
    const { engine, sent, advance } = setup()
    engine.handle({ type: "permission.asked", properties: { id: "p1", permission: "edit" } })
    engine.handle({ type: "permission.replied", properties: { requestID: "p1" } })
    advance(250)
    expect(sent).toEqual([])
  })

  test("suppresses an ask that arrives after a reply", () => {
    const { engine, sent, advance } = setup()
    engine.handle({ type: "permission.replied", properties: { permissionID: "p1" } })
    engine.handle({ type: "permission.asked", properties: { id: "p1", permission: "bash" } })
    advance(250)
    expect(sent).toEqual([])
  })

  test("deduplicates v1 updated and v2 asked for the same id", () => {
    const { engine, sent, advance } = setup()
    engine.handle({ type: "permission.asked", properties: { id: "p1", permission: "bash" } })
    engine.handle({ type: "permission.updated", properties: { id: "p1", type: "bash", title: "ls" } })
    advance(250)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.body).toBe("demo: bash")
  })

  test("retracts an already shown request notification on reply", () => {
    const { engine, sent, closed, advance } = setup()
    engine.handle({ type: "permission.asked", properties: { id: "p1", permission: "bash" } })
    advance(250)
    expect(sent).toHaveLength(1)
    engine.handle({ type: "permission.replied", properties: { requestID: "p1" } })
    expect(closed).toEqual([1])
  })

  test("ignores MessageAbortedError", () => {
    const { engine, sent } = setup()
    engine.handle({
      type: "session.error",
      properties: { error: { name: "MessageAbortedError", data: { message: "Aborted" } } },
    })
    expect(sent).toEqual([])
  })

  test("notifies a real session error", () => {
    const { engine, sent } = setup()
    engine.handle({
      type: "session.error",
      properties: { error: { name: "UnknownError", data: { message: "boom" } } },
    })
    expect(sent).toEqual([{ title: "opencode error", body: "demo: boom", urgency: "critical" }])
  })

  test("notifies a pending askuserquestion once", () => {
    const { engine, sent } = setup()
    const part = {
      type: "tool",
      tool: "askuserquestion",
      id: "q1",
      state: { status: "pending" },
      input: { questions: [{ question: "Ship it?" }] },
    }
    engine.handle({ type: "message.part.updated", properties: { part } })
    engine.handle({ type: "message.part.updated", properties: { part } })
    expect(sent).toEqual([{ title: "opencode question", body: "demo: Ship it?", urgency: "critical" }])
  })

  test("ignores asks without an id", () => {
    const { engine, sent, advance } = setup()
    engine.handle({ type: "permission.asked", properties: { permission: "bash" } })
    advance(250)
    expect(sent).toEqual([])
  })

  test("truncates notification bodies to 240 characters", () => {
    const { engine, sent } = setup()
    engine.handle({
      type: "session.error",
      properties: { error: { data: { message: "x".repeat(300) } } },
    })
    expect(sent[0]?.body.length).toBe(240)
  })
})
