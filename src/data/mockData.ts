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
 * Default Enrolled Criminal Watchlist Dossiers
 * Provides instant visual gallery and offline biometric verification
 */
export const DEFAULT_WATCHLIST_PERSONS: DefaultReferencePerson[] = [
  {
    person_id: 'p-obama',
    name: 'Barack Obama',
    photo_path: '/static/gallery/p-obama_barack_obama.jpg',
    photo_url: 'http://localhost:8000/static/gallery/p-obama_barack_obama.jpg',
    age: 63,
    last_seen: 'Washington D.C.',
    category: 'PERSON OF INTEREST',
    threat_level: 'CRITICAL',
    offense: 'High-Profile Surveillance Target / Diplomatic Detail',
    case_id: 'CR-P-OBAMA',
    warrant_status: 'MONITORED TARGET'
  },
  {
    person_id: 'p-trump',
    name: 'Donald Trump',
    photo_path: '/static/gallery/p-trump_donald_trump.jpg',
    photo_url: 'http://localhost:8000/static/gallery/p-trump_donald_trump.jpg',
    age: 79,
    last_seen: 'Mar-a-Lago, FL',
    category: 'PERSON OF INTEREST',
    threat_level: 'CRITICAL',
    offense: 'High-Profile Surveillance Target / Homeland Security Priority',
    case_id: 'CR-P-TRUMP',
    warrant_status: 'MONITORED TARGET'
  },
  {
    person_id: 'p-bush',
    name: 'George W. Bush',
    photo_path: '/static/gallery/p-bush_george_w._bush.jpg',
    photo_url: 'http://localhost:8000/static/gallery/p-bush_george_w._bush.jpg',
    age: 78,
    last_seen: 'Dallas, TX',
    category: 'PERSON OF INTEREST',
    threat_level: 'HIGH',
    offense: 'Former Head of State — Surveillance Priority',
    case_id: 'CR-P-BUSH',
    warrant_status: 'MONITORED TARGET'
  },
  {
    person_id: 'p-musk',
    name: 'Elon Musk',
    photo_path: '/static/gallery/p-musk_elon_musk.jpg',
    photo_url: 'http://localhost:8000/static/gallery/p-musk_elon_musk.jpg',
    age: 53,
    last_seen: 'Austin, TX',
    category: 'PERSON OF INTEREST',
    threat_level: 'MEDIUM',
    offense: 'High-Value Infrastructure & Aerospace Target',
    case_id: 'CR-P-MUSK',
    warrant_status: 'ACTIVE WATCH'
  },
  {
    person_id: 'p-saddam',
    name: 'Saddam Hussein',
    photo_path: '/static/gallery/p-saddam_saddam_hussein.jpg',
    photo_url: 'http://localhost:8000/static/gallery/p-saddam_saddam_hussein.jpg',
    age: 69,
    last_seen: 'International Surveillance Grid',
    category: 'WANTED FUGITIVE',
    threat_level: 'CRITICAL',
    offense: 'International War Crimes / Red Notice Alert',
    case_id: 'CR-P-SADDAM',
    warrant_status: 'ACTIVE FELONY WARRANT'
  },
  {
    person_id: 'p-suspect-001',
    name: 'Unknown Suspect Alpha',
    photo_path: '/static/gallery/p-suspect-001_unknown_suspect_alpha.jpg',
    photo_url: 'http://localhost:8000/static/gallery/p-suspect-001_unknown_suspect_alpha.jpg',
    age: 35,
    last_seen: 'Manhattan, NY',
    category: 'WANTED FUGITIVE',
    threat_level: 'HIGH',
    offense: 'Active Felony Warrant — Armed Robbery / Extortion',
    case_id: 'CR-ALPHA-01',
    warrant_status: 'ACTIVE WARRANT'
  },
  {
    person_id: 'p-suspect-002',
    name: 'Unknown Suspect Bravo',
    photo_path: '/static/gallery/p-suspect-002_unknown_suspect_bravo.jpg',
    photo_url: 'http://localhost:8000/static/gallery/p-suspect-002_unknown_suspect_bravo.jpg',
    age: 32,
    last_seen: 'Seattle, WA',
    category: 'WANTED FUGITIVE',
    threat_level: 'HIGH',
    offense: 'Grand Larceny / Interstate Wire Fraud',
    case_id: 'CR-BRAVO-02',
    warrant_status: 'ACTIVE WARRANT'
  },
  {
    person_id: 'p-suspect-003',
    name: 'Unknown Suspect Charlie',
    photo_path: '/static/gallery/p-suspect-003_unknown_suspect_charlie.jpg',
    photo_url: 'http://localhost:8000/static/gallery/p-suspect-003_unknown_suspect_charlie.jpg',
    age: 40,
    last_seen: 'Denver, CO',
    category: 'WANTED FUGITIVE',
    threat_level: 'MEDIUM',
    offense: 'Identity Theft / Financial Crimes',
    case_id: 'CR-CHARLIE-03',
    warrant_status: 'ACTIVE WARRANT'
  },
  {
    person_id: 'p-suspect-004',
    name: 'Unknown Suspect Delta',
    photo_path: '/static/gallery/p-suspect-004_unknown_suspect_delta.jpg',
    photo_url: 'http://localhost:8000/static/gallery/p-suspect-004_unknown_suspect_delta.jpg',
    age: 29,
    last_seen: 'Las Vegas, NV',
    category: 'WANTED FUGITIVE',
    threat_level: 'HIGH',
    offense: 'Narcotics Trafficking / Organized Ring',
    case_id: 'CR-DELTA-04',
    warrant_status: 'ACTIVE WARRANT'
  },
  {
    person_id: 'p-catt',
    name: 'CATT Operative',
    photo_path: '/static/gallery/catt_catt.jpg',
    photo_url: 'http://localhost:8000/static/gallery/catt_catt.jpg',
    age: 34,
    last_seen: 'Chicago, IL',
    category: 'TERROR SUSPECT',
    threat_level: 'CRITICAL',
    offense: 'Cyber Espionage / Critical Infrastructure Intrusion',
    case_id: 'CR-CATT-99',
    warrant_status: 'ACTIVE RED NOTICE'
  },
  {
    person_id: 'p-charlie-kirk',
    name: 'Charlie Kirk',
    photo_path: '/static/gallery/00911_charlie_kirk.jpg',
    photo_url: 'http://localhost:8000/static/gallery/00911_charlie_kirk.jpg',
    age: 31,
    last_seen: 'Phoenix, AZ',
    category: 'PERSON OF INTEREST',
    threat_level: 'LOW',
    offense: 'Public Figure Detail / Surveillance Watch',
    case_id: 'CR-KIRK-01',
    warrant_status: 'MONITORED TARGET'
  }
];

/**
 * Clean slate for manual pipeline testing.
 * Detections will dynamically appear as CCTV clips and live checkpoints are processed.
 */
export const INITIAL_MATCHES: Match[] = [];
