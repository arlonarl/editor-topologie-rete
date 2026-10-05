import { DeviceBase } from './device';

/** Dispositivo terminale con dati opzionali di rete e sistema operativo. */
export type Pc = DeviceBase & {
  type: 'PC';
  ip?: string;
  hostname?: string;
  operatingSystem?: string;
};
