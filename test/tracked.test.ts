import { describe, expect, test } from "bun:test"
import { MAX_TRACKED, createTracked } from "../src/tracked"

describe("createTracked", () => {
  test("stores, refreshes, and deletes keys", () => {
    const tracked = createTracked<number>()
    tracked.set("a", 1)
    expect(tracked.has("a")).toBe(true)
    expect(tracked.get("a")).toBe(1)
    tracked.set("a", 2)
    expect(tracked.get("a")).toBe(2)
    tracked.delete("a")
    expect(tracked.has("a")).toBe(false)
    expect(tracked.get("a")).toBeUndefined()
  })

  test("evicts the oldest key after MAX_TRACKED", () => {
    const tracked = createTracked<true>()
    for (let i = 0; i < MAX_TRACKED; i++) tracked.set(`id-${i}`, true)
    expect(tracked.size).toBe(MAX_TRACKED)
    expect(tracked.has("id-0")).toBe(true)
    tracked.set("id-new", true)
    expect(tracked.size).toBe(MAX_TRACKED)
    expect(tracked.has("id-0")).toBe(false)
    expect(tracked.has("id-new")).toBe(true)
    expect(tracked.has("id-1")).toBe(true)
  })

  test("refreshing a key makes it newest", () => {
    const tracked = createTracked<true>()
    for (let i = 0; i < MAX_TRACKED; i++) tracked.set(`id-${i}`, true)
    tracked.set("id-0", true)
    tracked.set("id-new", true)
    expect(tracked.has("id-0")).toBe(true)
    expect(tracked.has("id-1")).toBe(false)
  })
})
