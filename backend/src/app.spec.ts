import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  find: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findOneAndDelete: vi.fn(),
  nextId: vi.fn(),
}));
const databaseConnection = vi.hoisted(() => ({ readyState: 0 }));

vi.mock('mongoose', () => ({ default: { connection: databaseConnection } }));

// Exercise the real Express routes and middleware without requiring MongoDB.
vi.mock('./models/topology.model.js', () => ({
  default: persistence,
  getNextTopologyId: persistence.nextId,
}));

import app from './app.js';

const payload = { name: 'Lab network', devices: [], connections: [] };
const record = { id: 7, ...payload, _id: 'internal-id', __v: 0, createdAt: new Date() };
const publicRecord = { id: 7, ...payload };

describe('HTTP API', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
      server.once('error', reject);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    vi.resetAllMocks();
    databaseConnection.readyState = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  const request = (path: string, method = 'GET', body?: unknown) => fetch(`${baseUrl}${path}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });

  it.each([
    [1, 200, 'ok', 'connected'],
    [0, 503, 'unavailable', 'disconnected'],
    [2, 503, 'unavailable', 'disconnected'],
  ] as const)('reports database state %i in health responses', async (state, status, health, database) => {
    databaseConnection.readyState = state;
    const response = await request('/api/health');
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ status: health, database });
  });

  it('returns a JSON 404 for an unknown route', async () => {
    const response = await request('/api/unknown');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('serves the OpenAPI document', async () => {
    const response = await request('/api-docs/openapi.json');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      openapi: '3.0.3', paths: { '/api/topologies': expect.any(Object) },
    });
  });

  it('lists topologies ordered by public ID without database metadata', async () => {
    const sort = vi.fn().mockResolvedValue([record]);
    persistence.find.mockReturnValue({ sort });
    const response = await request('/api/topologies');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([publicRecord]);
    expect(sort).toHaveBeenCalledWith({ id: 1 });
  });

  it('returns an empty list when there are no saved topologies', async () => {
    persistence.find.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) });
    const response = await request('/api/topologies');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('retrieves a topology using its numeric ID', async () => {
    persistence.findOne.mockResolvedValue(record);
    const response = await request('/api/topologies/7');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(publicRecord);
    expect(persistence.findOne).toHaveBeenCalledWith({ id: 7 });
  });

  it('creates a topology with a server-assigned ID and normalized name', async () => {
    persistence.nextId.mockResolvedValue(7);
    persistence.create.mockResolvedValue(record);
    const response = await request('/api/topologies', 'POST', { ...payload, name: '  Lab network  ' });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(publicRecord);
    expect(persistence.nextId).toHaveBeenCalledOnce();
    expect(persistence.create).toHaveBeenCalledWith(publicRecord);
  });

  it('replaces a topology and returns the updated document', async () => {
    const updated = { ...payload, name: 'Updated network' };
    persistence.findOneAndUpdate.mockResolvedValue({ id: 7, ...updated });
    const response = await request('/api/topologies/7', 'PUT', updated);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 7, ...updated });
    expect(persistence.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 7 }, updated, { new: true, runValidators: true },
    );
    expect(persistence.nextId).not.toHaveBeenCalled();
  });

  it('deletes a topology with an empty 204 response', async () => {
    persistence.findOneAndDelete.mockResolvedValue(record);
    const response = await request('/api/topologies/7', 'DELETE');
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(persistence.findOneAndDelete).toHaveBeenCalledWith({ id: 7 });
  });

  it.each(['GET', 'PUT', 'DELETE'])('returns 404 for %s on a missing topology', async (method) => {
    persistence.findOne.mockResolvedValue(null);
    persistence.findOneAndUpdate.mockResolvedValue(null);
    persistence.findOneAndDelete.mockResolvedValue(null);
    const response = await request('/api/topologies/7', method, method === 'PUT' ? payload : undefined);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it.each(['0', '-1', '1.5', 'abc', '9007199254740992'])('rejects invalid ID %s before reading the database', async (id) => {
    const response = await request(`/api/topologies/${id}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', details: [{ path: ['id'], message: expect.any(String) }] },
    });
    expect(persistence.findOne).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PUT'])('rejects an invalid %s body before writing to the database', async (method) => {
    const response = await request(method === 'POST' ? '/api/topologies' : '/api/topologies/7', method, {
      ...payload, name: '',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', details: [{ path: ['name'], message: expect.any(String) }] },
    });
    expect(persistence.nextId).not.toHaveBeenCalled();
    expect(persistence.create).not.toHaveBeenCalled();
    expect(persistence.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 409 when persistence reports a duplicate ID', async () => {
    persistence.nextId.mockResolvedValue(7);
    persistence.create.mockRejectedValue({ code: 11000 });
    const response = await request('/api/topologies', 'POST', payload);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('returns a generic 500 without exposing database error details', async () => {
    const error = new Error('private database credentials');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    persistence.findOne.mockRejectedValue(error);
    const response = await request('/api/topologies/7');
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    expect(JSON.stringify(body)).not.toContain(error.message);
    expect(log).toHaveBeenCalledWith(error);
  });
});
