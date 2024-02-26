import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('revision')
    .addColumn('did', 'varchar', (col) => col.primaryKey())
    .addColumn('rev', 'varchar', (col) => col.notNull())
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('seqIdentity', 'integer', (col) => col.notNull())
    .execute()
  await db.schema
    .createIndex('revision_seq_did_idx')
    .on('revision')
    .columns(['seq', 'did'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('revision').execute()
}
