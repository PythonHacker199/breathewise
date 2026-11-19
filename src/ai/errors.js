/**
 * One-line, log-safe description of an error (includes Gemini's upstream reason when present).
 * @param {unknown} err
 */
export function describeError(err) {
  if (!(err instanceof Error)) return String(err);
  const detail = /** @type {{ detail?: string }} */ (err).detail;
  return detail ? `${err.message} ${detail}` : err.message;
}
