import { TestBed } from '@angular/core/testing';

import { TopologyApiService } from './topology-api-service';

describe('TopologyApiService', () => {
  let service: TopologyApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TopologyApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
