import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import AppContext from '../../../../context'
import { OutputSchema } from '../../../../lexicon/types/com/atproto/sync/subscribeRevisions'

export default function (server: Server, ctx: AppContext) {
  server.com.atproto.sync.subscribeRevisions(async function* ({
    params,
    signal,
  }) {
    const seq = params.cursor ? parseInt(params.cursor, 10) : undefined
    if (seq !== undefined && isNaN(seq)) {
      throw new InvalidRequestError('invalid cursor')
    }
    let cursor: Cursor | undefined = seq !== undefined ? { seq } : undefined
    for await (const item of ctx.revisions.latest(cursor, signal)) {
      yield itemToMessage(item)
      cursor = itemToCursor(item)
    }
    // @NOTE unlikely but possible missed event while cutting over to watch(). would be corrected on next event.
    for await (const _ of ctx.revisions.notify.watch({ signal })) {
      for await (const item of ctx.revisions.latest(cursor, signal)) {
        yield itemToMessage(item)
        cursor = itemToCursor(item)
      }
    }
  })
}

function itemToMessage(item: Item) {
  const { seq, did, rev, ident, status } = item
  const result: OutputSchema = { seq: seq.toString(), did, rev }
  if (ident !== null) {
    result.ident = ident
  }
  if (status !== null) {
    result.status = status
  }
  return result
}

function itemToCursor(item: Item) {
  const { seq, did } = item
  return { seq, did }
}

type Cursor = { seq: number; did?: string }

type Item = {
  seq: number
  did: string
  rev: string
  ident: string | null
  status: string | null
}
