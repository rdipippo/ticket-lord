import type { Request, Response, NextFunction } from 'express';

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function keysToCamel<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(keysToCamel) as unknown as T;
  if (obj instanceof Date) return obj;
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [toCamel(k), keysToCamel(v)])
    ) as T;
  }
  return obj;
}

export function camelizeResponse(_req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => originalJson(keysToCamel(body));
  next();
}
