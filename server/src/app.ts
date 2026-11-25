import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { sessionsRouter } from './modules/auth/auth.routes';
import { tripsRouter } from './modules/trips/trips.routes';
import { usersRouter } from './modules/users/users.routes';

/** createApp tách khỏi server.ts để test bằng supertest, không cần mở cổng. */
export function createApp() {
  const app = express();
  if (config.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/sessions', sessionsRouter);
  api.use('/users', usersRouter);
  api.use('/trips', tripsRouter);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
