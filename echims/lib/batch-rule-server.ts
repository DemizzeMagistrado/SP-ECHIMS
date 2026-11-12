import { DEFAULT_BATCH_RULE, parseBatchRule, type BatchRule } from '@/lib/vaccination-config'

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** The batch number format from Settings › Vaccine Catalog (default when unset or unreadable). */
export async function loadBatchRule(db: Db): Promise<BatchRule> {
  const { data, error } = await db.from('vaccination_setting').select('value').eq('key', 'batch_number_format').maybeSingle()
  return error || !data ? DEFAULT_BATCH_RULE : parseBatchRule(data.value)
}
