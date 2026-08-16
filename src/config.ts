import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export const SETTLE_MS = 250

export const URGENCIES = ["low", "normal", "critical"] as const
export type Urgency = (typeof URGENCIES)[number]

export type Options = {
  settleMs: number
  notifyRequests: boolean
  notifyQuestions: boolean
  notifyErrors: boolean
  notifyIdle: boolean
  urgency: Urgency
}

export const defaults: Options = {
  settleMs: SETTLE_MS,
  notifyRequests: true,
  notifyQuestions: true,
  notifyErrors: true,
  notifyIdle: true,
  urgency: "critical",
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
  if (typeof o.notifyRequests === "boolean") out.notifyRequests = o.notifyRequests
  if (typeof o.notifyQuestions === "boolean") out.notifyQuestions = o.notifyQuestions
  if (typeof o.notifyErrors === "boolean") out.notifyErrors = o.notifyErrors
  if (typeof o.notifyIdle === "boolean") out.notifyIdle = o.notifyIdle
  if (typeof o.urgency === "string" && (URGENCIES as readonly string[]).includes(o.urgency)) {
    out.urgency = o.urgency as Urgency
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
