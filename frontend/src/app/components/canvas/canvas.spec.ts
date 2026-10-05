import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { TopologyService } from '../../services/topology-service';
import { Canvas } from './canvas';

describe('Canvas', () => {
  let fixture: ComponentFixture<Canvas>;
  let topologyService: TopologyService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Canvas],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Canvas);
    topologyService = TestBed.inject(TopologyService);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should zoom within limits and reset the canvas view', () => {
    const canvas = fixture.componentInstance;

    canvas.zoomIn();
    expect(canvas.zoom()).toBe(1.1);

    for (let step = 0; step < 20; step++) {
      canvas.zoomIn();
    }
    expect(canvas.zoom()).toBe(2);

    canvas.resetView();
    expect(canvas.zoom()).toBe(1);
    expect(canvas.panX()).toBe(0);
    expect(canvas.panY()).toBe(0);
  });

  it('should pan the canvas when the pan mode is active', () => {
    const canvas = fixture.componentInstance;
    canvas.setMode('pan');
    canvas.onCanvasPointerDown(new MouseEvent('pointerdown', {
      button: 0,
      clientX: 10,
      clientY: 15,
    }) as unknown as PointerEvent);
    canvas.onPointerMove(new MouseEvent('pointermove', {
      clientX: 40,
      clientY: 55,
    }) as unknown as PointerEvent);

    expect(canvas.panX()).toBe(30);
    expect(canvas.panY()).toBe(40);
    expect(canvas.isPanning()).toBe(true);

    canvas.onPointerUp();
    expect(canvas.isPanning()).toBe(false);
  });

  it('should render each device type marker for the type color styles', () => {
    topologyService.addDevice('PC', 20, 30);
    topologyService.addDevice('Switch', 80, 90);
    topologyService.addDevice('Router', 140, 150);
    fixture.detectChanges();

    const devices: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('.device');
    expect(Array.from(devices, (device) => device.dataset['deviceType'])).toEqual(['PC', 'Switch', 'Router']);
  });

  it('should add a device through the toolbar', () => {
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[data-action="add-pc"]');

    button.click();
    fixture.detectChanges();
    expect(topologyService.devices()).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('.toolbar-status')?.textContent).toContain('Posiziona PC');

    const canvas: HTMLDivElement = fixture.nativeElement.querySelector('.canvas-container');
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 120, clientY: 100 }));
    fixture.detectChanges();

    expect(topologyService.devices()).toHaveLength(1);
    expect(topologyService.devices()[0].type).toBe('PC');
  });

  it('should offer device types at the clicked canvas position', () => {
    const canvas: HTMLDivElement = fixture.nativeElement.querySelector('.canvas-container');
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 150, clientY: 180 }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[aria-label="Scegli il dispositivo da inserire"]')).toBeTruthy();

    const addRouterButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-action="place-router"]');
    addRouterButton.click();
    fixture.detectChanges();

    expect(topologyService.devices()).toMatchObject([{ type: 'Router', x: 150, y: 180 }]);
    expect(fixture.nativeElement.querySelector('[aria-label="Scegli il dispositivo da inserire"]')).toBeNull();
  });

  it('should clear the canvas and reset interaction state after confirmation', () => {
    const pc = topologyService.addDevice('PC', 20, 30);
    const router = topologyService.addDevice('Router', 80, 90);
    topologyService.addConnection(pc.id, router.id);
    fixture.componentInstance.selectedDeviceId.set(pc.id);
    fixture.componentInstance.detailDeviceId.set(router.id);
    fixture.detectChanges();

    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const clearButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-action="clear-canvas"]');
    clearButton.click();
    fixture.detectChanges();
    confirmSpy.mockRestore();

    expect(topologyService.devices()).toEqual([]);
    expect(topologyService.connections()).toEqual([]);
    expect(fixture.componentInstance.selectedDeviceId()).toBeNull();
    expect(fixture.componentInstance.detailDeviceId()).toBeNull();
    expect(fixture.componentInstance.mode()).toBe('edit');
  });

  it('should preserve the current topology when creating a new one is cancelled', () => {
    topologyService.addDevice('PC', 20, 30);
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);

    fixture.componentInstance.startNewTopology();

    expect(topologyService.devices()).toHaveLength(1);
    confirmSpy.mockRestore();
  });

  it('should show a visible error when a connection is duplicated', () => {
    const addPcButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-action="add-pc"]');
    const addSwitchButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-action="add-switch"]');

    const canvas: HTMLDivElement = fixture.nativeElement.querySelector('.canvas-container');

    addPcButton.click();
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 100 }));
    addSwitchButton.click();
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 220, clientY: 140 }));
    fixture.detectChanges();

    const connectButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-mode="connect"]');
    connectButton.click();
    fixture.detectChanges();

    let devices: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('.device');
    devices[0].click();
    devices[1].click();
    fixture.detectChanges();

    devices = fixture.nativeElement.querySelectorAll('.device');
    devices[0].click();
    devices[1].click();
    fixture.detectChanges();

    expect(topologyService.connections()).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('già collegati');
  });

  it('should select and remove a connection, updating endpoint statuses', () => {
    const addPcButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-action="add-pc"]');
    const addRouterButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-action="add-router"]');
    const canvas: HTMLDivElement = fixture.nativeElement.querySelector('.canvas-container');

    addPcButton.click();
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 100 }));
    addRouterButton.click();
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 220, clientY: 140 }));
    fixture.detectChanges();

    const connectButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-mode="connect"]');
    connectButton.click();
    fixture.detectChanges();
    const devices: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('.device');
    devices[0].click();
    devices[1].click();
    fixture.detectChanges();

    const connectionLine: SVGLineElement = fixture.nativeElement.querySelector('.connection-line');
    connectionLine.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedConnectionId()).toBe(topologyService.connections()[0].id);
    expect(fixture.nativeElement.querySelector('[data-action="remove-connection"]')).toBeTruthy();

    const removeButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-action="remove-connection"]');
    removeButton.click();
    fixture.detectChanges();

    expect(topologyService.connections()).toHaveLength(0);
    expect(topologyService.devices().map((device) => device.status)).toEqual(['Online', 'Online']);
    expect(fixture.componentInstance.selectedConnectionId()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-action="remove-connection"]')).toBeNull();
  });

  it('should show device details after a context-menu interaction', () => {
    const addRouterButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-action="add-router"]');

    addRouterButton.click();
    fixture.detectChanges();
    const canvas: HTMLDivElement = fixture.nativeElement.querySelector('.canvas-container');
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 120, clientY: 100 }));
    fixture.detectChanges();

    const deviceButton: HTMLButtonElement = fixture.nativeElement.querySelector('.device');
    deviceButton.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.device-details')?.textContent).toContain('Router-1');
  });

  it('should confirm successful device updates and clear the message on the next edit', () => {
    const device = topologyService.addDevice('PC', 40, 50);
    fixture.componentInstance.detailDeviceId.set(device.id);
    fixture.detectChanges();

    fixture.componentInstance.saveDeviceDetails({ id: device.id, name: 'Lab PC' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('Modifiche applicate');

    const nameInput: HTMLInputElement = fixture.nativeElement.querySelector('.device-details [name="name"]');
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
  });

  it('should save edited device details back to the topology service', async () => {
    const addPcButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-action="add-pc"]');
    addPcButton.click();
    fixture.detectChanges();

    const canvas: HTMLDivElement = fixture.nativeElement.querySelector('.canvas-container');
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 120, clientY: 100 }));
    fixture.detectChanges();

    const deviceButton: HTMLButtonElement = fixture.nativeElement.querySelector('.device');
    deviceButton.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    const nameInput: HTMLInputElement = fixture.nativeElement.querySelector('.device-details [name="name"]');
    nameInput.value = 'Lab PC';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    const ipInput: HTMLInputElement = fixture.nativeElement.querySelector('.device-details [name="ip"]');
    ipInput.value = '192.168.1.20';
    ipInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    const saveButton: HTMLButtonElement = fixture.nativeElement.querySelector('.device-details button[type="submit"]');
    expect(saveButton.disabled).toBe(false);
    saveButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(topologyService.devices()[0]).toMatchObject({
      name: 'Lab PC',
      ip: '192.168.1.20',
    });
  });
});
