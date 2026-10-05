import { HttpErrorResponse } from '@angular/common/http';
import { computed, Injectable, inject, signal } from '@angular/core';

import { Connection } from '../types/connection';
import { Device } from '../types/device-union';
import { DeviceUpdateResult } from '../types/device-update-result';
import { Topology } from '../types/topology';
import { parseTopologyJson, serializeTopologyJson } from '../types/topology-json';
import { DEFAULT_SWITCH_PORT_COUNT } from '../types/switch';
import { TopologyApiService } from './topology-api-service';

/** Esito della creazione di un collegamento, con eventuale motivo di rifiuto. */
type ConnectionResult =
  | { ok: true; connection: Connection }
  | {
      ok: false;
      reason: 'SELF_CONNECTION' | 'DEVICE_NOT_FOUND' | 'DUPLICATE_CONNECTION' | 'SWITCH_PORT_LIMIT';
      switchName?: string;
    };

@Injectable({
  providedIn: 'root',
})
/**
 * Mantiene lo stato della topologia e applica le regole di dominio prima della persistenza.
 */
export class TopologyService {
  private readonly topologyApi = inject(TopologyApiService);
  private readonly devicesSignal = signal<Device[]>([]);
  private readonly connectionsSignal = signal<Connection[]>([]);
  private readonly topologiesSignal = signal<Topology[]>([]);

  readonly devices = this.devicesSignal.asReadonly();
  readonly connections = this.connectionsSignal.asReadonly();
  readonly topologies = this.topologiesSignal.asReadonly();
  /**
   * Collegamenti visualmente attivi: entrambi gli estremi devono essere online.
   * Il calcolo è derivato dallo stato dei dispositivi e non modifica i dati della connessione.
   */
  readonly activeConnectionIds = computed(() => {
    const statuses = new Map(this.devices().map((device) => [device.id, device.status]));
    return new Set(
      this.connections()
        .filter(
          (connection) =>
            statuses.get(connection.sourceId) === 'Online' &&
            statuses.get(connection.targetId) === 'Online',
        )
        .map((connection) => connection.id),
    );
  });
  readonly currentTopologyId = signal<number | null>(null);
  readonly currentTopologyName = signal('Nuova topologia');
  readonly isLoading = signal(false);
  readonly isRefreshingTopologies = signal(false);
  readonly lastError = signal<string | null>(null);
  readonly lastSuccess = signal<string | null>(null);

  private nextDeviceId = 1;
  private nextConnectionId = 1;

  /** Ripristina il canvas a una topologia nuova, senza modificare dati remoti. */
  clearTopology(): void {
    this.devicesSignal.set([]);
    this.connectionsSignal.set([]);
    this.currentTopologyId.set(null);
    this.currentTopologyName.set('Nuova topologia');
    this.lastError.set(null);
    this.lastSuccess.set(null);
    this.nextDeviceId = 1;
    this.nextConnectionId = 1;
  }

  /** Aggiorna l'elenco delle topologie disponibili nel backend. */
  refreshTopologies(showSuccess = true): void {
    this.isRefreshingTopologies.set(true);
    if (showSuccess) {
      this.lastError.set(null);
      this.lastSuccess.set(null);
    }

    this.topologyApi.list().subscribe({
      next: (topologies) => {
        this.topologiesSignal.set(topologies);
        if (showSuccess) {
          this.lastSuccess.set('Elenco delle topologie aggiornato.');
        }
        this.isRefreshingTopologies.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.lastError.set(this.formatApiError(error));
        this.isRefreshingTopologies.set(false);
      },
    });
  }

  /** Carica una topologia remota e ricalcola i prossimi identificativi locali. */
  loadTopology(topologyId: number): void {
    this.isLoading.set(true);
    this.lastError.set(null);
    this.lastSuccess.set(null);

    this.topologyApi.getById(topologyId).subscribe({
      next: (topology) => {
        this.applyTopology(topology);
        this.lastSuccess.set(`Topologia "${topology.name}" caricata dal database.`);
        this.isLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.lastError.set(this.formatApiError(error));
        this.isLoading.set(false);
      },
    });
  }

