import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { TopologyPersistenceToolbar } from './topology-persistence-toolbar';

describe('TopologyPersistenceToolbar', () => {
  let component: TopologyPersistenceToolbar;
  let fixture: ComponentFixture<TopologyPersistenceToolbar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopologyPersistenceToolbar],
    }).compileComponents();

    fixture = TestBed.createComponent(TopologyPersistenceToolbar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit persistence actions and the edited topology name', () => {
    const nameChange = vi.spyOn(component.nameChange, 'emit');
    const refresh = vi.spyOn(component.refresh, 'emit');
    const createNew = vi.spyOn(component.createNew, 'emit');
    const load = vi.spyOn(component.load, 'emit');
    const save = vi.spyOn(component.save, 'emit');

    fixture.componentRef.setInput('topologies', [{ id: 7, name: 'Demo', devices: [], connections: [] }]);
    fixture.detectChanges();

    const nameInput: HTMLInputElement = fixture.nativeElement.querySelector('[aria-label="Nome della topologia"]');
    nameInput.value = '  Lab topology  ';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.componentRef.setInput('topologyName', '  Lab topology  ');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-action="refresh-topologies"]').click();
    fixture.nativeElement.querySelector('[data-action="new-topology"]').click();
    fixture.nativeElement.querySelector('[data-action="save-topology"]').click();

    const topologySelect: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    topologySelect.value = '7';
    topologySelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(nameChange).toHaveBeenCalledWith('  Lab topology  ');
    expect(refresh).toHaveBeenCalled();
    expect(createNew).toHaveBeenCalled();
    expect(load).toHaveBeenCalledWith(7);
    expect(save).toHaveBeenCalledWith('Lab topology');
  });

  it('should emit the active topology ID for deletion', () => {
    const deleteTopology = vi.spyOn(component.deleteTopology, 'emit');
    fixture.componentRef.setInput('currentTopologyId', 12);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-action="delete-topology"]').click();

    expect(deleteTopology).toHaveBeenCalledWith(12);
  });

  it('should close the JSON menu when clicking outside or exporting', () => {
    const exportJson = vi.spyOn(component.exportJson, 'emit');
    const menu: HTMLDetailsElement = fixture.nativeElement.querySelector('.json-menu');
    const summary: HTMLElement = menu.querySelector('summary')!;

    summary.click();
    expect(menu.open).toBe(true);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.open).toBe(false);

    summary.click();
    fixture.nativeElement.querySelector('[data-action="export-json"]').click();
    expect(exportJson).toHaveBeenCalled();
    expect(menu.open).toBe(false);
  });
});
