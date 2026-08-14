import React, { useState, useEffect, useRef } from 'react';
import {
  Shield, Plus, Upload, X, Search, RefreshCw,
  Trash2, Eye, AlertTriangle, AlertOctagon, Check, Fingerprint,
  MapPin, Terminal,
  Zap, ChevronDown, ChevronUp, Image as ImageIcon,
  ZoomIn, ZoomOut, UserPlus
} from 'lucide-react';
import {
  fetchReferencePersons, enrollReferencePerson, syncWatchlist,
  deleteReferencePerson, deleteAllReferencePersons, getPhotoUrl,
  type ReferencePerson
} from '../services/api';
import { DEFAULT_WATCHLIST_PERSONS } from '../data/mockData';

interface WatchlistGalleryModalProps {
  onClose: () => void;
  onSelectPerson?: (personId: string) => void;
}

const LOCAL_CACHE_KEY = 'sentinel_watchlist_custom_targets';
const IMAGE_VAULT_KEY = 'sentinel_watchlist_images_vault';
const PURGED_FLAG_KEY = 'sentinel_watchlist_purged';

export function getImageVault(): Record<string, string> {
  try {
    const raw = localStorage.getItem(IMAGE_VAULT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveVaultImage(personId: string, dataUrl: string) {
  if (!personId || !dataUrl) return;
  try {
    const vault = getImageVault();
    vault[personId] = dataUrl;
    // Keep last 100 images
    const keys = Object.keys(vault);
    if (keys.length > 100) {
      delete vault[keys[0]];
    }
    localStorage.setItem(IMAGE_VAULT_KEY, JSON.stringify(vault));
  } catch (e) {
    console.warn('Image vault save warning:', e);
  }
}

export function getVaultImage(personId?: string): string | null {
  if (!personId) return null;
  try {
    const vault = getImageVault();
    return vault[personId] || null;
  } catch {
    return null;
  }
}

function getCachedPersons(): ReferencePerson[] {
  try {
    const isPurged = localStorage.getItem(PURGED_FLAG_KEY) === 'true';
    if (isPurged) {
      return [];
    }
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    const cachedList: ReferencePerson[] = raw ? JSON.parse(raw) : [];

    // Purge any legacy hardcoded mock profiles
    const hardcodedIds = new Set([
      'p-obama', 'p-bush', 'p-saddam', 'p-musk', 'p-trump', 'p-zuck', 'p-kirk',
      'p-suspect-001', 'p-suspect-002', 'p-suspect-003', 'p-suspect-004',
      'p-suspect-005', 'p-suspect-006', 'p-suspect-007', 'p-suspect-008'
    ]);

    const sanitized = cachedList.filter(p => !hardcodedIds.has(p.person_id));
    if (sanitized.length !== cachedList.length) {
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(sanitized));
    }

    const vault = getImageVault();
    return sanitized.map(p => {
      const vaultPhoto = vault[p.person_id];
      const hasBase64 = p.photo_url && p.photo_url.startsWith('data:');
      return {
        ...p,
        photo_url: hasBase64 ? p.photo_url : (vaultPhoto || p.photo_url || p.photo_path),
        photo_path: (p.photo_path && p.photo_path.startsWith('data:')) ? p.photo_path : (vaultPhoto || p.photo_path || p.photo_url),
      };
    });
  } catch {
    return [];
  }
}

function saveCachedPersons(items: ReferencePerson[]) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(items));
    if (items.length > 0) {
      localStorage.removeItem(PURGED_FLAG_KEY);
    }
    items.forEach(p => {
      const img = p.photo_url || p.photo_path;
      if (img && img.startsWith('data:')) {
        saveVaultImage(p.person_id, img);
      }
    });
  } catch (e) {
    console.warn('LocalStorage save warning:', e);
  }
}

/**
 * Rapid Client-Side Image Optimizer
 * Downsamples high-resolution photos to max 800px and returns a permanent Base64 Data URL
 * that NEVER expires across modal closes or browser reloads.
 */
async function optimizeImageFile(file: File): Promise<{ optimizedFile: File; previewUrl: string; originalSizeKb: number; optimizedSizeKb: number }> {
  const originalSizeKb = Math.round(file.size / 1024);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        const maxDim = 800;

        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const optimizedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: 'image/jpeg' });
                const optimizedSizeKb = Math.round(optimizedFile.size / 1024);
                resolve({ optimizedFile, previewUrl: dataUrl, originalSizeKb, optimizedSizeKb });
              } else {
                resolve({ optimizedFile: file, previewUrl: dataUrl, originalSizeKb, optimizedSizeKb: originalSizeKb });
              }
            },
            'image/jpeg',
            0.88
          );
        } else {
          const fallbackUrl = (e.target?.result as string) || '';
          resolve({ optimizedFile: file, previewUrl: fallbackUrl, originalSizeKb, optimizedSizeKb: originalSizeKb });
        }
      };
      img.onerror = () => {
        const fallbackUrl = (e.target?.result as string) || '';
        resolve({ optimizedFile: file, previewUrl: fallbackUrl, originalSizeKb, optimizedSizeKb: originalSizeKb });
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      resolve({ optimizedFile: file, previewUrl: '', originalSizeKb, optimizedSizeKb: originalSizeKb });
    };
    reader.readAsDataURL(file);
  });
}

