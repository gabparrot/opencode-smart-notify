import { describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SETTLE_MS, defaults, loadFileConfig, parseOptions, resolveProjectName } from "../src/config"

describe("parseOptions", () => {
  test("returns empty for non-objects", () => {
    expect(parseOptions(undefined)).toEqual({})
    expect(parseOptions(null)).toEqual({})
    expect(parseOptions("nope")).toEqual({})
    expect(parseOptions(1)).toEqual({})
  })

  test("accepts a finite non-negative settleMs", () => {
    expect(parseOptions({ settleMs: 0 })).toEqual({ settleMs: 0 })
    expect(parseOptions({ settleMs: 100 })).toEqual({ settleMs: 100 })
  })

  test("ignores invalid settleMs", () => {
    expect(parseOptions({ settleMs: -1 })).toEqual({})
    expect(parseOptions({ settleMs: Number.NaN })).toEqual({})
    expect(parseOptions({ settleMs: Number.POSITIVE_INFINITY })).toEqual({})
    expect(parseOptions({ settleMs: "250" })).toEqual({})
  })
})

describe("loadFileConfig", () => {
  test("returns defaults-compatible empty object when the file is missing", () => {
    expect(loadFileConfig(join(tmpdir(), "missing-opencode-smart-notify.json"))).toEqual({})
  })

  test("parses a valid config file", () => {
    const dir = mkdtempSync(join(tmpdir(), "smart-notify-"))
    const path = join(dir, "opencode-smart-notify.json")
    writeFileSync(path, JSON.stringify({ settleMs: 80 }))
    expect(loadFileConfig(path)).toEqual({ settleMs: 80 })
  })

  test("returns empty on invalid JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "smart-notify-"))
    const path = join(dir, "opencode-smart-notify.json")
    writeFileSync(path, "{")
    expect(loadFileConfig(path)).toEqual({})
  })
})

describe("resolveProjectName", () => {
  test("prefers project.name, then directory basename, then opencode", () => {
    expect(resolveProjectName({ name: "demo" }, "/tmp/other")).toBe("demo")
    expect(resolveProjectName({}, "/tmp/from-dir")).toBe("from-dir")
    expect(resolveProjectName(undefined, "/tmp/from-dir/")).toBe("from-dir")
    expect(resolveProjectName(undefined, undefined)).toBe("opencode")
  })
})

describe("defaults", () => {
  test("uses the documented SETTLE_MS constant", () => {
    expect(SETTLE_MS).toBe(250)
    expect(defaults).toEqual({ settleMs: 250 })
  })
})