  /** Crea o aggiorna la topologia corrente a seconda della presenza dell'ID remoto. */
  saveTopology(name = 'Topologia'): void {
    const topologyId = this.currentTopologyId();
    const payload = this.buildTopologyPayload(name);
    this.isLoading.set(true);
    this.lastError.set(null);
    this.lastSuccess.set(null);

    const request = topologyId === null
      ? this.topologyApi.create(payload)
      : this.topologyApi.update(topologyId, payload);

    request.subscribe({
      next: (topology) => {
        this.applyTopology(topology);
        this.refreshTopologies(false);
        this.lastSuccess.set('Topologia salvata nel database.');
        this.isLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.lastError.set(this.formatApiError(error));
        this.isLoading.set(false);
      },
    });
  }

  deleteTopology(topologyId: number): void {
    this.isLoading.set(true);
    this.lastError.set(null);
    this.lastSuccess.set(null);

    this.topologyApi.delete(topologyId).subscribe({
      next: () => {
        this.refreshTopologies(false);
        if (this.currentTopologyId() === topologyId) {
          this.clearTopology();
        }
        this.lastSuccess.set('Topologia eliminata dal database.');
        this.isLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.lastError.set(this.formatApiError(error));
        this.isLoading.set(false);
      },
    });
  }

  /** Restituisce il JSON esportabile della topologia visibile nel canvas. */
  exportTopologyJson(): string {
    return serializeTopologyJson(this.currentTopologyName(), this.devices(), this.connections());
  }

  /**
   * Sostituisce lo stato locale soltanto dopo una validazione completa del JSON importato.
   * Una topologia importata non possiede un ID remoto, quindi il salvataggio successivo ne creerà una nuova.
   */
  importTopologyJson(json: string): { ok: true } | { ok: false; error: string } {
    try {
      const topology = parseTopologyJson(json);
      this.devicesSignal.set(topology.devices);
      this.connectionsSignal.set(topology.connections);
      this.currentTopologyId.set(null);
      this.currentTopologyName.set(topology.name);
      this.nextDeviceId = Math.max(0, ...topology.devices.map((device) => device.id)) + 1;
      this.nextConnectionId = Math.max(0, ...topology.connections.map((connection) => connection.id)) + 1;
      this.lastError.set(null);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossibile importare la topologia.';
      return { ok: false, error: message };
    }
  }

  private buildTopologyPayload(name: string): Omit<Topology, 'id'> {
    return {
      name,
      devices: this.devices(),
      connections: this.connections(),
    };
  }

  /**
   * Applica una topologia persistita e prepara gli ID per successive aggiunte locali.
   * Gli ID sono calcolati dal valore massimo per evitare collisioni dopo un caricamento o un'importazione.
   */
  private applyTopology(topology: Topology): void {
    this.devicesSignal.set(topology.devices);
    this.connectionsSignal.set(topology.connections);
    this.currentTopologyId.set(topology.id);
    this.currentTopologyName.set(topology.name);
    this.nextDeviceId = Math.max(1, ...topology.devices.map((device) => device.id)) + 1;
    this.nextConnectionId = Math.max(1, ...topology.connections.map((connection) => connection.id)) + 1;
  }

  private formatApiError(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Servizio non disponibile. Verifica che il server API sia attivo e riprova.';
    }

