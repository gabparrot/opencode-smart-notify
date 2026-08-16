import type { Plugin } from "@opencode-ai/plugin"
import { defaults, loadFileConfig, parseOptions, resolveProjectName } from "./config"
import { createEngine } from "./engine"
import { createNotifier } from "./notify"

export { SETTLE_MS, defaults, loadFileConfig, parseOptions, resolveProjectName } from "./config"
export type { Options } from "./config"
export { createEngine, isAbortedError, requestIds } from "./engine"
export { createNotifier } from "./notify"
export { MAX_TRACKED, createTracked } from "./tracked"

export function createPlugin(deps?: {
  loadConfig?: typeof loadFileConfig
  send?: (title: string, body: string, urgency?: string) => number | undefined
  close?: (id: number) => void
  setTimeout?: (fn: () => void, ms?: number) => unknown
  clearTimeout?: (id: unknown) => void
}): Plugin {
  const notifier = createNotifier()
  return async ({ project, directory }, options) => {
    const config = {
      ...defaults,
      ...(deps?.loadConfig ?? loadFileConfig)(),
      ...parseOptions(options),
    }
    const engine = createEngine({
      projectName: resolveProjectName(project as { name?: string } | undefined, directory),
      settleMs: config.settleMs,
      send: deps?.send ?? notifier.send,
      close: deps?.close ?? notifier.close,
      setTimeout: deps?.setTimeout,
      clearTimeout: deps?.clearTimeout,
    })
    return {
      event: async ({ event }) => {
        engine.handle(event as { type: string; properties?: unknown })
      },
    }
  }
}

export const OpencodeSmartNotify: Plugin = createPlugin()

export default OpencodeSmartNotify
