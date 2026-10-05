import { describe, expect, it } from 'vitest';

import { topologyWriteSchema } from './topology.schema.js';

const validTopology = {
  name: 'Lab network',
  devices: [
    { id: 1, type: 'Switch', name: 'Switch-1', x: 200, y: 100, status: 'Offline', portCount: 1 },
    { id: 2, type: 'PC', name: 'PC-1', x: 100, y: 200, status: 'Online', ip: '192.168.1.10' },
    { id: 3, type: 'Router', name: 'Router-1', x: 300, y: 200, status: 'Online', ip: '192.168.1.1' },
  ],
  connections: [
    { id: 1, sourceId: 1, targetId: 2 },
  ],
};

describe('topologyWriteSchema', () => {
  it('accepts a valid topology', () => {
    expect(topologyWriteSchema.safeParse(validTopology).success).toBe(true);
  });

  it('rejects duplicate IP addresses and connections beyond switch capacity', () => {
    const invalidTopology = {
      ...validTopology,
      devices: validTopology.devices.map((device) =>
        device.id === 3 ? { ...device, ip: '192.168.1.10' } : device,
      ),
      connections: [
        ...validTopology.connections,
        { id: 2, sourceId: 1, targetId: 3 },
      ],
    };

    const result = topologyWriteSchema.safeParse(invalidTopology);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain('Gli indirizzi IP devono essere univoci.');
      expect(result.error.issues.some((issue) => issue.message.includes('supera il numero di porte disponibili'))).toBe(true);
    }
  });
});
