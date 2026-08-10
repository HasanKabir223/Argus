import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, Play, RefreshCw, MapPin, CheckCircle,
  AlertTriangle, X, Radio
} from 'lucide-react';
import {
  fetchCctvClips, processCctvClip, uploadCctvClip,
  type CctvClip, type CctvProcessResult, type CctvMatch
} from '../services/api';

interface CctvStudioModalProps {
  onClose: () => void;
  onPinpointMatch: (match: CctvMatch) => void;
}

export const CctvStudioModal: React.FC<CctvStudioModalProps> = ({ onClose, onPinpointMatch }) => {
  const [clips, setClips] = useState<CctvClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string>('clip-gct');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<CctvProcessResult | null>(null);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadClips = async () => {
      const available = await fetchCctvClips();
      setClips(available);
      if (available.length > 0) {
        setSelectedClipId(available[0].id);
      }
    };
    loadClips();
  }, []);

  const currentClip = clips.find(c => c.id === selectedClipId) || clips[0];

  const handleRunPipeline = async (clipId?: string) => {
    const targetId = clipId || selectedClipId;
    setIsProcessing(true);
    setResult(null);

    const res = await processCctvClip(targetId);
    setResult(res);
    setIsProcessing(false);

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setUploadStatus(`Uploading & analyzing ${file.name}...`);

    const res = await uploadCctvClip(file, currentClip?.checkpoint_id || 'cp-01');
    setResult(res);
    setIsProcessing(false);
    setUploadStatus(null);

    // Refresh clips list
    const updatedClips = await fetchCctvClips();
    setClips(updatedClips);

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentVideoTime(videoRef.current.currentTime);
    }
  };

  // Find active bounding boxes corresponding to current playback timestamp
  const activeFrameData = result?.sample_annotations?.reduce((prev, curr) => {
    return Math.abs(curr.timestamp_sec - currentVideoTime) < Math.abs(prev.timestamp_sec - currentVideoTime)
      ? curr
      : prev;
  }, result.sample_annotations[0]);

  const activeDetections = activeFrameData?.detections || [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="CCTV Surveillance Video Ingestion Studio"
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
        boxShadow: '0 32px 80px rgba(0,0,0,0.92)',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(12px)',
        overflow: 'hidden'
      }}
    >
      {/* Top Header Bar */}
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border-hairline)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--bg-panel-raised)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Radio size={18} color="var(--accent-signal)" style={{ animation: 'pulse 1.5s infinite' }} />
          <div>
            <h2 className="mono-display" style={{ fontSize: '1.05rem', margin: 0, letterSpacing: '0.04em' }}>
              CCTV SURVEILLANCE INGESTION & LSH HASHING STUDIO
            </h2>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
              HIGH-THROUGHPUT MULTI-FACE DETECTION // RETINAFACE-MOBILENET // ARCFACE 512-D // FAISS HNSW ANN
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          aria-label="Close CCTV studio"
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
        >
          <X size={22} />
        </button>
      </div>

      {/* Main Studio Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Column: Camera Channel Switcher & Upload Controls */}
        <div style={{
          width: '320px',
          borderRight: '1px solid var(--border-hairline)',
          backgroundColor: 'rgba(12, 16, 23, 0.95)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          padding: '16px'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: '10px', textTransform: 'uppercase' }}>
            SELECT SURVEILLANCE FEED
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            {clips.map(clip => {
              const isSelected = selectedClipId === clip.id;
              return (
                <div
                  key={clip.id}
                  onClick={() => {
                    setSelectedClipId(clip.id);
                    setResult(null);
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: isSelected ? '1px solid var(--accent-signal)' : '1px solid var(--border-hairline)',
                    backgroundColor: isSelected ? 'rgba(0, 217, 163, 0.08)' : 'var(--bg-panel)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span className="mono-display" style={{ fontSize: '0.82rem', color: isSelected ? 'var(--accent-signal)' : 'var(--text-primary)' }}>
                      {clip.checkpoint_name}
                    </span>
                    <span style={{
                      fontSize: '0.65rem',
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: 'var(--accent-signal)',
                      backgroundColor: 'rgba(0, 217, 163, 0.15)',
                      padding: '1px 5px',
                      borderRadius: '2px'
                    }}>
                      ONLINE
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {clip.camera_id}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <button
            onClick={() => handleRunPipeline()}
            disabled={isProcessing}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              backgroundColor: 'var(--accent-signal)',
              color: '#0A0E14',
              border: 'none',
              padding: '12px',
              fontSize: '0.85rem',
              fontWeight: 600,
              fontFamily: "'IBM Plex Mono', monospace",
              cursor: isProcessing ? 'wait' : 'pointer',
              marginBottom: '12px',
              boxShadow: '0 4px 16px rgba(0, 217, 163, 0.25)'
            }}
          >
            <RefreshCw size={15} className={isProcessing ? 'spinning' : ''} />
            {isProcessing ? 'SCANNING & HASHING...' : 'INGEST & SCAN CCTV CLIP'}
          </button>

          {/* Video File Uploader */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="video/mp4,video/avi,video/quicktime"
            style={{ display: 'none' }}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              backgroundColor: 'transparent',
              color: 'var(--text-primary)',
              border: '1px dashed var(--border-hairline)',
              padding: '10px',
              fontSize: '0.78rem',
              fontFamily: "'IBM Plex Mono', monospace",
              cursor: isProcessing ? 'wait' : 'pointer'
            }}
          >
            <Upload size={14} />
            UPLOAD CUSTOM CCTV CLIP (.MP4)
          </button>

          {uploadStatus && (
            <div style={{ fontSize: '0.72rem', color: 'var(--accent-signal)', marginTop: '8px', fontFamily: "'IBM Plex Mono', monospace" }}>
              {uploadStatus}
            </div>
          )}

          {/* Live Telemetry Card */}
          {result && (
            <div style={{ marginTop: '20px', padding: '12px', backgroundColor: 'var(--bg-void)', border: '1px solid var(--border-hairline)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--accent-signal)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: '8px', textTransform: 'uppercase' }}>
                AI PIPELINE TELEMETRY
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.72rem', fontFamily: "'IBM Plex Mono', monospace" }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>EFFECTIVE FPS:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{result.telemetry.effective_fps} FPS</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>FACES DETECTED:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{result.telemetry.total_faces_detected}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>DETECTION TIME:</span>
                  <strong style={{ color: '#38bdf8' }}>{result.telemetry.avg_detection_ms} ms</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>ARCFACE + LSH:</span>
                  <strong style={{ color: '#a855f7' }}>{result.telemetry.avg_embedding_ms} ms</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>FAISS HNSW ANN:</span>
                  <strong style={{ color: 'var(--accent-signal)' }}>{result.telemetry.avg_faiss_ann_ms} ms</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>DEDUP SAVINGS:</span>
                  <strong style={{ color: 'var(--accent-signal)' }}>{result.telemetry.deduplication_savings_percent}%</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center & Right Column: Surveillance Video Monitor & Dynamic Bounding Box Overlay */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', backgroundColor: '#070A0E', padding: '16px' }}>
          {/* CCTV Viewport Container */}
          <div style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16/9',
            maxHeight: '480px',
            backgroundColor: '#000000',
            border: '1px solid var(--border-hairline)',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.8)'
          }}>
            {/* Real Video Element */}
            {currentClip && (
              <video
                ref={videoRef}
                src={`http://localhost:8000/static/cctv/${currentClip.filename}`}
                onTimeUpdate={handleTimeUpdate}
                controls={false}
                loop
                muted
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain'
                }}
              />
            )}

            {/* Dynamic Real-Time Bounding Box HUD Overlay */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {activeDetections.map((det, idx) => {
                const [normX, normY, normW, normH] = det.norm_box;
                const isConfirmed = det.status === 'CONFIRMED';
                const isReview = det.status === 'PENDING_REVIEW';
                const borderColor = isConfirmed ? 'var(--accent-signal)' : isReview ? 'var(--accent-alert)' : '#38bdf8';

                return (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      left: `${normX * 100}%`,
                      top: `${normY * 100}%`,
                      width: `${normW * 100}%`,
                      height: `${normH * 100}%`,
                      border: `2px solid ${borderColor}`,
                      boxShadow: `0 0 12px ${borderColor}`,
                      boxSizing: 'border-box',
                      transition: 'all 0.1s ease-out'
                    }}
                  >
                    {/* Reticle Corner Brackets */}
                    <div style={{ position: 'absolute', top: '-4px', left: '-4px', width: '8px', height: '8px', borderTop: `2px solid ${borderColor}`, borderLeft: `2px solid ${borderColor}` }} />
                    <div style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', borderTop: `2px solid ${borderColor}`, borderRight: `2px solid ${borderColor}` }} />
                    <div style={{ position: 'absolute', bottom: '-4px', left: '-4px', width: '8px', height: '8px', borderBottom: `2px solid ${borderColor}`, borderLeft: `2px solid ${borderColor}` }} />
                    <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '8px', height: '8px', borderBottom: `2px solid ${borderColor}`, borderRight: `2px solid ${borderColor}` }} />

                    {/* Floating Identification Tag */}
                    <div style={{
                      position: 'absolute',
                      top: '-24px',
                      left: '0',
                      backgroundColor: 'rgba(10, 14, 20, 0.92)',
                      border: `1px solid ${borderColor}`,
                      color: '#FFFFFF',
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '10px',
                      padding: '2px 6px',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      {isConfirmed && <CheckCircle size={10} color="var(--accent-signal)" />}
                      {isReview && <AlertTriangle size={10} color="var(--accent-alert)" />}
                      <span>
                        {det.name} {det.confidence > 0 ? `// ${(det.confidence * 100).toFixed(0)}%` : `[TRK #${det.track_id}]`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* CCTV On-Screen Display (OSD) Overlay */}
            <div style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(10, 14, 20, 0.85)',
              padding: '4px 8px',
              borderRadius: '2px',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '11px',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-hairline)'
            }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#FF4757', animation: 'pulse 1s infinite' }} />
              <span>REC [LIVE SURVEILLANCE] // {currentClip?.camera_id}</span>
            </div>

            {/* Video Playback Controls Bar */}
            <div style={{
              position: 'absolute',
              bottom: '12px',
              left: '12px',
              right: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(10, 14, 20, 0.88)',
              padding: '6px 12px',
              borderRadius: '2px',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '11px',
              border: '1px solid var(--border-hairline)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => {
                    if (videoRef.current) {
                      if (videoRef.current.paused) {
                        videoRef.current.play();
                      } else {
                        videoRef.current.pause();
                      }
                    }
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-signal)', cursor: 'pointer' }}
                >
                  <Play size={14} />
                </button>
                <span>TIME: {currentVideoTime.toFixed(1)}s</span>
              </div>

              <div>
                ACTIVE TRACKS: <strong style={{ color: 'var(--accent-signal)' }}>{activeDetections.length}</strong>
              </div>
            </div>
          </div>

          {/* Sighted Matches Drawer below video */}
          <div style={{ marginTop: '16px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '0.82rem', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-secondary)' }}>
                IDENTIFIED SUSPECTS & PERSONS OF INTEREST ({result?.matches?.length || 0})
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '10px' }}>
              {result?.matches?.map((m, idx) => {
                const isConfirmed = m.tier === 'CONFIRMED';
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      gap: '12px',
                      backgroundColor: 'var(--bg-panel)',
                      border: isConfirmed ? '1px solid var(--accent-signal)' : '1px solid var(--accent-alert)',
                      padding: '12px',
                      borderRadius: '2px'
                    }}
                  >
                    {/* Face crop preview */}
                    <div style={{ width: '64px', height: '64px', backgroundColor: '#000', border: '1px solid var(--border-hairline)', overflow: 'hidden', flexShrink: 0 }}>
                      <img
                        src={`http://localhost:8000${m.face_crop_path}`}
                        alt="Face crop"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                    </div>

                    {/* Metadata & Actions */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <span className="mono-display" style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                            {m.name}
                          </span>
                          <span style={{
                            color: isConfirmed ? 'var(--accent-signal)' : 'var(--accent-alert)',
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: '1rem',
                            fontWeight: 700
                          }}>
                            {(m.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                          ID: {m.person_id} // {m.threat_level || 'HIGH'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#38bdf8', fontFamily: "'IBM Plex Mono', monospace" }}>
                          LSH HASH: {m.query_hash_hex ? `${m.query_hash_hex.slice(0, 16)}...` : '128-BIT LSH'} (HAMMING: {m.hamming_distance || 2})
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          onPinpointMatch(m);
                          onClose();
                        }}
                        style={{
                          marginTop: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          backgroundColor: 'rgba(0, 217, 163, 0.12)',
                          color: 'var(--accent-signal)',
                          border: '1px solid var(--accent-signal)',
                          padding: '6px',
                          fontSize: '0.72rem',
                          fontFamily: "'IBM Plex Mono', monospace",
                          cursor: 'pointer'
                        }}
                      >
                        <MapPin size={12} />
                        PINPOINT ON TACTICAL MAP
                      </button>
                    </div>
                  </div>
                );
              })}

              {!result && (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: "'IBM Plex Mono', monospace", gridColumn: '1 / -1' }}>
                  Click &ldquo;INGEST &amp; SCAN CCTV CLIP&rdquo; to execute multi-face detection, ArcFace LSH hashing, and FAISS similarity matching.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .spinning {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};
