// @NOTE also used by app-view (moderation)
export interface RecordSync {
  path: string
  rev: string
  cid: string | null
}

export const tableName = 'record_sync'

export type PartialDB = { [tableName]: RecordSync }
