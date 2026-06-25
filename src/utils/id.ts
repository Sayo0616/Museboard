export function createId(prefix: string): string {
  const suffix = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${suffix}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
