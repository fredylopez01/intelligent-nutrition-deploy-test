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

export function businessDate(now = new Date()): Date {
  const local = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
}

export function businessDayBounds(date: string): { start: Date; end: Date } {
  const start = new Date(
    Date.parse(`${date.slice(0, 10)}T00:00:00.000Z`) + BOGOTA_OFFSET_MS,
  );
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) };
}
