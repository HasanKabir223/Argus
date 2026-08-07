import { useState, useEffect } from 'react';
import { INITIAL_MATCHES, type Match } from './data/mockData';
import { TopBar } from './components/TopBar';
import { GlobeView } from './components/GlobeView';
import { MatchListPanel } from './components/MatchListPanel';
import { TimelineStrip } from './components/TimelineStrip';
import { MatchDetailModal } from './components/MatchDetailModal';

function App() {
  const [matches, setMatches] = useState<Match[]>(INITIAL_MATCHES);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  // Simulating incoming matches
  useEffect(() => {
    const timer = setInterval(() => {
      if (Math.random() > 0.8) {
        const newMatch: Match = {
          id: `m-${Date.now()}`,
          personId: `p-${Math.floor(Math.random() * 100).toString().padStart(3, '0')}`,
          name: 'Unknown Candidate',
          checkpointId: `cp-0${Math.floor(Math.random() * 5) + 1}`,
          confidence: 0.7 + Math.random() * 0.3,
          timestamp: new Date(),
          status: 'PENDING REVIEW'
        };
        setMatches(prev => [...prev, newMatch]);
      }
    }, 10000); // 10s interval
    return () => clearInterval(timer);
  }, []);

  const handleSelectPerson = (personId: string) => {
    if (selectedPersonId === personId) {
      // Toggle off
      setSelectedPersonId(null);
      setSelectedMatchId(null);
    } else {
      setSelectedPersonId(personId);
      // Automatically open the details for the latest match of this person
      const personMatches = matches.filter(m => m.personId === personId);
      if (personMatches.length > 0) {
        // Sort descending by time
        personMatches.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setSelectedMatchId(personMatches[0].id);
      }
    }
  };

  const handleConfirmMatch = (matchId: string) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'CONFIRMED' } : m));
    setSelectedMatchId(null);
    setSelectedPersonId(null);
  };

  const handleDismissMatch = (matchId: string) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'DISMISSED' } : m));
    setSelectedMatchId(null);
    setSelectedPersonId(null);
  };

  const activeMatch = matches.find(m => m.id === selectedMatchId);

  return (
    <>
      <TopBar />
      <GlobeView matches={matches} selectedPersonId={selectedPersonId} />
      <MatchListPanel 
        matches={matches} 
        selectedPersonId={selectedPersonId} 
        onSelectPerson={handleSelectPerson} 
      />
      <TimelineStrip matches={matches} />

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
    </>
  );
}

export default App;
