import React, { useState, useEffect, useRef } from 'react';
import { Shield, Plus, Upload, X, Search, RefreshCw } from 'lucide-react';
import {
  fetchReferencePersons, enrollReferencePerson, syncWatchlist,
  type ReferencePerson
} from '../services/api';

interface WatchlistGalleryModalProps {
  onClose: () => void;
  onSelectPerson?: (personId: string) => void;
}

export const WatchlistGalleryModal: React.FC<WatchlistGalleryModalProps> = ({ onClose, onSelectPerson }) => {
  const [persons, setPersons] = useState<ReferencePerson[]>([]);
  const [query, setQuery] = useState('');
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [personId, setPersonId] = useState('');
  const [age, setAge] = useState(30);
  const [category, setCategory] = useState('WANTED FUGITIVE');
  const [threatLevel, setThreatLevel] = useState('HIGH');
  const [offense, setOffense] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPersons();
  }, []);

  const loadPersons = async () => {
    const list = await fetchReferencePersons();
    setPersons(list);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setEnrollError(null);
    }
  };

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnrollError(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setEnrollError('Full Name is required');
      return;
    }

    const cleanPersonId = personId.trim() || `p-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString().slice(-4)}`;

    setIsEnrolling(true);
    const formData = new FormData();
    formData.append('person_id', cleanPersonId);
    formData.append('name', cleanName);
    formData.append('age', String(age));
    formData.append('category', category);
    formData.append('threat_level', threatLevel);
    formData.append('offense', offense || 'Active Criminal Warrant');
    formData.append('last_seen', 'Surveillance Network');

    if (selectedFile) {
      formData.append('file', selectedFile);
    }

    try {
      const created = await enrollReferencePerson(formData);
      setIsEnrolling(false);

      if (created) {
        setShowEnrollForm(false);
        setName('');
        setPersonId('');
        setOffense('');
        setSelectedFile(null);
        setPreviewUrl(null);
        await loadPersons();
      } else {
        setEnrollError('Failed to save to database. Please check connection and try again.');
      }
    } catch (err: any) {
      setIsEnrolling(false);
      setEnrollError(err?.message || 'Database enrollment failed');
    }
  };

  const filtered = persons.filter(p => {
    const hay = `${p.name} ${p.person_id} ${p.category || ''} ${p.offense || ''}`.toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Wanted Criminals & Reference Gallery"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '90vw',
        maxWidth: '1100px',
        height: '84vh',
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-hairline)',
        zIndex: 220,
        boxShadow: '0 32px 80px rgba(0,0,0,0.92)',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(12px)',
        overflow: 'hidden'
      }}
    >
      {/* Top Header */}
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border-hairline)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--bg-panel-raised)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield size={18} color="var(--accent-signal)" />
          <div>
            <h2 className="mono-display" style={{ fontSize: '1.05rem', margin: 0 }}>
              REFERENCE WATCHLIST & CRIMINAL DOSSIERS
            </h2>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
              FAISS VECTOR GALLERY // DATABASE DOSSIERS // {persons.length} ENROLLED TARGETS
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={async () => {
              setIsSyncing(true);
              await syncWatchlist();
              await loadPersons();
              setIsSyncing(false);
            }}
            disabled={isSyncing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(0, 217, 163, 0.12)',
              color: 'var(--accent-signal)',
              border: '1px solid var(--accent-signal)',
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 600,
              cursor: isSyncing ? 'wait' : 'pointer'
            }}
          >
            <RefreshCw size={13} className={isSyncing ? 'spinning' : ''} />
            {isSyncing ? 'SYNCING DB...' : 'SYNC DB & FAISS'}
          </button>

          <button
            onClick={() => setShowEnrollForm(prev => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: showEnrollForm ? 'transparent' : 'var(--accent-signal)',
              color: showEnrollForm ? 'var(--text-primary)' : '#0A0E14',
              border: showEnrollForm ? '1px solid var(--border-hairline)' : 'none',
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Plus size={14} />
            {showEnrollForm ? 'BACK TO GALLERY' : 'ENROLL NEW TARGET'}
          </button>

          <button
            onClick={onClose}
            aria-label="Close watchlist modal"
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '20px', gap: '20px', backgroundColor: '#070A0E' }}>
        {showEnrollForm ? (
          /* Enrollment Form */
          <form
            onSubmit={handleEnroll}
            style={{
              flex: 1,
              maxWidth: '600px',
              margin: '0 auto',
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-hairline)',
              padding: '24px',
              borderRadius: '2px',
              overflowY: 'auto'
            }}
          >
            <h3 className="mono-display" style={{ fontSize: '0.95rem', marginBottom: '16px', color: 'var(--accent-signal)' }}>
              ENROLL SUSPECT INTO DATABASE & FAISS
            </h3>

            {enrollError && (
              <div style={{
                padding: '8px 12px',
                marginBottom: '14px',
                backgroundColor: 'rgba(255, 71, 87, 0.15)',
                border: '1px solid var(--accent-alert)',
                color: 'var(--accent-alert)',
                fontSize: '0.78rem',
                fontFamily: "'IBM Plex Mono', monospace"
              }}>
                {enrollError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              {/* Photo upload dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '120px',
                  height: '120px',
                  backgroundColor: '#000',
                  border: '1px dashed var(--accent-signal)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  position: 'relative'
                }}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="Target preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <>
                    <Upload size={20} color="var(--accent-signal)" />
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '4px', textAlign: 'center' }}>
                      UPLOAD PHOTO
                    </span>
                  </>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  style={{ display: 'none' }}
                />
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>PERSON ID</label>
                  <input
                    value={personId}
                    onChange={e => setPersonId(e.target.value)}
                    placeholder="e.g. p-009"
                    required
                    style={{
                      width: '100%',
                      background: 'var(--bg-void)',
                      border: '1px solid var(--border-hairline)',
                      color: 'var(--text-primary)',
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '0.8rem',
                      padding: '6px 8px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>FULL NAME</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Alex Mercer"
                    required
                    style={{
                      width: '100%',
                      background: 'var(--bg-void)',
                      border: '1px solid var(--border-hairline)',
                      color: 'var(--text-primary)',
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '0.8rem',
                      padding: '6px 8px'
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>AGE</label>
                <input
                  type="number"
                  value={age}
                  onChange={e => setAge(parseInt(e.target.value) || 25)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-void)',
                    border: '1px solid var(--border-hairline)',
                    color: 'var(--text-primary)',
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '0.8rem',
                    padding: '6px 8px'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>THREAT LEVEL</label>
                <select
                  value={threatLevel}
                  onChange={e => setThreatLevel(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-void)',
                    border: '1px solid var(--border-hairline)',
                    color: 'var(--text-primary)',
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '0.8rem',
                    padding: '6px 8px'
                  }}
                >
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>CATEGORY</label>
                <input
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-void)',
                    border: '1px solid var(--border-hairline)',
                    color: 'var(--text-primary)',
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '0.8rem',
                    padding: '6px 8px'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>ACTIVE OFFENSE / CHARGES</label>
              <textarea
                value={offense}
                onChange={e => setOffense(e.target.value)}
                placeholder="Description of warrant, fugitive status, or offenses..."
                rows={3}
                style={{
                  width: '100%',
                  background: 'var(--bg-void)',
                  border: '1px solid var(--border-hairline)',
                  color: 'var(--text-primary)',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '0.8rem',
                  padding: '6px 8px'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isEnrolling}
              style={{
                width: '100%',
                backgroundColor: 'var(--accent-signal)',
                color: '#0A0E14',
                border: 'none',
                padding: '12px',
                fontFamily: "'IBM Plex Mono', monospace",
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: isEnrolling ? 'wait' : 'pointer'
              }}
            >
              {isEnrolling ? 'EXTRACTING EMBEDDING & SAVING TO DATABASE...' : 'ENROLL SUSPECT INTO DATABASE & FAISS'}
            </button>
          </form>
        ) : (
          /* Gallery Grid */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Search filter */}
            <div style={{ marginBottom: '16px', position: 'relative', maxWidth: '400px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Filter watchlist targets..."
                style={{
                  width: '100%',
                  background: 'var(--bg-void)',
                  border: '1px solid var(--border-hairline)',
                  color: 'var(--text-primary)',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '0.8rem',
                  padding: '7px 8px 7px 30px'
                }}
              />
            </div>

            {/* Cards Grid */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '16px'
            }}>
              {filtered.map(p => {
                const isCritical = p.threat_level === 'CRITICAL';
                const isHigh = p.threat_level === 'HIGH';
                const threatColor = isCritical ? 'var(--accent-alert)' : isHigh ? '#f59e0b' : '#38bdf8';

                return (
                  <div
                    key={p.person_id}
                    onClick={() => onSelectPerson?.(p.person_id)}
                    style={{
                      backgroundColor: 'var(--bg-panel)',
                      border: '1px solid var(--border-hairline)',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      borderRadius: '2px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                      cursor: onSelectPerson ? 'pointer' : 'default'
                    }}
                  >
                    {/* Photo */}
                    <div style={{ width: '100%', aspectRatio: '1/1', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
                      <img
                        src={`http://localhost:8000${p.photo_url || p.photo_path}`}
                        alt={p.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                      <div style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        backgroundColor: 'rgba(10, 14, 20, 0.88)',
                        border: `1px solid ${threatColor}`,
                        color: threatColor,
                        padding: '2px 6px',
                        fontSize: '0.65rem',
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontWeight: 700
                      }}>
                        {p.threat_level || 'HIGH'}
                      </div>
                    </div>

                    {/* Metadata */}
                    <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div className="mono-display" style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '2px' }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: '6px' }}>
                          ID: {p.person_id}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-primary)', marginBottom: '8px', lineHeight: 1.3 }}>
                          {p.offense || 'Active Criminal Warrant'}
                        </div>
                      </div>

                      <div style={{
                        fontSize: '0.65rem',
                        fontFamily: "'IBM Plex Mono', monospace",
                        color: 'var(--accent-signal)',
                        backgroundColor: 'rgba(0, 217, 163, 0.08)',
                        padding: '4px 6px',
                        border: '1px solid rgba(0, 217, 163, 0.2)'
                      }}>
                        FAISS HNSW INDEXED // 64-D EMBEDDING
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
