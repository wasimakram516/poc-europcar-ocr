'use client';

import { useRef, useState, DragEvent, ChangeEvent } from 'react';
import {
  Box,
  Typography,
  Button,
  LinearProgress,
  Alert,
  Tooltip,
  Stack,
  Chip,
} from '@mui/material';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { DocType } from '@/lib/types';
import { renderAllPages, BOOKLET_PAGE_MAP } from '@/lib/pdfRenderer';
import { DOC_TYPE_OPTIONS } from '@/lib/fieldParsers';

export interface BookletPageResult {
  docType: DocType;
  imageDataUrl: string;
  rawText: string;
  fields: Record<string, { label: string; value: string | null }>;
}

interface Props {
  onPageResult: (result: BookletPageResult) => void;
  onClearAll: () => void;
  processedDocTypes: DocType[];
}

type Stage = 'idle' | 'loaded' | 'rendering' | 'ocr' | 'done';

export default function BookletUploader({ onPageResult, onClearAll, processedDocTypes }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<{ pageNum: number; docType: DocType | null; dataUrl: string }[]>([]);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) selectFile(f);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) selectFile(f);
  }

  function selectFile(f: File) {
    if (f.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    setError(null);
    setFile(f);
    setStage('loaded');
    setPages([]);
  }

  async function runAll() {
    if (!file) return;
    setError(null);
    setStage('rendering');
    setProgress({ done: 0, total: 0, label: 'Rendering pages…' });

    let renderedPages: { pageNum: number; docType: DocType | null; dataUrl: string }[] = [];
    try {
      renderedPages = await renderAllPages(file, 1.8, (done, total) => {
        setProgress({ done, total, label: `Rendering page ${done} of ${total}…` });
      });
      setPages(renderedPages);
    } catch (err) {
      setError('Failed to render PDF pages. The file may be corrupted or password-protected.');
      setStage('loaded');
      return;
    }

    // OCR only pages that have a mapped doc type
    const ocrPages = renderedPages.filter((p) => p.docType !== null);
    setStage('ocr');

    const failed: string[] = [];

    for (let i = 0; i < ocrPages.length; i++) {
      const p = ocrPages[i];
      const label = DOC_TYPE_OPTIONS.find((o) => o.value === p.docType)?.label ?? String(p.docType);
      setProgress({ done: i + 1, total: ocrPages.length, label: `Running OCR — ${label}…` });

      try {
        const res = await fetch('/api/v1/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64: p.dataUrl, docType: p.docType }),
        });
        if (!res.ok) {
          // 413 (payload too large) or 5xx — record and continue
          failed.push(label);
          continue;
        }
        const json = await res.json();
        if (json.status === 'success' && json.data) {
          onPageResult({
            docType: p.docType!,
            imageDataUrl: p.dataUrl,
            rawText: json.data.rawText,
            fields: json.data.fields,
          });
        } else {
          failed.push(label);
        }
      } catch {
        failed.push(label);
      }
    }

    setStage('done');
    setProgress({ done: ocrPages.length, total: ocrPages.length, label: 'Complete' });
    if (failed.length) {
      setError(`OCR failed for: ${failed.join(', ')}. Try uploading ${failed.length > 1 ? 'those pages' : 'that page'} individually.`);
    }
  }

  function clearAll() {
    setFile(null);
    setStage('idle');
    setPages([]);
    setProgress({ done: 0, total: 0, label: '' });
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
    onClearAll();
  }

  const isRunning = stage === 'rendering' || stage === 'ocr';
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Box>
      {/* Section header */}
      <Box sx={{ px: 2, pt: 2.5, pb: 1 }}>
        <Typography
          variant="overline"
          sx={{ color: 'text.disabled', fontWeight: 700, letterSpacing: 1.2 }}
        >
          Full Booklet (PDF)
        </Typography>
      </Box>

      <Box sx={{ px: 1 }}>
        {stage === 'idle' ? (
          /* Drop zone */
          <Box
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
            sx={{
              border: '2px dashed',
              borderColor: dragging ? 'primary.main' : 'grey.300',
              borderRadius: 2,
              p: 2,
              textAlign: 'center',
              cursor: 'pointer',
              bgcolor: dragging ? 'primary.50' : 'grey.50',
              transition: 'all 0.2s',
              '&:hover': { borderColor: 'primary.main', bgcolor: 'grey.100' },
            }}
          >
            <FolderZipIcon sx={{ fontSize: 28, color: 'grey.400', display: 'block', mx: 'auto', mb: 0.5 }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.4 }}>
              Drop the full rental booklet PDF here or click to browse
            </Typography>
          </Box>
        ) : (
          /* File loaded / processing / done */
          <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
              <FolderZipIcon sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }} />
              <Typography
                variant="caption"
                sx={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {file?.name}
              </Typography>
            </Stack>

            {/* Progress */}
            {isRunning && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {progress.label}
                </Typography>
                <LinearProgress variant="determinate" value={progressPct} sx={{ mt: 0.5, borderRadius: 1 }} />
              </Box>
            )}

            {/* Done summary */}
            {stage === 'done' && (
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', mb: 1, gap: 0.5 }}>
                {processedDocTypes.map((dt) => (
                  <Chip
                    key={dt}
                    icon={<CheckCircleIcon />}
                    label={DOC_TYPE_OPTIONS.find((o) => o.value === dt)?.label.replace(' (RA)', '') ?? dt}
                    color="success"
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.65rem', height: 20 }}
                  />
                ))}
              </Stack>
            )}

            {/* Action buttons */}
            <Stack direction="row" spacing={1}>
              {(stage === 'loaded' || stage === 'done') && (
                <Tooltip title={stage === 'done' ? 'Re-run OCR on all pages' : 'Render pages and run OCR on all'}>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<PlayArrowIcon />}
                    onClick={runAll}
                    sx={{ flex: 1, fontSize: '0.72rem' }}
                  >
                    {stage === 'done' ? 'Re-run OCR All' : 'Run OCR All'}
                  </Button>
                </Tooltip>
              )}
              <Tooltip title="Clear booklet and all extracted data">
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  startIcon={<ClearAllIcon />}
                  onClick={clearAll}
                  disabled={isRunning}
                  sx={{ fontSize: '0.72rem', minWidth: 'auto', px: 1 }}
                >
                  Clear
                </Button>
              </Tooltip>
            </Stack>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </Box>

      <input ref={inputRef} type="file" hidden accept="application/pdf" onChange={handleChange} />
    </Box>
  );
}
