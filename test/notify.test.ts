import { describe, expect, test } from "bun:test"
import { createNotifier, type SpawnSyncFn } from "../src/notify"

type Call = { command: string; args: string[] }

function fakeSpawn(handler: (command: string, args: string[]) => { status?: number | null; error?: Error; stdout?: string }) {
  const calls: Call[] = []
  const spawn: SpawnSyncFn = (command, args) => {
    calls.push({ command, args })
    return handler(command, args)
  }
  return { spawn, calls }
}

describe("createNotifier", () => {
  test("uses notify-send -p and returns the printed id", () => {
    const { spawn, calls } = fakeSpawn(() => ({ status: 0, stdout: "42\n" }))
    const notifier = createNotifier(spawn)
    expect(notifier.send("opencode request", "demo: bash", "critical")).toBe(42)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe("notify-send")
    expect(calls[0]?.args.slice(0, 3)).toEqual(["-p", "-u", "critical"])
    expect(calls[0]?.args.slice(-2)).toEqual(["opencode request", "demo: bash"])
  })

  test("falls back to notify-send without -p when print-id fails", () => {
    const { spawn, calls } = fakeSpawn((command, args) => {
      if (command === "notify-send" && args[0] === "-p") return { status: 1 }
      return { status: 0 }
    })
    const notifier = createNotifier(spawn)
    expect(notifier.send("opencode error", "boom")).toBeUndefined()
    expect(calls.map((call) => call.args[0])).toEqual(["-p", "-u"])
  })

  test("swallows notify-send exceptions", () => {
    const spawn: SpawnSyncFn = () => {
      throw new Error("missing")
    }
    expect(createNotifier(spawn).send("t", "b")).toBeUndefined()
  })

  test("closes with gdbus when it succeeds", () => {
    const { spawn, calls } = fakeSpawn(() => ({ status: 0 }))
    createNotifier(spawn).close(7)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe("gdbus")
    expect(calls[0]?.args.at(-1)).toBe("7")
  })

  test("falls back to busctl when gdbus fails", () => {
    const { spawn, calls } = fakeSpawn((command) => {
      if (command === "gdbus") return { status: 1 }
      return { status: 0 }
    })
    createNotifier(spawn).close(9)
    expect(calls.map((call) => call.command)).toEqual(["gdbus", "busctl"])
    expect(calls[1]?.args.at(-1)).toBe("9")
  })
})
