export const BUSINESS_TIME_ZONE = "America/Bogota";

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

export function startOfBusinessDay(now = new Date()): Date {
  const local = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  const midnight = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  return new Date(midnight + BOGOTA_OFFSET_MS);
}
