import 'dotenv/config';

import mongoose from 'mongoose';

import app from './app.js';

const port = Number(process.env.PORT ?? 3000);
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error('MONGODB_URI is required');
}

await mongoose.connect(mongoUri);

const server = app.listen(port, () => {
  console.log(`Topology API listening on http://localhost:${port}`);
});

/** Chiude server HTTP e connessione MongoDB in risposta ai segnali di arresto. */
const shutdown = async (): Promise<void> => {
  server.close();
  await mongoose.disconnect();
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
