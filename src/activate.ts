import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { SpawnSyncFn } from "./notify"

export type ActivateTarget = {
  sessionId?: string
  clickCommand?: string[]
}

const CHANNELS = ["stable", "preview", "nightly", "dev"] as const

const SOCKET_SCRIPT =
  "import socket,sys;s=socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM);s.connect(sys.argv[1]);s.send(sys.argv[2].encode())"

export function zedAgentUrl(sessionId?: string) {
  if (!sessionId) return "zed://agent"
  return `zed://agent?session=${encodeURIComponent(sessionId)}`
}

export function zedSocketCandidates(home = homedir(), env: NodeJS.ProcessEnv = process.env) {
  const data = env.XDG_DATA_HOME ?? join(home, ".local/share")
  const roots = [
    join(data, "zed"),
    join(home, ".local/share/zed"),
    join(home, ".var/app/dev.zed.Zed/data/zed"),
  ]
  const out: string[] = []
  for (const root of roots) {
    for (const channel of CHANNELS) {
      out.push(join(root, `zed-${channel}.sock`))
    }
  }
  return [...new Set(out)]
}

export function expandClickCommand(command: string[], sessionId?: string) {
  return command.map((part) => part.replaceAll("{sessionId}", sessionId ?? ""))
}

export function activate(
  target: ActivateTarget,
  spawn: SpawnSyncFn,
  exists: (path: string) => boolean = existsSync,
  home = homedir(),
  env: NodeJS.ProcessEnv = process.env,
) {
  try {
    if (target.clickCommand?.length) {
      const [cmd, ...args] = expandClickCommand(target.clickCommand, target.sessionId)
      if (cmd) spawn(cmd, args, { stdio: "ignore", timeout: 5000 })
      return
    }
    const url = zedAgentUrl(target.sessionId)
    for (const sock of zedSocketCandidates(home, env)) {
      if (exists(sock) && sendUnixDgram(sock, url, spawn)) return
    }
    const attempts: Array<[string, string[]]> = [
      ["zed", ["-e", url]],
      ["xdg-open", [url]],
      ["open", [url]],
      ["zed", []],
      ["xdg-open", ["zed://"]],
      ["open", ["zed://"]],
      ["flatpak", ["run", "dev.zed.Zed", url]],
    ]
    for (const [cmd, args] of attempts) {
      try {
        const result = spawn(cmd, args, { stdio: "ignore", timeout: 5000 })
        if (!result.error && (result.status === 0 || result.status == null)) return
      } catch {
      }
    }
  } catch {
  }
}

function sendUnixDgram(path: string, payload: string, spawn: SpawnSyncFn) {
  try {
    const result = spawn("python3", ["-c", SOCKET_SCRIPT, path, payload], { stdio: "ignore", timeout: 2000 })
    return !result.error && result.status === 0
  } catch {
    return false
  }
}
