import { spawnSync } from "node:child_process"

export type SpawnSyncFn = (
  command: string,
  args: string[],
  options?: { encoding?: BufferEncoding; stdio?: "ignore"; timeout?: number },
) => { status?: number | null; error?: Error; stdout?: string | Buffer }

export type Notifier = {
  send(title: string, body: string, urgency?: string): number | undefined
  close(id: number): void
}

export function createNotifier(spawn: SpawnSyncFn = spawnSync): Notifier {
  return {
    send(title: string, body: string, urgency = "normal") {
      const args = ["-u", urgency, "-a", "opencode", "-i", "dialog-information-symbolic", title, body]
      try {
        const printed = spawn("notify-send", ["-p", ...args], { encoding: "utf8", timeout: 5000 })
        if (!printed.error && printed.status === 0) {
          const parsed = Number.parseInt(String(printed.stdout ?? "").trim(), 10)
          return Number.isFinite(parsed) ? parsed : undefined
        }
        spawn("notify-send", args, { stdio: "ignore", timeout: 5000 })
      } catch {
      }
    },
    close(id: number) {
      const attempts: Array<[string, string[]]> = [
        [
          "gdbus",
          [
            "call",
            "--session",
            "--dest",
            "org.freedesktop.Notifications",
            "--object-path",
            "/org/freedesktop/Notifications",
            "--method",
            "org.freedesktop.Notifications.CloseNotification",
            String(id),
          ],
        ],
        [
          "busctl",
          [
            "--user",
            "call",
            "org.freedesktop.Notifications",
            "/org/freedesktop/Notifications",
            "org.freedesktop.Notifications",
            "CloseNotification",
            "u",
            String(id),
          ],
        ],
      ]
      for (const [cmd, argv] of attempts) {
        try {
          const result = spawn(cmd, argv, { stdio: "ignore", timeout: 5000 })
          if (!result.error && result.status === 0) return
        } catch {
        }
      }
    },
  }
}
