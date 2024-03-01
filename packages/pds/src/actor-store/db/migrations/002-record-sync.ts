import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('record_sync')
    .addColumn('path', 'varchar', (col) => col.primaryKey())
    .addColumn('rev', 'varchar', (col) => col.notNull())
    .addColumn('cid', 'varchar')
    .execute()
  await db.schema
    .createIndex('record_sync_rev_idx')
    .on('record_sync')
    .columns(['rev', 'path'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('record_sync').execute()
}
