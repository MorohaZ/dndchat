import { env } from './config/env';
import { logger } from './observability/logger';

export { env } from './config/env';
export { logger } from './observability/logger';

async function bootstrap() {
  logger.info(
    { nodeEnv: env.NODE_ENV, port: env.PORT },
    'D&D Chat Bot Application initialized'
  );
}

if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    logger.fatal({ err }, 'Failed to bootstrap application');
    process.exit(1);
  });
}
