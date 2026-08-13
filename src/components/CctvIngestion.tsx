import React, { useState, useRef, useEffect, useCallback } from 'react';

// CSS Variable Palette strictly enforced from spec:
// --bg-void: #0A0E14
// --bg-panel: #12161F
// --bg-panel-raised: #1A2029
// --border-hairline: #262D3A
// --text-primary: #E8ECF1
// --text-secondary: #8892A0
// --accent-signal: #00D9A3
// --accent-alert: #FF4757
// --accent-muted: #3D4759

export interface TrackedPerson {
  track_id: string;
  best_crop_url: string;
  first_frame: number;
  total_frames: number;
  embedding_stored: boolean;
}

export type IngestStatus = 'idle' | 'uploaded' | 'processing' | 'done' | 'error';
export type IngestStage = 'detecting' | 'tracking' | 'embedding' | 'indexing' | 'done';

export interface IngestStatusResponse {
  job_id: string;
  status: 'processing' | 'done' | 'error';
  progress: number;
  stage: IngestStage;
  persons: TrackedPerson[];
  total_persons: number;
  error_message: string | null;
}

interface CctvIngestionProps {
  apiBaseUrl?: string;
  onClose?: () => void;
}

export const CctvIngestion: React.FC<CctvIngestionProps> = ({
  apiBaseUrl = '',
  onClose
}) => {
  const [appState, setAppState] = useState<IngestStatus>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0.0);
  const [stage, setStage] = useState<IngestStage | null>(null);
  const [persons, setPersons] = useState<TrackedPerson[]>([]);
  const [totalPersons, setTotalPersons] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPersonTrackId, setSelectedPersonTrackId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up object URL and polling on unmount
  useEffect(() => {
    return () => {
      if (videoPreviewUrl && videoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [videoPreviewUrl]);

  // Handle file selection
  const handleFileSelect = (file: File) => {
    const validExtensions = ['.mp4', '.avi', '.mov'];
    const fileNameLower = file.name.toLowerCase();
    const isValid = validExtensions.some(ext => fileNameLower.endsWith(ext));

    if (!isValid) {
      setErrorMessage('Invalid file format. Please upload an .mp4, .avi, or .mov video file.');
      setAppState('error');
      return;
    }

    if (videoPreviewUrl && videoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(videoPreviewUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setVideoPreviewUrl(objectUrl);
    setAppState('uploaded');
    setErrorMessage(null);
    setProgress(0.0);
    setStage(null);
    setPersons([]);
    setTotalPersons(0);
    setSelectedPersonTrackId(null);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileSelect(file);
    }
  };

  // Trigger file input click
  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  // Poll backend job status every 1000ms
  const startStatusPolling = useCallback((activeJobId: string) => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }

    const poll = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/ingest/status/${activeJobId}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch status: ${response.statusText}`);
        }

        const data: IngestStatusResponse = await response.json();
        setProgress(data.progress || 0.0);
        setStage(data.stage);
        
        if (Array.isArray(data.persons)) {
          setPersons(data.persons);
        }
        if (data.total_persons !== undefined) {
          setTotalPersons(data.total_persons);
        }

        if (data.status === 'done') {
          setAppState('done');
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        } else if (data.status === 'error') {
          setAppState('error');
          setErrorMessage(data.error_message || 'An error occurred during video ingestion.');
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        }
      } catch (err: any) {
        console.error('Polling error:', err);
        setAppState('error');
        setErrorMessage(err?.message || 'Network error while checking job status.');
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    };

    // Immediate first poll, then interval
    poll();
    pollTimerRef.current = setInterval(poll, 1000);
  }, [apiBaseUrl]);

  // Start processing pipeline on button click
  const handleProcessVideo = async () => {
    if (!selectedFile) return;

    setAppState('processing');
    setErrorMessage(null);
    setProgress(0.0);
    setStage('detecting');
    setPersons([]);
    setTotalPersons(0);

    const formData = new FormData();
    formData.append('video', selectedFile);

    try {
      const response = await fetch(`${apiBaseUrl}/ingest/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      const newJobId = result.job_id;
      setJobId(newJobId);
      startStatusPolling(newJobId);
    } catch (err: any) {
      console.error('Upload error:', err);
      setAppState('error');
      setErrorMessage(err?.message || 'Failed to upload video to backend.');
    }
  };

  // Reset component state for re-upload
  const handleReset = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (videoPreviewUrl && videoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setAppState('idle');
    setSelectedFile(null);
    setVideoPreviewUrl(null);
    setJobId(null);
    setProgress(0.0);
    setStage(null);
    setPersons([]);
    setTotalPersons(0);
    setErrorMessage(null);
    setSelectedPersonTrackId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Scrub video player to person's first appearance frame
  const handleCardClick = (person: TrackedPerson) => {
    setSelectedPersonTrackId(person.track_id);
    if (videoPlayerRef.current) {
      // Assuming standard 30 FPS for frame-to-time scrubbing
      const videoFps = 30.0;
      const targetTimeSec = Math.max(0, (person.first_frame - 1) / videoFps);
      videoPlayerRef.current.currentTime = targetTimeSec;
      videoPlayerRef.current.play().catch(() => {
        // Autoplay may be restricted without user interaction
      });
    }
  };

  // Map backend processing stage to required spec message
  const getStageStatusText = () => {
    if (appState === 'done') {
      const count = totalPersons || persons.length;
      return `Done. ${count} unique persons indexed.`;
    }
    switch (stage) {
      case 'detecting':
        return 'Detecting faces...';
      case 'tracking':
        return 'Tracking persons...';
      case 'embedding':
        return 'Generating embeddings...';
      case 'indexing':
        return 'Storing to FAISS...';
      case 'done':
        return `Done. ${totalPersons || persons.length} unique persons indexed.`;
      default:
        return 'Processing video...';
    }
  };

  // Resolve crop image URL with fallback to backend host if relative
  const resolveCropUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
      return url;
    }
    return `${apiBaseUrl}${url}`;
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-void)',
        color: 'var(--text-primary)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: '680px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Header bar (Optional close action if provided) */}
      {onClose && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            backgroundColor: 'var(--bg-panel)',
            borderBottom: '1px solid var(--border-hairline)',
          }}
        >
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '0.9rem',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--text-primary)',
            }}
          >
            CCTV Video Ingestion Pipeline
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '1.2rem',
              lineHeight: 1,
              padding: '4px 8px',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Split Layout: Left & Right Panels */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(420px, 1.15fr) minmax(360px, 1fr)',
          flex: 1,
          height: '100%',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-void)',
        }}
      >
        {/* ========================================================================= */}
        {/* LEFT PANEL — Video Upload + Playback */}
        {/* ========================================================================= */}
        <div
          style={{
            backgroundColor: 'var(--bg-panel)',
            borderRight: '1px solid var(--border-hairline)',
            borderRadius: 0,
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            overflowY: 'auto',
            boxSizing: 'border-box',
          }}
        >
          {/* Panel Header */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Surveillance Source
            </div>
            <div
              style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              Video Ingestion & Tracking
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.avi,.mov,video/mp4,video/avi,video/quicktime"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />

          {/* Upload Zone (State 1: idle) */}
          {appState === 'idle' && (
            <div
              onClick={openFilePicker}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                border: isDragOver
                  ? '1px dashed var(--accent-signal)'
                  : '1px dashed var(--border-hairline)',
                backgroundColor: isDragOver
                  ? 'var(--bg-panel-raised)'
                  : 'var(--bg-panel)',
                borderRadius: 0,
                padding: '60px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s ease',
                minHeight: '260px',
              }}
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-secondary)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginBottom: '16px' }}
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <div
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '0.95rem',
                  marginBottom: '8px',
                }}
              >
                Drop video file here or click to upload
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                  color: 'var(--accent-muted)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                }}
              >
                Supports MP4, AVI, MOV
              </div>
            </div>
          )}

          {/* Video Player (States: uploaded, processing, done, error with video) */}
          {appState !== 'idle' && videoPreviewUrl && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                backgroundColor: 'var(--bg-void)',
                border: '1px solid var(--border-hairline)',
                borderRadius: 0,
                overflow: 'hidden',
              }}
            >
              <video
                ref={videoPlayerRef}
                src={videoPreviewUrl}
                controls
                playsInline
                style={{
                  width: '100%',
                  maxHeight: '360px',
                  backgroundColor: 'var(--bg-void)',
                  display: 'block',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderTop: '1px solid var(--border-hairline)',
                  fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedFile?.name || 'CCTV_CLIP.mp4'}
                </span>
                {jobId && (
                  <span style={{ color: 'var(--accent-signal)', flexShrink: 0, marginLeft: '12px' }}>
                    JOB: {jobId}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Processing Progress & Status Section (States: processing, done) */}
          {(appState === 'processing' || appState === 'done') && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                backgroundColor: 'var(--bg-panel-raised)',
                border: '1px solid var(--border-hairline)',
                borderRadius: 0,
                padding: '16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                {/* Status text according to stage */}
                <div
                  style={{
                    fontSize: '0.88rem',
                    fontWeight: 500,
                    color: appState === 'done' ? 'var(--accent-signal)' : 'var(--text-primary)',
                  }}
                >
                  {getStageStatusText()}
                </div>

                {/* Progress percentage in JetBrains Mono */}
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                    fontSize: '0.85rem',
                    color: 'var(--accent-signal)',
                    fontWeight: 600,
                  }}
                >
                  {Math.round(progress * 100)}%
                </div>
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  backgroundColor: 'var(--bg-void)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: 0,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    backgroundColor: 'var(--accent-signal)',
                    width: `${Math.min(100, Math.max(0, Math.round(progress * 100)))}%`,
                    transition: 'width 0.25s ease-out',
                  }}
                />
              </div>
            </div>
          )}

          {/* Error Message Display (State: error) */}
          {appState === 'error' && (
            <div
              style={{
                backgroundColor: 'var(--bg-panel-raised)',
                border: '1px solid var(--accent-alert)',
                borderRadius: 0,
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div
                style={{
                  fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                  fontSize: '0.75rem',
                  color: 'var(--accent-alert)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Ingestion Failed
              </div>
              <div
                style={{
                  fontSize: '0.88rem',
                  color: 'var(--accent-alert)',
                  wordBreak: 'break-word',
                }}
              >
                {errorMessage || 'An error occurred during video processing.'}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ marginTop: 'auto', paddingTop: '12px' }}>
            {/* State: uploaded -> Process Video */}
            {appState === 'uploaded' && (
              <button
                onClick={handleProcessVideo}
                style={{
                  width: '100%',
                  backgroundColor: 'rgba(0, 217, 163, 0.1)',
                  border: '1px solid var(--accent-signal)',
                  color: 'var(--accent-signal)',
                  padding: '12px 20px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: '3px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 217, 163, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 217, 163, 0.1)';
                }}
              >
                Process Video
              </button>
            )}

            {/* State: processing -> Disabled processing indicator */}
            {appState === 'processing' && (
              <button
                disabled
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-panel-raised)',
                  border: '1px solid var(--border-hairline)',
                  color: 'var(--text-secondary)',
                  padding: '12px 20px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'not-allowed',
                  borderRadius: '3px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Processing Ingestion...
              </button>
            )}

            {/* State: done -> Reset / Re-upload */}
            {appState === 'done' && (
              <button
                onClick={handleReset}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-panel-raised)',
                  border: '1px solid var(--border-hairline)',
                  color: 'var(--text-primary)',
                  padding: '12px 20px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: '3px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  transition: 'border-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--text-secondary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-hairline)';
                }}
              >
                Upload Another Video
              </button>
            )}

            {/* State: error -> Option to retry */}
            {appState === 'error' && (
              <div style={{ display: 'flex', gap: '12px' }}>
                {selectedFile && (
                  <button
                    onClick={handleProcessVideo}
                    style={{
                      flex: 1,
                      backgroundColor: 'rgba(255, 71, 87, 0.1)',
                      border: '1px solid var(--accent-alert)',
                      color: 'var(--accent-alert)',
                      padding: '12px 16px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      borderRadius: '3px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Retry Processing
                  </button>
                )}
                <button
                  onClick={handleReset}
                  style={{
                    flex: 1,
                    backgroundColor: 'var(--bg-panel-raised)',
                    border: '1px solid var(--border-hairline)',
                    color: 'var(--text-primary)',
                    padding: '12px 16px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    borderRadius: '3px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Choose New File
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT PANEL — Detected Persons Preview */}
        {/* ========================================================================= */}
        <div
          style={{
            backgroundColor: 'var(--bg-void)',
            borderRadius: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            height: '100%',
            boxSizing: 'border-box',
          }}
        >
          {/* Right Panel Header */}
          <div
            style={{
              padding: '24px 24px 16px 24px',
              backgroundColor: 'var(--bg-panel)',
              borderBottom: '1px solid var(--border-hairline)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Tracked Face Roster
              </div>
              <div
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                Detected Persons Preview
              </div>
            </div>

            {/* Counter */}
            <div
              style={{
                fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                fontSize: '0.8rem',
                color: 'var(--accent-signal)',
                backgroundColor: 'var(--bg-panel-raised)',
                border: '1px solid var(--border-hairline)',
                padding: '4px 10px',
                borderRadius: '3px',
              }}
            >
              {persons.length} {persons.length === 1 ? 'Person' : 'Persons'}
            </div>
          </div>

          {/* Independently Scrollable Grid Area */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              boxSizing: 'border-box',
            }}
          >
            {/* Empty State */}
            {persons.length === 0 && (
              <div
                style={{
                  height: '100%',
                  minHeight: '280px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)',
                  textAlign: 'center',
                  padding: '20px',
                }}
              >
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent-muted)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginBottom: '12px' }}
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <div style={{ fontSize: '0.9rem', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                  {appState === 'processing'
                    ? 'Scanning video frames for faces...'
                    : 'No tracked persons yet'}
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                    fontSize: '0.75rem',
                    color: 'var(--accent-muted)',
                  }}
                >
                  {appState === 'processing'
                    ? 'Unique person cards will appear progressively'
                    : 'Upload and process a video to extract unique face tracks'}
                </div>
              </div>
            )}

            {/* Progressive Grid of Person Cards */}
            {persons.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                  gap: '14px',
                }}
              >
                {persons.map((person) => {
                  const isSelected = selectedPersonTrackId === person.track_id;
                  return (
                    <div
                      key={person.track_id}
                      onClick={() => handleCardClick(person)}
                      style={{
                        backgroundColor: isSelected
                          ? 'var(--bg-panel-raised)'
                          : 'var(--bg-panel)',
                        border: isSelected
                          ? '1px solid var(--accent-signal)'
                          : '1px solid var(--border-hairline)',
                        borderRadius: 0,
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s ease, background 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = 'var(--text-secondary)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = 'var(--border-hairline)';
                        }
                      }}
                    >
                      {/* Face Crop Image */}
                      <div
                        style={{
                          width: '100%',
                          height: '150px',
                          backgroundColor: 'var(--bg-void)',
                          border: '1px solid var(--border-hairline)',
                          borderRadius: 0,
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {person.best_crop_url ? (
                          <img
                            src={resolveCropUrl(person.best_crop_url)}
                            alt={`Best face crop for ${person.track_id}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block',
                            }}
                            onError={(e) => {
                              // Fallback placeholder if image load fails
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: '0.75rem',
                              color: 'var(--accent-muted)',
                            }}
                          >
                            NO CROP
                          </div>
                        )}
                      </div>

                      {/* Card Details */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {/* Unique Person ID */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                              fontSize: '0.9rem',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {person.track_id}
                          </span>
                        </div>

                        {/* First frame seen & total frames appeared */}
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '3px',
                            fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <div>
                            First seen:{' '}
                            <span style={{ color: 'var(--text-primary)' }}>
                              Frame #{person.first_frame}
                            </span>
                          </div>
                          <div>
                            Appeared:{' '}
                            <span style={{ color: 'var(--text-primary)' }}>
                              {person.total_frames} {person.total_frames === 1 ? 'frame' : 'frames'}
                            </span>
                          </div>
                        </div>

                        {/* Status Badge: Embedding stored (green) vs Skipped — low quality (grey) */}
                        <div style={{ marginTop: '4px' }}>
                          {person.embedding_stored ? (
                            <span
                              style={{
                                display: 'inline-block',
                                fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                                fontSize: '0.7rem',
                                fontWeight: 500,
                                color: 'var(--accent-signal)',
                                backgroundColor: 'rgba(0, 217, 163, 0.12)',
                                border: '1px solid var(--accent-signal)',
                                borderRadius: '3px',
                                padding: '2px 7px',
                              }}
                            >
                              Embedding stored
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-block',
                                fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                                fontSize: '0.7rem',
                                fontWeight: 500,
                                color: 'var(--text-secondary)',
                                backgroundColor: 'var(--bg-panel-raised)',
                                border: '1px solid var(--accent-muted)',
                                borderRadius: '3px',
                                padding: '2px 7px',
                              }}
                            >
                              Skipped — low quality
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
