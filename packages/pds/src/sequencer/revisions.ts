import { Notify } from './notify'
import { SequencerDb, getDb } from './db'
import { excluded } from '../db'

export class Revisions {
  db: SequencerDb
  notify: Notify

  constructor(
    notifyLocation: string,
    dbLocation: string,
    disableWalAutoCheckpoint = false,
  ) {
    this.db = getDb(dbLocation, disableWalAutoCheckpoint)
    this.notify = new Notify(notifyLocation)
  }

  async getPage(since?: { seq: number; did?: string }) {
    let qb = this.db.db
      .selectFrom('revision')
      .selectAll()
      .orderBy('seq', 'asc')
      .orderBy('did', 'asc')
      .limit(250)
    if (since) {
      if (since.did) {
        qb = qb.where('seq', '>', since.seq).where('did', '>', since.did)
      } else {
        qb = qb.where('seq', '>=', since.seq)
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
