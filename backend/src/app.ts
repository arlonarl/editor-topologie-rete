import 'dotenv/config';

import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import swaggerUi from 'swagger-ui-express';

import openApiDocument from './openapi.js';
import topologiesRouter from './routes/topologies.routes.js';

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:4200')
  .split(',')
  .map((origin) => origin.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  response.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? 'ok' : 'unavailable',
    database: databaseConnected ? 'connected' : 'disconnected',
  });
});

app.get('/api-docs/openapi.json', (_request, response) => {
  response.json(openApiDocument);
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, {
  customSiteTitle: 'API REST per la gestione delle topologie di rete | Swagger UI',
  swaggerOptions: { docExpansion: 'list', displayRequestDuration: true },
}));

app.use('/api/topologies', topologiesRouter);

app.use((_request, response) => {
  response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Percorso non trovato.' } });
});

/** Traduce gli errori di validazione e persistenza in risposte API coerenti. */
const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'I dati della richiesta non sono validi.',
        details: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      },
    });
    return;
  }

  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
    response.status(409).json({ error: { code: 'CONFLICT', message: 'Esiste già una risorsa con questo ID.' } });
    return;
  }

  console.error(error);
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Si è verificato un errore imprevisto.' } });
};

app.use(errorHandler);

export default app;
