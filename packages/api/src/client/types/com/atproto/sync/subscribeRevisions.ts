/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { Headers, XRPCError } from '@atproto/xrpc'
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { isObj, hasProp } from '../../../../util'
import { lexicons } from '../../../../lexicons'
import { CID } from 'multiformats/cid'

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
