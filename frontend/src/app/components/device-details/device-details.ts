import { Component, input, OnChanges, output } from '@angular/core';
import { Device } from '../../types/device-union';
import { FormsModule } from '@angular/forms';

type DeviceDetailsDraft = {
  name: string;
  status: Device['status'];
  ip: string;
  hostname: string;
  operatingSystem: string;
  portCount: number | null;
  model: string;
};

/** Dati modificabili emessi dal pannello dei dettagli. */
export type DeviceDetailsUpdate = {
  id: number;
  name: string;
  status?: Device['status'];
  ip?: string;
  hostname?: string;
  operatingSystem?: string;
  portCount?: number;
  model?: string;
};

export type DeviceStatusChange = {
  id: number;
  status: Device['status'];
};

@Component({
  selector: 'app-device-details',
  imports: [FormsModule],
  templateUrl: './device-details.html',
  styleUrl: './device-details.css',
})
/** Gestisce la bozza del form e invia le modifiche al canvas proprietario. */
export class DeviceDetails implements OnChanges {
  readonly device = input.required<Device>();
  readonly saveError = input<string | null>(null);
  readonly saveSuccess = input<string | null>(null);
  readonly close = output<void>();
  readonly save = output<DeviceDetailsUpdate>();
  readonly statusChange = output<DeviceStatusChange>();
  readonly draftChanged = output<void>();
  draft: DeviceDetailsDraft = this.createDraft();

  /** Ricrea la bozza quando il pannello visualizza un dispositivo diverso. */
  ngOnChanges(): void {
    const device = this.device();
    this.draft = {
      name: device.name,
      status: device.status,
      ip: 'ip' in device ? device.ip ?? '' : '',
      hostname: 'hostname' in device ? device.hostname ?? '' : '',
      operatingSystem: 'operatingSystem' in device ? device.operatingSystem ?? '' : '',
      portCount: 'portCount' in device ? device.portCount : null,
      model: 'model' in device ? device.model ?? '' : '',
    };
  }

  /** Verifica se la bozza differisce dai valori attualmente salvati nel dispositivo. */
  hasChanges(): boolean {
    const device = this.device();
    const optionalValue = (value: string): string | undefined => value.trim() || undefined;

    if (this.draft.name.trim() !== device.name || this.draft.status !== device.status) {
      return true;
    }

    if (optionalValue(this.draft.ip) !== ('ip' in device ? device.ip : undefined)) {
      return true;
    }

    if (optionalValue(this.draft.model) !== ('model' in device ? device.model : undefined)) {
      return true;
    }

    switch (device.type) {
      case 'PC':
        return (
          optionalValue(this.draft.hostname) !== device.hostname ||
          optionalValue(this.draft.operatingSystem) !== device.operatingSystem
        );
      case 'Switch':
        return (
          (this.draft.portCount ?? device.portCount) !== device.portCount
        );
      case 'Router':
        return optionalValue(this.draft.hostname) !== device.hostname;
    }
  }

  onSave(): void {
    if (!this.hasChanges()) {
      return;
    }

    const device = this.device();
    const details = {
      id: device.id,
      name: this.draft.name.trim(),
      status: this.draft.status ?? device.status,
    };
    const optionalValue = (value: string): string | undefined => value.trim() || undefined;

    switch (device.type) {
      case 'PC':
        this.save.emit({
          ...details,
          ip: optionalValue(this.draft.ip),
          hostname: optionalValue(this.draft.hostname),
          operatingSystem: optionalValue(this.draft.operatingSystem),
        });
        break;
      case 'Switch':
        this.save.emit({
          ...details,
          ip: optionalValue(this.draft.ip),
          portCount: this.draft.portCount ?? undefined,
          model: optionalValue(this.draft.model),
        });
        break;
      case 'Router':
        this.save.emit({
          ...details,
          ip: optionalValue(this.draft.ip),
          hostname: optionalValue(this.draft.hostname),
          model: optionalValue(this.draft.model),
        });
        break;
    }
  }

  /** Applica subito il cambio di stato, senza richiedere il salvataggio del form. */
  onStatusToggle(event: Event): void {
    const input = event.target as HTMLInputElement;
    const status: Device['status'] = input.checked ? 'Online' : 'Offline';
    this.draft.status = status;
    this.statusChange.emit({ id: this.device().id, status });
    this.draftChanged.emit();
  }

  private createDraft(): DeviceDetailsDraft {
    return {
      name: '',
      status: 'Online',
      ip: '',
      hostname: '',
      operatingSystem: '',
      portCount: null,
      model: '',
    };
  }
}
