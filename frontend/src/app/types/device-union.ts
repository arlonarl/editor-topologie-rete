import { Pc } from './pc';
import { Switch } from './switch';
import { Router } from './router';

/** Unione dei dispositivi gestiti dal dominio della topologia. */
export type Device = Pc | Switch | Router;
