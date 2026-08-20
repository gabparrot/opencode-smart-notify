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
  const errors: Array<() => void> = []
  const watch: SpawnFn = () => ({
    stdout: {
      on(event, cb) {
        if (event === "data") listeners.push(cb)
      },
    },
    on(event, cb) {
      if (event === "error") errors.push(() => cb())
    },
    kill() {},
  })
  return {
    watch,
    emit(text: string) {
      for (const listener of listeners) listener(text)
    },
    emitError() {
      for (const listener of errors) listener()
    },
  }
}

describe("createNotifier", () => {
  test("creates a notification with a default Open action via gdbus", () => {
    const { spawn, calls } = fakeSpawn(() => ({ status: 0, stdout: "(uint32 42,)\n" }))
    const { watch } = fakeWatch()
    const notifier = createNotifier({ spawn, watch, platform: "linux" })
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
    const notifier = createNotifier({ spawn, watch, platform: "linux" })
    expect(notifier.send("opencode error", "boom")).toBe(7)
    expect(calls.some((call) => call.command === "notify-send" && call.args[0] === "-p")).toBe(true)
  })

  test("swallows notify-send exceptions", () => {
    const spawn: SpawnSyncFn = () => {
      throw new Error("missing")
    }
    expect(createNotifier({ spawn, watch: fakeWatch().watch, platform: "linux" }).send("t", "b")).toBeUndefined()
  })

  test("activates the matching session when the notification is clicked", () => {
    const { spawn } = fakeSpawn(() => ({ status: 0, stdout: "(uint32 9,)\n" }))
    const { watch, emit } = fakeWatch()
    const activated: Array<{ sessionId?: string; activationToken?: string }> = []
    const notifier = createNotifier({
      spawn,
      watch,
      platform: "linux",
      activate(target) {
        activated.push(target)
      },
    })
    notifier.send("opencode request", "demo: bash", "critical", { sessionId: "ses_1" })
    emit('/org/freedesktop/Notifications: org.freedesktop.Notifications.ActionInvoked (uint32 9, "default")\n')
    expect(activated).toEqual([{ sessionId: "ses_1" }])
  })

  test("passes a GNOME activation token so Wayland can focus Zed", () => {
    const { spawn } = fakeSpawn(() => ({ status: 0, stdout: "(uint32 9,)\n" }))
    const { watch, emit } = fakeWatch()
    const activated: Array<{ sessionId?: string; activationToken?: string }> = []
    const notifier = createNotifier({
      spawn,
      watch,
      platform: "linux",
      activate(target) {
        activated.push(target)
      },
    })
    notifier.send("opencode idle", "demo: finished", "critical", { sessionId: "ses_1" })
    emit(
      "/org/freedesktop/Notifications: org.freedesktop.Notifications.ActivationToken (uint32 9, 'gnome-shell/1/token')\n",
    )
    expect(activated).toEqual([{ sessionId: "ses_1", activationToken: "gnome-shell/1/token" }])
    emit("/org/freedesktop/Notifications: org.freedesktop.Notifications.ActionInvoked (uint32 9, 'default')\n")
    expect(activated).toHaveLength(1)
  })

  test("line-buffers gdbus monitor so a click is not stuck in stdout", () => {
    const { spawn } = fakeSpawn(() => ({ status: 0, stdout: "(uint32 1,)\n" }))
    const calls: Array<{ command: string; args: string[] }> = []
    const watch: SpawnFn = (command, args) => {
      calls.push({ command, args })
      return fakeWatch().watch(command, args)
    }
    createNotifier({ spawn, watch, platform: "linux" }).send("t", "b")
    expect(calls[0]).toEqual({
      command: "stdbuf",
      args: ["-oL", "gdbus", "monitor", "--session", "--dest", "org.freedesktop.Notifications"],
    })
  })

  test("falls back to gdbus monitor when stdbuf is missing", () => {
    const { spawn } = fakeSpawn(() => ({ status: 0, stdout: "(uint32 1,)\n" }))
    const calls: Array<{ command: string; args: string[] }> = []
    const watch: SpawnFn = (command, args) => {
      calls.push({ command, args })
      if (command === "stdbuf") throw new Error("missing")
      return fakeWatch().watch(command, args)
    }
    createNotifier({ spawn, watch, platform: "linux" }).send("t", "b")
    expect(calls[1]).toEqual({
      command: "gdbus",
      args: ["monitor", "--session", "--dest", "org.freedesktop.Notifications"],
    })
  })

  test("falls back to gdbus monitor when stdbuf fails to spawn", () => {
    const { spawn } = fakeSpawn(() => ({ status: 0, stdout: "(uint32 1,)\n" }))
    const first = fakeWatch()
    const second = fakeWatch()
    const calls: Array<{ command: string; args: string[] }> = []
    const watch: SpawnFn = (command, args) => {
      calls.push({ command, args })
      return (calls.length === 1 ? first : second).watch(command, args)
    }
    createNotifier({ spawn, watch, platform: "linux" }).send("t", "b")
    first.emitError()
    expect(calls.map((call) => call.command)).toEqual(["stdbuf", "gdbus"])
  })

  test("closes with gdbus when it succeeds", () => {
    const { spawn, calls } = fakeSpawn(() => ({ status: 0 }))
    createNotifier({ spawn, watch: fakeWatch().watch, platform: "linux" }).close(7)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe("gdbus")
    expect(calls[0]?.args.at(-1)).toBe("7")
  })

  test("falls back to busctl when gdbus fails", () => {
    const { spawn, calls } = fakeSpawn((command) => {
      if (command === "gdbus") return { status: 1 }
      return { status: 0 }
    })
    createNotifier({ spawn, watch: fakeWatch().watch, platform: "linux" }).close(9)
    expect(calls.map((call) => call.command)).toEqual(["gdbus", "busctl"])
    expect(calls[1]?.args.at(-1)).toBe("9")
  })
})

