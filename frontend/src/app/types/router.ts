import { DeviceBase } from './device';

/** Dispositivo di instradamento con dati opzionali di rete. */
export type Router = DeviceBase & {
  type: 'Router';
  ip?: string;
  hostname?: string;
  model?: string;
};
