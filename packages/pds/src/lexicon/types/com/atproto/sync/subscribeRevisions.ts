/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'
import { HandlerAuth, ErrorFrame } from '@atproto/xrpc-server'
import { IncomingMessage } from 'http'

export interface QueryParams {
  /** The last seen seq to continue the subscription. */
  cursor?: string
}

/** Indicates an change in repository revision, identity, or hosting status. */
export interface OutputSchema {
  /** The sequence tag of this message. */
  seq: string
  /** The repository's DID. */
  did: string
  /** The repository's latest revision. */
  rev: string
  /** The repository's hosting status. */
  status?: 'takendown' | 'suspended' | 'deleted' | 'deactivated' | (string & {})
  /** A token that changes when the repository's underlying identity has been updated. */
  ident?: string
  [k: string]: unknown
}

export type HandlerError = ErrorFrame<never>
export type HandlerOutput = HandlerError | OutputSchema
export type HandlerReqCtx<HA extends HandlerAuth = never> = {
  auth: HA
  params: QueryParams
  req: IncomingMessage
  signal: AbortSignal
}
export type Handler<HA extends HandlerAuth = never> = (
  ctx: HandlerReqCtx<HA>,
) => AsyncIterable<HandlerOutput>
