export function getAtPath(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

export function setAtPath<T extends Record<string, unknown>>(
  source: T,
  path: string,
  value: unknown,
): T {
  const keys = path.split(".");
  const clone = structuredClone(source);
  let cursor: Record<string, unknown> = clone;

  keys.slice(0, -1).forEach((key) => {
    const existing = cursor[key];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  });

  cursor[keys[keys.length - 1]] = value;
  return clone;
}
