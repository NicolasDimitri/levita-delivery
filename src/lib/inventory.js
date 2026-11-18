export function parseInventoryQuantity(value) {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,3})?$/.test(normalized)) return null;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number <= 0 || number >= 1000000000000) return null;
  return normalized;
}

export async function fetchAllInventoryRows(client, table, columns, orderColumns = ['id']) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = client.from(table).select(columns);
    for (const column of orderColumns) query = query.order(column);
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

export async function submitInventoryMovement(client, operation) {
  const { error } = await client.rpc('inventory_record_movement', operation.params);
  if (!error) return { status: 'success' };

  const { data, error: lookupError } = await client.from('inventory_operations')
    .select('id').eq('id', operation.params.p_operation).maybeSingle();
  if (!lookupError && data) return { status: 'success' };

  // Only a database rejection establishes that the transaction did not commit.
  if (!lookupError && error.code && error.code !== '23505' && /^[0-9A-Z]{5}$/.test(error.code)) {
    return { status: 'rejected', message: error.message };
  }
  return { status: 'unknown', message: error.message };
}
