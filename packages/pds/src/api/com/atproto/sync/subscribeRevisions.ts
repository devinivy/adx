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
    let cursor: { seq: number; did?: string } | undefined =
      seq !== undefined ? { seq } : undefined
    const todo = true // @TODO
    for await (const result of ctx.revisions.latest(cursor, signal)) {
      const { did, rev, seq, seqIdentity } = result
      yield {
        $type: todo
          ? 'com.atproto.sync.subscribeRevisions#identity'
          : 'com.atproto.sync.subscribeRevisions#commit',
        did,
        rev,
        seq,
      }
      cursor = { seq, did }
    }
    for await (const _ of ctx.revisions.notify.watch({ signal })) {
      for await (const result of ctx.revisions.latest(cursor, signal)) {
        const { did, rev, seq, seqIdentity } = result
        yield {
          $type: todo
            ? 'com.atproto.sync.subscribeRevisions#identity'
            : 'com.atproto.sync.subscribeRevisions#commit',
          did,
          rev,
          seq,
        }
        cursor = { seq, did }
      }
    }
  })
}
