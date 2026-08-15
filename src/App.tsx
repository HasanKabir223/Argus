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
import { CctvStudioModal } from './components/CctvStudioModal';
import { CctvIngestionModal } from './components/CctvIngestionModal';
import { WatchlistGalleryModal } from './components/WatchlistGalleryModal';
import { fetchEvents, updateEventStatus, clearAllEvents, deleteEvent, type CctvMatch } from './services/api';


function App() {
  const [isBooting, setIsBooting] = useState(true);
  const [matches, setMatches] = useState<Match[]>(INITIAL_MATCHES);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'globe' | 'map'>('map');
  const [isLive, setIsLive] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCctvStudio, setShowCctvStudio] = useState(false);
  const [showCctvIngestion, setShowCctvIngestion] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [replayTime, setReplayTime] = useState<number | null>(null);

  // Boot sequence
  useEffect(() => {
    const timer = setTimeout(() => setIsBooting(false), 800);
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
    if (backendEvents) {
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

  const handleClearMatches = async () => {
    await clearAllEvents();
    setMatches([]);
    setSelectedPersonId(null);
    setSelectedMatchId(null);
    addToast('All active sightings purged. Clean slate ready for manual testing.', 'info');
  };

  const handleDeleteMatch = async (matchId: string) => {
    await deleteEvent(matchId);
    setMatches(prev => prev.filter(m => m.id !== matchId));
    if (selectedMatchId === matchId) {
      setSelectedMatchId(null);
    }
    addToast('Sighting event purged from database.', 'info');
  };



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
      if (e.key === 'c' || e.key === 'C') setShowCctvStudio(prev => !prev);
      if (e.key === 'w' || e.key === 'W') setShowWatchlist(prev => !prev);
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

  const handlePinpointCctvMatch = async (match: CctvMatch) => {
    setViewMode('map');
    setShowCctvStudio(false);

    // Immediately create tactical match object so map renders it without waiting for poll
    const matchId = String(match.event_id || `m-cctv-${Date.now()}`);
    const newMatch: Match = {
      id: matchId,
      personId: match.person_id,
      name: match.name,
      checkpointId: match.checkpoint_id,
      confidence: match.confidence,
      timestamp: new Date(),
      status: match.tier === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING REVIEW',
      faceCropUrl: match.face_crop_path ? `http://localhost:8000${match.face_crop_path}` : undefined,
      referencePhotoUrl: match.reference_photo_path ? `http://localhost:8000${match.reference_photo_path}` : undefined
    };

    setMatches(prev => {
      const exists = prev.some(m => m.id === matchId || (m.personId === match.person_id && m.checkpointId === match.checkpoint_id));
      return exists ? prev : [newMatch, ...prev];
    });

    setSelectedPersonId(match.person_id);
    setSelectedMatchId(matchId);
    addToast(`Target sighted: ${match.name} at ${match.checkpoint_name} (${(match.confidence * 100).toFixed(1)}%)`, 'alert');

    // Sync backend database in background
    syncBackendEvents();
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
      addToast(`Match ${match.personId} (${match.name}) confirmed`, 'success');
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

  const handleFlagMatch = (matchId: string) => {
    const match = matches.find(m => m.id === matchId);
    if (match) {
      const cp = CHECKPOINTS.find(c => c.id === match.checkpointId);
      setAuditLog(prev => [...prev, {
        id: `a-${Date.now()}`,
        action: 'FLAGGED',
        personId: match.personId,
        matchId: match.id,
        checkpointName: cp?.name ?? match.checkpointId,
        timestamp: new Date(),
      }]);
      addToast(`Match ${match.personId} flagged for manual review`, 'info');
    }
    setSelectedMatchId(null);
    setSelectedPersonId(null);
    // No backend status change — the AI pipeline only recognizes CONFIRMED/DISMISSED
    // (see CheckList.md §1.6). Flagging is an operator annotation that stays
    // PENDING REVIEW for a supervisor to look at, not a pipeline decision.
  };

  if (isBooting) {
    return <LoadingScreen />;
  }

  const activeMatch = matches.find(m => m.id === selectedMatchId);
  const activeMatchSightingHistory = activeMatch
    ? matches
        .filter(m => m.personId === activeMatch.personId)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    : [];
  const pendingCount = matches.filter(m => m.status === 'PENDING REVIEW').length;
  // The globe/map operate on the replay-scoped view; the match list and
  // pending count stay tied to full live state so review workload never
  // silently hides just because someone scrubbed the timeline back.
  const visibleMatches = replayTime !== null
    ? matches.filter(m => m.timestamp.getTime() <= replayTime)
    : matches;

  return (
    <>
      <TopBar
        isLive={isLive}
        onToggleLive={() => setIsLive(prev => !prev)}
        pendingCount={pendingCount}
        onOpenCheckpoints={() => setShowCheckpoints(prev => !prev)}
        onOpenAuditLog={() => setShowAuditLog(true)}
        onOpenShortcuts={() => setShowShortcuts(true)}
        onOpenCctvStudio={() => setShowCctvStudio(true)}
        onOpenCctvIngestion={() => setShowCctvIngestion(true)}
        onOpenWatchlist={() => setShowWatchlist(true)}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode(prev => prev === 'globe' ? 'map' : 'globe')}
        onSimulate={syncBackendEvents}
      />

      {/* Main Viewport: 2D Tactical Map vs 3D Globe */}
      {viewMode === 'globe' ? (
        <GlobeView matches={visibleMatches} selectedPersonId={selectedPersonId} />
      ) : (
        <MapView
          matches={visibleMatches}
          selectedPersonId={selectedPersonId}
          onSelectCheckpoint={handleSelectCheckpoint}
          onSelectMatch={setSelectedMatchId}
        />
      )}

      <MatchListPanel
        matches={matches}
        selectedPersonId={selectedPersonId}
        onSelectPerson={handleSelectPerson}
        onClearMatches={handleClearMatches}
        onDeleteMatch={handleDeleteMatch}
        onOpenCctvStudio={() => setShowCctvStudio(true)}
      />

      <TimelineStrip
        matches={matches}
        onSelectPerson={handleSelectPerson}
        replayTime={replayTime}
        onScrub={setReplayTime}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* CCTV Ingestion Feature Modal */}
      {showCctvIngestion && (
        <CctvIngestionModal
          onClose={() => {
            setShowCctvIngestion(false);
            syncBackendEvents();
          }}
        />
      )}

      {/* CCTV Surveillance Studio Modal */}
      {showCctvStudio && (
        <>
          <div
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(10, 14, 20, 0.75)',
              backdropFilter: 'blur(5px)',
              zIndex: 210,
            }}
            onClick={() => setShowCctvStudio(false)}
          />
          <CctvStudioModal
            onClose={() => {
              setShowCctvStudio(false);
              syncBackendEvents();
            }}
            onPinpointMatch={handlePinpointCctvMatch}
          />
        </>
      )}

      {/* Watchlist Gallery Modal */}
      {showWatchlist && (
        <>
          <div
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(10, 14, 20, 0.75)',
              backdropFilter: 'blur(5px)',
              zIndex: 210,
            }}
            onClick={() => setShowWatchlist(false)}
          />
          <WatchlistGalleryModal
            onClose={() => setShowWatchlist(false)}
            onSelectPerson={handleSelectPerson}
          />
        </>
      )}

      {showCheckpoints && (
        <CheckpointStatusPanel matches={matches} onClose={() => setShowCheckpoints(false)} />
      )}

      {activeMatch && (
        <>
          {/* Transparent click-catcher only */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 150,
          }} onClick={() => { setSelectedMatchId(null); setSelectedPersonId(null); }} />

          <MatchDetailModal
            match={activeMatch}
            sightingHistory={activeMatchSightingHistory}
            onClose={() => { setSelectedMatchId(null); setSelectedPersonId(null); }}
            onConfirm={handleConfirmMatch}
            onDismiss={handleDismissMatch}
            onFlag={handleFlagMatch}
            onDeleteMatch={handleDeleteMatch}
            onSelectSighting={(matchId) => setSelectedMatchId(matchId)}
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