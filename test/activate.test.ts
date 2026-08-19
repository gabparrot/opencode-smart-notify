import { describe, expect, test } from "bun:test"
import { activate, expandClickCommand, zedAgentUrl, zedSocketCandidates } from "../src/activate"
import type { SpawnSyncFn } from "../src/notify"

type Call = { command: string; args: string[] }

function fakeSpawn(handler: (command: string, args: string[]) => { status?: number | null; error?: Error; stdout?: string } = () => ({ status: 0 })) {
  const calls: Call[] = []
  const spawn: SpawnSyncFn = (command, args) => {
    calls.push({ command, args })
    return handler(command, args)
  }
  return { spawn, calls }
}

describe("zedAgentUrl", () => {
  test("opens the agent panel and includes a session when present", () => {
    expect(zedAgentUrl()).toBe("zed://agent")
    expect(zedAgentUrl("ses_abc")).toBe("zed://agent?session=ses_abc")
    expect(zedAgentUrl("ses a")).toBe("zed://agent?session=ses%20a")
  })
})

describe("zedSocketCandidates", () => {
  test("prefers the native XDG socket over Flatpak", () => {
    const paths = zedSocketCandidates("/home/gab", { XDG_DATA_HOME: "/tmp/xdg" })
    expect(paths[0]).toBe("/tmp/xdg/zed/zed-stable.sock")
    expect(paths).toContain("/home/gab/.var/app/dev.zed.Zed/data/zed/zed-stable.sock")
  })
})

describe("expandClickCommand", () => {
  test("substitutes sessionId placeholders", () => {
    expect(expandClickCommand(["zed", "-e", "zed://agent?session={sessionId}"], "ses_1")).toEqual([
      "zed",
      "-e",
      "zed://agent?session=ses_1",
    ])
  })
})

describe("activate", () => {
  test("runs clickCommand when configured", () => {
    const { spawn, calls } = fakeSpawn()
    activate({ sessionId: "ses_1", clickCommand: ["zed", "-e", "zed://agent?session={sessionId}"] }, spawn)
    expect(calls).toEqual([{ command: "zed", args: ["-e", "zed://agent?session=ses_1"] }])
  })

  test("sends the agent URL to an existing Zed socket", () => {
    const { spawn, calls } = fakeSpawn()
    activate({ sessionId: "ses_1" }, spawn, (path) => path === "/tmp/xdg/zed/zed-stable.sock", "/home/gab", {
      XDG_DATA_HOME: "/tmp/xdg",
    })
    expect(calls[0]?.command).toBe("python3")
    expect(calls[0]?.args.at(-2)).toBe("/tmp/xdg/zed/zed-stable.sock")
    expect(calls[0]?.args.at(-1)).toBe("zed://agent?session=ses_1")
  })

  test("falls back to the zed CLI when no socket exists", () => {
    const { spawn, calls } = fakeSpawn()
    activate({ sessionId: "ses_1" }, spawn, () => false, "/home/gab", {})
    expect(calls[0]).toEqual({ command: "zed", args: ["-e", "zed://agent?session=ses_1"] })
  })

  test("falls back to opening Zed when the agent URL fails", () => {
    const { spawn, calls } = fakeSpawn((command, args) => {
      if (args.includes("zed://agent?session=ses_1") || args.includes("zed://agent")) return { status: 1 }
      if (command === "python3") return { status: 1 }
      return { status: 0 }
    })
    activate({ sessionId: "ses_1" }, spawn, () => false, "/home/gab", {})
    expect(calls.some((call) => call.command === "zed" && call.args.length === 0)).toBe(true)
  })
})
