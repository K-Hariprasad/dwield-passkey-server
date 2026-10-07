import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import path from 'path';
import { env } from './config/env';
import { logger } from './config/logger';
import { isDatabaseConnected } from './config/database';
import { errorHandler } from './middleware/error-handler';
import { NotFoundError } from './shared/errors/app-error';
import { registrationRouter } from './modules/registration/registration.routes';
import { authenticationRouter } from './modules/authentication/authentication.routes';
import { credentialRouter } from './modules/credentials/credential.routes';
import { stepUpRouter } from './modules/step-up/step-up.routes';

export const createApp = (): Express => {
  const app = express();

  // Security HTTP headers
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );

  // CORS configuration
  const configuredOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is explicitly allowed or matches wildcards/Vercel
      const isAllowed =
        configuredOrigins.includes('*') ||
        configuredOrigins.includes(origin) ||
        env.NODE_ENV === 'development' ||
        origin.endsWith('.vercel.app') ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1');

      if (isAllowed) {
        callback(null, true);
      } else {
        logger.warn({ origin, configuredOrigins }, 'CORS request blocked');
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Api-Key',
      'X-Dwield-User-Token',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    exposedHeaders: ['Authorization'],
    optionsSuccessStatus: 204,
  };

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));

  // Serve static browser test client
  app.use(express.static(path.join(process.cwd(), 'public')));

  // HTTP Request Logging (suppressed in test environment)
  if (env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger,
        autoLogging: {
          ignore: (req) => req.url?.startsWith('/health') ?? false,
        },
      })
    );
  }

  // Health Endpoints
  app.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
    });
  });

  app.get('/health/ready', (_req: Request, res: Response) => {
    const dbConnected = isDatabaseConnected();

    if (dbConnected) {
      res.status(200).json({
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Passkey Registration Routes
  app.use('/v1/passkeys/registration', registrationRouter);

  // Passkey Authentication Routes
  app.use('/v1/passkeys/authentication', authenticationRouter);

  // Passkey Management Routes
  app.use('/v1/passkeys', credentialRouter);

  // Step-Up Verification Routes (Customer Backend Integration)
  app.use('/v1/step-up', stepUpRouter);

  // Catch 404 routes
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`Endpoint not found: ${req.method} ${req.path}`));
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
};
