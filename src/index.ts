import { getEnv, validateEnv, loadDotenv, env } from './config/env';
import { logger, sanitizeError } from './observability/logger';

export { env, getEnv, validateEnv } from './config/env';
export { logger } from './observability/logger';

/**
 * Bootstrap the application.
 * Performs fail-fast environment validation as the very first step.
 */
export async function bootstrap() {
  let validatedConfig;
  try {
    loadDotenv();
    validatedConfig = getEnv();
  } catch (err: unknown) {
    // Print sanitized error without secrets to stderr and terminate with exit code 1
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[FATAL] Startup configuration validation failed:\n${message}`);
    process.exit(1);
  }

  logger.info(
    { nodeEnv: validatedConfig.NODE_ENV, port: validatedConfig.PORT, host: validatedConfig.HOST },
    'D&D Chat Bot Application initialized'
  );

  return validatedConfig;
}

if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    logger.fatal({ err: sanitizeError(err) }, 'Failed to bootstrap application');
    process.exit(1);
  });
}
