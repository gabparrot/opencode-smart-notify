export const MAX_TRACKED = 256

export function createTracked<T>() {
  const items = new Map<string, T>()
  return {
    get(id: string) {
      return items.get(id)
    },
    has(id: string) {
      return items.has(id)
    },
    set(id: string, value: T) {
      if (items.has(id)) items.delete(id)
      items.set(id, value)
      while (items.size > MAX_TRACKED) {
        const oldest = items.keys().next().value
        if (oldest === undefined) break
        items.delete(oldest)
      }
    },
    delete(id: string) {
      items.delete(id)
    },
    get size() {
      return items.size
    },
  }
}
