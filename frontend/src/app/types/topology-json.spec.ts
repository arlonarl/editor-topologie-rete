import { describe, expect, it } from 'vitest';

import { parseTopologyJson, serializeTopologyJson } from './topology-json';

describe('topology JSON', () => {
  it('should round-trip a topology without a remote ID', () => {
    const json = serializeTopologyJson(
      'Lab network',
      [{ id: 1, type: 'PC', name: 'PC-1', x: 20, y: 30, status: 'Offline' }],
      [],
    );

    expect(JSON.parse(json)).not.toHaveProperty('id');
    expect(parseTopologyJson(json)).toEqual({
      name: 'Lab network',
      devices: [{ id: 1, type: 'PC', name: 'PC-1', x: 20, y: 30, status: 'Offline' }],
      connections: [],
    });
  });

  it('should accept the README example device casing and default devices online', () => {
    const parsed = parseTopologyJson(JSON.stringify({
      name: 'Lab network',
      devices: [
        { id: 1, type: 'router', name: 'Router-1', x: 20, y: 30 },
        { id: 2, type: 'switch', name: 'Switch-1', x: 80, y: 90 },
      ],
      connections: [{ id: 1, sourceId: 1, targetId: 2 }],
    }));

    expect(parsed.devices).toMatchObject([
      { type: 'Router', status: 'Online' },
      { type: 'Switch', status: 'Online', portCount: 8 },
    ]);
  });

  it('should preserve imported offline device status', () => {
    const parsed = parseTopologyJson(JSON.stringify({
      name: 'Offline lab',
      devices: [{ id: 1, type: 'PC', name: 'PC-1', x: 20, y: 30, status: 'Offline' }],
      connections: [],
    }));

    expect(parsed.devices[0].status).toBe('Offline');
  });

  it('should reject invalid or duplicate connections', () => {
    const invalidTopology = {
      name: 'Lab network',
      devices: [{ id: 1, type: 'PC', name: 'PC-1', x: 20, y: 30 }],
      connections: [{ id: 1, sourceId: 1, targetId: 1 }],
    };

    expect(() => parseTopologyJson(JSON.stringify(invalidTopology))).toThrow('Un dispositivo non può essere collegato a sé stesso.');
  });
});
