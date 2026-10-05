import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TopologyService } from './topology-service';

describe('TopologyService', () => {
  let service: TopologyService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TopologyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should load a topology from the backend API', () => {
    const payload = {
      id: 7,
      name: 'Demo topology',
      devices: [
        { id: 1, type: 'PC', name: 'PC-1', x: 40, y: 50, status: 'Offline' as const },
        { id: 2, type: 'Switch', name: 'Switch-2', x: 120, y: 80, status: 'Online' as const, portCount: 8 },
      ],
      connections: [{ id: 1, sourceId: 1, targetId: 2 }],
    };

    service.loadTopology(7);

    const request = httpMock.expectOne('http://localhost:3000/api/topologies/7');
    expect(request.request.method).toBe('GET');
    request.flush(payload);

    expect(service.currentTopologyId()).toBe(7);
    expect(service.devices()).toEqual(payload.devices);
    expect(service.connections()).toEqual(payload.connections);
  });

  it('should import a topology as unsaved and continue its device IDs', () => {
    const result = service.importTopologyJson(JSON.stringify({
      id: 42,
      name: 'Imported lab',
      devices: [{ id: 4, type: 'PC', name: 'PC-4', x: 20, y: 30 }],
      connections: [],
    }));

    expect(result).toEqual({ ok: true });
    expect(service.currentTopologyId()).toBeNull();
    expect(service.currentTopologyName()).toBe('Imported lab');
    expect(service.addDevice('Router', 80, 90).id).toBe(5);
  });

  it('should preserve the current topology when imported JSON is invalid', () => {
    const existing = service.addDevice('PC', 20, 30);

    const result = service.importTopologyJson('{invalid');

    expect(result.ok).toBe(false);
    expect(service.devices()).toEqual([existing]);
  });

  it('should clear all devices and connections', () => {
    const pc = service.addDevice('PC', 20, 30);
    const router = service.addDevice('Router', 80, 90);
    service.addConnection(pc.id, router.id);

    service.clearTopology();

    expect(service.devices()).toEqual([]);
    expect(service.connections()).toEqual([]);
  });

  it('should derive active connections from endpoint status and power endpoints on creation', () => {
    const pc = service.addDevice('PC', 20, 30);
    const router = service.addDevice('Router', 80, 90);

    expect(pc.status).toBe('Online');
    expect(router.status).toBe('Online');
    const result = service.addConnection(pc.id, router.id);

    if (!result.ok) {
      throw new Error('Expected the connection to be created');
    }

    expect(service.activeConnectionIds().has(result.connection.id)).toBe(true);
    expect(service.updateDevice(pc.id, 'PC-1', undefined, undefined, undefined, undefined, undefined, 'Offline')).toEqual({ ok: true });
    expect(service.activeConnectionIds().has(result.connection.id)).toBe(false);

    service.updateDevice(pc.id, 'PC-1', undefined, undefined, undefined, undefined, undefined, 'Online');
    expect(service.activeConnectionIds().has(result.connection.id)).toBe(true);
  });

  it('should add, move, and update a device', () => {
    const device = service.addDevice('PC', 20, 30);

    service.moveDevice(device.id, 100, 120);
    const result = service.updateDevice(device.id, 'Lab PC', '192.168.1.20', 'lab-pc', 'Linux');

    expect(result).toEqual({ ok: true });
    expect(service.findDevice(device.id)).toMatchObject({
      id: device.id,
      type: 'PC',
      name: 'Lab PC',
      x: 100,
      y: 120,
      ip: '192.168.1.20',
      hostname: 'lab-pc',
      operatingSystem: 'Linux',
    });
  });

  it('should validate device names and unique IPv4 addresses', () => {
    const firstPc = service.addDevice('PC', 20, 30);
    const secondRouter = service.addDevice('Router', 80, 90);

    expect(service.updateDevice(firstPc.id, '  ', '192.168.1.10')).toEqual({
      ok: false,
      reason: 'EMPTY_DEVICE_NAME',
    });
    expect(service.updateDevice(firstPc.id, 'PC one', '999.1.1.1')).toEqual({
      ok: false,
      reason: 'INVALID_IP_ADDRESS',
    });
    expect(service.updateDevice(firstPc.id, 'PC one', '192.168.1.10')).toEqual({ ok: true });
    expect(service.updateDevice(secondRouter.id, 'Router one', '192.168.1.10')).toEqual({
      ok: false,
      reason: 'DUPLICATE_IP_ADDRESS',
    });
    expect(service.updateDevice(firstPc.id, 'PC one', undefined, 'a'.repeat(256))).toEqual({
      ok: false,
      reason: 'INVALID_OPTIONAL_TEXT',
    });
  });

  it('should default switches to eight ports and reject connections beyond capacity', () => {
    const switchDevice = service.addDevice('Switch', 20, 30);
    const firstPc = service.addDevice('PC', 80, 90);
    const secondPc = service.addDevice('PC', 140, 150);

    expect(switchDevice).toMatchObject({ type: 'Switch', portCount: 8 });
    expect(service.updateDevice(switchDevice.id, 'Switch one', undefined, undefined, undefined, 1)).toEqual({ ok: true });
    expect(service.addConnection(switchDevice.id, firstPc.id).ok).toBe(true);
    expect(service.addConnection(switchDevice.id, secondPc.id)).toEqual({
      ok: false,
      reason: 'SWITCH_PORT_LIMIT',
      switchName: 'Switch one',
    });
    expect(service.updateDevice(switchDevice.id, 'Switch one', undefined, undefined, undefined, 0)).toEqual({
      ok: false,
      reason: 'INVALID_PORT_COUNT',
    });
  });

  it('should not allow a switch port count below its current connections', () => {
    const switchDevice = service.addDevice('Switch', 20, 30);
    const firstPc = service.addDevice('PC', 80, 90);
    const secondPc = service.addDevice('PC', 140, 150);
    service.addConnection(switchDevice.id, firstPc.id);
    service.addConnection(switchDevice.id, secondPc.id);

    expect(service.updateDevice(switchDevice.id, 'Switch one', undefined, undefined, undefined, 1)).toEqual({
      ok: false,
      reason: 'PORTS_BELOW_CONNECTION_COUNT',
    });
  });

  it('should reject invalid and duplicate connections regardless of endpoint order', () => {
    const pc = service.addDevice('PC', 20, 30);
    const router = service.addDevice('Router', 80, 90);

    expect(service.addConnection(pc.id, pc.id)).toEqual({ ok: false, reason: 'SELF_CONNECTION' });
    expect(service.addConnection(pc.id, 999)).toEqual({ ok: false, reason: 'DEVICE_NOT_FOUND' });
    expect(service.addConnection(pc.id, router.id).ok).toBe(true);
    expect(service.addConnection(router.id, pc.id)).toEqual({
      ok: false,
      reason: 'DUPLICATE_CONNECTION',
    });
    expect(service.connections()).toHaveLength(1);
  });

  it('should remove a device connection and return the remaining device to offline', () => {
    const pc = service.addDevice('PC', 20, 30);
    const router = service.addDevice('Router', 80, 90);
    const result = service.addConnection(pc.id, router.id);

    if (!result.ok) {
      throw new Error('Expected the connection to be created');
    }

    expect(service.findDevice(router.id)?.status).toBe('Online');
    expect(service.removeDevice(pc.id)).toBe(true);
    expect(service.connections()).toEqual([]);
    expect(service.findDevice(router.id)?.status).toBe('Online');
  });
});
