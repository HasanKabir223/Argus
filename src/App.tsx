import { useState, useEffect, useCallback } from 'react';
import { INITIAL_MATCHES, CHECKPOINTS, type Match } from './data/mockData';
import { TopBar } from './components/TopBar';
import { MapView } from './components/MapView';
import { MatchListPanel } from './components/MatchListPanel';
import { TimelineStrip } from './components/TimelineStrip';
import { MatchDetailModal } from './components/MatchDetailModal';
import { ToastContainer, type ToastItem } from './components/Toast';
import { CheckpointStatusPanel } from './components/CheckpointStatusPanel';
import { AuditLogPanel, type AuditEntry } from './components/AuditLogPanel';
import { ShortcutsOverlay } from './components/ShortcutsOverlay';
import { LoadingScreen } from './components/LoadingScreen';

function App() {
  const [isBooting, setIsBooting] = useState(true);
  const [matches, setMatches] = useState<Match[]>(INITIAL_MATCHES);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
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

  // Simulating incoming matches (pausable via TopBar toggle)
  useEffect(() => {
    if (!isLive) return;
    const timer = setInterval(() => {
      if (Math.random() > 0.8) {
        const checkpointId = `cp-0${Math.floor(Math.random() * 5) + 1}`;
        const cp = CHECKPOINTS.find(c => c.id === checkpointId);
        const newMatch: Match = {
          id: `m-${Date.now()}`,
          personId: `p-${Math.floor(Math.random() * 100).toString().padStart(3, '0')}`,
          name: 'Unknown Candidate',
          checkpointId,
          confidence: 0.7 + Math.random() * 0.3,
          timestamp: new Date(),
          status: 'PENDING REVIEW'
        };
        setMatches(prev => [...prev, newMatch]);
        addToast(`New match at ${cp?.name ?? checkpointId} — ${(newMatch.confidence * 100).toFixed(1)}%`, 'alert');
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [isLive, addToast]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (isTyping) return;
      if (e.key === 'p' || e.key === 'P') setIsLive(prev => !prev);
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

  const handleConfirmMatch = (matchId: string) => {
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
  };

  const handleDismissMatch = (matchId: string) => {
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
      />
      <MapView matches={matches} selectedPersonId={selectedPersonId} onSelectCheckpoint={handleSelectCheckpoint} />
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
            backgroundColor: 'rgba(10, 14, 20, 0.6)',
            backdropFilter: 'blur(2px)',
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
            backgroundColor: 'rgba(10, 14, 20, 0.6)',
            backdropFilter: 'blur(2px)',
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
            backgroundColor: 'rgba(10, 14, 20, 0.6)',
            backdropFilter: 'blur(2px)',
            zIndex: 190,
          }} onClick={() => setShowShortcuts(false)} />
          <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />
        </>
      )}
    </>
  );
}

export default App;