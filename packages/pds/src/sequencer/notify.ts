import { writeFileSync } from 'node:fs'
import { watch } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:stream'
import { on } from 'node:events'

export class Notify {
  private ee = new EventEmitter()
  private ac = new AbortController()

  constructor(private filename: string) {
    try {
      writeFileSync(filename, nonce(), { flag: 'ax' })
    } catch (err) {
      if (err?.['code'] !== 'EEXIST') {
        throw err
      }
    }
    ;(async () => {
      const watcher = watch(filename, { signal: this.ac.signal })
      for await (const _ of watcher) {
        this.ee.emit('update')
      }
    })()
  }

  async *watch(opts?: { signal?: AbortSignal }) {
    for await (const _ of on(this.ee, 'update', { signal: opts?.signal })) {
      yield
    }
  }

  update() {
    writeFileSync(this.filename, nonce())
  }

  destroy() {
    this.ac.abort()
  }
}

function nonce() {
  return randomBytes(16)
}
