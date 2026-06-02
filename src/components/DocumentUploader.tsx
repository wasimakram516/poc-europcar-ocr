'use client';

import { useRef, useState, useEffect, DragEvent, ChangeEvent, MouseEvent } from 'react';
import {
  Box,
  Typography,
  Button,
  LinearProgress,
  Alert,
  Stack,
  Chip,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import RefreshIcon from '@mui/icons-material/Refresh';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import { DocType, SignatureEntry } from '@/lib/types';
import { extractSignatures } from '@/lib/cropSignature';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_MB = 10;
const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

type Stage = 'idle' | 'uploading' | 'ready' | 'running_ocr';

interface Props {
  docType: DocType;
  onResult: (rawText: string, fields: Record<string, { label: string; value: string | null }>) => void;
  onSignaturesExtracted: (sigs: Omit<SignatureEntry, 'id' | 'status'>[]) => void;
  onReset: () => void;
  hasResult: boolean;
  /** Data URL injected from the booklet processor — shown as the preview image */
  externalPreview?: string | null;
  /** Increment this number to fully reset the uploader (clears file, preview, stage) */
  resetToken?: number;
}

export default function DocumentUploader({ docType, onResult, onSignaturesExtracted, onReset, hasResult, externalPreview, resetToken }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const panOrigin = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const pinchRef = useRef<{ initialDist: number; initialZoom: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [panning, setPanning] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // When a booklet page image is injected externally (data URL, not a blob),
  // transition to "ready" state so the preview is immediately visible.
  useEffect(() => {
    if (!externalPreview || stage !== 'idle') return;
    setPreviewUrl(externalPreview);
    setFile(null);
    setStage('ready');
    setZoom(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalPreview]);

  // Parent-triggered full reset: clears file, preview, and stage.
  // Uses functional setters so we always read the latest previewUrl before revoking.
  useEffect(() => {
    if (!resetToken) return;
    setFile(null);
    setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setStage('idle');
    setZoom(1);
    setError(null);
    setUploadProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  }, [resetToken]);

  // Attach non-passive touch listeners so preventDefault() actually blocks the
  // browser's native pinch-to-zoom (React's synthetic handlers are passive by default
  // and the browser ignores preventDefault() on passive listeners).
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchstart', prevent, { passive: false });
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => {
      el.removeEventListener('touchstart', prevent);
      el.removeEventListener('touchmove', prevent);
    };
  // Re-attach when the preview container appears (stage changes to ready)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl]);

  function validate(f: File): string | null {
    if (!ACCEPTED.includes(f.type))
      return 'Unsupported file type. Please upload a JPG, PNG, WEBP, or PDF.';
    if (f.size > MAX_SIZE_MB * 1024 * 1024)
      return `File too large. Maximum size is ${MAX_SIZE_MB} MB.`;
    return null;
  }

  async function loadFile(f: File) {
    const err = validate(f);
    if (err) { setError(err); return; }

    setError(null);
    setStage('uploading');
    setUploadProgress(0);
    setZoom(1);

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    await new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      reader.onload = () => { setUploadProgress(100); resolve(); };
      reader.onerror = () => resolve();
      reader.readAsDataURL(f);
    });

    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setStage('ready');
    setUploadProgress(0);
  }

  async function runOcr() {
    // For booklet-injected pages, file is null but previewUrl is already a base64
    // data URL — use that directly. For manual uploads, encode the File object.
    const base64 = file ? await toBase64(file) : previewUrl;
    if (!base64) return;

    setStage('running_ocr');
    setError(null);
    try {
      const res = await fetch('/api/v1/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, docType }),
      });
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        onResult(json.data.rawText, json.data.fields);
        setStage('ready');
        // Extract signature crops — works for both manual uploads and booklet pages
        const sigSource = previewUrl;
        const sigName = file?.name ?? `booklet-${docType}`;
        if (sigSource && file?.type !== 'application/pdf') {
          extractSignatures(sigSource, docType, sigName)
            .then(onSignaturesExtracted)
            .catch(() => { /* crop failure is non-fatal */ });
        }
      } else {
        setError(json.message ?? 'OCR failed. Please try again.');
        setStage('ready');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
      setStage('ready');
    }
  }

  function toBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) loadFile(f);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
  }

  function getTouchDist(touches: React.TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2) {
      pinchRef.current = { initialDist: getTouchDist(e.touches), initialZoom: zoom };
      setPanning(false);
    } else if (e.touches.length === 1 && zoom > 1 && previewContainerRef.current) {
      setPanning(true);
      panOrigin.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        scrollLeft: previewContainerRef.current.scrollLeft,
        scrollTop: previewContainerRef.current.scrollTop,
      };
    }
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2 && pinchRef.current) {
      const ratio = getTouchDist(e.touches) / pinchRef.current.initialDist;
      setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchRef.current.initialZoom * ratio)));
    } else if (e.touches.length === 1 && panning && previewContainerRef.current) {
      const dx = e.touches[0].clientX - panOrigin.current.x;
      const dy = e.touches[0].clientY - panOrigin.current.y;
      previewContainerRef.current.scrollLeft = panOrigin.current.scrollLeft - dx;
      previewContainerRef.current.scrollTop = panOrigin.current.scrollTop - dy;
    }
  }

  function handleTouchEnd() {
    pinchRef.current = null;
    setPanning(false);
  }

  function startPan(e: MouseEvent<HTMLDivElement>) {
    if (zoom <= 1 || !previewContainerRef.current) return;
    setPanning(true);
    panOrigin.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: previewContainerRef.current.scrollLeft,
      scrollTop: previewContainerRef.current.scrollTop,
    };
  }

  function doPan(e: MouseEvent<HTMLDivElement>) {
    if (!panning || !previewContainerRef.current) return;
    e.preventDefault();
    const dx = e.clientX - panOrigin.current.x;
    const dy = e.clientY - panOrigin.current.y;
    previewContainerRef.current.scrollLeft = panOrigin.current.scrollLeft - dx;
    previewContainerRef.current.scrollTop = panOrigin.current.scrollTop - dy;
  }

  function stopPan() {
    setPanning(false);
  }

  function handleReset(openPicker = false) {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStage('idle');
    setError(null);
    setUploadProgress(0);
    setZoom(1);
    if (inputRef.current) inputRef.current.value = '';
    onReset();
    if (openPicker) setTimeout(() => inputRef.current?.click(), 0);
  }

  // ── Drop zone ──────────────────────────────────────────────────────────────
  if (stage === 'idle') {
    return (
      <Box>
        <Box
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
          sx={{
            border: '2px dashed',
            borderColor: dragging ? 'primary.main' : 'grey.300',
            borderRadius: 3,
            p: 5,
            textAlign: 'center',
            cursor: 'pointer',
            bgcolor: dragging ? 'primary.50' : 'grey.50',
            transition: 'all 0.2s',
            '&:hover': { borderColor: 'primary.main', bgcolor: 'grey.100' },
          }}
        >
          <UploadFileIcon sx={{ fontSize: 56, color: 'grey.400', mb: 1 }} />
          <Typography variant="h6" gutterBottom sx={{ color: 'text.secondary' }}>
            Drag & drop your document here
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            or click to browse files
          </Typography>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            {['JPG', 'PNG', 'WEBP', 'PDF'].map((ext) => (
              <Chip key={ext} label={ext} size="small" variant="outlined" />
            ))}
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
            Max file size: {MAX_SIZE_MB} MB
          </Typography>
        </Box>
        <input ref={inputRef} type="file" hidden accept={ACCEPTED.join(',')} onChange={handleChange} />
        {error && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      </Box>
    );
  }

  // ── Uploading ───────────────────────────────────────────────────────────────
  if (stage === 'uploading') {
    return (
      <Box sx={{ py: 3 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
          Loading <strong>{file?.name ?? 'file'}</strong>…
        </Typography>
        <LinearProgress variant="determinate" value={uploadProgress} color="primary" />
        <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5, display: 'block' }}>
          {uploadProgress}% loaded
        </Typography>
      </Box>
    );
  }

  // ── Ready / Result ──────────────────────────────────────────────────────────
  const isPdf = file?.type === 'application/pdf';

  return (
    <Box>
      {/* File info + action bar */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file?.name}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {file ? (file.size / 1024).toFixed(0) + ' KB' : ''}
          </Typography>
        </Box>

        {stage === 'ready' && !hasResult && (
          <Button variant="contained" size="small" startIcon={<DocumentScannerIcon />} onClick={runOcr}>
            Run OCR
          </Button>
        )}
        {stage === 'ready' && hasResult && (
          <Button variant="outlined" size="small" startIcon={<DocumentScannerIcon />} onClick={runOcr}>
            Re-run OCR
          </Button>
        )}
        <Button variant="text" size="small" color="inherit" startIcon={<RefreshIcon />} onClick={() => handleReset(true)}>
          Change
        </Button>
      </Stack>

      <Divider sx={{ mb: 1.5 }} />

      {/* OCR progress */}
      {stage === 'running_ocr' && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>Running OCR…</Typography>
          <LinearProgress color="primary" />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>{error}</Alert>
      )}

      {/* Preview + zoom controls */}
      {previewUrl && (
        <>
          {/* Zoom toolbar — images only */}
          {!isPdf && (
            <Stack
              direction="row"
              spacing={0.5}
              sx={{ alignItems: 'center', mb: 1, px: 0.5 }}
            >
              <Tooltip title="Zoom out">
                <span>
                  <IconButton size="small" onClick={() => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN))} disabled={zoom <= ZOOM_MIN}>
                    <ZoomOutIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>

              <Typography variant="caption" sx={{ minWidth: 38, textAlign: 'center', fontWeight: 600, color: 'text.secondary' }}>
                {Math.round(zoom * 100)}%
              </Typography>

              <Tooltip title="Zoom in">
                <span>
                  <IconButton size="small" onClick={() => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX))} disabled={zoom >= ZOOM_MAX}>
                    <ZoomInIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip title="Reset to fit">
                <span>
                  <IconButton size="small" onClick={() => setZoom(1)} disabled={zoom === 1}>
                    <FitScreenIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          )}

          {/* Image preview */}
          {!isPdf && (
            <Box
              ref={previewContainerRef}
              onMouseDown={startPan}
              onMouseMove={doPan}
              onMouseUp={stopPan}
              onMouseLeave={stopPan}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              sx={{
                overflow: 'auto',
                maxHeight: 560,
                border: '1px solid',
                borderColor: 'grey.200',
                borderRadius: 2,
                bgcolor: 'grey.50',
                p: 1,
                cursor: zoom > 1 ? (panning ? 'grabbing' : 'grab') : 'default',
                userSelect: 'none',
                touchAction: 'none',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Document preview"
                draggable={false}
                style={{
                  width: `${zoom * 100}%`,
                  maxWidth: 'none',
                  display: 'block',
                  borderRadius: 8,
                  transition: panning ? 'none' : 'width 0.15s ease',
                  pointerEvents: 'none',
                }}
              />
            </Box>
          )}

          {/* PDF preview */}
          {isPdf && (
            <>
              <Box sx={{ width: '100%', height: 520, borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'grey.200' }}>
                <Box component="iframe" src={previewUrl} sx={{ width: '100%', height: '100%', border: 'none' }} title="Document preview" />
              </Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1 }}>
                <PictureAsPdfIcon sx={{ color: 'error.main', fontSize: 16 }} />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Use Ctrl + Scroll inside the PDF viewer to zoom.
                </Typography>
              </Stack>
            </>
          )}
        </>
      )}

      <input ref={inputRef} type="file" hidden accept={ACCEPTED.join(',')} onChange={handleChange} />
    </Box>
  );
}
