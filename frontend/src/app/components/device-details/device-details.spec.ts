import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { DeviceDetails } from './device-details';

describe('DeviceDetails', () => {
  let component: DeviceDetails;
  let fixture: ComponentFixture<DeviceDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeviceDetails],
    }).compileComponents();

    fixture = TestBed.createComponent(DeviceDetails);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('device', {
      id: 1,
      type: 'PC',
      name: 'PC-1',
      x: 40,
      y: 50,
      status: 'Offline',
    });
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit edited PC details without mutating the input device', () => {
    let savedDetails: unknown;
    component.save.subscribe((details) => (savedDetails = details));

    const nameInput: HTMLInputElement = fixture.nativeElement.querySelector('[name="name"]');
    const ipInput: HTMLInputElement = fixture.nativeElement.querySelector('[name="ip"]');
    nameInput.value = '  Lab PC  ';
    nameInput.dispatchEvent(new Event('input'));
    ipInput.value = '192.168.1.20';
    ipInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const saveButton: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    saveButton.click();

    expect(savedDetails).toEqual({
      id: 1,
      name: 'Lab PC',
      status: 'Offline',
      ip: '192.168.1.20',
      hostname: undefined,
      operatingSystem: undefined,
    });
    expect(component.device().name).toBe('PC-1');
  });

  it('should emit an immediate Online/Offline status change without saving the form', () => {
    const statusChange = vi.spyOn(component.statusChange, 'emit');
    const statusInput: HTMLInputElement = fixture.nativeElement.querySelector('[name="status"]');

    statusInput.checked = true;
    statusInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(statusChange).toHaveBeenCalledWith({ id: 1, status: 'Online' });
    expect(component.draft.status).toBe('Online');
  });
});