    const message = error.error?.error?.message ?? error.error?.message ?? 'L’operazione sulla topologia non è riuscita.';
    return typeof message === 'string' ? message : 'L’operazione sulla topologia non è riuscita.';
  }

  /** Crea un dispositivo con valori iniziali coerenti con la sua tipologia. */
  addDevice(type: Device['type'], x: number, y: number): Device {
    const id = this.nextDeviceId++;
    let newDevice: Device;

    switch (type) {
      case 'PC':
        newDevice = { id, type: type, name: `PC-${id}`, x, y, status: 'Online' };
        break;
      case 'Switch':
        newDevice = {
          id,
          type,
          name: `Switch-${id}`,
          x,
          y,
          status: 'Online',
          portCount: DEFAULT_SWITCH_PORT_COUNT,
        };
        break;
      case 'Router':
          newDevice = { id, type, name: `Router-${id}`, x, y, status: 'Online' };
        break;
    }

    this.devicesSignal.update((devices) => [...devices, newDevice]);
    return newDevice;
  }

  /** Aggiorna esclusivamente le coordinate di un dispositivo. */
  moveDevice(deviceId: number, x: number, y: number): void {
    this.devicesSignal.update((devices) =>
      devices.map((device) => (device.id === deviceId ? { ...device, x, y } : device)),
    );
  }

  /**
   * Valida e aggiorna i campi condivisi e specifici di un dispositivo.
   * Gli indirizzi IP sono univoci nella topologia; i campi testuali facoltativi sono normalizzati e limitati a 255 caratteri,
   * come nel contratto dell'API, così l'errore viene segnalato prima del salvataggio remoto.
   */
  updateDevice(deviceId: number, name: string, ip?: string, hostname?: string, operatingSystem?: string, portCount?: number, model?: string, status?: Device['status']): DeviceUpdateResult {
    const device = this.findDevice(deviceId);

    if (!device) {
      return { ok: false, reason: 'DEVICE_NOT_FOUND' };
    }

    const normalizedName = name.trim();
    if (!normalizedName) {
      return { ok: false, reason: 'EMPTY_DEVICE_NAME' };
    }

    if (status !== undefined && status !== 'Online' && status !== 'Offline') {
      return { ok: false, reason: 'INVALID_DEVICE_STATUS' };
    }

    if (![hostname, operatingSystem, model].every((value) => this.isValidOptionalText(value))) {
      return { ok: false, reason: 'INVALID_OPTIONAL_TEXT' };
    }

    const normalizedIp = ip?.trim() || undefined;
    const normalizedHostname = this.normalizeOptionalText(hostname);
    const normalizedOperatingSystem = this.normalizeOptionalText(operatingSystem);
    const normalizedModel = this.normalizeOptionalText(model);
    if (normalizedIp && !this.isValidIpv4(normalizedIp)) {
      return { ok: false, reason: 'INVALID_IP_ADDRESS' };
    }

    if (
      normalizedIp &&
      this.devices().some(
        (currentDevice) =>
          currentDevice.id !== deviceId &&
          'ip' in currentDevice &&
          currentDevice.ip?.trim() === normalizedIp,
      )
    ) {
      return { ok: false, reason: 'DUPLICATE_IP_ADDRESS' };
    }

    const switchPortCount = device.type === 'Switch' ? (portCount ?? device.portCount) : undefined;

    if (switchPortCount !== undefined) {
      if (!Number.isInteger(switchPortCount) || switchPortCount < 1) {
        return { ok: false, reason: 'INVALID_PORT_COUNT' };
      }

      if (this.getConnectionCount(deviceId) > switchPortCount) {
        return { ok: false, reason: 'PORTS_BELOW_CONNECTION_COUNT' };
      }
    }

    this.devicesSignal.update((devices) =>
      devices.map((currentDevice) => {
        if (currentDevice.id !== deviceId) {
          return currentDevice;
        }

        switch (currentDevice.type) {
          case 'PC':
            return { ...currentDevice, name: normalizedName, status: status ?? currentDevice.status, ip: normalizedIp, hostname: normalizedHostname, operatingSystem: normalizedOperatingSystem };
          case 'Switch':
            return {
              ...currentDevice,
              name: normalizedName,
              status: status ?? currentDevice.status,
              ip: normalizedIp,
              portCount: switchPortCount ?? currentDevice.portCount,
              model: normalizedModel,
            };
          case 'Router':
            return { ...currentDevice, name: normalizedName, status: status ?? currentDevice.status, ip: normalizedIp, hostname: normalizedHostname, model: normalizedModel };
        }
      }),
    );

    return { ok: true };
  }

  removeDevice(deviceId: number): boolean {
    if (!this.findDevice(deviceId)) {
      return false;
    }

    this.devicesSignal.update((devices) => devices.filter((device) => device.id !== deviceId));

    // Elimina i collegamenti che resterebbero privi di un estremo valido.
    this.connectionsSignal.update((connections) =>
      connections.filter(
        (connection) => connection.sourceId !== deviceId && connection.targetId !== deviceId,
      ),
    );

    return true;
  }

  findDevice(deviceId: number): Device | undefined {
    return this.devices().find((device) => device.id === deviceId);
  }

  setDeviceStatus(deviceId: number, status: Device['status']): void {
    this.devicesSignal.update((devices) =>
      devices.map((device) =>
        device.id === deviceId ? { ...device, status } : device,
      ),
    );
  }

  /**
   * Crea un collegamento soltanto se entrambi gli estremi esistono, non coincidono,
   * non sono già collegati e gli eventuali switch hanno ancora porte disponibili.
   */
  addConnection(sourceId: number, targetId: number): ConnectionResult {
    if (sourceId === targetId) {
      return { ok: false, reason: 'SELF_CONNECTION' };
    }

    if (!this.findDevice(sourceId) || !this.findDevice(targetId)) {
      return { ok: false, reason: 'DEVICE_NOT_FOUND' };
    }

    // I collegamenti sono non orientati: A-B e B-A descrivono la stessa rete fisica e sono duplicati.
    const alreadyExists = this.connections().some(
      (connection) =>
        (connection.sourceId === sourceId && connection.targetId === targetId) ||
        (connection.sourceId === targetId && connection.targetId === sourceId),
    );

    if (alreadyExists) {
      return { ok: false, reason: 'DUPLICATE_CONNECTION' };
    }

    const switchAtCapacity = [sourceId, targetId]
      .map((deviceId) => this.findDevice(deviceId))
      .find(
        (device): device is Extract<Device, { type: 'Switch' }> =>
          !!device &&
          device.type === 'Switch' &&
          this.getConnectionCount(device.id) >= device.portCount,
      );

    if (switchAtCapacity) {
      return { ok: false, reason: 'SWITCH_PORT_LIMIT', switchName: switchAtCapacity.name };
    }

    const connection: Connection = {
      id: this.nextConnectionId++,
      sourceId,
      targetId,
    };

    this.connectionsSignal.update((connections) => [...connections, connection]);

    // Un nuovo collegamento rende operativi entrambi gli estremi, aggiornando anche lo stile della linea.
    this.setDeviceStatus(sourceId, 'Online');
    this.setDeviceStatus(targetId, 'Online');

    return { ok: true, connection };
  }



  /** Rimuove un collegamento esistente restituendo se l'operazione è riuscita. */
  removeConnection(connectionId: number): boolean {
    const connection = this.connections().find(
      (connection) => connection.id === connectionId,
    );

    if (!connection) {
      return false;
    }

    this.connectionsSignal.update((connections) =>
      connections.filter((connection) => connection.id !== connectionId),
    );

    return true;
  }

  /** Restituisce i dispositivi direttamente collegati a quello indicato. */
  getConnectedDevices(deviceId: number): Device[] {
    const connectedIds = this.connections()
      .filter((connection) => connection.sourceId === deviceId || connection.targetId === deviceId)
      .map((connection) =>
        connection.sourceId === deviceId ? connection.targetId : connection.sourceId,
      );

    return this.devices().filter((device) => connectedIds.includes(device.id));
  }

  private getConnectionCount(deviceId: number): number {
    return this.connections().filter(
      (connection) => connection.sourceId === deviceId || connection.targetId === deviceId,
    ).length;
  }

  private isValidIpv4(value: string): boolean {
    const octets = value.split('.');
    return (
      octets.length === 4 &&
      octets.every((octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255)
    );
  }

  /** Accetta un campo vuoto come assente e rifiuta testo oltre il limite previsto dal backend. */
  private isValidOptionalText(value: string | undefined): boolean {
    return value === undefined || value.trim().length <= 255;
  }

  /** Elimina spazi superflui e rappresenta i campi vuoti con undefined. */
  private normalizeOptionalText(value: string | undefined): string | undefined {
    return value?.trim() || undefined;
  }
}