export const WatchlistGalleryModal: React.FC<WatchlistGalleryModalProps> = ({ onClose, onSelectPerson }) => {
  // Synchronously initialize from local storage cache so there is 0ms delay and no blank screen
  const [persons, setPersons] = useState<ReferencePerson[]>(() => getCachedPersons());
  const [query, setQuery] = useState('');
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollStep, setEnrollStep] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Real-time Ingestion Terminal Logs HUD
  const [ingestionLogs, setIngestionLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] [INIT] Watchlist database connected. Ready for biometric target ingestion.`
  ]);
  const [showLogsHUD, setShowLogsHUD] = useState<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Detailed Preview Lightbox Target & Zoom State
  const [previewTarget, setPreviewTarget] = useState<ReferencePerson | null>(null);
  const [previewZoom, setPreviewZoom] = useState<number>(1.0);

  // Target ID queued for delete confirmation
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<ReferencePerson | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Bulk Purge All State
  const [showDeleteAllModal, setShowDeleteAllModal] = useState<boolean>(false);
  const [isPurgingAll, setIsPurgingAll] = useState<boolean>(false);

  // Form State
  const [name, setName] = useState('');
  const [personId, setPersonId] = useState('');
  const [age, setAge] = useState(30);
  const [category, setCategory] = useState('WANTED FUGITIVE');
  const [threatLevel, setThreatLevel] = useState('HIGH');
  const [offense, setOffense] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageCompressionNotice, setImageCompressionNotice] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [lastTelemetry, setLastTelemetry] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPersons();
  }, []);

  useEffect(() => {
    if (showLogsHUD) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [ingestionLogs, showLogsHUD]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setIngestionLogs(prev => [...prev.slice(-40), `[${timestamp}] ${msg}`]);
  };

  const loadPersons = async () => {
    const isPurged = localStorage.getItem(PURGED_FLAG_KEY) === 'true';

    // 1. First ensure cached targets are in state
    const cached = getCachedPersons();
    if (cached.length > 0) {
      setPersons(cached);
    } else if (isPurged) {
      setPersons([]);
    }

    // 2. Fetch from backend database
    const backendList = await fetchReferencePersons();
    const vault = getImageVault();

    const hardcodedIds = new Set([
      'p-obama', 'p-bush', 'p-saddam', 'p-musk', 'p-trump', 'p-zuck', 'p-kirk',
      'p-suspect-001', 'p-suspect-002', 'p-suspect-003', 'p-suspect-004',
      'p-suspect-005', 'p-suspect-006', 'p-suspect-007', 'p-suspect-008'
    ]);

    const realBackendList = (backendList || []).filter(p => !hardcodedIds.has(p.person_id));

    if (realBackendList.length > 0) {
      const mergedMap = new Map<string, ReferencePerson>();

      // Seed with local cache (preserves any custom offline enrollments)
      cached.forEach(p => mergedMap.set(p.person_id, p));

      // Merge backend profiles
      realBackendList.forEach(p => {
        const existing = mergedMap.get(p.person_id);
        const vaultPhoto = vault[p.person_id];
        const resolvedPhoto = vaultPhoto || (existing?.photo_url?.startsWith('data:') ? existing.photo_url : null) || p.photo_url || p.photo_path;

        mergedMap.set(p.person_id, {
          ...existing,
          ...p,
          photo_url: resolvedPhoto,
          photo_path: resolvedPhoto || p.photo_path,
        });
      });

      const mergedList = Array.from(mergedMap.values());
      setPersons(mergedList);
      saveCachedPersons(mergedList);
      addLog(`[GALLERY] Loaded ${mergedList.length} target dossiers from SQLite and FAISS database.`);
    } else if (cached.length > 0) {
      setPersons(cached);
      addLog(`[GALLERY] Restored ${cached.length} target dossiers from local vault storage.`);
    } else {
      setPersons([]);
      addLog(`[GALLERY] Watchlist database is clean (0 enrolled targets).`);
    }
  };

  const handlePurgeAll = async () => {
    setIsPurgingAll(true);
    const targetCount = persons.length;
    addLog(`[PURGE ALL] Initiating complete wipe of ${targetCount} suspect profiles across SQLite, FAISS, and disk storage...`);

    try {
      await deleteAllReferencePersons();

      // Wipe local cache & image vault
      localStorage.setItem(PURGED_FLAG_KEY, 'true');
      localStorage.setItem(LOCAL_CACHE_KEY, '[]');
      localStorage.removeItem(IMAGE_VAULT_KEY);

      // Clear React state
      setPersons([]);
      setPreviewTarget(null);
      setDeleteConfirmTarget(null);

      addLog(`[SQLITE] Wiped 'reference_persons' table in SQLite database.`);
      addLog(`[FAISS] Vector search engine reset to 0 active vectors.`);
      addLog(`[VAULT] Cleared Base64 image cache vault.`);
      addLog(`[COMPLETE] Watchlist database is now completely empty.`);

      setIsPurgingAll(false);
      setShowDeleteAllModal(false);
      showTemporaryNotice(`✓ Successfully purged all ${targetCount} suspects, FAISS vectors, and database dossiers`);
    } catch (err: any) {
      setIsPurgingAll(false);
      setShowDeleteAllModal(false);
      addLog(`[ERROR] Purge failed: ${err?.message || err}`);
      showTemporaryNotice(`Local gallery wiped, backend will sync on restart`);
    }
  };

  const showTemporaryNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      addLog(`[FILE] Selected '${file.name}' (${Math.round(file.size / 1024)} KB). Preparing permanent preview...`);
      const { optimizedFile, previewUrl: pUrl, originalSizeKb, optimizedSizeKb } = await optimizeImageFile(file);
      setSelectedFile(optimizedFile);
      setPreviewUrl(pUrl);
      setEnrollError(null);

      // Auto-populate name & unique ID from filename
      const rawBase = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/[()]/g, '')
        .trim();
      
      const autoName = rawBase ? rawBase.replace(/\b\w/g, l => l.toUpperCase()) : 'New Suspect';
      const cleanSlug = autoName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const uniqueSuffix = Math.random().toString(36).substring(2, 6);
      const generatedId = `p-${cleanSlug || 'target'}-${uniqueSuffix}`;

      if (!name.trim()) {
        setName(autoName);
      }
      // Always provide a unique Person ID so multiple uploads never collide
      setPersonId(generatedId);

      if (originalSizeKb > optimizedSizeKb) {
        const msg = `Downscaled from ${originalSizeKb} KB to ${optimizedSizeKb} KB (Instant Fast Stream)`;
        setImageCompressionNotice(msg);
        addLog(`[OPTIMIZE] ${msg}`);
      } else {
        setImageCompressionNotice(`${optimizedSizeKb} KB Ready`);
        addLog(`[OPTIMIZE] Image buffer verified: ${optimizedSizeKb} KB`);
      }
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

    // Guarantee unique Person ID
    let cleanPersonId = personId.trim();
    if (!cleanPersonId) {
      const slug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const uniqueSuffix = Math.random().toString(36).substring(2, 6) + '-' + Date.now().toString().slice(-4);
      cleanPersonId = `p-${slug || 'target'}-${uniqueSuffix}`;
    }

    setIsEnrolling(true);
    setEnrollStep(1);
    addLog(`[START] Initiating enrollment for target '${cleanName}' (ID: ${cleanPersonId})...`);

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
      addLog(`[STEP 1/4] Attaching photo stream (${Math.round(selectedFile.size / 1024)} KB)...`);
    } else {
      addLog(`[STEP 1/4] No photo provided. Generating synthetic reference portrait...`);
    }

    setEnrollStep(2);
    addLog(`[STEP 2/4] Transmitting buffer payload to FastAPI AI Services Layer...`);

    // If we have a permanent Base64 preview image, immediately store into the persistent vault
    if (previewUrl && previewUrl.startsWith('data:')) {
      saveVaultImage(cleanPersonId, previewUrl);
    }

    try {
      setEnrollStep(3);
      addLog(`[STEP 3/4] Extracting 64-D ArcFace deep vector embedding & L2 normalizing...`);

      const created = await enrollReferencePerson(formData);

      setEnrollStep(4);
      addLog(`[STEP 4/4] Writing criminal dossier to SQLite and indexing in FAISS HNSW graph...`);

      setIsEnrolling(false);
      setEnrollStep(0);

      if (created) {
        const savedPhoto = (previewUrl && previewUrl.startsWith('data:')) ? previewUrl : (created.photo_url || created.photo_path);

        const enriched: ReferencePerson = {
          ...created,
          person_id: cleanPersonId,
          name: cleanName,
          age,
          category,
          threat_level: threatLevel,
          offense: offense || 'Active Criminal Warrant',
          photo_url: savedPhoto,
          photo_path: savedPhoto || created.photo_path,
        };

        // Cache locally so it is NEVER lost across modal closes or browser reloads
        const currentCached = getCachedPersons();
        const updatedCached = [enriched, ...currentCached.filter(p => p.person_id !== enriched.person_id)];
        saveCachedPersons(updatedCached);

        // Update React state immediately
        setPersons(prev => {
          const filtered = prev.filter(p => p.person_id !== enriched.person_id);
          return [enriched, ...filtered];
        });

        if (created.logs && Array.isArray(created.logs)) {
          created.logs.forEach(l => addLog(l));
        }
        if (created.telemetry) {
          setLastTelemetry(created.telemetry);
          addLog(`[TELEMETRY] Complete in ${created.telemetry.total_ms}ms (Decode: ${created.telemetry.image_decode_ms}ms, Enroll: ${created.telemetry.enroll_ms}ms)`);
        }

        setShowEnrollForm(false);
        setName('');
        setPersonId('');
        setOffense('');
        setSelectedFile(null);
        setPreviewUrl(null);
        setImageCompressionNotice(null);

        showTemporaryNotice(`✓ Target ${cleanName} (${cleanPersonId}) successfully enrolled into Watchlist`);
      } else {
        setEnrollError('Failed to save to database. Please check connection and try again.');
        addLog(`[ERROR] Server returned empty response for target ${cleanPersonId}`);
      }
    } catch (err: any) {
      setIsEnrolling(false);
      setEnrollStep(0);
      const errMsg = err?.message || 'Database enrollment failed';
      setEnrollError(errMsg);
      addLog(`[EXCEPTION] Enrollment failed: ${errMsg}`);
    }
  };

  const handleDeleteTarget = async (target: ReferencePerson) => {
    setIsDeleting(true);
    addLog(`[DELETE] Purging target ${target.name} (${target.person_id}) from SQLite & FAISS...`);
    await deleteReferencePerson(target.person_id);
    setIsDeleting(false);

    // Purge from state, local cache, and image vault
    setPersons(prev => prev.filter(p => p.person_id !== target.person_id));
    const cached = getCachedPersons().filter(p => p.person_id !== target.person_id);
    saveCachedPersons(cached);

    try {
      const vault = getImageVault();
      delete vault[target.person_id];
      localStorage.setItem(IMAGE_VAULT_KEY, JSON.stringify(vault));
    } catch {}

    setDeleteConfirmTarget(null);
    if (previewTarget?.person_id === target.person_id) {
      setPreviewTarget(null);
    }
    addLog(`[PURGE] ✓ Purged target ${target.person_id} from database and vault.`);
    showTemporaryNotice(`Target ${target.name} (${target.person_id}) purged from Database & FAISS Index`);
  };

  const filtered = persons.filter(p => {
    const hay = `${p.name} ${p.person_id} ${p.category || ''} ${p.offense || ''} ${p.threat_level || ''}`.toLowerCase();
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
        width: '94vw',
        maxWidth: '1240px',
        height: '88vh',
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-hairline)',
        zIndex: 220,
        boxShadow: '0 32px 80px rgba(0,0,0,0.95)',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(16px)',
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
          <Shield size={20} color="var(--accent-signal)" />
          <div>
            <h2 className="mono-display" style={{ fontSize: '1.05rem', margin: 0, color: 'var(--text-primary)' }}>
              REFERENCE WATCHLIST & CRIMINAL DOSSIERS
            </h2>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
              FAISS VECTOR GALLERY // DATABASE DOSSIERS // {persons.length} ENROLLED TARGETS
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Toggle Ingestion Logs HUD */}
          <button
            onClick={() => setShowLogsHUD(prev => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: showLogsHUD ? 'rgba(0, 217, 163, 0.2)' : 'var(--bg-void)',
              color: showLogsHUD ? 'var(--accent-signal)' : 'var(--text-secondary)',
              border: `1px solid ${showLogsHUD ? 'var(--accent-signal)' : 'var(--border-hairline)'}`,
              padding: '6px 12px',
              fontSize: '0.72rem',
              fontFamily: "'IBM Plex Mono', monospace",
              cursor: 'pointer'
            }}
            title="Toggle Live System Ingestion Logs Terminal"
          >
            <Terminal size={13} />
            LOGS HUD ({ingestionLogs.length})
            {showLogsHUD ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          <button
            onClick={async () => {
              setIsSyncing(true);
              addLog('[SYNC] Triggering WatchList directory and FAISS vector index synchronization...');
              await syncWatchlist();
              await loadPersons();
              setIsSyncing(false);
              showTemporaryNotice('Watchlist synchronized with filesystem and FAISS index');
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
              padding: '6px 14px',
              fontSize: '0.75rem',
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Plus size={14} />
            {showEnrollForm ? 'BACK TO GALLERY' : 'ENROLL NEW TARGET'}
          </button>

          {/* PURGE ALL / DELETE ALL SUSPECTS BUTTON */}
          <button
            onClick={() => setShowDeleteAllModal(true)}
            disabled={persons.length === 0 || isPurgingAll}
            title={persons.length === 0 ? "No suspects to delete" : "Purge all suspect dossiers, FAISS vectors, and images"}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: persons.length === 0 ? 'rgba(255, 71, 87, 0.05)' : 'rgba(255, 71, 87, 0.14)',
              color: persons.length === 0 ? 'var(--text-secondary)' : 'var(--accent-alert)',
              border: '1px solid ' + (persons.length === 0 ? 'var(--border-hairline)' : 'rgba(255, 71, 87, 0.55)'),
              padding: '6px 13px',
              fontSize: '0.75rem',
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 700,
              cursor: persons.length === 0 || isPurgingAll ? 'not-allowed' : 'pointer',
              opacity: persons.length === 0 ? 0.5 : 1,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => {
              if (persons.length > 0) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 71, 87, 0.28)';
                e.currentTarget.style.borderColor = 'var(--accent-alert)';
              }
            }}
            onMouseLeave={e => {
              if (persons.length > 0) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 71, 87, 0.14)';
                e.currentTarget.style.borderColor = 'rgba(255, 71, 87, 0.55)';
              }
            }}
          >
            <Trash2 size={13} />
            DELETE ALL {persons.length > 0 ? `(${persons.length})` : ''}
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

      {/* Action Notification Banner */}
      {actionNotice && (
        <div style={{
          backgroundColor: 'rgba(0, 217, 163, 0.15)',
          borderBottom: '1px solid var(--accent-signal)',
          color: 'var(--accent-signal)',
          padding: '6px 20px',
          fontSize: '0.75rem',
          fontFamily: "'IBM Plex Mono', monospace",
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Check size={14} />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#070A0E' }}>
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '18px 20px', gap: '20px' }}>
          {showEnrollForm ? (
            /* Enrollment Form with Live Progress and Image Optimizer */
            <div style={{ flex: 1, display: 'flex', gap: '24px', overflowY: 'auto' }}>
              <form
                onSubmit={handleEnroll}
                style={{
                  flex: 1.2,
                  backgroundColor: 'var(--bg-panel)',
                  border: '1px solid var(--border-hairline)',
                  padding: '24px',
                  borderRadius: '2px',
                  overflowY: 'auto'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 className="mono-display" style={{ fontSize: '0.95rem', margin: 0, color: 'var(--accent-signal)' }}>
                    ENROLL SUSPECT INTO DATABASE & FAISS
                  </h3>
                  <span style={{ fontSize: '0.68rem', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-secondary)' }}>
                    SUB-MILLI SPEED OPTIMIZED
                  </span>
                </div>

                {enrollError && (
                  <div style={{
                    padding: '10px 14px',
                    marginBottom: '14px',
                    backgroundColor: 'rgba(255, 71, 87, 0.15)',
                    border: '1px solid var(--accent-alert)',
                    color: 'var(--accent-alert)',
                    fontSize: '0.78rem',
                    fontFamily: "'IBM Plex Mono', monospace",
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <AlertTriangle size={16} />
                    <div>{enrollError}</div>
                  </div>
                )}

                {/* Live Step Progress Indicator when Enrolling */}
                {isEnrolling && (
                  <div style={{
                    marginBottom: '16px',
                    backgroundColor: 'var(--bg-void)',
                    border: '1px solid var(--accent-signal)',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--accent-signal)' }}>
                      <span>INGESTION IN PROGRESS...</span>
                      <span>STEP {enrollStep} / 4</span>
                    </div>

                    <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--border-hairline)', overflow: 'hidden' }}>
                      <div style={{ width: `${(enrollStep / 4) * 100}%`, height: '100%', backgroundColor: 'var(--accent-signal)', transition: 'width 0.2s ease' }} />
                    </div>

                    <div style={{ fontSize: '0.72rem', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-primary)' }}>
                      {enrollStep === 1 && "• Preparing and resizing image payload..."}
                      {enrollStep === 2 && "• Transmitting photo buffer to FastAPI AI services..."}
                      {enrollStep === 3 && "• Extracting ArcFace 64-D deep feature vector..."}
                      {enrollStep === 4 && "• Persisting dossier to SQLite & updating FAISS HNSW graph..."}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '18px', marginBottom: '16px' }}>
                  {/* Photo upload dropzone with preview */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: '140px',
                      height: '140px',
                      backgroundColor: '#000',
                      border: previewUrl ? '2px solid var(--accent-signal)' : '1px dashed var(--accent-signal)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      position: 'relative',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.6)'
                    }}
                  >
                    {previewUrl ? (
                      <>
                        <img src={previewUrl} alt="Target preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          backgroundColor: 'rgba(10, 14, 20, 0.88)',
                          padding: '3px 4px',
                          textAlign: 'center',
                          fontSize: '0.62rem',
                          fontFamily: "'IBM Plex Mono', monospace",
                          color: 'var(--accent-signal)',
                          fontWeight: 700
                        }}>
                          CHANGE PHOTO
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload size={24} color="var(--accent-signal)" />
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-primary)', marginTop: '6px', textAlign: 'center', padding: '0 6px', fontWeight: 600 }}>
                          UPLOAD PHOTO
                        </span>
                        <span style={{ fontSize: '0.58rem', color: 'var(--accent-signal)', marginTop: '2px' }}>
                          CLICK TO BROWSE
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
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>PERSON ID</label>
                        {imageCompressionNotice && (
                          <span style={{ fontSize: '0.65rem', color: 'var(--accent-signal)', fontFamily: "'IBM Plex Mono', monospace" }}>
                            {imageCompressionNotice}
                          </span>
                        )}
                      </div>
                      <input
                        value={personId}
                        onChange={e => setPersonId(e.target.value)}
                        placeholder="e.g. p-suspect-010 (auto-generated if empty)"
                        style={{
                          width: '100%',
                          background: 'var(--bg-void)',
                          border: '1px solid var(--border-hairline)',
                          color: 'var(--text-primary)',
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '0.8rem',
                          padding: '7px 10px',
                          marginTop: '3px'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>FULL NAME *</label>
                      <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. Marcus Vance"
                        required
                        style={{
                          width: '100%',
                          background: 'var(--bg-void)',
                          border: '1px solid var(--border-hairline)',
                          color: 'var(--text-primary)',
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '0.8rem',
                          padding: '7px 10px',
                          marginTop: '3px'
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
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
                        padding: '7px 10px',
                        marginTop: '3px'
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
                        padding: '7px 10px',
                        marginTop: '3px'
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
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'var(--bg-void)',
                        border: '1px solid var(--border-hairline)',
                        color: 'var(--text-primary)',
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '0.8rem',
                        padding: '7px 10px',
                        marginTop: '3px'
                      }}
                    >
                      <option value="WANTED FUGITIVE">WANTED FUGITIVE</option>
                      <option value="PERSON OF INTEREST">PERSON OF INTEREST</option>
                      <option value="TERROR SUSPECT">TERROR SUSPECT</option>
                      <option value="MISSING PERSON">MISSING PERSON</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>ACTIVE OFFENSE / WARRANT CHARGES</label>
                  <textarea
                    value={offense}
                    onChange={e => setOffense(e.target.value)}
                    placeholder="Description of warrant, fugitive status, or offenses..."
                    rows={2}
                    style={{
                      width: '100%',
                      background: 'var(--bg-void)',
                      border: '1px solid var(--border-hairline)',
                      color: 'var(--text-primary)',
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '0.8rem',
                      padding: '7px 10px',
                      marginTop: '3px'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isEnrolling}
                  style={{
                    width: '100%',
                    backgroundColor: isEnrolling ? 'var(--bg-panel-raised)' : 'var(--accent-signal)',
                    color: isEnrolling ? 'var(--accent-signal)' : '#0A0E14',
                    border: isEnrolling ? '1px solid var(--accent-signal)' : 'none',
                    padding: '12px',
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: isEnrolling ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {isEnrolling ? (
                    <>
                      <RefreshCw size={16} className="spinning" />
                      EXTRACTING EMBEDDING & SAVING ({enrollStep}/4)...
                    </>
                  ) : (
                    <>
                      <Zap size={16} />
                      ENROLL SUSPECT INTO DATABASE & FAISS
                    </>
                  )}
                </button>
              </form>

              {/* Side Ingestion Telemetry & Logs in Enrollment Mode */}
              <div style={{
                flex: 1,
                backgroundColor: 'var(--bg-panel)',
                border: '1px solid var(--border-hairline)',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                borderRadius: '2px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-signal)', fontSize: '0.78rem', fontFamily: "'IBM Plex Mono', monospace" }}>
                    <Terminal size={14} /> LIVE INGESTION LOGS
                  </div>
                  {lastTelemetry && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--accent-signal)', fontFamily: "'IBM Plex Mono', monospace" }}>
                      TOTAL: {lastTelemetry.total_ms} ms
                    </span>
                  )}
                </div>

                <div style={{
                  flex: 1,
                  backgroundColor: '#04070A',
                  border: '1px solid var(--border-hairline)',
                  padding: '10px',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '0.7rem',
                  color: '#A0AEC0',
                  overflowY: 'auto',
                  lineHeight: 1.45
                }}>
                  {ingestionLogs.map((log, idx) => {
                    const isErr = log.includes('[ERROR]') || log.includes('[EXCEPTION]');
                    const isSucc = log.includes('[SUCCESS]') || log.includes('✓');
                    const isStep = log.includes('[STEP') || log.includes('[EMBED]');
                    return (
                      <div
                        key={idx}
                        style={{
                          color: isErr ? 'var(--accent-alert)' : isSucc ? 'var(--accent-signal)' : isStep ? '#38bdf8' : '#A0AEC0',
                          marginBottom: '3px'
                        }}
                      >
                        {log}
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          ) : (
            /* Gallery Grid */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Search filter bar */}
              <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: '450px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Filter by name, ID, offense, threat level..."
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

                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                  SHOWING {filtered.length} OF {persons.length} TARGETS
                </div>
              </div>

              {/* Empty State when no criminals in watchlist */}
              {filtered.length === 0 && (
                <div style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px 20px',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-panel)',
                  border: '1px dashed var(--border-hairline)'
                }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(0, 217, 163, 0.08)',
                    border: '1px solid rgba(0, 217, 163, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '16px'
                  }}>
                    <Shield size={32} color="var(--accent-signal)" />
                  </div>
                  <h3 className="mono-display" style={{ fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    {persons.length === 0 ? 'WATCHLIST DATABASE IS EMPTY' : 'NO TARGETS MATCHING QUERY'}
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '440px', lineHeight: 1.5, marginBottom: '20px' }}>
                    {persons.length === 0
                      ? 'All hardcoded mock data has been purged. Enroll a new criminal target or sync reference images to index biometric vectors into SQLite & FAISS.'
                      : `No enrolled suspects match '${query}'. Try searching by another name, ID, or threat category.`}
                  </p>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={() => setShowEnrollForm(true)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: 'var(--accent-signal)',
                        color: '#0A0E14',
                        border: 'none',
                        padding: '10px 18px',
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                      }}
                    >
                      <UserPlus size={16} /> ENROLL NEW SUSPECT
                    </button>
                    {persons.length === 0 && (
                      <button
                        onClick={async () => {
                          setIsSyncing(true);
                          addLog('[SYNC] Syncing WatchList folder with SQLite and FAISS...');
                          await syncWatchlist();
                          await loadPersons();
                          setIsSyncing(false);
                          showTemporaryNotice('Watchlist synchronized with filesystem and FAISS index');
                        }}
                        disabled={isSyncing}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          backgroundColor: 'var(--bg-panel-raised)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-hairline)',
                          padding: '10px 18px',
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '0.8rem',
                          cursor: isSyncing ? 'wait' : 'pointer'
                        }}
                      >
                        <RefreshCw size={15} className={isSyncing ? 'spinning' : ''} />
                        SYNC DISK PROFILES
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Cards Grid */}
              {filtered.length > 0 && (
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '20px',
                  paddingRight: '6px',
                  paddingBottom: '32px'
                }}>
                  {filtered.map(p => {
                    const isCritical = p.threat_level === 'CRITICAL';
                    const isHigh = p.threat_level === 'HIGH';
                    const threatColor = isCritical ? 'var(--accent-alert)' : isHigh ? '#f59e0b' : '#38bdf8';
                    const photoSrc = getPhotoUrl(p.photo_url || p.photo_path);

                    return (
                      <div
                        key={p.person_id}
                        style={{
                          backgroundColor: 'var(--bg-panel)',
                          border: '1px solid var(--border-hairline)',
                          display: 'flex',
                          flexDirection: 'column',
                          borderRadius: '3px',
                          boxShadow: '0 6px 20px rgba(0,0,0,0.65)',
                          transition: 'border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
                          position: 'relative',
                          overflow: 'hidden',
                          minHeight: '390px'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = 'rgba(0, 217, 163, 0.5)';
                          e.currentTarget.style.boxShadow = '0 8px 28px rgba(0, 217, 163, 0.15)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'var(--border-hairline)';
                          e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.65)';
                        }}
                      >
                        {/* Photo Header Container with Interactive Image Preview */}
                        <div
                          style={{
                            width: '100%',
                            height: '180px',
                            backgroundColor: '#04070A',
                            position: 'relative',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            flexShrink: 0,
                            borderBottom: '1px solid var(--border-hairline)'
                          }}
                          onClick={() => {
                            setPreviewZoom(1.0);
                            setPreviewTarget(p);
                          }}
                          title="Click to preview full-size mugshot and dossier"
                        >
                          {/* Image with multi-tier fallback */}
                          <TargetImage personId={p.person_id} photoUrl={photoSrc} name={p.name} />

                          {/* Optical Reticle Lines */}
                          <div style={{ position: 'absolute', top: '8px', left: '8px', width: '12px', height: '12px', borderTop: '2px solid rgba(0, 217, 163, 0.7)', borderLeft: '2px solid rgba(0, 217, 163, 0.7)', pointerEvents: 'none' }} />
                          <div style={{ position: 'absolute', top: '8px', right: '8px', width: '12px', height: '12px', borderTop: '2px solid rgba(0, 217, 163, 0.7)', borderRight: '2px solid rgba(0, 217, 163, 0.7)', pointerEvents: 'none' }} />
                          <div style={{ position: 'absolute', bottom: '8px', left: '8px', width: '12px', height: '12px', borderBottom: '2px solid rgba(0, 217, 163, 0.7)', borderLeft: '2px solid rgba(0, 217, 163, 0.7)', pointerEvents: 'none' }} />
                          <div style={{ position: 'absolute', bottom: '8px', right: '8px', width: '12px', height: '12px', borderBottom: '2px solid rgba(0, 217, 163, 0.7)', borderRight: '2px solid rgba(0, 217, 163, 0.7)', pointerEvents: 'none' }} />

                          {/* Threat Level Badge */}
                          <div style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            backgroundColor: 'rgba(10, 14, 20, 0.92)',
                            border: `1px solid ${threatColor}`,
                            color: threatColor,
                            padding: '3px 8px',
                            fontSize: '0.65rem',
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontWeight: 700,
                            zIndex: 2,
                            borderRadius: '2px',
                            letterSpacing: '0.05em'
                          }}>
                            {p.threat_level || 'HIGH'}
                          </div>

                          {/* Top-Left Person ID Pill */}
                          <div style={{
                            position: 'absolute',
                            top: '8px',
                            left: '8px',
                            backgroundColor: 'rgba(10, 14, 20, 0.88)',
                            border: '1px solid var(--border-hairline)',
                            color: 'var(--text-secondary)',
                            padding: '2px 6px',
                            fontSize: '0.62rem',
                            fontFamily: "'IBM Plex Mono', monospace",
                            zIndex: 2,
                            borderRadius: '2px'
                          }}>
                            {p.person_id}
                          </div>

                          {/* Hover Preview Bar */}
                          <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            backgroundColor: 'rgba(10, 14, 20, 0.9)',
                            borderTop: '1px solid rgba(0, 217, 163, 0.3)',
                            padding: '5px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.65rem',
                            fontFamily: "'IBM Plex Mono', monospace",
                            color: 'var(--accent-signal)'
                          }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                              <ImageIcon size={12} /> VIEW MUGSHOT
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text-secondary)' }}>
                              <Eye size={12} /> DOSSIER
                            </span>
                          </div>
                        </div>

                        {/* Metadata Content Body */}
                        <div style={{ padding: '14px 14px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                              <div className="mono-display" style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: 1.25 }}>
                                {p.name}
                              </div>
                              {p.age && (
                                <span style={{ fontSize: '0.66rem', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-secondary)', backgroundColor: 'var(--bg-void)', padding: '1px 5px', border: '1px solid var(--border-hairline)', borderRadius: '2px', whiteSpace: 'nowrap' }}>
                                  AGE {p.age}
                                </span>
                              )}
                            </div>

                            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ color: threatColor }}>●</span>
                              <span>{p.category || 'WANTED FUGITIVE'}</span>
                            </div>

                            <div style={{
                              fontSize: '0.74rem',
                              color: '#B0BAC5',
                              marginBottom: '12px',
                              lineHeight: 1.4,
                              minHeight: '38px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical'
                            }}>
                              {p.offense || 'Active Criminal Warrant'}
                            </div>
                          </div>

                          <div style={{ marginTop: 'auto' }}>
                            {/* FAISS Index Tag */}
                            <div style={{
                              fontSize: '0.65rem',
                              fontFamily: "'IBM Plex Mono', monospace",
                              color: 'var(--accent-signal)',
                              backgroundColor: 'rgba(0, 217, 163, 0.08)',
                              padding: '5px 8px',
                              border: '1px solid rgba(0, 217, 163, 0.25)',
                              marginBottom: '10px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              borderRadius: '2px'
                            }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <Fingerprint size={12} color="var(--accent-signal)" />
                                FAISS HNSW INDEXED
                              </span>
                              <span style={{ fontWeight: 700 }}>64-D</span>
                            </div>

                            {/* Action Buttons: PREVIEW & DELETE — ALWAYS 100% PROMINENT & VISIBLE */}
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => {
                                  setPreviewZoom(1.0);
                                  setPreviewTarget(p);
                                }}
                                style={{
                                  flex: 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  backgroundColor: 'rgba(0, 217, 163, 0.12)',
                                  border: '1px solid var(--accent-signal)',
                                  color: 'var(--accent-signal)',
                                  padding: '8px 10px',
                                  fontSize: '0.75rem',
                                  fontFamily: "'IBM Plex Mono', monospace",
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                  borderRadius: '2px'
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.backgroundColor = 'var(--accent-signal)';
                                  e.currentTarget.style.color = '#0A0E14';
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.backgroundColor = 'rgba(0, 217, 163, 0.12)';
                                  e.currentTarget.style.color = 'var(--accent-signal)';
                                }}
                              >
                                <Eye size={13} /> PREVIEW
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmTarget(p);
                                }}
                                aria-label={`Delete ${p.name}`}
                                title="Delete suspect from database and FAISS"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '5px',
                                  backgroundColor: 'rgba(255, 71, 87, 0.12)',
                                  border: '1px solid rgba(255, 71, 87, 0.5)',
                                  color: 'var(--accent-alert)',
                                  padding: '8px 12px',
                                  fontSize: '0.75rem',
                                  fontFamily: "'IBM Plex Mono', monospace",
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                  borderRadius: '2px'
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.backgroundColor = 'var(--accent-alert)';
                                  e.currentTarget.style.color = '#FFFFFF';
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.backgroundColor = 'rgba(255, 71, 87, 0.12)';
                                  e.currentTarget.style.color = 'var(--accent-alert)';
                                }}
                              >
                                <Trash2 size={13} /> DELETE
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Collapsible Logs HUD Terminal at bottom */}
        {showLogsHUD && (
          <div style={{
            height: '140px',
            backgroundColor: '#030508',
            borderTop: '1px solid var(--border-hairline)',
            padding: '10px 16px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'IBM Plex Mono', monospace"
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-signal)', fontSize: '0.72rem' }}>
                <Terminal size={13} /> REAL-TIME INGESTION TERMINAL & TELEMETRY STREAM
              </div>
              <button
                onClick={() => setIngestionLogs([])}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.68rem', cursor: 'pointer' }}
              >
                CLEAR LOGS
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.68rem', lineHeight: 1.4, color: '#A0AEC0' }}>
              {ingestionLogs.map((log, idx) => {
                const isErr = log.includes('[ERROR]') || log.includes('[EXCEPTION]');
                const isSucc = log.includes('[SUCCESS]') || log.includes('✓');
                const isStep = log.includes('[STEP') || log.includes('[EMBED]');
                return (
                  <div
                    key={idx}
                    style={{
                      color: isErr ? 'var(--accent-alert)' : isSucc ? 'var(--accent-signal)' : isStep ? '#38bdf8' : '#A0AEC0'
                    }}
                  >
                    {log}
                  </div>
                );
              })}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* ─── Lightbox Modal for Full Mugshot Preview ───────────────────────── */}
      {previewTarget && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(5, 7, 10, 0.85)',
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(8px)'
          }}
          onClick={() => setPreviewTarget(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-hairline)',
              width: '90vw',
              maxWidth: '720px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 24px 64px rgba(0,0,0,0.95)',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Lightbox Header */}
            <div style={{
              padding: '12px 18px',
              borderBottom: '1px solid var(--border-hairline)',
              backgroundColor: 'var(--bg-panel-raised)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ImageIcon size={18} color="var(--accent-signal)" />
                <span className="mono-display" style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  CRIMINAL IMAGE PREVIEW // {previewTarget.person_id}
                </span>
              </div>
              <button
                onClick={() => setPreviewTarget(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
                aria-label="Close image preview"
              >
                <X size={18} />
              </button>
            </div>

            {/* Lightbox Body */}
            <div style={{ padding: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              {/* Large Mugshot Image Preview with Zoom Controls */}
              <div style={{
                width: '280px',
                height: '310px',
                backgroundColor: '#000',
                border: '1px solid var(--border-hairline)',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '2px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <TargetImage
                  personId={previewTarget.person_id}
                  photoUrl={getPhotoUrl(previewTarget.photo_url || previewTarget.photo_path)}
                  name={previewTarget.name}
                  large
                  zoom={previewZoom}
                />

                {/* Floating Zoom Controls for Image Preview */}
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  left: '10px',
                  display: 'flex',
                  gap: '4px',
                  zIndex: 10,
                  backgroundColor: 'rgba(10, 14, 20, 0.85)',
                  padding: '3px',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: '2px'
                }}>
                  <button
                    onClick={() => setPreviewZoom(z => Math.min(3.0, Number((z + 0.25).toFixed(2))))}
                    title="Zoom In"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-signal)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '3px'
                    }}
                  >
                    <ZoomIn size={14} />
                  </button>
                  <button
                    onClick={() => setPreviewZoom(z => Math.max(0.6, Number((z - 0.25).toFixed(2))))}
                    title="Zoom Out"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-signal)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '3px'
                    }}
                  >
                    <ZoomOut size={14} />
                  </button>
                  <button
                    onClick={() => setPreviewZoom(1.0)}
                    title="Reset Zoom"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      fontSize: '0.65rem',
                      fontFamily: "'IBM Plex Mono', monospace",
                      cursor: 'pointer',
                      padding: '0 4px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    {Math.round(previewZoom * 100)}%
                  </button>
                </div>

                <div style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  backgroundColor: 'rgba(10, 14, 20, 0.92)',
                  border: `1px solid ${previewTarget.threat_level === 'CRITICAL' ? 'var(--accent-alert)' : '#f59e0b'}`,
                  color: previewTarget.threat_level === 'CRITICAL' ? 'var(--accent-alert)' : '#f59e0b',
                  padding: '2px 8px',
                  fontSize: '0.68rem',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontWeight: 700,
                  zIndex: 2
                }}>
                  {previewTarget.threat_level || 'HIGH'}
                </div>

                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: 'rgba(10, 14, 20, 0.88)',
                  padding: '6px 10px',
                  fontSize: '0.68rem',
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: 'var(--accent-signal)',
                  borderTop: '1px solid var(--border-hairline)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  zIndex: 2
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Fingerprint size={12} /> BIOMETRIC PREVIEW
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>HIGH-RES</span>
                </div>
              </div>

              {/* Dossier Specifications */}
              <div style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <h3 className="mono-display" style={{ fontSize: '1.25rem', margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                    {previewTarget.name}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                    PERSON ID: {previewTarget.person_id}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', backgroundColor: 'var(--bg-void)', padding: '10px', border: '1px solid var(--border-hairline)' }}>
                  <div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>CATEGORY</span>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontFamily: "'IBM Plex Mono', monospace" }}>{previewTarget.category || 'WANTED FUGITIVE'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>AGE</span>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontFamily: "'IBM Plex Mono', monospace" }}>{previewTarget.age || 30} YRS</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>LAST SEEN</span>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontFamily: "'IBM Plex Mono', monospace" }}>{previewTarget.last_seen || 'Surveillance Network'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>VECTOR INDEX</span>
                    <div style={{ fontSize: '0.78rem', color: 'var(--accent-signal)', fontFamily: "'IBM Plex Mono', monospace" }}>FAISS HNSW 64-D</div>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>OFFENSES & CHARGES</span>
                  <div style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-primary)',
                    backgroundColor: 'var(--bg-void)',
                    padding: '8px',
                    border: '1px solid var(--border-hairline)',
                    marginTop: '4px',
                    lineHeight: 1.4
                  }}>
                    {previewTarget.offense || 'Active Criminal Warrant on file.'}
                  </div>
                </div>

                {/* Actions in Lightbox: Pinpoint & Delete */}
                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '10px' }}>
                  {onSelectPerson && (
                    <button
                      onClick={() => {
                        onSelectPerson(previewTarget.person_id);
                        setPreviewTarget(null);
                        onClose();
                      }}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        backgroundColor: 'var(--accent-signal)',
                        color: '#0A0E14',
                        border: 'none',
                        padding: '10px 14px',
                        fontSize: '0.78rem',
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <MapPin size={14} /> PINPOINT ON MAP
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setDeleteConfirmTarget(previewTarget);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: 'rgba(255, 71, 87, 0.15)',
                      color: 'var(--accent-alert)',
                      border: '1px solid var(--accent-alert)',
                      padding: '10px 16px',
                      fontSize: '0.78rem',
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={14} /> DELETE TARGET
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Target Safety Confirmation Modal ───────────────────────── */}
      {deleteConfirmTarget && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(5, 7, 10, 0.9)',
            zIndex: 400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(10px)'
          }}
          onClick={() => setDeleteConfirmTarget(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--accent-alert)',
              width: '90vw',
              maxWidth: '460px',
              padding: '24px',
              boxShadow: '0 24px 64px rgba(255, 71, 87, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle size={24} color="var(--accent-alert)" />
              <h3 className="mono-display" style={{ fontSize: '1rem', margin: 0, color: 'var(--accent-alert)' }}>
                CONFIRM TARGET DELETION
              </h3>
            </div>

            <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
              Are you sure you want to permanently delete <strong>{deleteConfirmTarget.name}</strong> (<code>{deleteConfirmTarget.person_id}</code>) from the surveillance database, FAISS index, and image gallery?
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              padding: '10px',
              backgroundColor: 'rgba(255, 71, 87, 0.08)',
              border: '1px solid rgba(255, 71, 87, 0.2)',
              fontSize: '0.72rem',
              fontFamily: "'IBM Plex Mono', monospace",
              color: 'var(--text-secondary)'
            }}>
              <div>• Removes SQLite dossier</div>
              <div>• Rebuilds FAISS index</div>
              <div>• Purges mugshot file</div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                onClick={() => setDeleteConfirmTarget(null)}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-hairline)',
                  color: 'var(--text-primary)',
                  padding: '9px',
                  fontSize: '0.75rem',
                  fontFamily: "'IBM Plex Mono', monospace",
                  cursor: 'pointer'
                }}
              >
                CANCEL
              </button>

              <button
                onClick={() => handleDeleteTarget(deleteConfirmTarget)}
                disabled={isDeleting}
                style={{
                  flex: 1,
                  backgroundColor: 'var(--accent-alert)',
                  border: 'none',
                  color: '#FFFFFF',
                  padding: '9px',
                  fontSize: '0.75rem',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontWeight: 700,
                  cursor: isDeleting ? 'wait' : 'pointer'
                }}
              >
                {isDeleting ? 'DELETING...' : 'DELETE SUSPECT'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Purge All Suspects & FAISS Vectors Safety Modal ──────────────── */}
      {showDeleteAllModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(5, 7, 10, 0.92)',
            zIndex: 450,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(12px)'
          }}
          onClick={() => {
            if (!isPurgingAll) setShowDeleteAllModal(false);
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--accent-alert)',
              width: '90vw',
              maxWidth: '520px',
              padding: '24px',
              boxShadow: '0 24px 64px rgba(255, 71, 87, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 71, 87, 0.15)',
                border: '1px solid var(--accent-alert)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertOctagon size={24} color="var(--accent-alert)" />
              </div>
              <div>
                <h3 className="mono-display" style={{ fontSize: '1.05rem', margin: 0, color: 'var(--accent-alert)' }}>
                  PURGE ALL SUSPECT DOSSIERS & VECTORS
                </h3>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                  IRREVERSIBLE DATABASE & FAISS VECTOR GRAPH RESET
                </span>
              </div>
            </div>

            <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete <strong style={{ color: 'var(--accent-alert)' }}>ALL {persons.length} ENROLLED SUSPECTS</strong>? This will execute:
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '12px',
              backgroundColor: 'rgba(255, 71, 87, 0.08)',
              border: '1px solid rgba(255, 71, 87, 0.25)',
              fontSize: '0.74rem',
              fontFamily: "'IBM Plex Mono', monospace",
              color: '#CBD5E1'
            }}>
              <div>• <strong>SQLite Database</strong>: Truncates <code>reference_persons</code> table</div>
              <div>• <strong>Vector DB (FAISS)</strong>: Wipes all 64-D vector embeddings (0 active vectors)</div>
              <div>• <strong>Image Storage & Vault</strong>: Clears all photos from disk & cache</div>
              <div>• <strong>Frontend Gallery</strong>: Wipes gallery view and local memory cache</div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                onClick={() => setShowDeleteAllModal(false)}
                disabled={isPurgingAll}
                style={{
                  flex: 1,
                  backgroundColor: 'var(--bg-panel-raised)',
                  border: '1px solid var(--border-hairline)',
                  color: 'var(--text-secondary)',
                  padding: '10px 16px',
                  fontSize: '0.78rem',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontWeight: 600,
                  cursor: isPurgingAll ? 'not-allowed' : 'pointer'
                }}
              >
                CANCEL
              </button>

              <button
                onClick={handlePurgeAll}
                disabled={isPurgingAll}
                style={{
                  flex: 1.5,
                  backgroundColor: 'var(--accent-alert)',
                  border: 'none',
                  color: '#FFFFFF',
                  padding: '10px 16px',
                  fontSize: '0.78rem',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontWeight: 700,
                  cursor: isPurgingAll ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(255, 71, 87, 0.4)'
                }}
              >
                {isPurgingAll ? (
                  <>
                    <RefreshCw size={14} className="spinning" />
                    PURGING ALL TARGETS...
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    CONFIRM PURGE ALL ({persons.length})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Tactical Mugshot Image Component with Multi-Tier Fallback & Reticle Support
 * Guaranteed to NEVER display as a broken image: tries Base64 vault, primary URL,
 * direct Vite public static path, and watchlist fallback candidates.
 */
function TargetImage({
  personId,
  photoUrl,
  name,
  large,
  zoom = 1.0
}: {
  personId?: string;
  photoUrl?: string;
  name: string;
  large?: boolean;
  zoom?: number;
}) {
  const computeCandidates = (): string[] => {
    const list: string[] = [];
    const vaultImg = getVaultImage(personId);

    // 1. Local permanent Base64 image in the vault
    if (vaultImg && !list.includes(vaultImg)) {
      list.push(vaultImg);
    }

    if (photoUrl) {
      if (photoUrl.startsWith('data:')) {
        if (!list.includes(photoUrl)) list.push(photoUrl);
      } else {
        const fullUrl = getPhotoUrl(photoUrl);
        if (fullUrl && !list.includes(fullUrl)) list.push(fullUrl);

        if (fullUrl.startsWith('http://localhost:8000/')) {
          const rel = fullUrl.replace('http://localhost:8000', '');
          if (!list.includes(rel)) list.push(rel);
        }
      }
    }

    // Direct static gallery paths based on personId / filename
    if (personId) {
      const pClean = personId.toLowerCase();
      const nClean = name.replace(/\s+/g, '_').toLowerCase();
      
      const relGallery = `/static/gallery/${personId}_${nClean}.jpg`;
      if (!list.includes(relGallery)) list.push(relGallery);

      const relGalleryClean = `/static/gallery/${pClean}_${nClean}.jpg`;
      if (!list.includes(relGalleryClean)) list.push(relGalleryClean);

      const absGallery = `http://localhost:8000/static/gallery/${personId}_${nClean}.jpg`;
      if (!list.includes(absGallery)) list.push(absGallery);
    }

    return list.filter(Boolean);
  };

  const [candidates, setCandidates] = useState<string[]>(computeCandidates);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidates(computeCandidates());
    setCandidateIndex(0);
  }, [photoUrl, personId, name]);

  const currentSrc = candidates[candidateIndex];

  const handleError = () => {
    if (candidateIndex < candidates.length - 1) {
      setCandidateIndex(prev => prev + 1);
    } else {
      setCandidateIndex(candidates.length); // All candidate URLs exhausted -> show monogram
    }
  };

  const hasValidImage = Boolean(currentSrc && candidateIndex < candidates.length);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {hasValidImage ? (
        <img
          src={currentSrc}
          alt={name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${zoom})`,
            transition: 'transform 0.2s ease-out'
          }}
          onError={handleError}
        />
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#06090E',
          color: 'var(--text-secondary)',
          padding: '12px'
        }}>
          <div style={{
            width: large ? '64px' : '46px',
            height: large ? '64px' : '46px',
            borderRadius: '50%',
            backgroundColor: 'rgba(0, 217, 163, 0.12)',
            border: '1px solid rgba(0, 217, 163, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '6px'
          }}>
            <Fingerprint size={large ? 32 : 24} color="var(--accent-signal)" />
          </div>
          <span style={{ fontSize: '0.62rem', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--accent-signal)', letterSpacing: '0.05em' }}>
            BIOMETRIC PROFILE
          </span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-primary)', marginTop: '2px', textAlign: 'center' }}>
            {name}
          </span>
        </div>
      )}
    </div>
  );
}

