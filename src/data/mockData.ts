export interface Checkpoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: 'idle' | 'active';
}

export interface Match {
  id: string;
  personId: string;
  name: string;
  checkpointId: string;
  confidence: number;
  timestamp: Date;
  status: 'PENDING REVIEW' | 'CONFIRMED' | 'DISMISSED';
  faceCropUrl?: string;
  referencePhotoUrl?: string;
}

export const CHECKPOINTS: Checkpoint[] = [
  { id: 'cp-01', name: 'Grand Central Terminal', lat: 40.7527, lng: -73.9772, status: 'active' },
  { id: 'cp-02', name: 'Penn Station', lat: 40.7505, lng: -73.9934, status: 'active' },
  { id: 'cp-03', name: 'Port Authority Bus Terminal', lat: 40.7570, lng: -73.9902, status: 'active' },
  { id: 'cp-04', name: 'JFK Airport - T4', lat: 40.6413, lng: -73.7781, status: 'active' },
  { id: 'cp-05', name: 'Newark Liberty - C', lat: 40.6895, lng: -74.1745, status: 'active' }
];

export const INITIAL_MATCHES: Match[] = [
  {
    id: 'm-1001',
    personId: 'p-042',
    name: 'Doe, John',
    checkpointId: 'cp-02',
    confidence: 0.88,
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    status: 'PENDING REVIEW',
    faceCropUrl: 'http://localhost:8000/static/gallery/p-042_doe,_john.jpg',
    referencePhotoUrl: 'http://localhost:8000/static/gallery/p-042_doe,_john.jpg'
  },
  {
    id: 'm-1002',
    personId: 'p-089',
    name: 'Smith, Jane',
    checkpointId: 'cp-01',
    confidence: 0.95,
    timestamp: new Date(Date.now() - 1000 * 60 * 45),
    status: 'CONFIRMED',
    faceCropUrl: 'http://localhost:8000/static/gallery/p-089_smith,_jane.jpg',
    referencePhotoUrl: 'http://localhost:8000/static/gallery/p-089_smith,_jane.jpg'
  },
  {
    id: 'm-1003',
    personId: 'p-042',
    name: 'Doe, John',
    checkpointId: 'cp-04',
    confidence: 0.76,
    timestamp: new Date(Date.now() - 1000 * 60 * 120),
    status: 'CONFIRMED',
    faceCropUrl: 'http://localhost:8000/static/gallery/p-042_doe,_john.jpg',
    referencePhotoUrl: 'http://localhost:8000/static/gallery/p-042_doe,_john.jpg'
  }
];
