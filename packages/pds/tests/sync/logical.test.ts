import assert from 'node:assert'
import { TestNetworkNoAppView, SeedClient } from '@atproto/dev-env'
import { check, cidForCbor, wait } from '@atproto/common'
import { DisconnectError, Subscription } from '@atproto/xrpc-server'
import { randomStr } from '@atproto/crypto'
import * as repo from '@atproto/repo'
import { MemoryBlockstore, MST } from '@atproto/repo'
import { AtUri } from '@atproto/syntax'
import { jsonStringToLex } from '@atproto/lexicon'
import { OutputSchema } from '../../src/lexicon/types/com/atproto/sync/syncRepo'
import { OutputSchema as RevisionMessage } from '../../src/lexicon/types/com/atproto/sync/subscribeRevisions'
import { ids, lexicons } from '../../src/lexicon/lexicons'

describe('logical repo sync', () => {
  let network: TestNetworkNoAppView
  let sc: SeedClient

  beforeAll(async () => {
    network = await TestNetworkNoAppView.create({
      dbPostgresSchema: 'logical_sync',
      pds: {
        logicalSyncBatchSize: 3,
      },
    })
    sc = network.getSeedClient()
  })

  afterAll(async () => {
    await network.close()
  })

  describe('revision sync', () => {
    it('syncs repo revisions', async () => {
      let userId = 0
      const createUser = (id: number) => {
        return sc.createAccount(`user${id}`, {
          email: `user${id}@test.com`,
          handle: `user${id}.test`,
          password: `${id}-pass`,
        })
      }
      const ac = new AbortController()
      const revisionSub = new Subscription({
        service: sc.agent.service.origin.replace('http://', 'ws://'),
        method: ids.ComAtprotoSyncSubscribeRevisions,
        signal: ac.signal,
        getParams: async () => {
          return { cursor: 0 }
        },
        onReconnectError: (err) => {
          throw err
        },
        validate: (value) => {
          return lexicons.assertValidXrpcMessage<RevisionMessage>(
            ids.ComAtprotoSyncSubscribeRevisions,
            value,
          )
        },
      })
      let timer: NodeJS.Timeout
      const resetTimer = () => {
        clearTimeout(timer)
        timer = setTimeout(() => ac.abort(new DisconnectError()), 250)
      }
      await createUser(userId++)
      resetTimer()
      const items: RevisionMessage[] = []
      for await (const item of revisionSub) {
        resetTimer()
        items.push(item)
        if (userId >= 4) break
        await createUser(userId++)
      }
      expect(items).toHaveLength(4)
    })
  })

  describe('repo sync', () => {
    it('syncs records across revisions', async () => {
      let since: string | undefined
      let mst = await MST.create(new MemoryBlockstore())
      // create posts, sync and check
      const { did } = await sc.createAccount('alice', {
        email: 'alice@test.com',
        handle: 'alice.test',
        password: 'alice-pass',
      })
      for (let i = 0; i < 10; i++) {
        await createPost(sc, did)
      }
      let items = await getRepoSync(sc, { did })
      mst = await applySync(mst, items)
      await assertMatchingRoot(mst, items)
      // delete and create additional posts, sync and check
      for (let i = 0; i < 3; i++) {
        await deletePost(sc, sc.posts[did][i].ref.uri)
      }
      for (let i = 0; i < 2; i++) {
        await createPost(sc, did)
      }
      since = getSyncRoot(items).block.rev
      items = await getRepoSync(sc, { did, since })
      mst = await applySync(mst, items)
      await assertMatchingRoot(mst, items)
      // no-op, sync and check
      since = getSyncRoot(items).block.rev
      items = await getRepoSync(sc, { did, since })
      mst = await applySync(mst, items)
      await assertMatchingRoot(mst, items)
      // additional check on record count in the mst
      let total = 0
      for await (const entry of mst.walk()) {
        if (entry.isLeaf()) total++
      }
      expect(total).toBe(10 - 3 + 2)
    })

    it('syncs with concurrent updates', async () => {
      // create a decent amount of backfill
      const { did } = await sc.createAccount('bob', {
        email: 'bob@test.com',
        handle: 'bob.test',
        password: 'bob-pass',
      })
      for (let i = 0; i < 100; i++) {
        await createPost(sc, did)
      }
      // continuous writing and syncing
      // @NOTE not easy to reliably trigger the case of receiving a trailing root, may not occur here.
      const ac = new AbortController()
      const createConcurrent = (async () => {
        for (let i = 0; i < 500; i++) {
          await createPost(sc, did)
        }
        ac.abort()
      })()
      const syncConcurrent = (async () => {
        let since: string | undefined = undefined
        let mst = await MST.create(new MemoryBlockstore())
        let items: OutputSchema[]
        while (!ac.signal.aborted) {
          items = await getRepoSync(sc, { did, since })
          since = getSyncRoot(items).block.rev
          mst = await applySync(mst, items)
          await assertMatchingRoot(mst, items)
          await wait(5)
        }
      })()
      await Promise.all([createConcurrent, syncConcurrent])
    })
  })
})

const applySync = async (mst: MST, items: OutputSchema[]) => {
  for (const { path, cid, block } of items) {
    assert(
      block === null || cid !== null,
      'cannot specify a block without a cid',
    )
    if (cid && block) {
      const checkCid = await cidForCbor(block)
      assert(cid.equals(checkCid), 'cid does not match block')
    }
    if (path === null) continue
    if (cid === null) {
      mst = await mst.delete(path)
    } else {
      mst = await mst.add(path, cid)
    }
  }
  return mst
}

const assertMatchingRoot = async (mst: MST, items: OutputSchema[]) => {
  const root = getSyncRoot(items)
  assert(root.block.data.equals(await mst.getPointer()))
}

const getSyncRoot = (items: OutputSchema[]) => {
  let root = items.at(-1)
  if (!root || root.path !== null) {
    root = items.at(0)
  }
  assert(root && root.path === null && root.cid)
  assert(check.is(root.block, repo.schema.commit))
  return { path: null, cid: root.cid, block: root.block }
}

const getRepoSync = async (
  sc: SeedClient,
  params: { did: string; since?: string; collection?: string },
) => {
  const { did, since, collection } = params
  const url = new URL(sc.agent.service.origin)
  url.pathname = '/xrpc/com.atproto.sync.syncRepo'
  url.searchParams.set('did', did)
  if (since) url.searchParams.set('since', since)
  if (collection) url.searchParams.set('collection', collection)
  const res = await fetch(url)
  const output = await res.text()
  return output.split('\n').flatMap((item) => {
    return item ? (jsonStringToLex(item) as OutputSchema) : []
  })
}

const createPost = async (sc: SeedClient, did: string) => {
  return await sc.post(did, randomStr(32, 'base32'))
}

const deletePost = async (sc: SeedClient, uri: AtUri) => {
  return await sc.deletePost(uri.host, uri)
}
