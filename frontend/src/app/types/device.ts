/** Campi condivisi da ogni dispositivo rappresentato nel canvas. */
export type DeviceBase = {
    id: number;
    name: string;
    x: number;
    y: number;
    status: 'Online' | 'Offline';
  };

