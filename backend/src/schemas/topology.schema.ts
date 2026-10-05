import { z } from 'zod';

/** Verifica la forma decimale puntata di un indirizzo IPv4. */
const isIpv4 = (value: string): boolean => {
  const octets = value.split('.');
  return (
    octets.length === 4 &&
    octets.every((octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255)
  );
};

const optionalIpv4 = z.string().trim().refine(isIpv4, 'Inserire un indirizzo IPv4 valido.').optional();
const optionalText = z.string().trim().min(1).max(255).optional();
const deviceBase = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(60),
  x: z.number().finite(),
  y: z.number().finite(),
  status: z.enum(['Online', 'Offline']),
});

const deviceSchema = z.discriminatedUnion('type', [
  deviceBase.extend({
    type: z.literal('PC'),
    ip: optionalIpv4,
    hostname: optionalText,
    operatingSystem: optionalText,
  }).strict(),
  deviceBase.extend({
    type: z.literal('Switch'),
    ip: optionalIpv4,
    portCount: z.number().int().positive(),
    model: optionalText,
  }).strict(),
  deviceBase.extend({
    type: z.literal('Router'),
    ip: optionalIpv4,
    hostname: optionalText,
    model: optionalText,
  }).strict(),
]);

const connectionSchema = z.object({
  id: z.number().int().positive(),
  sourceId: z.number().int().positive(),
  targetId: z.number().int().positive(),
}).strict();

/** Valida la struttura e la coerenza referenziale di una topologia da salvare. */
export const topologyWriteSchema = z.object({
  name: z.string().trim().min(1).max(100),
  devices: z.array(deviceSchema).max(500),
  connections: z.array(connectionSchema).max(2000),
}).strict().superRefine((topology, context) => {
  const deviceIds = new Set<number>();
  const connectionIds = new Set<number>();
  const addresses = new Set<string>();
  const devicesById = new Map(topology.devices.map((device) => [device.id, device]));
  const connectionPairs = new Set<string>();
  const portUsage = new Map<number, number>();

  topology.devices.forEach((device, index) => {
    if (deviceIds.has(device.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['devices', index, 'id'], message: 'Gli ID dei dispositivi devono essere univoci.' });
    }
    deviceIds.add(device.id);

    if ('ip' in device && device.ip) {
      if (addresses.has(device.ip)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['devices', index, 'ip'], message: 'Gli indirizzi IP devono essere univoci.' });
      }
      addresses.add(device.ip);
    }
  });

  topology.connections.forEach((connection, index) => {
    if (connectionIds.has(connection.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['connections', index, 'id'], message: 'Gli ID delle connessioni devono essere univoci.' });
    }
    connectionIds.add(connection.id);

    if (connection.sourceId === connection.targetId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['connections', index], message: 'Un dispositivo non può essere collegato a sé stesso.' });
      return;
    }

    const source = devicesById.get(connection.sourceId);
    const target = devicesById.get(connection.targetId);
    if (!source || !target) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['connections', index], message: 'Entrambi gli estremi della connessione devono esistere.' });
      return;
    }

    const pair = [connection.sourceId, connection.targetId].sort((left, right) => left - right).join(':');
    if (connectionPairs.has(pair)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['connections', index], message: 'Le connessioni devono essere univoche indipendentemente dalla direzione.' });
    }
    connectionPairs.add(pair);

    for (const endpoint of [source, target]) {
      if (endpoint.type === 'Switch') {
        const used = (portUsage.get(endpoint.id) ?? 0) + 1;
        portUsage.set(endpoint.id, used);
        if (used > endpoint.portCount) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['connections', index], message: `Lo switch ${endpoint.id} supera il numero di porte disponibili.` });
        }
      }
    }
  });
});

export type TopologyWrite = z.infer<typeof topologyWriteSchema>;
