export function isMissingSchemaError(error: unknown) {
  const code = String((error as { code?: string })?.code || "");
  return code === "42P01" || code === "PGRST205";
}

export function isMissingColumnError(error: unknown, columnName = "") {
  const code = String((error as { code?: string })?.code || "");
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  const normalizedColumnName = String(columnName || "").toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    (message.includes("column") && (!normalizedColumnName || message.includes(normalizedColumnName)))
  );
}

export function isMissingTableError(error: unknown, tableName = "") {
  const code = String((error as { code?: string })?.code || "");
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  const normalizedTableName = String(tableName || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes("table") && (!normalizedTableName || message.includes(normalizedTableName)))
  );
}
