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
  const expectIssue = (payload: unknown, path: (string | number)[]) => {
    const result = topologyWriteSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path }),
      ]));
    }
  };

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

  it('accepts an empty topology', () => {
    expect(topologyWriteSchema.parse({ name: 'Empty', devices: [], connections: [] })).toEqual({
      name: 'Empty', devices: [], connections: [],
    });
  });

  it('trims names and optional device fields', () => {
    const result = topologyWriteSchema.parse({
      name: '  Network  ',
      devices: [{ id: 1, type: 'PC', name: '  PC  ', x: -10, y: 0, status: 'Online',
        ip: '  192.168.1.1  ', hostname: '  lab  ', operatingSystem: '  Linux  ' }],
      connections: [],
    });
    expect(result.name).toBe('Network');
    expect(result.devices[0]).toMatchObject({ name: 'PC', ip: '192.168.1.1', hostname: 'lab', operatingSystem: 'Linux' });
  });

  it.each(['', '   ', 'a'.repeat(101)])('rejects an invalid topology name (%s)', (name) => {
    expectIssue({ ...validTopology, name }, ['name']);
  });

  it.each(['256.1.1.1', '192.168.1', '01.2.3.4', '1.2.3.-1', 'localhost', ''])('rejects invalid IPv4 %s', (ip) => {
    expectIssue({ ...validTopology, devices: [
      { ...validTopology.devices[1], ip },
    ], connections: [] }, ['devices', 0, 'ip']);
  });

  it.each(['0.0.0.0', '255.255.255.255'])('accepts IPv4 boundary %s', (ip) => {
    expect(topologyWriteSchema.safeParse({ ...validTopology, devices: [
      { ...validTopology.devices[1], ip },
    ], connections: [] }).success).toBe(true);
  });

  it.each([
    ['id', 0], ['id', 1.5], ['name', ''], ['name', 'a'.repeat(61)],
    ['type', 'Printer'], ['status', 'Unknown'], ['x', Infinity], ['y', NaN],
  ])('rejects invalid device field %s=%s', (field, value) => {
    expectIssue({ ...validTopology, devices: [
      { ...validTopology.devices[1], [field as string]: value },
    ], connections: [] }, ['devices', 0, field as string]);
  });

  it.each([0, -1, 1.5])('rejects invalid switch capacity %s', (portCount) => {
    expectIssue({ ...validTopology, devices: [
      { ...validTopology.devices[0], portCount },
    ], connections: [] }, ['devices', 0, 'portCount']);
  });

  it('requires portCount for switches', () => {
    expectIssue({ name: 'Lab', devices: [
      { id: 1, type: 'Switch', name: 'Switch', x: 0, y: 0, status: 'Online' },
    ], connections: [] }, ['devices', 0, 'portCount']);
  });

  it('rejects duplicate device IDs', () => {
    expectIssue({ ...validTopology, devices: [
      validTopology.devices[0], { ...validTopology.devices[1], id: 1 },
    ] }, ['devices', 1, 'id']);
  });

  it('rejects duplicate IP addresses after trimming', () => {
    expectIssue({ ...validTopology, devices: validTopology.devices.map((device) =>
      device.id === 3 ? { ...device, ip: ' 192.168.1.10 ' } : device,
    ) }, ['devices', 2, 'ip']);
  });

  it('rejects duplicate connection IDs', () => {
    expectIssue({ ...validTopology, connections: [
      ...validTopology.connections, { id: 1, sourceId: 2, targetId: 3 },
    ] }, ['connections', 1, 'id']);
  });

  it('rejects a connection to the same device', () => {
    expectIssue({ ...validTopology, connections: [{ id: 1, sourceId: 2, targetId: 2 }] }, ['connections', 0]);
  });

  it.each([
    { id: 1, sourceId: 99, targetId: 2 },
    { id: 1, sourceId: 2, targetId: 99 },
  ])('rejects a connection with missing endpoints (%j)', (connection) => {
    expectIssue({ ...validTopology, connections: [connection] }, ['connections', 0]);
  });

  it.each([
    { id: 2, sourceId: 2, targetId: 3 },
    { id: 2, sourceId: 3, targetId: 2 },
  ])('rejects a duplicate connection regardless of direction (%j)', (duplicate) => {
    expectIssue({ ...validTopology, connections: [
      { id: 1, sourceId: 2, targetId: 3 }, duplicate,
    ] }, ['connections', 1]);
  });

  it.each([
    { id: 2, sourceId: 1, targetId: 3 },
    { id: 2, sourceId: 3, targetId: 1 },
  ])('counts switch ports at either endpoint (%j)', (connection) => {
    expectIssue({ ...validTopology, connections: [...validTopology.connections, connection] }, ['connections', 1]);
  });

  it('rejects unexpected top-level fields including client-assigned IDs', () => {
    expectIssue({ ...validTopology, id: 42 }, []);
  });

  it('rejects fields belonging to another device type', () => {
    expectIssue({ ...validTopology, devices: [
      { ...validTopology.devices[1], portCount: 8 },
    ], connections: [] }, ['devices', 0]);
  });

  it('rejects unexpected connection fields', () => {
    expectIssue({ ...validTopology, connections: [
      { ...validTopology.connections[0], label: 'extra' },
    ] }, ['connections', 0]);
  });

  it('rejects more than 500 devices', () => {
    expectIssue({ name: 'Large', devices: Array.from({ length: 501 }, (_, index) => ({
      id: index + 1, type: 'PC', name: `PC-${index}`, x: 0, y: 0, status: 'Online',
    })), connections: [] }, ['devices']);
  });

  it('rejects more than 2000 connections', () => {
    // Unique pairs between PCs keep the size limit independent of switch capacity.
    const devices = Array.from({ length: 65 }, (_, index) => ({
      id: index + 1, type: 'PC', name: `PC-${index}`, x: 0, y: 0, status: 'Online',
    }));
    const connections = [];
    for (let sourceId = 1; sourceId <= 65; sourceId++) {
      for (let targetId = sourceId + 1; targetId <= 65; targetId++) {
        connections.push({ id: connections.length + 1, sourceId, targetId });
      }
    }
    expectIssue({ name: 'Large', devices, connections: connections.slice(0, 2001) }, ['connections']);
  });
});
