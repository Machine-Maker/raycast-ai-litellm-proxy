import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod/v4';
import { HttpError } from '../errors/index.js';
import {
  ModelNotFoundError,
  LiteLLMConnectionError,
  LiteLLMAuthError,
  LiteLLMNotFoundError,
  StreamingError,
} from '../errors/custom-errors.js';
import { HttpLogger, pinoHttp } from 'pino-http';
import { Logger } from 'pino';
import { randomUUID } from 'node:crypto';
import { makeOllamaChunk, makeSSEMessage } from '../util.js';

interface ErrorBody {
  status: number;
  error: string;
  name: string;
}

export interface Middleware {
  logger: HttpLogger<Request, Response>;
  routeNotFound(req: Request, res: Response, next: NextFunction): void;
  errorHandler(err: Error, req: Request, res: Response<ErrorBody>, next: NextFunction): void;
}

export const makeMiddleware = (logger: Logger): Middleware => {
  return {
    logger: pinoHttp({
      logger: logger.child({ category: 'HttpEvent' }),
      genReqId: function (req, res) {
        const id = randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: function (req, res, err) {
        if (res.statusCode >= 400 && res.statusCode < 500) {
          return 'warn';
        } else if (res.statusCode >= 500 || err) {
          return 'error';
        }
        return 'info';
      },
      quietReqLogger: true,
    }),

    routeNotFound: (_req, _res, _next) => {
      throw new HttpError(404, 'Route not found');
    },

    errorHandler: (err, req, res, _next) => {
      const loggerMsg = 'ErrorHandler';
      const isChatCompletionEndpoint = req.path === '/api/chat';

      if (res.writableEnded) {
        req.log.error(err, loggerMsg);
        return;
      }

      // For chat completion endpoint, check if streaming has started
      if (isChatCompletionEndpoint && res.headersSent) {
        req.log.error(err, loggerMsg);
        const ollamaChunk = makeOllamaChunk('Unknown', '', true);
        res.write(makeSSEMessage(ollamaChunk));
        res.end();
        return;
      }

      // Use JSON responses for other cases
      if (err instanceof HttpError) {
        req.log.warn(err, loggerMsg);
        res.status(err.status).send({ status: err.status, error: err.message, name: err.name });
        return;
      } else if (err instanceof ModelNotFoundError) {
        req.log.warn(err, loggerMsg);
        res.status(400).send({ status: 400, error: err.message, name: err.name });
        return;
      } else if (err instanceof LiteLLMAuthError) {
        req.log.error(err, loggerMsg);
        res.status(401).send({ status: 401, error: err.message, name: err.name });
        return;
      } else if (err instanceof LiteLLMNotFoundError) {
        req.log.error(err, loggerMsg);
        res.status(404).send({ status: 404, error: err.message, name: err.name });
        return;
      } else if (err instanceof LiteLLMConnectionError) {
        req.log.error(err, loggerMsg);
        res.status(503).send({ status: 503, error: err.message, name: err.name });
        return;
      } else if (err instanceof StreamingError) {
        req.log.error(err, loggerMsg);
        res.status(500).send({ status: 500, error: err.message, name: err.name });
        return;
      } else if (err instanceof ZodError) {
        req.log.warn(err, loggerMsg);
        res.status(400).send({ status: 400, error: 'Invalid request', name: 'ZodError' });
        return;
      }

      req.log.error(err, loggerMsg);
      res.status(500).send({
        status: 500,
        error: err.message ?? 'Something went wrong',
        name: 'InternalServerError',
      });
    },
  };
};
