import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export const SETTLE_MS = 250

export type Options = {
  settleMs: number
}

export const defaults: Options = {
  settleMs: SETTLE_MS,
}

export function configPath() {
  return join(homedir(), ".config/opencode/opencode-smart-notify.json")
}

export function parseOptions(raw: unknown): Partial<Options> {
  if (!raw || typeof raw !== "object") return {}
  const o = raw as Record<string, unknown>
  const out: Partial<Options> = {}
  if (typeof o.settleMs === "number" && Number.isFinite(o.settleMs) && o.settleMs >= 0) {
    out.settleMs = o.settleMs
  }
  return out
}

export function loadFileConfig(path = configPath()): Partial<Options> {
  try {
    return parseOptions(JSON.parse(readFileSync(path, "utf8")))
  } catch {
    return {}
  }
}

export function resolveProjectName(project?: { name?: string }, directory?: string) {
  return project?.name ?? (directory ? directory.split("/").filter(Boolean).pop() : undefined) ?? "opencode"
}
