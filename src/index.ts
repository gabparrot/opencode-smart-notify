import type { Plugin } from "@opencode-ai/plugin"
import type { ActivateTarget } from "./activate"
import { defaults, loadFileConfig, parseOptions, resolveProjectName } from "./config"
import { createEngine } from "./engine"
import { createNotifier } from "./notify"

export { activate, expandClickCommand, zedAgentUrl, zedSocketCandidates } from "./activate"
export type { ActivateTarget } from "./activate"
export { SETTLE_MS, URGENCIES, defaults, loadFileConfig, parseOptions, resolveProjectName } from "./config"
export type { Options, Urgency } from "./config"
export { createEngine, isAbortedError, requestIds, sessionIdOf } from "./engine"
export { createNotifier } from "./notify"
export type { SendExtra } from "./notify"
export { MAX_TRACKED, createTracked } from "./tracked"

export function createPlugin(deps?: {
  loadConfig?: typeof loadFileConfig
  send?: (title: string, body: string, urgency?: string) => number | undefined
  close?: (id: number) => void
  setTimeout?: (fn: () => void, ms?: number) => unknown
  clearTimeout?: (id: unknown) => void
  activate?: (target: ActivateTarget) => void
}): Plugin {
  return async ({ project, directory }, options) => {
    const config = {
      ...defaults,
      ...(deps?.loadConfig ?? loadFileConfig)(),
      ...parseOptions(options),
    }
    const notifier = createNotifier({
      clickCommand: config.clickCommand,
      activate: deps?.activate,
    })
    const engine = createEngine({
      projectName: resolveProjectName(project as { name?: string } | undefined, directory),
      options: config,
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

export default {
  id: "opencode-smart-notify",
  server: OpencodeSmartNotify,
}
