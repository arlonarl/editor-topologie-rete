import { Connection } from './connection';
import { Device } from './device-union';
import { DEFAULT_SWITCH_PORT_COUNT } from './switch';

/** Contenuto di una topologia importata, privo dell'ID assegnato dal backend. */
export type ImportedTopology = {
  name: string;
  devices: Device[];
  connections: Connection[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const isIpv4 = (value: string): boolean => {
  const octets = value.split('.');
  return (
    octets.length === 4 &&
    octets.every((octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255)
  );
};

const optionalText = (record: Record<string, unknown>, field: string): string | undefined => {
  const value = record[field];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 255) {
    const fieldName = field === 'operatingSystem' ? 'sistema operativo' : field;
    throw new Error(`Il campo ${fieldName} deve contenere testo e non superare 255 caratteri.`);
  }
  return value.trim();
};

const optionalIp = (record: Record<string, unknown>): string | undefined => {
  const ip = optionalText(record, 'ip');
  if (ip && !isIpv4(ip)) {
    throw new Error('Gli indirizzi IP dei dispositivi devono essere indirizzi IPv4 validi.');
  }
  return ip;
};

/** Converte e valida un dispositivo proveniente da un file JSON non attendibile. */
const parseDevice = (value: unknown, index: number): Device => {
  if (!isRecord(value)) {
    throw new Error(`Il dispositivo ${index + 1} deve essere un oggetto.`);
  }

  const { id, name, x, y } = value;
  if (!isPositiveInteger(id)) {
    throw new Error(`Il dispositivo ${index + 1} deve avere un ID intero positivo.`);
  }
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) {
    throw new Error(`Il dispositivo ${index + 1} deve avere un nome da 1 a 60 caratteri.`);
  }
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
    throw new Error(`Il dispositivo ${index + 1} deve avere coordinate x e y valide.`);
  }

  const status = value['status'];
  if (status !== undefined && status !== 'Online' && status !== 'Offline') {
    throw new Error(`Il dispositivo ${index + 1} ha uno stato non valido.`);
  }

  const base = { id, name: name.trim(), x, y, status: status ?? 'Online' } as const;
  if (typeof value['type'] !== 'string') {
    throw new Error(`Il dispositivo ${index + 1} ha un tipo non valido.`);
  }

  switch (value['type'].toLowerCase()) {
    case 'pc': {
      const ip = optionalIp(value);
      const hostname = optionalText(value, 'hostname');
      const operatingSystem = optionalText(value, 'operatingSystem');
      return {
        ...base,
        type: 'PC',
        ...(ip ? { ip } : {}),
        ...(hostname ? { hostname } : {}),
        ...(operatingSystem ? { operatingSystem } : {}),
      };
    }
    case 'switch': {
      const ip = optionalIp(value);
      const portCount = value['portCount'] ?? DEFAULT_SWITCH_PORT_COUNT;
      if (!isPositiveInteger(portCount)) {
        throw new Error(`Lo switch ${id} deve avere un numero intero positivo di porte.`);
      }
      const model = optionalText(value, 'model');
      return { ...base, type: 'Switch', ...(ip ? { ip } : {}), portCount, ...(model ? { model } : {}) };
    }
    case 'router': {
      const ip = optionalIp(value);
      const hostname = optionalText(value, 'hostname');
      const model = optionalText(value, 'model');
      return {
        ...base,
        type: 'Router',
        ...(ip ? { ip } : {}),
        ...(hostname ? { hostname } : {}),
        ...(model ? { model } : {}),
      };
    }
    default:
      throw new Error(`Il tipo del dispositivo ${index + 1} non è supportato.`);
  }
};

/** Esporta lo stato corrente in un JSON leggibile e indipendente dal backend. */
export const serializeTopologyJson = (
  name: string,
  devices: Device[],
  connections: Connection[],
): string => JSON.stringify({ name, devices, connections }, null, 2);

/** Importa una topologia verificando riferimenti, duplicati e capacità degli switch. */
export const parseTopologyJson = (json: string): ImportedTopology => {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('Il file selezionato non contiene JSON valido.');
  }

  if (!isRecord(value)) {
    throw new Error('Il file JSON della topologia deve contenere un oggetto.');
  }
  if (typeof value['name'] !== 'string' || !value['name'].trim() || value['name'].trim().length > 100) {
    throw new Error('Il nome della topologia deve contenere da 1 a 100 caratteri.');
  }
  if (!Array.isArray(value['devices']) || value['devices'].length > 500) {
    throw new Error('I dispositivi della topologia devono essere un elenco di massimo 500 elementi.');
  }
  if (!Array.isArray(value['connections']) || value['connections'].length > 2000) {
    throw new Error('Le connessioni della topologia devono essere un elenco di massimo 2000 elementi.');
  }

  const devices = value['devices'].map(parseDevice);
  const deviceIds = new Set<number>();
  const addresses = new Set<string>();
  const devicesById = new Map<number, Device>();

  for (const device of devices) {
    if (deviceIds.has(device.id)) {
      throw new Error(`L'ID del dispositivo ${device.id} è duplicato.`);
    }
    deviceIds.add(device.id);
    devicesById.set(device.id, device);
    if ('ip' in device && device.ip) {
      if (addresses.has(device.ip)) {
        throw new Error(`L'indirizzo IP ${device.ip} è assegnato più di una volta.`);
      }
      addresses.add(device.ip);
    }
  }

  const connections = value['connections'].map((connection, index): Connection => {
    if (!isRecord(connection)) {
      throw new Error(`La connessione ${index + 1} deve essere un oggetto.`);
    }
    const { id, sourceId, targetId } = connection;
    if (!isPositiveInteger(id) || !isPositiveInteger(sourceId) || !isPositiveInteger(targetId)) {
      throw new Error(`La connessione ${index + 1} deve avere ID interi positivi.`);
    }
    return { id, sourceId, targetId };
  });

  const connectionIds = new Set<number>();
  const pairs = new Set<string>();
  const portUsage = new Map<number, number>();
  for (const connection of connections) {
    if (connectionIds.has(connection.id)) {
      throw new Error(`L'ID della connessione ${connection.id} è duplicato.`);
    }
    connectionIds.add(connection.id);
    if (connection.sourceId === connection.targetId) {
      throw new Error('Un dispositivo non può essere collegato a sé stesso.');
    }
    const source = devicesById.get(connection.sourceId);
    const target = devicesById.get(connection.targetId);
    if (!source || !target) {
      throw new Error('Ogni connessione deve fare riferimento a dispositivi esistenti.');
    }
    const pair = [connection.sourceId, connection.targetId].sort((a, b) => a - b).join(':');
    if (pairs.has(pair)) {
      throw new Error('Non sono ammesse connessioni duplicate.');
    }
    pairs.add(pair);
    for (const endpoint of [source, target]) {
      if (endpoint.type === 'Switch') {
        const count = (portUsage.get(endpoint.id) ?? 0) + 1;
        if (count > endpoint.portCount) {
          throw new Error(`Lo switch ${endpoint.id} supera il numero di porte disponibili.`);
        }
        portUsage.set(endpoint.id, count);
      }
    }
  }

  return { name: value['name'].trim(), devices, connections };
};
