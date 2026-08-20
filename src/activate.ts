import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { SpawnSyncFn } from "./notify"

export type ActivateTarget = {
  sessionId?: string
  clickCommand?: string[]
  activationToken?: string
}

const CHANNELS = ["stable", "preview", "nightly", "dev"] as const

const SOCKET_SCRIPT =
  "import socket,sys;s=socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM);s.connect(sys.argv[1]);s.send(sys.argv[2].encode())"

export function zedFocusUrl() {
  return "zed://"
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
    const opts = spawnOpts(env, target.activationToken)
    if (target.clickCommand?.length) {
      const [cmd, ...args] = expandClickCommand(target.clickCommand, target.sessionId)
      if (cmd) spawn(cmd, args, opts)
      return
    }
    const url = zedFocusUrl()
    const attempts: Array<[string, string[]]> = [
      ["zed", ["-e", url]],
      ["xdg-open", [url]],
      ["gtk-launch", ["dev.zed.Zed"]],
      ["open", [url]],
      ["zed", []],
      ["flatpak", ["run", "dev.zed.Zed"]],
    ]
    if (target.activationToken) {
      for (const [cmd, args] of attempts) {
        if (run(spawn, cmd, args, opts)) return
      }
    }
    for (const sock of zedSocketCandidates(home, env)) {
      if (exists(sock) && sendUnixDgram(sock, url, spawn, opts)) return
    }
    for (const [cmd, args] of attempts) {
      if (run(spawn, cmd, args, opts)) return
    }
  } catch {
  }
}

function spawnOpts(env: NodeJS.ProcessEnv, token?: string) {
  return {
    stdio: "ignore" as const,
    timeout: 5000,
    ...(token ? { env: { ...env, XDG_ACTIVATION_TOKEN: token } } : {}),
  }
}

function run(
  spawn: SpawnSyncFn,
  command: string,
  args: string[],
  opts: { stdio: "ignore"; timeout: number; env?: NodeJS.ProcessEnv },
) {
  try {
    const result = spawn(command, args, opts)
    return !result.error && (result.status === 0 || result.status == null)
  } catch {
    return false
  }
}

function sendUnixDgram(
  path: string,
  payload: string,
  spawn: SpawnSyncFn,
  opts: { stdio: "ignore"; timeout: number; env?: NodeJS.ProcessEnv },
) {
  try {
    const result = spawn("python3", ["-c", SOCKET_SCRIPT, path, payload], { ...opts, timeout: 2000 })
    return !result.error && result.status === 0
  } catch {
    return false
  }
}
