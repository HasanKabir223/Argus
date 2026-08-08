import { useState, useEffect, useCallback } from 'react';
import { INITIAL_MATCHES, CHECKPOINTS, type Match } from './data/mockData';
import { TopBar } from './components/TopBar';
import { GlobeView } from './components/GlobeView';
import { MapView } from './components/MapView';
import { MatchListPanel } from './components/MatchListPanel';
import { TimelineStrip } from './components/TimelineStrip';
import { MatchDetailModal } from './components/MatchDetailModal';
import { ToastContainer, type ToastItem } from './components/Toast';
import { CheckpointStatusPanel } from './components/CheckpointStatusPanel';
import { AuditLogPanel, type AuditEntry } from './components/AuditLogPanel';
import { ShortcutsOverlay } from './components/ShortcutsOverlay';
import { LoadingScreen } from './components/LoadingScreen';
import { fetchEvents, updateEventStatus } from './services/api';

function App() {
  const [isBooting, setIsBooting] = useState(true);
  const [matches, setMatches] = useState<Match[]>(INITIAL_MATCHES);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'globe' | 'map'>('globe');
  const [isLive, setIsLive] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Boot sequence
  useEffect(() => {
    const timer = setTimeout(() => setIsBooting(false), 900);
    return () => clearTimeout(timer);
  }, []);

  const addToast = useCallback((message: string, type: ToastItem['type']) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Sync events from FastAPI backend
  const syncBackendEvents = useCallback(async () => {
    const backendEvents = await fetchEvents();
    if (backendEvents && backendEvents.length > 0) {
      const mapped: Match[] = backendEvents.map(e => ({
        id: String(e.match_id || e.id),
        personId: e.person_id,
        name: e.name || 'Unknown Candidate',
        checkpointId: e.checkpoint_id,
        confidence: e.confidence,
        timestamp: new Date(e.timestamp),
        status: (e.status === 'CONFIRMED' ? 'CONFIRMED' : e.status === 'DISMISSED' ? 'DISMISSED' : 'PENDING REVIEW') as any,
        faceCropUrl: e.face_crop_path ? `http://localhost:8000${e.face_crop_path}` : undefined,
        referencePhotoUrl: e.reference_photo_path ? `http://localhost:8000${e.reference_photo_path}` : undefined
      }));
      setMatches(mapped);
    }
  }, []);

  useEffect(() => {
    syncBackendEvents();
    if (!isLive) return;
    const interval = setInterval(syncBackendEvents, 2500);
    return () => clearInterval(interval);
  }, [isLive, syncBackendEvents]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (isTyping) return;
      if (e.key === 'p' || e.key === 'P') setIsLive(prev => !prev);
      if (e.key === 'v' || e.key === 'V') setViewMode(prev => prev === 'globe' ? 'map' : 'globe');
      if (e.key === '?') setShowShortcuts(prev => !prev);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleSelectPerson = (personId: string) => {
    if (selectedPersonId === personId) {
      setSelectedPersonId(null);
      setSelectedMatchId(null);
    } else {
      setSelectedPersonId(personId);
      const personMatches = matches.filter(m => m.personId === personId);
      if (personMatches.length > 0) {
        personMatches.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setSelectedMatchId(personMatches[0].id);
      }
    }
  };

  const handleSelectCheckpoint = (checkpointId: string) => {
    const cpMatches = matches
      .filter(m => m.checkpointId === checkpointId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    if (cpMatches.length > 0) {
      handleSelectPerson(cpMatches[0].personId);
    }
  };

  const handleConfirmMatch = async (matchId: string) => {
    const match = matches.find(m => m.id === matchId);
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'CONFIRMED' } : m));
    if (match) {
      const cp = CHECKPOINTS.find(c => c.id === match.checkpointId);
      setAuditLog(prev => [...prev, {
        id: `a-${Date.now()}`,
        action: 'CONFIRMED',
        personId: match.personId,
        matchId: match.id,
        checkpointName: cp?.name ?? match.checkpointId,
        timestamp: new Date(),
      }]);
      addToast(`Match ${match.personId} confirmed`, 'success');
    }
    setSelectedMatchId(null);
    setSelectedPersonId(null);

    await updateEventStatus(matchId, 'CONFIRMED');
    syncBackendEvents();
  };

  const handleDismissMatch = async (matchId: string) => {
    const match = matches.find(m => m.id === matchId);
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'DISMISSED' } : m));
    if (match) {
      const cp = CHECKPOINTS.find(c => c.id === match.checkpointId);
      setAuditLog(prev => [...prev, {
        id: `a-${Date.now()}`,
        action: 'DISMISSED',
        personId: match.personId,
        matchId: match.id,
        checkpointName: cp?.name ?? match.checkpointId,
        timestamp: new Date(),
      }]);
      addToast(`Match ${match.personId} dismissed`, 'info');
    }
    setSelectedMatchId(null);
    setSelectedPersonId(null);

    await updateEventStatus(matchId, 'DISMISSED');
    syncBackendEvents();
  };

  if (isBooting) {
    return <LoadingScreen />;
  }

  const activeMatch = matches.find(m => m.id === selectedMatchId);
  const pendingCount = matches.filter(m => m.status === 'PENDING REVIEW').length;

  return (
    <>
      <TopBar
        isLive={isLive}
        onToggleLive={() => setIsLive(prev => !prev)}
        pendingCount={pendingCount}
        onOpenCheckpoints={() => setShowCheckpoints(prev => !prev)}
        onOpenAuditLog={() => setShowAuditLog(true)}
        onOpenShortcuts={() => setShowShortcuts(true)}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode(prev => prev === 'globe' ? 'map' : 'globe')}
        onSimulate={syncBackendEvents}
      />

      {/* Main Viewport: 3D Globe vs 2D Tactical Map */}
      {viewMode === 'globe' ? (
        <GlobeView matches={matches} selectedPersonId={selectedPersonId} />
      ) : (
        <MapView matches={matches} selectedPersonId={selectedPersonId} onSelectCheckpoint={handleSelectCheckpoint} />
      )}

      <MatchListPanel
        matches={matches}
        selectedPersonId={selectedPersonId}
        onSelectPerson={handleSelectPerson}
      />

      <TimelineStrip matches={matches} onSelectPerson={handleSelectPerson} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {showCheckpoints && (
        <CheckpointStatusPanel matches={matches} onClose={() => setShowCheckpoints(false)} />
      )}

      {activeMatch && (
        <>
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(10, 14, 20, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 150,
          }} onClick={() => { setSelectedMatchId(null); setSelectedPersonId(null); }} />

          <MatchDetailModal
            match={activeMatch}
            onClose={() => { setSelectedMatchId(null); setSelectedPersonId(null); }}
            onConfirm={handleConfirmMatch}
            onDismiss={handleDismissMatch}
          />
        </>
      )}

      {showAuditLog && (
        <>
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(10, 14, 20, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 190,
          }} onClick={() => setShowAuditLog(false)} />
          <AuditLogPanel entries={auditLog} onClose={() => setShowAuditLog(false)} />
        </>
      )}

      {showShortcuts && (
        <>
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(10, 14, 20, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 190,
          }} onClick={() => setShowShortcuts(false)} />
          <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />
        </>
      )}
    </>
  );
}

export default App;