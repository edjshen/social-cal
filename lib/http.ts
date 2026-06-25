/**
 * Tiny request helpers shared across API routes.
 */

/**
 * Parse JSON body. On parse failure, returns [null, errorResponse].
 * On success, returns [body, null]. Route pattern:
 *   const [body, err] = await parseJsonBody(request);
 *   if (err) return err;
 */
export async function parseJsonBody(
  request: Request,
  { maxBytes = 64 * 1024 }: { maxBytes?: number } = {}
): Promise<[unknown, null] | [null, Response]> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength && contentLength > maxBytes) {
    return [null, Response.json({ error: 'Request body is too large' }, { status: 413 })];
  }
  try {
    return [await request.json(), null];
  } catch {
    return [null, Response.json({ error: 'Invalid JSON' }, { status: 400 })];
  }
}
