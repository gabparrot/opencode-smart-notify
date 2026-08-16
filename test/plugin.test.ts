import { describe, expect, test } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import plugin, { createPlugin } from "../src/index"

function input(partial: { name?: string; directory?: string } = {}): PluginInput {
  return {
    project: { name: partial.name } as unknown as PluginInput["project"],
    directory: partial.directory ?? "/tmp/demo",
  } as PluginInput
}

describe("createPlugin", () => {
  test("uses tuple options over file config", async () => {
    const sent: Array<{ title: string }> = []
    const plugin = createPlugin({
      loadConfig: () => ({ settleMs: 1000 }),
      send(title) {
        sent.push({ title })
        return 1
      },
      close() {},
      setTimeout: (fn: () => void) => {
        fn()
        return 0
      },
      clearTimeout() {},
    })
    const hooks = await plugin(input({ name: "demo" }), { settleMs: 0 })
    await hooks.event?.({
      event: { type: "permission.asked", properties: { id: "p1", permission: "bash" } } as never,
    })
    expect(sent).toEqual([{ title: "opencode request" }])
  })

  test("resolves the project name from the directory when unnamed", async () => {
    const sent: Array<{ body: string }> = []
    const plugin = createPlugin({
      loadConfig: () => ({}),
      send(_title, body) {
        sent.push({ body })
        return 1
      },
      close() {},
    })
    const hooks = await plugin(input({ directory: "/tmp/from-dir" }), {})
    await hooks.event?.({
      event: {
        type: "session.error",
        properties: { error: { data: { message: "boom" } } },
      } as never,
    })
    expect(sent).toEqual([{ body: "from-dir: boom" }])
  })

  test("honors notifyErrors from tuple options", async () => {
    const sent: Array<{ title: string }> = []
    const plugin = createPlugin({
      loadConfig: () => ({}),
      send(title) {
        sent.push({ title })
        return 1
      },
      close() {},
    })
    const hooks = await plugin(input({ name: "demo" }), { notifyErrors: false })
    await hooks.event?.({
      event: {
        type: "session.error",
        properties: { error: { data: { message: "boom" } } },
      } as never,
    })
    expect(sent).toEqual([])
  })
})

describe("default export", () => {
  test("is a v1 plugin module with a server function", () => {
    expect(plugin.id).toBe("opencode-smart-notify")
    expect(typeof plugin.server).toBe("function")
  })

  test("can be initialized the way OpenCode loads plugins", async () => {
    const hooks = await plugin.server(input({ name: "demo" }), {})
    expect(typeof hooks.event).toBe("function")
  })
})
