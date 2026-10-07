import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './config/database';
import { TenantService } from './modules/tenants/tenant.service';

const startServer = async () => {
  try {
    // Attempt database connection
    await connectDatabase();

    // Seed default development tenant & API key for local POC convenience
    await TenantService.seedDevTenant();

    const app = createApp();

    const server = app.listen(env.PORT, () => {
      logger.info(
        { port: env.PORT, environment: env.NODE_ENV },
        `Dwield Passkey Server listening on port ${env.PORT}`
      );
    });

    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received termination signal, shutting down gracefully...');

      server.close(async () => {
        logger.info('HTTP server closed.');
        await disconnectDatabase();
        logger.info('Graceful shutdown completed.');
        process.exit(0);
      });

      // Force exit if shutdown hangs
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout.');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}
