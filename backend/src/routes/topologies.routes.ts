import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import Topology, { getNextTopologyId } from '../models/topology.model.js';
import { topologyWriteSchema } from '../schemas/topology.schema.js';

const router = Router();

/** Converte il parametro URL in un ID numerico valido per l'API. */
const parseTopologyId = (rawId: string): number => {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new z.ZodError([
      { code: z.ZodIssueCode.custom, path: ['id'], message: 'L’ID della topologia deve essere un intero positivo.' },
    ]);
  }
  return id;
};

/** Elimina i dettagli interni di Mongoose dalla risposta HTTP. */
const toResponse = (document: mongoose.Document & {
  id: number;
  name: string;
  devices: unknown[];
  connections: unknown[];
}) => ({
  id: document.id,
  name: document.name,
  devices: document.devices,
  connections: document.connections,
});

router.get('/', async (_request, response) => {
  const topologies = await Topology.find().sort({ id: 1 });
  response.json(topologies.map(toResponse));
});

router.get('/:id', async (request, response) => {
  const id = parseTopologyId(request.params.id);
  const topology = await Topology.findOne({ id });

  if (!topology) {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Topologia non trovata.' } });
    return;
  }

  response.json(toResponse(topology));
});

router.post('/', async (request, response) => {
  const payload = topologyWriteSchema.parse(request.body);
  const id = await getNextTopologyId();
  const topology = await Topology.create({ ...payload, id });
  response.status(201).json(toResponse(topology));
});

router.put('/:id', async (request, response) => {
  const id = parseTopologyId(request.params.id);
  const payload = topologyWriteSchema.parse(request.body);
  const topology = await Topology.findOneAndUpdate({ id }, payload, {
    new: true,
    runValidators: true,
  });

  if (!topology) {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Topologia non trovata.' } });
    return;
  }

  response.json(toResponse(topology));
});

router.delete('/:id', async (request, response) => {
  const id = parseTopologyId(request.params.id);
  const topology = await Topology.findOneAndDelete({ id });

  if (!topology) {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Topologia non trovata.' } });
    return;
  }

  response.status(204).end();
});

export default router;