function decodePs(args: string[]) {
  const encoded = args.at(-1) ?? ""
  return Buffer.from(encoded, "base64").toString("utf16le")
}

describe("createNotifier darwin", () => {
  test("uses osascript display notification", () => {
    const { spawn, calls } = fakeSpawn(() => ({ status: 0 }))
    expect(createNotifier({ spawn, platform: "darwin" }).send("opencode request", "demo: bash")).toBeUndefined()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe("osascript")
    expect(calls[0]?.args[0]).toBe("-e")
    expect(calls[0]?.args[1]).toBe('display notification "demo: bash" with title "opencode request"')
  })

  test("escapes quotes and flattens newlines", () => {
    const { spawn, calls } = fakeSpawn(() => ({ status: 0 }))
    createNotifier({ spawn, platform: "darwin" }).send('say "hi"', "line1\nline2")
    expect(calls[0]?.args[1]).toBe('display notification "line1 line2" with title "say \\"hi\\""')
  })

  test("swallows osascript exceptions", () => {
    const spawn: SpawnSyncFn = () => {
      throw new Error("missing")
    }
    expect(createNotifier({ spawn, platform: "darwin" }).send("t", "b")).toBeUndefined()
  })

  test("close is a no-op", () => {
    const { spawn, calls } = fakeSpawn(() => ({ status: 0 }))
    createNotifier({ spawn, platform: "darwin" }).close(1)
    expect(calls).toEqual([])
  })
})

describe("createNotifier win32", () => {
  test("uses a PowerShell toast and returns a local id", () => {
    const { spawn, calls } = fakeSpawn(() => ({ status: 0 }))
    const notifier = createNotifier({ spawn, platform: "win32" })
    expect(notifier.send("opencode request", "demo: bash")).toBe(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe("powershell.exe")
    expect(calls[0]?.args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-EncodedCommand"])
    const script = decodePs(calls[0]?.args ?? [])
    expect(script).toContain("<text>opencode request</text>")
    expect(script).toContain("<text>demo: bash</text>")
    expect(script).toContain("opencode-smart-notify-1")
    expect(script).toContain("CreateToastNotifier")
  })

  test("escapes XML and PowerShell quotes", () => {
    const { spawn, calls } = fakeSpawn(() => ({ status: 0 }))
    createNotifier({ spawn, platform: "win32" }).send("a <b> & 'c'", 'say "hi"')
    const script = decodePs(calls[0]?.args ?? [])
    expect(script).toContain("<text>a &lt;b&gt; &amp; ''c''</text>")
    expect(script).toContain("<text>say &quot;hi&quot;</text>")
  })

  test("increments ids across sends", () => {
    const { spawn } = fakeSpawn(() => ({ status: 0 }))
    const notifier = createNotifier({ spawn, platform: "win32" })
    expect(notifier.send("t", "a")).toBe(1)
    expect(notifier.send("t", "b")).toBe(2)
  })

  test("does not return an id when PowerShell fails", () => {
    const { spawn } = fakeSpawn(() => ({ status: 1 }))
    expect(createNotifier({ spawn, platform: "win32" }).send("t", "b")).toBeUndefined()
  })

  test("swallows PowerShell exceptions", () => {
    const spawn: SpawnSyncFn = () => {
      throw new Error("missing")
    }
    expect(createNotifier({ spawn, platform: "win32" }).send("t", "b")).toBeUndefined()
  })

  test("closes via toast history remove", () => {
    const { spawn, calls } = fakeSpawn(() => ({ status: 0 }))
    createNotifier({ spawn, platform: "win32" }).close(7)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe("powershell.exe")
    const script = decodePs(calls[0]?.args ?? [])
    expect(script).toContain("History.Remove")
    expect(script).toContain("opencode-smart-notify-7")
  })
})
