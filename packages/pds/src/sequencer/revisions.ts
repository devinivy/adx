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

  async *latest(
    params?: { seq?: number; did?: string; til?: number },
    signal?: AbortSignal,
  ) {
    let cursor = params?.seq ? { seq: params.seq, did: params.did } : undefined
    let epoch = params?.til ?? Date.now()
    let epochPages = 0
    do {
      epochPages = 0
      do {
        if (signal?.aborted) return
        const page = await this.getPage({ ...cursor, til: epoch })
        for (const { did, rev, seq, seqIdentity } of page) {
          yield {
            did,
            rev,
            seq,
            identity: !cursor || seqIdentity >= cursor.seq,
          }
        }
        epochPages++
        cursor = page.at(-1)
      } while (cursor)
      cursor = { seq: epoch, did: undefined }
      epoch = Date.now()
    } while (epochPages > 1)
  }

  async getPage(params: { seq?: number; did?: string; til: number }) {
    let qb = this.db.db
      .selectFrom('revision')
      .selectAll()
      .where('seq', '<', params.til)
      .orderBy('seq', 'asc')
      .orderBy('did', 'asc')
      .limit(250)
    if (params.seq) {
      if (params.did) {
        qb = qb.where('seq', '>', params.seq).where('did', '>', params.did)
      } else {
        qb = qb.where('seq', '>=', params.seq)
      }
    }
    return await qb.execute()
  }

  async commit(info: { did: string; rev: string }) {
    const { did, rev } = info
    const seq = Date.now()
    await this.db.executeWithRetry(
      this.db.db
        .insertInto('revision')
        .values({ did, rev, seq, seqIdentity: seq })
        .onConflict((oc) =>
          oc.column('did').doUpdateSet({
            rev: excluded(this.db.db, 'rev'),
            seq: excluded(this.db.db, 'seq'),
          }),
        ),
    )
    this.notify.update()
  }

  async identity(info: { did: string }) {
    const { did } = info
    const seq = Date.now()
    await this.db.executeWithRetry(
      this.db.db
        .updateTable('revision')
        .set({ seq, seqIdentity: seq })
        .where('did', '=', did),
    )
    this.notify.update()
  }

  destroy() {
    this.notify.destroy()
  }
}
