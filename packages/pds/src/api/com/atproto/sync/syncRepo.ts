import assert from 'node:assert'
import stream from 'node:stream'
import { OutgoingMessage } from 'node:http'
import { sql } from 'kysely'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { CID } from 'multiformats/cid'
import { cborDecode, ipldToJson, wait } from '@atproto/common'
import { OutputSchema } from '../../../../lexicon/types/com/atproto/sync/syncRepo'
import { Server } from '../../../../lexicon'
import AppContext from '../../../../context'
import { ActorDb } from '../../../../actor-store/db'

export default function (server: Server, ctx: AppContext) {
  server.com.atproto.sync.syncRepo({
    auth: ctx.authVerifier.optionalAccessOrRole,
    handler: async ({ params, auth, res }) => {
      const signal = handleAbort(res)
      const { did, since, collection } = params
      // takedown check for anyone other than an admin or the user
      if (!ctx.authVerifier.isUserOrAdmin(auth, did)) {
        const available = await ctx.accountManager.isRepoAvailable(did)
        if (!available) {
          throw new InvalidRequestError(`Could not find repo for DID: ${did}`)
        }
      }
      const output = toJsonLines(
        getRecordStream(ctx, { did, since, collection, signal }),
      )
      return {
        encoding: 'application/json-lines',
        body: stream.Readable.from(output, { objectMode: false }) as any,
      }
    },
  })
}

export const getRecordStream = async function* (
  ctx: AppContext,
  opts: {
    did: string
    since: string | undefined
    collection: string | undefined
    signal: AbortSignal
  },
): AsyncGenerator<OutputSchema> {
  const { did, since, collection, signal } = opts
  const actorDb = await ctx.actorStore.openDb(did)
  try {
    signal.throwIfAborted()
    const initialRoot = await getRoot(actorDb)
    yield rowToOutput({ path: null, ...initialRoot })
    let root = initialRoot
    let cursor: Cursor | undefined = since ? { rev: since } : undefined
    // eslint-disable-next-line no-constant-condition
    while (true) {
      signal.throwIfAborted()
      const records = await getSyncRecords(
        actorDb,
        cursor,
        ctx.cfg.subscription.logicalSyncBatchSize,
      )
      for (const row of records) {
        yield rowToOutput(row, collection)
      }
      await wait(10) // @TODO
      const last = records.at(-1)
      if (!last) {
        signal.throwIfAborted()
        const lastRoot = await getRoot(actorDb)
        if (lastRoot.cid === root.cid) {
          // root has not changed since last time we ran out of records.
          if (lastRoot.cid !== initialRoot.cid) {
            // if the root has changed at least once, output a final root.
            yield rowToOutput({ path: null, ...lastRoot })
          }
          break
        }
        root = lastRoot
      } else {
        cursor = { rev: last.rev, path: last.path }
      }
    }
  } finally {
    actorDb.close()
  }
}

const getSyncRecords = async (
  actorDb: ActorDb,
  cursor: Cursor | undefined,
  batchSize?: number,
) => {
  const { ref } = actorDb.db.dynamic
  return await actorDb.db
    .selectFrom('record_sync')
    .leftJoin('repo_block', 'repo_block.cid', 'record_sync.cid')
    .orderBy('record_sync.rev', 'asc')
    .orderBy('record_sync.path', 'asc')
    .where((qb) => {
      if (!cursor) return qb.where(sql`1 = 1`)
      if (cursor.path) {
        const cols = sql`(${ref('record_sync.rev')}, ${ref(
          'record_sync.path',
        )})`
        const vals = sql`(${cursor.rev}, ${cursor.path})`
        return qb.where(cols, '>', vals)
      } else {
        return qb.where('record_sync.rev', '>', cursor.rev)
      }
    })
    .select([
      'record_sync.path',
      'record_sync.cid',
      'record_sync.rev',
      'repo_block.content',
    ])
    .limit(batchSize ?? 250)
    .execute()
}

const getRoot = async (actorDb: ActorDb): Promise<Root> => {
  return await actorDb.db
    .selectFrom('repo_root')
    .innerJoin('repo_block', 'repo_block.cid', 'repo_root.cid')
    .select(['repo_root.cid', 'repo_block.content'])
    .executeTakeFirstOrThrow()
}

const rowToOutput = (
  row: {
    path: string | null
    cid: string | null
    content: Uint8Array | null
  },
  collection?: string,
) => {
  if (row.cid === null || row.content === null) {
    // deletion
    assert(row.path !== null) // cannot express a deletion on the root
    return { path: row.path, cid: null, block: null }
  }
  if (
    collection &&
    row.path !== null &&
    !row.path.startsWith(`${collection}/`)
  ) {
    // shallow record put
    return {
      path: row.path,
      cid: CID.parse(row.cid),
      block: null,
    }
  }
  // record put
  return {
    path: row.path,
    cid: CID.parse(row.cid),
    block: cborDecode(row.content) as Record<string, unknown>,
  }
}

const toJsonLines = async function* (output: AsyncGenerator<OutputSchema>) {
  for await (const out of output) {
    yield Buffer.from(JSON.stringify(ipldToJson(out)) + '\n')
  }
}

const handleAbort = (res: OutgoingMessage) => {
  const ac = new AbortController()
  res.once('close', () => ac.abort())
  return ac.signal
}

type Root = { cid: string; content: Uint8Array }

type Cursor = { rev: string; path?: string }
