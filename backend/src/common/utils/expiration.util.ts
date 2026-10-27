export function startOfTodayUtc(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function toExpirationDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function isExpired(
  expirationDate: Date,
  now: Date = new Date(),
): boolean {
  return expirationDate.getTime() < startOfTodayUtc(now).getTime();
}

export function formatExpirationDate(expirationDate: Date): string {
  return expirationDate.toISOString().slice(0, 10);
}
