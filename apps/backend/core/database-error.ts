function hasErrorCode(value: unknown, code: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    value.code === code
  );
}

/** DrizzleがラップしたPostgreSQLエラーを含め、SQLSTATEを判定する。 */
export function hasDatabaseErrorCode(error: unknown, code: string): boolean {
  if (hasErrorCode(error, code)) {
    return true;
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    hasErrorCode(error.cause, code)
  );
}
