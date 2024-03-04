import { sql } from 'kysely'
import { randomStr } from '@atproto/crypto'
import { Notify } from './notify'
import { SequencerDb, getDb } from './db'
import { excluded } from '../db'

export class Revisions {
  db: SequencerDb
  notify: Notify

  constructor(
    dbLocation: string,
    disableWalAutoCheckpoint = false,
    notifyLocation: string,
  ) {
    this.db = getDb(dbLocation, disableWalAutoCheckpoint)
    this.notify = new Notify(notifyLocation)
  }

  async *latest(params?: { seq: number; did?: string }, signal?: AbortSignal) {
    let cursor = params && {
      seq: params.seq,
      did: params.did,
    }
    do {
      if (signal?.aborted) return
      const page = await this.getPage(cursor)
      for (const item of page) {
        yield item
      }
      cursor = page.at(-1)
    } while (cursor)
  }

  async getPage(params?: { seq: number; did?: string }) {
    const { ref } = this.db.db.dynamic
    let qb = this.db.db
      .selectFrom('revision')
      .selectAll()
      .orderBy('seq', 'asc')
      .orderBy('did', 'asc')
      .limit(250)
    if (params) {
      if (params.did) {
        const cols = sql`(${ref('seq')}, ${ref('did')})`
        const vals = sql`(${params.seq}, ${params.did})`
        qb = qb.where(cols, '>', vals)
      } else {
        qb = qb.where('seq', '>=', params.seq)
      }
    }
    return await qb.execute()
  }

  async init(info: {
    did: string
    rev: string
    ident?: string
    status: string | null
  }) {
    const { did, rev, ident = randomStr(8, 'base32'), status } = info
    const seq = Date.now()
    await this.db.executeWithRetry(
      this.db.db
        .insertInto('revision')
        .values({ seq, did, rev, ident, status })
        .onConflict((oc) =>
          oc.column('did').doUpdateSet({
            seq: excluded(this.db.db, 'seq'),
            rev: excluded(this.db.db, 'rev'),
            ident: excluded(this.db.db, 'ident'),
            status: excluded(this.db.db, 'status'),
          }),
        ),
    )
    this.notify.update()
  }

  async commit(info: { did: string; rev: string }) {
    const { did, rev } = info
    const seq = Date.now()
    await this.db.executeWithRetry(
      this.db.db
        .insertInto('revision')
        .values({ seq, did, rev })
        .onConflict((oc) =>
          oc.column('did').doUpdateSet({
            rev: excluded(this.db.db, 'rev'),
            seq: excluded(this.db.db, 'seq'),
          }),
        ),
    )
    this.notify.update()
  }

  // @TODO make identity required, perhaps some kind of truncated hash related to DID doc contents
  async identity(info: { did: string; ident?: string }) {
    const { did, ident = randomStr(8, 'base32') } = info
    const seq = Date.now()
    await this.db.executeWithRetry(
      this.db.db
        .updateTable('revision')
        .set({ seq, ident })
        .where('did', '=', did),
    )
    this.notify.update()
  }

  async status(info: { did: string; status: string | null }) {
    const { did, status } = info
    const seq = Date.now()
    await this.db.executeWithRetry(
      this.db.db
        .updateTable('revision')
        .set({ seq, status })
        .where('did', '=', did),
    )
    this.notify.update()
  }

  destroy() {
    this.notify.destroy()
  }
}
