import { describe, expect, test } from "bun:test"
import { createNotifier, type SpawnFn, type SpawnSyncFn } from "../src/notify"

type Call = { command: string; args: string[] }

function fakeSpawn(handler: (command: string, args: string[]) => { status?: number | null; error?: Error; stdout?: string }) {
  const calls: Call[] = []
  const spawn: SpawnSyncFn = (command, args) => {
    calls.push({ command, args })
    return handler(command, args)
  }
  return { spawn, calls }
}

function fakeWatch() {
  const listeners: Array<(chunk: string) => void> = []
  const watch: SpawnFn = () => ({
    stdout: {
      on(event, cb) {
        if (event === "data") listeners.push(cb)
      },
    },
    on() {},
    kill() {},
  })
  return {
    watch,
    emit(text: string) {
      for (const listener of listeners) listener(text)
    },
  }
}

describe("createNotifier", () => {
  test("creates a notification with a default Open action via gdbus", () => {
    const { spawn, calls } = fakeSpawn(() => ({ status: 0, stdout: "(uint32 42,)\n" }))
    const { watch } = fakeWatch()
    const notifier = createNotifier({ spawn, watch })
    expect(notifier.send("opencode request", "demo: bash", "critical")).toBe(42)
    expect(calls[0]?.command).toBe("gdbus")
    expect(calls[0]?.args).toContain("org.freedesktop.Notifications.Notify")
    expect(calls[0]?.args).toContain("['default', 'Open']")
    expect(calls[0]?.args).toContain("'opencode request'")
    expect(calls[0]?.args).toContain("'demo: bash'")
  })

  test("falls back to notify-send -p when gdbus notify fails", () => {
    const { spawn, calls } = fakeSpawn((command, args) => {
      if (command === "gdbus" && args.includes("org.freedesktop.Notifications.Notify")) return { status: 1 }
      return { status: 0, stdout: "7\n" }
    })
    const { watch } = fakeWatch()
    const notifier = createNotifier({ spawn, watch })
    expect(notifier.send("opencode error", "boom")).toBe(7)
    expect(calls.some((call) => call.command === "notify-send" && call.args[0] === "-p")).toBe(true)
    expect(calls.some((call) => call.args.includes("string:desktop-entry:dev.zed.Zed"))).toBe(true)
  })

  test("swallows notify-send exceptions", () => {
    const spawn: SpawnSyncFn = () => {
      throw new Error("missing")
    }
    expect(createNotifier({ spawn, watch: fakeWatch().watch }).send("t", "b")).toBeUndefined()
  })

  test("activates the matching session when the notification is clicked", () => {
    const { spawn } = fakeSpawn(() => ({ status: 0, stdout: "(uint32 9,)\n" }))
    const { watch, emit } = fakeWatch()
    const activated: Array<{ sessionId?: string }> = []
    const notifier = createNotifier({
      spawn,
      watch,
      activate(target) {
        activated.push(target)
      },
    })
    notifier.send("opencode request", "demo: bash", "critical", { sessionId: "ses_1" })
    emit("/org/freedesktop/Notifications: org.freedesktop.Notifications.ActionInvoked (uint32 9, 'default')\n")
    expect(activated).toEqual([{ sessionId: "ses_1" }])
  })

  test("closes with gdbus when it succeeds", () => {
    const { spawn, calls } = fakeSpawn(() => ({ status: 0 }))
    createNotifier({ spawn, watch: fakeWatch().watch }).close(7)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe("gdbus")
    expect(calls[0]?.args.at(-1)).toBe("7")
  })

  test("falls back to busctl when gdbus fails", () => {
    const { spawn, calls } = fakeSpawn((command) => {
      if (command === "gdbus") return { status: 1 }
      return { status: 0 }
    })
    createNotifier({ spawn, watch: fakeWatch().watch }).close(9)
    expect(calls.map((call) => call.command)).toEqual(["gdbus", "busctl"])
    expect(calls[1]?.args.at(-1)).toBe("9")
  })
})
