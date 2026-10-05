import { Component, ElementRef, HostListener, input, output, viewChild } from '@angular/core';

import { Topology } from '../../types/topology';

@Component({
  selector: 'app-topology-persistence-toolbar',
  imports: [],
  templateUrl: './topology-persistence-toolbar.html',
  styleUrl: './topology-persistence-toolbar.css',
})
/** Espone le azioni di persistenza senza conoscere lo stato del canvas. */
export class TopologyPersistenceToolbar {
  private readonly jsonMenu = viewChild<ElementRef<HTMLDetailsElement>>('jsonMenu');

  readonly topologies = input<Topology[]>([]);
  readonly currentTopologyId = input<number | null>(null);
  readonly topologyName = input('Nuova topologia');
  readonly isLoading = input(false);
  readonly isRefreshingTopologies = input(false);
  readonly error = input<string | null>(null);
  readonly success = input<string | null>(null);

  readonly nameChange = output<string>();
  readonly refresh = output<void>();
  readonly createNew = output<void>();
  readonly load = output<number>();
  readonly save = output<string>();
  readonly deleteTopology = output<number>();
  readonly exportJson = output<void>();
  readonly importJson = output<File>();

  onNameInput(event: Event): void {
    this.nameChange.emit((event.target as HTMLInputElement).value);
  }

  onTopologySelect(event: Event): void {
    const topologyId = Number((event.target as HTMLSelectElement).value);

    if (Number.isInteger(topologyId) && topologyId > 0) {
      this.load.emit(topologyId);
    }
  }

  onSave(): void {
    this.save.emit(this.topologyName().trim() || 'Nuova topologia');
  }

  onDelete(): void {
    const topologyId = this.currentTopologyId();

    if (topologyId !== null) {
      this.deleteTopology.emit(topologyId);
    }
  }

  /** Emette il file selezionato e azzera l'input per consentire una nuova selezione identica. */
  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (file) {
      this.importJson.emit(file);
    }

    input.value = '';
    this.closeJsonMenu();
  }

  onExportJson(): void {
    this.exportJson.emit();
    this.closeJsonMenu();
  }

  @HostListener('document:click', ['$event'])
  closeJsonMenuOnOutsideClick(event: MouseEvent): void {
    const menu = this.jsonMenu()?.nativeElement;
    if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) {
      menu.open = false;
    }
  }

  @HostListener('document:keydown.escape')
  closeJsonMenuOnEscape(): void {
    this.closeJsonMenu();
  }

  /** Chiude il menu nativo dedicato a importazione ed esportazione JSON. */
  private closeJsonMenu(): void {
    const menu = this.jsonMenu()?.nativeElement;
    if (menu) {
      menu.open = false;
    }
  }
}
