import { Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';

import { TopologyService } from '../../services/topology-service';
import { Device } from '../../types/device-union';
import { DeviceUpdateResult } from '../../types/device-update-result';
import { DeviceDetails, type DeviceDetailsUpdate, type DeviceStatusChange } from '../device-details/device-details';
import { TopologyPersistenceToolbar } from '../topology-persistence-toolbar/topology-persistence-toolbar';

/** Strumento attivo nel canvas: modifica, collegamento o spostamento della vista. */
type InteractionMode = 'edit' | 'connect' | 'pan';

type PlacementMenu = {
  x: number;
  y: number;
  left: number;
  top: number;
};

@Component({
  selector: 'app-canvas',
  imports: [DeviceDetails, TopologyPersistenceToolbar],
  templateUrl: './canvas.html',
  styleUrl: './canvas.css',
})
/** Coordina le interazioni del canvas e delega lo stato della rete al service. */
export class Canvas {
  private readonly canvasArea = viewChild.required<ElementRef<HTMLDivElement>>('canvasArea');
  private readonly topologyService = inject(TopologyService);

  readonly devices = this.topologyService.devices;
  readonly connections = this.topologyService.connections;
  readonly activeConnectionIds = this.topologyService.activeConnectionIds;
  readonly topologies = this.topologyService.topologies;
  readonly topologyName = this.topologyService.currentTopologyName;
  readonly currentTopologyId = this.topologyService.currentTopologyId;
  readonly isLoading = this.topologyService.isLoading;
  readonly isRefreshingTopologies = this.topologyService.isRefreshingTopologies;
  readonly topologyError = this.topologyService.lastError;
  readonly topologySuccess = this.topologyService.lastSuccess;
  readonly importError = signal<string | null>(null);
  readonly mode = signal<InteractionMode>('edit');
  readonly zoom = signal(1);
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly isPanning = signal(false);
  readonly selectedDeviceId = signal<number | null>(null);
  readonly connectionSourceId = signal<number | null>(null);
  readonly connectionError = signal<string | null>(null);
  readonly deviceUpdateError = signal<string | null>(null);
  readonly deviceUpdateSuccess = signal<string | null>(null);
  readonly detailDeviceId = signal<number | null>(null);
  readonly selectedDevice = computed(
    () => this.devices().find((device) => device.id === this.selectedDeviceId()) ?? null,
  );
  readonly detailDevice = computed(
    () => this.devices().find((device) => device.id === this.detailDeviceId()) ?? null,
  )
  readonly devicesById = computed(() => new Map(this.devices().map((device) => [device.id, device])));

  private dragState: { deviceId: number; offsetX: number; offsetY: number } | null = null;
  private panDragState: { pointerX: number; pointerY: number; panX: number; panY: number } | null = null;

  readonly selectedConnectionId = signal<number | null>(null);
  readonly pendingDeviceType = signal<Device['type'] | null>(null);
  readonly placementMenu = signal<PlacementMenu | null>(null);

  /** Ricarica le topologie disponibili dalla persistenza remota. */
  refreshTopologies(): void {
    this.topologyService.refreshTopologies();
  }

  /**
   * Avvia una topologia vuota solo dopo conferma quando il canvas contiene dati.
   * La conferma evita di perdere modifiche locali che non sono state ancora salvate nel database.
   */
  startNewTopology(): void {
    if (
      (this.currentTopologyId() !== null || this.devices().length > 0) &&
      !globalThis.confirm('Creare una nuova topologia? Le modifiche non salvate andranno perse.')
    ) {
      return;
    }

    this.topologyService.clearTopology();
    this.resetSelection();
  }

  updateTopologyName(name: string): void {
    this.topologyName.set(name);
  }

  loadSelectedTopology(topologyId: number): void {
    this.topologyService.loadTopology(topologyId);
    this.resetSelection();
  }

  saveCurrentTopology(name: string): void {
    this.topologyService.saveTopology(name || 'Nuova topologia');
  }

  deleteCurrentTopology(): void {
    const topologyId = this.currentTopologyId();

    if (topologyId === null || !globalThis.confirm('Eliminare la topologia corrente dal database?')) {
      return;
    }

    this.topologyService.deleteTopology(topologyId);
    this.resetSelection();
  }

  /** Genera il download del JSON senza inviarlo al backend. */
  downloadTopologyJson(): void {
    const blob = new Blob([this.topologyService.exportTopologyJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = this.topologyName().trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '');
    link.href = url;
    link.download = `${safeName || 'topologia'}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url));
  }

  /** Legge un file JSON e sostituisce il canvas dopo conferma e validazione. */
  async importTopologyFile(file: File): Promise<void> {
    this.importError.set(null);

    if (
      (this.currentTopologyId() !== null || this.devices().length > 0) &&
      !globalThis.confirm('L’importazione sostituirà la topologia attualmente presente nel canvas. Vuoi continuare?')
    ) {
      return;
    }

    if (file.size > 1_000_000) {
      this.importError.set('Il file JSON non può superare 1 MB.');
      return;
    }

    try {
      const result = this.topologyService.importTopologyJson(await file.text());
      if (!result.ok) {
        this.importError.set(result.error);
        return;
      }

      this.resetSelection();
    } catch {
      this.importError.set('Impossibile leggere il file JSON selezionato.');
    }
  }

  private resetSelection(): void {
    this.selectedDeviceId.set(null);
    this.selectedConnectionId.set(null);
    this.detailDeviceId.set(null);
    this.connectionSourceId.set(null);
    this.connectionError.set(null);
  }

  /**
   * Cambia strumento e annulla le interazioni incompatibili ancora in corso.
   * Per esempio, passando da Collega a Modifica viene annullata l'eventuale scelta del dispositivo sorgente.
   */
  setMode(mode: InteractionMode): void {
    this.mode.set(mode);
    this.connectionSourceId.set(null);
    this.connectionError.set(null);
    this.pendingDeviceType.set(null);
    this.placementMenu.set(null);
    this.dragState = null;
    this.panDragState = null;
    this.isPanning.set(false);
  }

  zoomIn(): void {
    this.changeZoom(0.1);
  }

  zoomOut(): void {
    this.changeZoom(-0.1);
  }

  onCanvasWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.deltaY !== 0) {
      this.changeZoom(event.deltaY < 0 ? 0.1 : -0.1, event.clientX, event.clientY);
    }
  }

  resetView(): void {
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }

  worldTransform(): string {
    return `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoom()})`;
  }

  zoomPercentage(): number {
    return Math.round(this.zoom() * 100);
  }

  /**
   * Applica lo zoom mantenendo stabile il punto sotto il cursore, oppure il centro del canvas se il cursore non è disponibile.
   * Pan e zoom appartengono alla vista e non alterano mai le coordinate persistite dei dispositivi.
   */
  private changeZoom(delta: number, clientX?: number, clientY?: number): void {
    const bounds = this.canvasArea().nativeElement.getBoundingClientRect();
    const previousZoom = this.zoom();
    const nextZoom = Math.min(2, Math.max(0.5, Math.round((previousZoom + delta) * 10) / 10));
    const centerX = clientX === undefined ? bounds.width / 2 : clientX - bounds.left;
    const centerY = clientY === undefined ? bounds.height / 2 : clientY - bounds.top;

    this.panX.set(centerX - ((centerX - this.panX()) / previousZoom) * nextZoom);
    this.panY.set(centerY - ((centerY - this.panY()) / previousZoom) * nextZoom);
    this.zoom.set(nextZoom);
  }

  /**
   * Converte una coordinata dello schermo in coordinate del canvas: rimuove prima il pan e poi compensa lo zoom.
   * In questo modo inserimento e trascinamento restano corretti anche dopo aver modificato la vista.
  */
  private screenToWorld(clientX: number, clientY: number): { x: number; y: number; screenX: number; screenY: number } {
    const bounds = this.canvasArea().nativeElement.getBoundingClientRect();
    const screenX = clientX - bounds.left;
    const screenY = clientY - bounds.top;

    return {
      x: (screenX - this.panX()) / this.zoom(),
      y: (screenY - this.panY()) / this.zoom(),
      screenX,
      screenY,
    };
  }

  onCanvasPointerDown(event: PointerEvent): void {
    const target = event.target;

    if (
      this.mode() !== 'pan' ||
      event.button !== 0 ||
      (target instanceof Element && target.closest('.device, .device-type-menu'))
    ) {
      return;
    }

    event.preventDefault();
    this.panDragState = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      panX: this.panX(),
      panY: this.panY(),
    };
    this.isPanning.set(true);
  }

  selectDeviceType(type: Device['type']): void {
    this.setMode('edit');
    this.selectedConnectionId.set(null);
    this.pendingDeviceType.set(type);
    this.placementMenu.set(null);
    this.connectionError.set(null);
  }

  /** Inserisce il tipo selezionato o apre il menu di scelta nel punto cliccato. */
  onCanvasClick(event: MouseEvent): void {
    const hadSelectedConnection = this.selectedConnectionId() !== null;
    this.selectedConnectionId.set(null);

    if (hadSelectedConnection) {
      return;
    }

    if (this.mode() !== 'edit') {
      return;
    }

    const bounds = this.canvasArea().nativeElement.getBoundingClientRect();
    const point = this.screenToWorld(event.clientX, event.clientY);
    const x = point.x;
    const y = point.y;

    const type = this.pendingDeviceType();
    if (type) {
      this.addDeviceAt(type, x, y);
      return;
    }

    const menuWidth = Math.min(184, bounds.width);
    const menuHeight = Math.min(148, bounds.height);
    this.placementMenu.set({
      x,
      y,
      left: Math.max(0, Math.min(point.screenX - menuWidth / 2, bounds.width - menuWidth)),
      top: Math.max(0, Math.min(point.screenY, bounds.height - menuHeight)),
    });
  }

  placeDeviceAt(type: Device['type']): void {
    const placement = this.placementMenu();

    if (!placement) {
      return;
    }

    this.addDeviceAt(type, placement.x, placement.y);
  }

  @HostListener('document:click', ['$event'])
  closePlacementMenuOnOutsideClick(event: MouseEvent): void {
    const target = event.target;

    if (
      this.placementMenu() &&
      target instanceof Element &&
      !this.canvasArea().nativeElement.contains(target)
    ) {
      this.placementMenu.set(null);
    }
  }

  @HostListener('document:click', ['$event'])
  clearConnectionSelectionOnOutsideClick(event: MouseEvent): void {
    const target = event.target;

    if (
      this.selectedConnectionId() !== null &&
      target instanceof Element &&
      !target.closest('.connection-line, .connection-hit-area')
    ) {
      this.selectedConnectionId.set(null);
    }
  }

  @HostListener('document:keydown.escape')
  cancelPlacement(): void {
    this.placementMenu.set(null);
    this.pendingDeviceType.set(null);
  }

  private addDeviceAt(type: Device['type'], x: number, y: number): void {
    const device = this.topologyService.addDevice(type, x, y);

    this.selectedDeviceId.set(device.id);
    this.selectedConnectionId.set(null);
    this.pendingDeviceType.set(null);
    this.placementMenu.set(null);
    this.detailDeviceId.set(null);
  }

  /** Seleziona un dispositivo o completa un collegamento nella modalità Collega. */
  selectDevice(device: Device): void {
    this.connectionError.set(null);
    this.selectedConnectionId.set(null);

    if (this.mode() === 'edit') {
      this.selectedDeviceId.set(device.id);
      return;
    }

    if (this.mode() !== 'connect') {
      return;
    }

    const sourceId = this.connectionSourceId();

    if (sourceId === null) {
      this.connectionSourceId.set(device.id);
      this.selectedDeviceId.set(device.id);
      return;
    }

    if (sourceId === device.id) {
      this.connectionSourceId.set(null);
      return;
    }

    const result = this.topologyService.addConnection(sourceId, device.id);

    if (!result.ok) {
      this.selectedDeviceId.set(sourceId);
      this.connectionError.set(this.getConnectionErrorMessage(result.reason, result.switchName));
      return;
    }

    this.connectionSourceId.set(null);
    // Mantiene evidenziato il dispositivo appena collegato.
    this.selectedDeviceId.set(device.id);
  }

  onDevicePointerDown(event: PointerEvent, device: Device): void {
    if (this.mode() !== 'edit' || event.button !== 0) {
      return;
    }

    const point = this.screenToWorld(event.clientX, event.clientY);

    this.dragState = {
      deviceId: device.id,
      offsetX: point.x - device.x,
      offsetY: point.y - device.y,
    };

    this.selectedDeviceId.set(device.id);
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    if (this.panDragState) {
      this.panX.set(this.panDragState.panX + event.clientX - this.panDragState.pointerX);
      this.panY.set(this.panDragState.panY + event.clientY - this.panDragState.pointerY);
      return;
    }

    if (!this.dragState || this.mode() !== 'edit') {
      return;
    }

    const bounds = this.canvasArea().nativeElement.getBoundingClientRect();
    const point = this.screenToWorld(event.clientX, event.clientY);
    const maxX = Math.max(56, bounds.width / this.zoom() - 56);
    const maxY = Math.max(44, bounds.height / this.zoom() - 44);
    const x = Math.min(Math.max(56, point.x - this.dragState.offsetX), maxX);
    const y = Math.min(Math.max(44, point.y - this.dragState.offsetY), maxY);

    this.topologyService.moveDevice(this.dragState.deviceId, x, y);
  }

  @HostListener('window:pointerup')
  onPointerUp(): void {
    this.dragState = null;
    this.panDragState = null;
    this.isPanning.set(false);
  }

  /** Apre il pannello laterale senza mostrare il menu contestuale del browser. */
  showDeviceDetails(device: Device, event: MouseEvent): void {
    event.preventDefault();
    this.selectedDeviceId.set(device.id);
    this.detailDeviceId.set(device.id);
    this.clearDeviceUpdateFeedback();
  }

  closeDeviceDetails(): void {
    this.detailDeviceId.set(null);
  }

  clearCanvas(): void {
    if (this.devices().length === 0 && this.connections().length === 0) {
      return;
    }

    if (!globalThis.confirm('Vuoi eliminare tutti i dispositivi e le connessioni?')) {
      return;
    }

    this.topologyService.clearTopology();
    this.setMode('edit');
    this.selectedDeviceId.set(null);
    this.selectedConnectionId.set(null);
    this.detailDeviceId.set(null);
    this.connectionSourceId.set(null);
    this.connectionError.set(null);
    this.pendingDeviceType.set(null);
    this.placementMenu.set(null);
  }

  saveDeviceDetails(details: DeviceDetailsUpdate): void {
    const result = this.topologyService.updateDevice(
      details.id,
      details.name,
      details.ip,
      details.hostname,
      details.operatingSystem,
      details.portCount,
      details.model,
      details.status,
    );

    this.deviceUpdateError.set(result.ok ? null : this.getDeviceUpdateErrorMessage(result.reason));
    this.deviceUpdateSuccess.set(
      result.ok ? 'Modifiche applicate alla topologia. Usa Salva per renderle persistenti.' : null,
    );
  }

  changeDeviceStatus(change: DeviceStatusChange): void {
    this.topologyService.setDeviceStatus(change.id, change.status);
    this.deviceUpdateError.set(null);
    this.deviceUpdateSuccess.set('Stato aggiornato. Usa Salva per renderlo persistente.');
  }

  clearDeviceUpdateFeedback(): void {
    this.deviceUpdateError.set(null);
    this.deviceUpdateSuccess.set(null);
  }

  removeSelectedDevice(): void {
    const deviceId = this.selectedDeviceId();

    if (deviceId === null) {
      return;
    }

    this.topologyService.removeDevice(deviceId);
    this.selectedDeviceId.set(null);
    this.connectionSourceId.set(null);
  }

  /** Recupera il dispositivo dall'indice reattivo per evitare ricerche ripetute nell'array. */
  getDevice(deviceId: number): Device | undefined {
    return this.devicesById().get(deviceId);
  }

  getDeviceIcon(type: Device['type']): string {
    switch (type) {
      case 'PC':
        return 'bi-pc-display';
      case 'Switch':
        return 'bi-diagram-3';
      case 'Router':
        return 'bi-router';
    }
  }

  selectConnection(connectionId: number, event: MouseEvent): void {
    event.stopPropagation();

    if (this.mode() === 'connect') {
      this.setMode('edit');
    }

    this.selectedConnectionId.set(connectionId);
    this.selectedDeviceId.set(null);
    this.connectionError.set(null);
  }

  removeSelectedConnection(): void {
    const connectionId = this.selectedConnectionId();

    if (connectionId === null) {
      return;
    }

    this.topologyService.removeConnection(connectionId);
    this.selectedConnectionId.set(null);
  }

  private getConnectionErrorMessage(
    reason: 'SELF_CONNECTION' | 'DEVICE_NOT_FOUND' | 'DUPLICATE_CONNECTION' | 'SWITCH_PORT_LIMIT',
    switchName?: string,
  ): string {
    switch (reason) {
      case 'SELF_CONNECTION':
        return 'Non puoi collegare un dispositivo a sé stesso.';
      case 'DEVICE_NOT_FOUND':
        return 'Uno dei dispositivi selezionati non esiste più.';
      case 'DUPLICATE_CONNECTION':
        return 'Questi dispositivi sono già collegati.';
      case 'SWITCH_PORT_LIMIT':
        return `Lo switch "${switchName ?? 'selezionato'}" ha raggiunto il limite delle porte disponibili.`;
    }
  }

  private getDeviceUpdateErrorMessage(reason: Extract<DeviceUpdateResult, { ok: false }>['reason']): string {
    switch (reason) {
      case 'DEVICE_NOT_FOUND':
        return 'Il dispositivo non esiste più.';
      case 'EMPTY_DEVICE_NAME':
        return 'Il nome del dispositivo non può essere vuoto.';
      case 'INVALID_IP_ADDRESS':
        return 'Inserisci un indirizzo IPv4 valido.';
      case 'INVALID_OPTIONAL_TEXT':
        return 'I campi testuali facoltativi possono contenere al massimo 255 caratteri.';
      case 'DUPLICATE_IP_ADDRESS':
        return 'Questo indirizzo IP è già assegnato a un altro dispositivo.';
      case 'INVALID_PORT_COUNT':
        return 'Il numero di porte deve essere un intero maggiore di zero.';
      case 'PORTS_BELOW_CONNECTION_COUNT':
        return 'Non puoi impostare meno porte delle connessioni già presenti.';
      case 'INVALID_DEVICE_STATUS':
        return 'Lo stato del dispositivo non è valido.';
    }
  }
}
