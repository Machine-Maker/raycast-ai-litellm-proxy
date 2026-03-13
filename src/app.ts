import express, { Express } from 'express';
import { Middleware } from './middleware/index.js';
import { makeApiRoutes } from './routes/api.js';
import { Config } from './config.js';
import { ModelConfig } from './data/models.js';
import { ModelStore } from './data/model-store.js';
import { DEFAULT_JSON_LIMIT } from './constants.js';
import OpenAI from 'openai';

export interface AppContext {
  middleware: Middleware;
  config: Config;
  models: ModelConfig[];
  modelStore: ModelStore;
  openai: OpenAI;
}

export function makeApp(ctx: AppContext): Express {
  const app = express();
  app.use(express.json({ limit: DEFAULT_JSON_LIMIT }));
  app.use(ctx.middleware.logger);

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      models: ctx.models.length,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', makeApiRoutes(ctx));

  app.use(ctx.middleware.routeNotFound);
  app.use(ctx.middleware.errorHandler);

  return app;
}
