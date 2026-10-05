import { DeviceBase } from './device';

/** Numero di porte assegnato a uno switch appena creato. */
export const DEFAULT_SWITCH_PORT_COUNT = 8;

/** Dispositivo di commutazione con un numero finito di porte disponibili. */
export type Switch = DeviceBase & {
  type: 'Switch';
  ip?: string;
  portCount: number;
  model?: string;
};
