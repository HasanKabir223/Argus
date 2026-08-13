export interface Checkpoint {
  id: string;
  name: string;
  city: string;
  state: string;
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

export interface DefaultReferencePerson {
  person_id: string;
  name: string;
  photo_path: string;
  photo_url: string;
  age: number;
  last_seen: string;
  category: string;
  threat_level: string;
  offense: string;
  case_id?: string;
  warrant_status?: string;
}

export const CHECKPOINTS: Checkpoint[] = [
  { id: 'cp-01', name: 'JFK International Airport - T4', city: 'New York', state: 'NY', lat: 40.6413, lng: -73.7781, status: 'active' },
  { id: 'cp-02', name: 'Capitol Hill & Union Station Hub', city: 'Washington', state: 'DC', lat: 38.8977, lng: -77.0057, status: 'active' },
  { id: 'cp-03', name: 'LAX International - Tom Bradley', city: 'Los Angeles', state: 'CA', lat: 33.9416, lng: -118.4085, status: 'active' },
  { id: 'cp-04', name: 'O\'Hare International Airport - T5', city: 'Chicago', state: 'IL', lat: 41.9742, lng: -87.9073, status: 'active' },
  { id: 'cp-05', name: 'Port of Miami & Downtown Corridor', city: 'Miami', state: 'FL', lat: 25.7781, lng: -80.1791, status: 'active' },
  { id: 'cp-06', name: 'DFW International Airport Hub', city: 'Dallas / Fort Worth', state: 'TX', lat: 32.8998, lng: -97.0403, status: 'active' },
  { id: 'cp-07', name: 'SFO International & Golden Gate', city: 'San Francisco', state: 'CA', lat: 37.6213, lng: -122.3790, status: 'active' },
  { id: 'cp-08', name: 'Sea-Tac International & Puget Sound', city: 'Seattle', state: 'WA', lat: 47.4502, lng: -122.3088, status: 'active' },
  { id: 'cp-09', name: 'Denver International Airport', city: 'Denver', state: 'CO', lat: 39.8561, lng: -104.6737, status: 'active' },
  { id: 'cp-10', name: 'Hartsfield-Jackson International', city: 'Atlanta', state: 'GA', lat: 33.6407, lng: -84.4277, status: 'active' },
  { id: 'cp-11', name: 'Logan International Airport', city: 'Boston', state: 'MA', lat: 42.3656, lng: -71.0096, status: 'active' },
  { id: 'cp-12', name: 'Harry Reid Airport & Vegas Strip', city: 'Las Vegas', state: 'NV', lat: 36.0840, lng: -115.1537, status: 'active' },
  { id: 'cp-13', name: 'Sky Harbor International - T4', city: 'Phoenix', state: 'AZ', lat: 33.4352, lng: -112.0101, status: 'active' },
  { id: 'cp-14', name: 'Ambassador Bridge Border Crossing', city: 'Detroit', state: 'MI', lat: 42.3120, lng: -83.0740, status: 'active' },
  { id: 'cp-15', name: 'Daniel K. Inouye International', city: 'Honolulu', state: 'HI', lat: 21.3245, lng: -157.9251, status: 'active' }
];

/**
 * Criminal Watchlist Dossiers
 * Populated dynamically via SQLite database and FAISS AI Vector Gallery.
 */
export const DEFAULT_WATCHLIST_PERSONS: DefaultReferencePerson[] = [];

/**
 * Clean slate for manual pipeline testing.
 * Detections will dynamically appear as CCTV clips and live checkpoints are processed.
 */
export const INITIAL_MATCHES: Match[] = [];
