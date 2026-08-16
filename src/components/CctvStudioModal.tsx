import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, Play, RefreshCw, MapPin, CheckCircle,
  AlertTriangle, X, Radio, Scan, Zap
} from 'lucide-react';
import {
  fetchCctvClips,
  uploadCctvClipStreaming,
  processCctvClipStreaming,
  type CctvClip,
  type CctvProcessResult,
  type CctvMatch,
  type StreamCrop,
  type StreamPhaseStart,
  type StreamPhase1Complete,
  type StreamMatch
} from '../services/api';

interface CctvStudioModalProps {
  onClose: () => void;
  onPinpointMatch: (match: CctvMatch) => void;
}

export const CctvStudioModal: React.FC<CctvStudioModalProps> = ({ onClose, onPinpointMatch }) => {
  const [clips, setClips] = useState<CctvClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string>('');
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pipelinePhase, setPipelinePhase] = useState<'idle' | 'phase1_detecting' | 'phase2_matching' | 'complete'>('idle');
  const [phaseMessage, setPhaseMessage] = useState<string>('');
  const [streamCrops, setStreamCrops] = useState<StreamCrop[]>([]);
  const [streamMatches, setStreamMatches] = useState<CctvMatch[]>([]);
  const [result, setResult] = useState<CctvProcessResult | null>(null);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'matches' | 'crops'>('matches');
  const [isDragging, setIsDragging] = useState(false);
  const [videoDims, setVideoDims] = useState<{ width: number; height: number; offsetX: number; offsetY: number }>({
    width: 0,
    height: 0,
    offsetX: 0,
    offsetY: 0
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Measure actual rendered video content box inside container (accounting for letterbox/pillarbox)
  const updateVideoBounds = () => {
    if (!videoRef.current || !containerRef.current) return;
    const video = videoRef.current;
    const container = containerRef.current;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    if (cw === 0 || ch === 0) return;

    const containerAspect = cw / ch;
    const videoAspect = vw / vh;

    let rw = cw;
    let rh = ch;
    let ox = 0;
    let oy = 0;

    if (videoAspect > containerAspect) {
      rw = cw;
      rh = cw / videoAspect;
      oy = (ch - rh) / 2;
    } else {
      rh = ch;
      rw = ch * videoAspect;
      ox = (cw - rw) / 2;
    }

    setVideoDims({ width: rw, height: rh, offsetX: ox, offsetY: oy });
  };

  useEffect(() => {
    window.addEventListener('resize', updateVideoBounds);
    return () => window.removeEventListener('resize', updateVideoBounds);
  }, []);

  const getCctvStreamUrl = (filename: string) => {
    return `/static/cctv/${encodeURIComponent(filename)}`;
  };

  useEffect(() => {
    const loadClips = async () => {
      const available = await fetchCctvClips();
      setClips(available);
      if (available.length > 0) {
        setSelectedClipId(available[0].id);
        setActiveVideoUrl(getCctvStreamUrl(available[0].filename));
        handleRunPipeline(available[0].id, available[0].filename);
      }
    };
    loadClips();
  }, []);

  const currentClip = clips.find(c => c.id === selectedClipId) || clips[0];

  const handleRunPipeline = (clipId?: string, filename?: string) => {
    const targetId = clipId || selectedClipId;
    const targetClip = clips.find(c => c.id === targetId);
    const fname = filename || targetClip?.filename;
    
    if (fname) {
      setActiveVideoUrl(getCctvStreamUrl(fname));
    }

    abortControllerRef.current?.abort();

    setIsProcessing(true);
    setPipelinePhase('phase1_detecting');
    setPhaseMessage(`Scanning ${fname || 'CCTV video'} with ByteTrack motion tracking...`);
    setUploadStatus(`Fast inference & ByteTrack tracking on ${fname || 'CCTV video'}...`);
    setStreamCrops([]);
    setStreamMatches([]);
    setResult(null);

    const controller = processCctvClipStreaming(targetId, {
      onPhaseStart: (data: StreamPhaseStart) => {
        if (data.phase === 1) {
          setPipelinePhase('phase1_detecting');
          setPhaseMessage(data.message || 'Detecting faces with ByteTrack motion deduplication...');
          setUploadStatus('Phase 1: Detecting faces & tracking unique appearances...');
        } else if (data.phase === 2) {
          setPipelinePhase('phase2_matching');
          setPhaseMessage(data.message || 'Extracting 64-D embeddings & FAISS vector search...');
          setUploadStatus('Phase 2: Extracting 64-D embeddings & querying WatchList FAISS index...');
        }
      },
      onCrop: (crop: StreamCrop) => {
        setStreamCrops(prev => [...prev, crop]);
      },
      onPhase1Complete: (data: StreamPhase1Complete) => {
        setPipelinePhase('phase2_matching');
        setPhaseMessage(`Phase 1 done (${data.total_unique_faces} unique tracks). Converting embeddings & FAISS search...`);
        setUploadStatus(`Phase 2: Comparing ${data.total_unique_faces} unique tracks against WatchList FAISS...`);
      },
      onMatch: (data: StreamMatch) => {
        setStreamMatches(prev => {
          if (prev.some(m => m.event_id === data.match.event_id || (m.track_id === data.match.track_id && m.person_id === data.match.person_id))) {
            return prev;
          }
          return [...prev, data.match];
        });
      },
      onSummary: (res: CctvProcessResult) => {
        setResult(res);
        setIsProcessing(false);
        setPipelinePhase('complete');
        setUploadStatus(null);

        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play().catch(() => {});
          setTimeout(updateVideoBounds, 200);
        }
      },
      onError: (err: string) => {
        console.error("Pipeline streaming error:", err);
        setIsProcessing(false);
        setPipelinePhase('idle');
        setUploadStatus(null);
      }
    });

    abortControllerRef.current = controller;
  };

  const processUploadedFile = (file: File) => {
    const localUrl = URL.createObjectURL(file);
    setActiveVideoUrl(localUrl);

    abortControllerRef.current?.abort();

    setIsProcessing(true);
    setPipelinePhase('phase1_detecting');
    setPhaseMessage(`Ingesting ${file.name} with ByteTrack & FaceArc...`);
    setUploadStatus(`Ingesting with buffalo_s model & FAISS: ${file.name}...`);
    setStreamCrops([]);
    setStreamMatches([]);
    setResult(null);

    const controller = uploadCctvClipStreaming(file, currentClip?.checkpoint_id || 'cp-01', {
      onPhaseStart: (data: StreamPhaseStart) => {
        if (data.phase === 1) {
          setPipelinePhase('phase1_detecting');
          setPhaseMessage(data.message || 'Detecting faces & ByteTrack motion deduplication...');
          setUploadStatus('Phase 1: Detecting faces & tracking unique appearances...');
        } else if (data.phase === 2) {
          setPipelinePhase('phase2_matching');
          setPhaseMessage(data.message || 'Extracting 64-D embeddings & FAISS search...');
          setUploadStatus('Phase 2: Converting unique face crops to 64-D embeddings & FAISS search...');
        }
      },
      onCrop: (crop: StreamCrop) => {
        setStreamCrops(prev => [...prev, crop]);
      },
      onPhase1Complete: (data: StreamPhase1Complete) => {
        setPipelinePhase('phase2_matching');
        setPhaseMessage(`Phase 1 done (${data.total_unique_faces} unique tracks). Converting embeddings & FAISS search...`);
        setUploadStatus(`Phase 2: Comparing ${data.total_unique_faces} unique tracks against WatchList FAISS...`);
      },
      onMatch: (data: StreamMatch) => {
        setStreamMatches(prev => {
          if (prev.some(m => m.event_id === data.match.event_id || (m.track_id === data.match.track_id && m.person_id === data.match.person_id))) {
            return prev;
          }
          return [...prev, data.match];
        });
      },
      onSummary: async (res: CctvProcessResult) => {
        setResult(res);
        setIsProcessing(false);
        setPipelinePhase('complete');
        setUploadStatus(null);

        // Refresh clips catalog
        const updatedClips = await fetchCctvClips();
        setClips(updatedClips);
        if (updatedClips.length > 0) {
          setSelectedClipId(updatedClips[updatedClips.length - 1].id);
        }

        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play().catch(() => {});
          setTimeout(updateVideoBounds, 200);
        }
      },
      onError: (err: string) => {
        console.error("Upload stream error:", err);
        setIsProcessing(false);
        setPipelinePhase('idle');
        setUploadStatus(null);
      }
    });

    abortControllerRef.current = controller;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processUploadedFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processUploadedFile(file);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentVideoTime(videoRef.current.currentTime);
    }
  };

  // Find active bounding boxes corresponding to current playback timestamp
  const activeDetections = React.useMemo(() => {
    if (!result?.sample_annotations || result.sample_annotations.length === 0) {
      return [];
    }
    let best = result.sample_annotations[0];
    let minDiff = Math.abs(best.timestamp_sec - currentVideoTime);

    for (let i = 1; i < result.sample_annotations.length; i++) {
      const curr = result.sample_annotations[i];
      const diff = Math.abs(curr.timestamp_sec - currentVideoTime);
      if (diff < minDiff) {
        minDiff = diff;
        best = curr;
      }
    }

    if (minDiff > 1.2) {
      return [];
    }
    return best.detections || [];
  }, [result, currentVideoTime]);

  // Derived matches and crops lists for tabs (updates live while streaming)
  const displayMatches = React.useMemo(() => {
    if (result?.matches && result.matches.length > 0) {
      return result.matches;
    }
    return streamMatches;
  }, [result, streamMatches]);

  const displayCrops = React.useMemo(() => {
    if (result?.detected_crops && result.detected_crops.length > 0) {
      return result.detected_crops;
    }
    return streamCrops.map(c => {
      const matched = streamMatches.find(m => m.track_id === c.track_id);
      return {
        track_id: c.track_id,
        crop_url: c.crop_url,
        timestamp_sec: c.timestamp_sec,
        bbox: c.bbox,
        det_score: c.det_score,
        best_match_name: matched ? matched.name : 'Passerby',
        best_match_id: matched ? matched.person_id : null,
        confidence: matched ? matched.confidence : 0,
        status: matched ? matched.tier : 'UNKNOWN_PASSERBY'
      };
    });
  }, [result, streamCrops, streamMatches]);

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
              CCTV SURVEILLANCE INGESTION & MATCHING STUDIO
            </h2>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
              HIGH-PRECISION MULTI-FACE DETECTION // RETINAFACE // ARCFACE 512-D // COSINE SIMILARITY
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
        {/* Left Column: Video Uploader & Feed Selector */}
        <div style={{
          width: '340px',
          borderRight: '1px solid var(--border-hairline)',
          backgroundColor: 'rgba(12, 16, 23, 0.95)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          padding: '16px',
          gap: '14px'
        }}>
          {/* Primary Upload Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: isDragging ? '2px dashed var(--accent-signal)' : '1px dashed var(--border-hairline)',
              backgroundColor: isDragging ? 'rgba(0, 217, 163, 0.08)' : 'rgba(18, 22, 31, 0.7)',
              padding: '16px',
              textAlign: 'center',
              borderRadius: '2px',
              cursor: isProcessing ? 'wait' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="video/mp4,video/avi,video/quicktime,video/webm,video/mkv"
              style={{ display: 'none' }}
            />
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'rgba(0, 217, 163, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--accent-signal)'
            }}>
              <Upload size={18} color="var(--accent-signal)" />
            </div>
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                UPLOAD CCTV FOOTAGE
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace", marginTop: '2px' }}>
                Drag & Drop or Click (.MP4, .MOV, .AVI, .WEBM)
              </div>
            </div>
          </div>

          {/* Rescan / Processing Action */}
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
              padding: '10px',
              fontSize: '0.82rem',
              fontWeight: 700,
              fontFamily: "'IBM Plex Mono', monospace",
              cursor: isProcessing ? 'wait' : 'pointer',
              boxShadow: '0 4px 16px rgba(0, 217, 163, 0.25)',
              borderRadius: '2px'
            }}
          >
            <RefreshCw size={14} className={isProcessing ? 'spinning' : ''} />
            {isProcessing ? 'DETECTING & HASHING...' : 'RE-SCAN SELECTED CLIP'}
          </button>

          {uploadStatus && (
            <div style={{
              fontSize: '0.72rem',
              color: 'var(--accent-signal)',
              padding: '6px 10px',
              backgroundColor: 'rgba(0, 217, 163, 0.08)',
              border: '1px solid rgba(0, 217, 163, 0.2)',
              fontFamily: "'IBM Plex Mono', monospace"
            }}>
              {uploadStatus}
            </div>
          )}

          {/* Active Feeds / Discovered Video Catalog */}
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: '8px', textTransform: 'uppercase' }}>
              ACTIVE SURVEILLANCE FEEDS ({clips.length})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
              {clips.map(clip => {
                const isSelected = selectedClipId === clip.id;
                return (
                  <div
                    key={clip.id}
                    onClick={() => {
                      setSelectedClipId(clip.id);
                      handleRunPipeline(clip.id, clip.filename);
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '2px',
                      border: isSelected ? '1px solid var(--accent-signal)' : '1px solid var(--border-hairline)',
                      backgroundColor: isSelected ? 'rgba(0, 217, 163, 0.1)' : 'var(--bg-panel)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span className="mono-display" style={{ fontSize: '0.78rem', color: isSelected ? 'var(--accent-signal)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                        {clip.filename}
                      </span>
                      <span style={{
                        fontSize: '0.62rem',
                        fontFamily: "'IBM Plex Mono', monospace",
                        color: 'var(--accent-signal)',
                        backgroundColor: 'rgba(0, 217, 163, 0.15)',
                        padding: '1px 4px'
                      }}>
                        {clip.camera_id.split(' ')[0]}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                      {clip.checkpoint_name}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Telemetry Card */}
          {result && (
            <div style={{ padding: '10px', backgroundColor: 'var(--bg-void)', border: '1px solid var(--border-hairline)', borderRadius: '2px' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--accent-signal)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: '6px', textTransform: 'uppercase' }}>
                AI PIPELINE TELEMETRY
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.7rem', fontFamily: "'IBM Plex Mono', monospace" }}>
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
                  <span style={{ color: 'var(--text-secondary)' }}>MOBILENET-V3 EMBEDDING:</span>
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
          <div
            ref={containerRef}
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16/9',
              maxHeight: '480px',
              backgroundColor: '#000000',
              border: '1px solid var(--border-hairline)',
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.8)'
            }}
          >
            {/* Real Video Element */}
            {activeVideoUrl ? (
              <video
                ref={videoRef}
                src={activeVideoUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={updateVideoBounds}
                onPlay={updateVideoBounds}
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
            ) : (
              <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '0.85rem'
              }}>
                SELECT A SURVEILLANCE FEED OR UPLOAD CCTV FOOTAGE
              </div>
            )}

            {/* Tactical Cyber Ingestion HUD on Screen Area (Live Face Previews & Phase Indicator) */}
            {isProcessing && (
              <div style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(7, 10, 14, 0.88)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '16px',
                zIndex: 30,
                fontFamily: "'IBM Plex Mono', monospace"
              }}>
                {/* Scanning Laser Line */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '2px',
                  background: 'linear-gradient(90deg, transparent, #00D9A3, #38BDF8, transparent)',
                  boxShadow: '0 0 15px #00D9A3, 0 0 30px #38BDF8',
                  animation: 'scanLaser 1.8s ease-in-out infinite',
                  pointerEvents: 'none'
                }} />

                {/* Top Phase & Status Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      backgroundColor: pipelinePhase === 'phase1_detecting' ? 'rgba(0, 217, 163, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                      border: `1px solid ${pipelinePhase === 'phase1_detecting' ? 'var(--accent-signal)' : '#38BDF8'}`,
                      color: pipelinePhase === 'phase1_detecting' ? 'var(--accent-signal)' : '#38BDF8',
                      padding: '4px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <Zap size={13} className="spinning" />
                      {pipelinePhase === 'phase1_detecting'
                        ? 'PHASE 1: FACE DETECTION & BYTETRACK'
                        : 'PHASE 2: 64-D EMBEDDING & FAISS ANN'}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#E2E8F0' }}>
                      {phaseMessage}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '14px', fontSize: '0.72rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      UNIQUE CROPS: <strong style={{ color: 'var(--accent-signal)' }}>{streamCrops.length}</strong>
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      WATCHLIST MATCHES: <strong style={{ color: '#F59E0B' }}>{streamMatches.length}</strong>
                    </span>
                  </div>
                </div>

                {/* Center Live Face Crop Preview Grid right on the screen (the black area) */}
                <div style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  margin: '12px 0',
                  overflow: 'hidden'
                }}>
                  {streamCrops.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <div style={{ position: 'relative', width: '60px', height: '60px', margin: '0 auto 12px' }}>
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: '50%',
                          border: '2px dashed #00D9A3',
                          animation: 'spin 3s linear infinite'
                        }} />
                        <div style={{
                          position: 'absolute',
                          inset: '8px',
                          borderRadius: '50%',
                          border: '1.5px solid #38BDF8',
                          animation: 'spinReverse 2s linear infinite'
                        }} />
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00D9A3' }}>
                          <Scan size={20} />
                        </div>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--accent-signal)' }}>
                        SCANNING CCTV FRAMES WITH STRIDE-SKIPPING...
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        ByteTrack associating high & low confidence detections
                      </div>
                    </div>
                  ) : (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--accent-signal)', letterSpacing: '0.05em' }}>
                          LIVE DETECTED FACE PREVIEWS ({streamCrops.length} UNIQUE APPEARANCES / ANGLES)
                        </span>
                        <span style={{ fontSize: '0.65rem', color: '#38BDF8' }}>
                          {pipelinePhase === 'phase2_matching' ? 'MATCHING WITH WATCHLIST VECTOR DB...' : 'READY FOR FAISS ANN SEARCH'}
                        </span>
                      </div>

                      {/* Horizontal scrollable row of detected face crops popping in */}
                      <div style={{
                        display: 'flex',
                        gap: '10px',
                        overflowX: 'auto',
                        padding: '8px 4px',
                        maxWidth: '100%'
                      }}>
                        {streamCrops.map((crop, idx) => {
                          const matched = streamMatches.find(m => m.track_id === crop.track_id);
                          const isConfirmed = matched?.tier === 'CONFIRMED';
                          const borderColor = matched ? (isConfirmed ? 'var(--accent-signal)' : '#F59E0B') : '#38BDF8';

                          return (
                            <div
                              key={idx}
                              style={{
                                flexShrink: 0,
                                width: '90px',
                                backgroundColor: 'rgba(12, 16, 23, 0.95)',
                                border: `1.5px solid ${borderColor}`,
                                padding: '6px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: `0 4px 14px ${matched ? (isConfirmed ? 'rgba(0, 217, 163, 0.25)' : 'rgba(245, 158, 11, 0.25)') : 'rgba(56, 189, 248, 0.15)'}`,
                                animation: 'fadeInScale 0.25s ease-out'
                              }}
                            >
                              <div style={{
                                width: '74px',
                                height: '74px',
                                backgroundColor: '#000',
                                overflow: 'hidden',
                                position: 'relative'
                              }}>
                                <img
                                  src={`http://localhost:8000${crop.crop_url}`}
                                  alt={`Track ${crop.track_id}`}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                />
                                <div style={{
                                  position: 'absolute',
                                  bottom: 0,
                                  left: 0,
                                  right: 0,
                                  backgroundColor: 'rgba(0,0,0,0.75)',
                                  fontSize: '8px',
                                  color: '#FFF',
                                  textAlign: 'center',
                                  padding: '1px'
                                }}>
                                  {crop.timestamp_sec}s
                                </div>
                              </div>

                              <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
                                TRK #{crop.track_id}
                              </div>

                              {matched ? (
                                <div style={{
                                  fontSize: '0.58rem',
                                  color: isConfirmed ? 'var(--accent-signal)' : '#F59E0B',
                                  textAlign: 'center',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '82px',
                                  fontWeight: 700
                                }}>
                                  {(matched.confidence * 100).toFixed(0)}% {matched.name.split(' ')[0]}
                                </div>
                              ) : (
                                <div style={{ fontSize: '0.58rem', color: '#94A3B8', textAlign: 'center' }}>
                                  {crop.det_score ? `${(crop.det_score * 100).toFixed(0)}% DET` : 'DETECTED'}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Progress Bar */}
                <div style={{ width: '100%' }}>
                  <div style={{
                    height: '3px',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '2px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: '100%',
                      height: '100%',
                      background: pipelinePhase === 'phase1_detecting'
                        ? 'linear-gradient(90deg, #00D9A3, #38BDF8)'
                        : 'linear-gradient(90deg, #38BDF8, #F59E0B)',
                      animation: 'progressIndeterminate 1.2s infinite'
                    }} />
                  </div>
                </div>
              </div>
            )}

            {/* Dynamic Real-Time Bounding Box HUD Overlay */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {activeDetections.map((det, idx) => {
                const [normX, normY, normW, normH] = det.norm_box;
                const isConfirmed = det.status === 'CONFIRMED';
                const isReview = det.status === 'PENDING_REVIEW';
                const borderColor = isConfirmed ? 'var(--accent-signal)' : isReview ? 'var(--accent-alert)' : '#38bdf8';

                // Compute bounding box pixel position mapped directly to the video frame inside container
                const boxLeft = videoDims.width > 0 ? (videoDims.offsetX + normX * videoDims.width) : (normX * 100);
                const boxTop = videoDims.height > 0 ? (videoDims.offsetY + normY * videoDims.height) : (normY * 100);
                const boxWidth = videoDims.width > 0 ? (normW * videoDims.width) : (normW * 100);
                const boxHeight = videoDims.height > 0 ? (normH * videoDims.height) : (normH * 100);
                const isPixel = videoDims.width > 0;

                return (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      left: isPixel ? `${boxLeft}px` : `${boxLeft}%`,
                      top: isPixel ? `${boxTop}px` : `${boxTop}%`,
                      width: isPixel ? `${boxWidth}px` : `${boxWidth}%`,
                      height: isPixel ? `${boxHeight}px` : `${boxHeight}%`,
                      border: `2px solid ${borderColor}`,
                      boxShadow: `0 0 16px ${borderColor}, inset 0 0 8px rgba(0, 217, 163, 0.2)`,
                      boxSizing: 'border-box',
                      transition: 'all 0.08s ease-out'
                    }}
                  >
                    {/* Reticle Corner Brackets */}
                    <div style={{ position: 'absolute', top: '-4px', left: '-4px', width: '8px', height: '8px', borderTop: `3px solid ${borderColor}`, borderLeft: `3px solid ${borderColor}` }} />
                    <div style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', borderTop: `3px solid ${borderColor}`, borderRight: `3px solid ${borderColor}` }} />
                    <div style={{ position: 'absolute', bottom: '-4px', left: '-4px', width: '8px', height: '8px', borderBottom: `3px solid ${borderColor}`, borderLeft: `3px solid ${borderColor}` }} />
                    <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '8px', height: '8px', borderBottom: `3px solid ${borderColor}`, borderRight: `3px solid ${borderColor}` }} />

                    {/* Floating Identification Tag */}
                    <div style={{
                      position: 'absolute',
                      top: '-26px',
                      left: '0',
                      backgroundColor: 'rgba(10, 14, 20, 0.95)',
                      border: `1px solid ${borderColor}`,
                      color: '#FFFFFF',
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '10px',
                      padding: '2px 6px',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.8)'
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

          {/* Sighted Matches & Detected Crops Drawer below video */}
          <div style={{ marginTop: '16px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setActiveTab('matches')}
                  style={{
                    backgroundColor: activeTab === 'matches' ? 'rgba(0, 217, 163, 0.15)' : 'var(--bg-panel)',
                    border: activeTab === 'matches' ? '1px solid var(--accent-signal)' : '1px solid var(--border-hairline)',
                    color: activeTab === 'matches' ? 'var(--accent-signal)' : 'var(--text-secondary)',
                    padding: '5px 12px',
                    fontSize: '0.75rem',
                    fontFamily: "'IBM Plex Mono', monospace",
                    cursor: 'pointer',
                    borderRadius: '2px',
                    fontWeight: 600
                  }}
                >
                  WATCHLIST MATCHES ({displayMatches.length})
                </button>
                <button
                  onClick={() => setActiveTab('crops')}
                  style={{
                    backgroundColor: activeTab === 'crops' ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-panel)',
                    border: activeTab === 'crops' ? '1px solid #38bdf8' : '1px solid var(--border-hairline)',
                    color: activeTab === 'crops' ? '#38bdf8' : 'var(--text-secondary)',
                    padding: '5px 12px',
                    fontSize: '0.75rem',
                    fontFamily: "'IBM Plex Mono', monospace",
                    cursor: 'pointer',
                    borderRadius: '2px',
                    fontWeight: 600
                  }}
                >
                  ALL DETECTED FACE CROPS ({displayCrops.length})
                </button>
              </div>

              {result && (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                  ARCFACE 512-D // COSINE SIMILARITY // {result.telemetry.total_faces_detected} FRAMES SCANNED
                </div>
              )}
            </div>

            {activeTab === 'matches' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '12px' }}>
                {displayMatches.map((m, idx) => {
                  const isConfirmed = m.tier === 'CONFIRMED';
                  const tierColor = isConfirmed ? 'var(--accent-signal)' : 'var(--accent-alert)';

                  return (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: 'var(--bg-panel)',
                        border: `1px solid ${tierColor}`,
                        padding: '12px',
                        borderRadius: '2px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        boxShadow: `0 4px 20px ${isConfirmed ? 'rgba(0, 217, 163, 0.1)' : 'rgba(255, 170, 0, 0.1)'}`
                      }}
                    >
                      {/* Top Comparison Row: Detected Crop vs Watchlist Dossier */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        {/* Detected Crop */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <div style={{ width: '76px', height: '76px', backgroundColor: '#000', border: '1px solid var(--border-hairline)', overflow: 'hidden', position: 'relative' }}>
                            <img
                              src={`http://localhost:8000${m.face_crop_path}`}
                              alt="CCTV Crop"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.75)', fontSize: '8px', color: '#FFF', textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace" }}>
                              {m.video_timestamp_sec}s
                            </div>
                          </div>
                          <span style={{ fontSize: '0.62rem', color: '#38bdf8', fontFamily: "'IBM Plex Mono', monospace" }}>
                            DETECTED CROP
                          </span>
                        </div>

                        {/* Match Indicator & ANN Metrics */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '2px' }}>
                          <div style={{
                            backgroundColor: isConfirmed ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 170, 0, 0.15)',
                            border: `1px solid ${tierColor}`,
                            color: tierColor,
                            padding: '3px 8px',
                            borderRadius: '2px',
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: '1rem',
                            fontWeight: 700
                          }}>
                            {(m.confidence * 100).toFixed(1)}% SIMILARITY
                          </div>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>
                            {m.tier}
                          </span>
                          <span style={{ fontSize: '0.62rem', color: '#38bdf8', fontFamily: "'IBM Plex Mono', monospace" }}>
                            ARCFACE 512-D COSINE
                          </span>
                        </div>

                        {/* Watchlist Reference Photo */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <div style={{ width: '76px', height: '76px', backgroundColor: '#000', border: `1px solid ${tierColor}`, overflow: 'hidden' }}>
                            <img
                              src={`http://localhost:8000${m.reference_photo_path}`}
                              alt={m.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          </div>
                          <span style={{ fontSize: '0.62rem', color: 'var(--accent-signal)', fontFamily: "'IBM Plex Mono', monospace" }}>
                            WATCHLIST DB
                          </span>
                        </div>
                      </div>

                      {/* Profile Metadata */}
                      <div style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <span className="mono-display" style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                            {m.name}
                          </span>
                          <span style={{
                            fontSize: '0.65rem',
                            fontFamily: "'IBM Plex Mono', monospace",
                            color: m.threat_level === 'CRITICAL' ? 'var(--accent-alert)' : '#f59e0b',
                            backgroundColor: 'rgba(255, 71, 87, 0.12)',
                            padding: '1px 5px',
                            border: '1px solid rgba(255, 71, 87, 0.3)'
                          }}>
                            {m.threat_level || 'HIGH THREAT'}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: '4px' }}>
                          ID: {m.person_id} // {m.offense || 'Active Criminal Warrant'}
                        </div>

                        <button
                          onClick={() => {
                            onPinpointMatch(m);
                            onClose();
                          }}
                          style={{
                            width: '100%',
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
                          PINPOINT SIGHTING ON TACTICAL MAP
                        </button>
                      </div>
                    </div>
                  );
                })}

                {displayMatches.length === 0 && !isProcessing && (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: "'IBM Plex Mono', monospace", gridColumn: '1 / -1' }}>
                    No high-confidence watchlist targets identified in this CCTV clip.
                  </div>
                )}

                {displayMatches.length === 0 && isProcessing && (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: "'IBM Plex Mono', monospace", gridColumn: '1 / -1' }}>
                    Scanning footage... matches will appear here progressively.
                  </div>
                )}
              </div>
            ) : (
              /* All Detected Crops Grid */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                {displayCrops.map((c, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: 'var(--bg-panel)',
                      border: '1px solid var(--border-hairline)',
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}
                  >
                    <div style={{ width: '100%', aspectRatio: '1/1', backgroundColor: '#000', overflow: 'hidden' }}>
                      <img
                        src={`http://localhost:8000${c.crop_url}`}
                        alt="Crop"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                    </div>
                    <div style={{ fontSize: '0.7rem', fontFamily: "'IBM Plex Mono', monospace" }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)' }}>
                        <span>TRK #{c.track_id}</span>
                        <span>{c.timestamp_sec}s</span>
                      </div>
                      <div style={{ color: c.confidence > 0.6 ? 'var(--accent-signal)' : 'var(--text-secondary)', marginTop: '2px' }}>
                        {c.best_match_name} ({c.confidence > 0 ? `${(c.confidence * 100).toFixed(0)}%` : 'No Match'})
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
        @keyframes spinReverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes scanLaser {
          0% { top: 0%; opacity: 0.85; }
          50% { top: 98%; opacity: 1; }
          100% { top: 0%; opacity: 0.85; }
        }
        @keyframes progressIndeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.92); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.85);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};
