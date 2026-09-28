import { getServerEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

/** Deployment smoke check. Reports whether AI is configured without exposing the key. */
export function GET() {
  const env = getServerEnv();
  return Response.json({
    status: 'ok',
    aiConfigured: Boolean(env.GEMINI_API_KEY),
    model: env.GEMINI_MODEL,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  });
}
