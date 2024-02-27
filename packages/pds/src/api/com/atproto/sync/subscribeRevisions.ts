import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import AppContext from '../../../../context'

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
    for await (const _ of ctx.revisions.notify.watch({ signal })) {
      for await (const item of ctx.revisions.latest(cursor, signal)) {
        yield itemToMessage(item)
        cursor = itemToCursor(item)
      }
    }
  })
}

function itemToMessage(item: Item) {
  const { seq, did, rev, identity } = item
  const $type = identity
    ? 'com.atproto.sync.subscribeRevisions#identity'
    : 'com.atproto.sync.subscribeRevisions#commit'
  return { $type, did, rev, seq: seq.toString() }
}

function itemToCursor(item: Item) {
  const { seq, did } = item
  return { seq, did }
}

type Cursor = { seq: number; did?: string }

type Item = { seq: number; did: string; rev: string; identity: boolean }
