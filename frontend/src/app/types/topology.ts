import { Device } from './device-union';
import { Connection } from './connection';

/** Insieme persistibile di dispositivi e collegamenti di una rete. */
export type Topology = {
  id: number;
  name: string;
  devices: Device[];
  connections: Connection[];
};
