import 'server-only';
import { z } from 'zod';

/**
 * Server-side configuration. Importing this from client code fails the build
 * (`server-only`), so secrets can never be bundled for the browser.
 */
const ServerEnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.6-flash'),
  /** Tried in order when the primary model is overloaded (503) or out of quota (429). */
  GEMINI_FALLBACK_MODELS: z
    .string()
    .default('gemini-3.7-flash,gemini-3.8-flash,gemini-3.5-flash,gemini-3-flash-preview,gemini-3.1-flash-lite')
    .transform((v) =>
      v
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
    ),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= ServerEnvSchema.parse({
    // Treat empty strings (e.g. an unfilled .env line) as unset.
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
    GEMINI_MODEL: process.env.GEMINI_MODEL || undefined,
    GEMINI_FALLBACK_MODELS: process.env.GEMINI_FALLBACK_MODELS || undefined,
  });
  return cached;
}

export class MissingConfigError extends Error {}

/** The API key, or a clear error for the AI route to return as a 503. */
export function requireGeminiApiKey(): string {
  const key = getServerEnv().GEMINI_API_KEY;
  if (!key) throw new MissingConfigError('GEMINI_API_KEY is not set. Add it to .env.local or your host settings.');
  return key;
}
