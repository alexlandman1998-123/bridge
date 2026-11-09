// Extracted without changing validation, persistence order or recovery behaviour.

export function isOnConflictConstraintError(error, conflictColumn = '') {
  if (!error) {
    return false
  }

  const message = String(error.message || '').toLowerCase()
  const details = String(error.details || '').toLowerCase()
  const hint = String(error.hint || '').toLowerCase()
  const normalizedConflictColumn = String(conflictColumn || '')
    .trim()
    .toLowerCase()
  const missingConstraintMessage = 'there is no unique or exclusion constraint matching the on conflict specification'
  const mentionsMissingConstraint =
    message.includes(missingConstraintMessage) || details.includes(missingConstraintMessage)
  const mentionsOnConflict =
    message.includes('on conflict') || details.includes('on conflict') || hint.includes('on conflict')
  const mentionsConflictColumn = normalizedConflictColumn
    ? message.includes(normalizedConflictColumn) ||
      details.includes(normalizedConflictColumn) ||
      hint.includes(normalizedConflictColumn)
    : false

  return error.code === '42P10' || mentionsMissingConstraint || (mentionsOnConflict && mentionsConflictColumn)
}

export async function upsertByDevelopmentIdWithFallback(
  client,
  { table, payload, selectClause = '', expectSingleRow = false } = {},
) {
  let updateQuery = client.from(table).update(payload).eq('development_id', payload.development_id)
  if (selectClause) {
    updateQuery = updateQuery.select(selectClause).maybeSingle()
  } else {
    updateQuery = updateQuery.select('development_id').maybeSingle()
  }
  const updateResult = await updateQuery
  if (!updateResult.error && updateResult.data) {
    return {
      data: selectClause ? updateResult.data : null,
      error: null,
    }
  }

  if (updateResult.error && !isOnConflictConstraintError(updateResult.error, 'development_id')) {
    return updateResult
  }

  let insertQuery = client.from(table).insert(payload)
  if (selectClause) {
    insertQuery = insertQuery.select(selectClause)
  }
  if (expectSingleRow) {
    insertQuery = insertQuery.single()
  }
  return await insertQuery
}
