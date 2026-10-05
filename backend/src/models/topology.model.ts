import { Schema, model } from 'mongoose';

import type { TopologyWrite } from '../schemas/topology.schema.js';

/** Forma completa del documento persistito, incluso l'ID numerico esposto dall'API. */
export type TopologyRecord = TopologyWrite & { id: number };

const topologySchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true },
    devices: { type: [Schema.Types.Mixed], required: true, default: [] },
    connections: { type: [Schema.Types.Mixed], required: true, default: [] },
  },
  { timestamps: true, versionKey: false },
);

const counterSchema = new Schema({
  _id: { type: String, required: true },
  value: { type: Number, required: true, default: 0 },
});

const Topology = model<TopologyRecord>('Topology', topologySchema);
const Counter = model('Counter', counterSchema);

/** Incrementa in modo atomico il contatore degli ID pubblici delle topologie. */
export const getNextTopologyId = async (): Promise<number> => {
  const counter = await Counter.findByIdAndUpdate(
    'topology',
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  if (!counter) {
    throw new Error('Impossibile assegnare un ID alla topologia.');
  }

  return counter.value;
};

export default Topology;
