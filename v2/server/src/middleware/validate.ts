import { createMiddleware } from 'hono/factory';
import type { ZodSchema } from 'zod';

export function validateBody(schema: ZodSchema) {
  return createMiddleware(async (c, next) => {
    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const result = schema.safeParse(body);
    if (!result.success) {
      return c.json({
        error: 'Validation failed',
        details: result.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      }, 400);
    }

    c.set('validatedBody' as never, result.data as never);
    await next();
  });
}
