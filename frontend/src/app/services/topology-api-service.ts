import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Topology } from '../types/topology';

/** Payload inviato al backend: l'identificativo viene assegnato dal server. */
type TopologyWrite = Omit<Topology, 'id'>;

@Injectable({
  providedIn: 'root',
})
export class TopologyApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:3000/api/topologies';

  /** Recupera l'elenco delle topologie disponibili. */
  list(): Observable<Topology[]> {
    return this.http.get<Topology[]>(this.baseUrl);
  }

  /** Recupera una topologia completa tramite il suo identificativo. */
  getById(id: number): Observable<Topology> {
    return this.http.get<Topology>(`${this.baseUrl}/${id}`);
  }

  /** Crea una nuova topologia persistente. */
  create(topology: TopologyWrite): Observable<Topology> {
    return this.http.post<Topology>(this.baseUrl, topology);
  }

  /** Sostituisce i dati della topologia indicata. */
  update(id: number, topology: TopologyWrite): Observable<Topology> {
    return this.http.put<Topology>(`${this.baseUrl}/${id}`, topology);
  }

  /** Elimina la topologia indicata dal database. */
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
