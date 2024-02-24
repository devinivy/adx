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

export type OutputSchema =
  | Commit
  | Identity
  | { $type: string; [k: string]: unknown }
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

/** Indicates an updated repository revision. */
export interface Commit {
  /** The did of the relevant repository. */
  did: string
  /** The revision of the relevant repository. */
  rev: string
  /** The sequence tag of this message. */
  seq: string
  [k: string]: unknown
}

export function isCommit(v: unknown): v is Commit {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'com.atproto.sync.subscribeRevisions#commit'
  )
}

export function validateCommit(v: unknown): ValidationResult {
  return lexicons.validate('com.atproto.sync.subscribeRevisions#commit', v)
}

/** Hints at an identity update for the repository. */
export interface Identity {
  /** The did of the relevant repository. */
  did: string
  /** The revision of the relevant repository. */
  rev: string
  /** The sequence tag of this message. */
  seq: string
  [k: string]: unknown
}

export function isIdentity(v: unknown): v is Identity {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    v.$type === 'com.atproto.sync.subscribeRevisions#identity'
  )
}

export function validateIdentity(v: unknown): ValidationResult {
  return lexicons.validate('com.atproto.sync.subscribeRevisions#identity', v)
}
