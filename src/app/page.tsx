'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Divider,
  Stack,
  Grid,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Badge,
  Button,
  Tooltip,
  Container,
} from '@mui/material';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PersonIcon from '@mui/icons-material/Person';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ChecklistIcon from '@mui/icons-material/Checklist';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import GestureIcon from '@mui/icons-material/Gesture';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import DocumentUploader from '@/components/DocumentUploader';
import OcrResultPanel from '@/components/OcrResultPanel';
import SignaturePanel from '@/components/SignaturePanel';
import BookletUploader, { BookletPageResult } from '@/components/BookletUploader';
import { DocType, SignatureEntry, SignatureStatus, ExtractedField } from '@/lib/types';
import { DOC_TYPE_OPTIONS } from '@/lib/fieldParsers';
import { extractSignatures } from '@/lib/cropSignature';

const SIDEBAR_WIDTH = 260;
type RightView = 'fields' | 'signatures';

const DOC_ICONS: Record<DocType, React.ReactNode> = {
  rental_agreement: <AssignmentIcon />,
  driver_details: <PersonIcon />,
  vehicle_checklist: <ChecklistIcon />,
  charge_slip: <ReceiptIcon />,
};

interface DocResult {
  rawText: string;
  fields: Record<string, ExtractedField>;
}

const ALL_DOC_TYPES = DOC_TYPE_OPTIONS.map((o) => o.value) as DocType[];

export default function Home() {
  const [docType, setDocType] = useState<DocType>('rental_agreement');
  const [rightView, setRightView] = useState<RightView>('fields');

  // Per-doc results — NOT cleared on tab switch
  const [docResults, setDocResults] = useState<Partial<Record<DocType, DocResult>>>({});

  // Per-doc external previews injected from the booklet processor
  const [docPreviews, setDocPreviews] = useState<Partial<Record<DocType, string>>>({});
  const [resetTokens, setResetTokens] = useState<Partial<Record<DocType, number>>>({});

  const [signatures, setSignatures] = useState<SignatureEntry[]>([]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleResult(
    dt: DocType,
    rawText: string,
    fields: Record<string, { label: string; value: string | null }>
  ) {
    setDocResults((prev) => ({ ...prev, [dt]: { rawText, fields } }));
  }

  function handleReset(dt: DocType) {
    setDocResults((prev) => { const n = { ...prev }; delete n[dt]; return n; });
    setDocPreviews((prev) => { const n = { ...prev }; delete n[dt]; return n; });
    setSignatures((prev) => prev.filter((s) => s.docType !== dt));
    // Increment the token so DocumentUploader resets its internal file/preview/stage
    setResetTokens((prev) => ({ ...prev, [dt]: (prev[dt] ?? 0) + 1 }));
  }

  function clearAllDocData() {
    setDocResults({});
    setDocPreviews({});
    setSignatures([]);
    // Bump every token so all DocumentUploaders reset their internal state
    setResetTokens((prev) =>
      Object.fromEntries(ALL_DOC_TYPES.map((dt) => [dt, (prev[dt] ?? 0) + 1]))
    );
  }

  // Booklet processor result
  const handleBookletPageResult = useCallback(async (result: BookletPageResult) => {
    const { docType: dt, imageDataUrl, rawText, fields } = result;
    // Store OCR result
    setDocResults((prev) => ({ ...prev, [dt]: { rawText, fields } }));
    // Store page preview
    setDocPreviews((prev) => ({ ...prev, [dt]: imageDataUrl }));
    // Extract signatures from the page image
    try {
      const sigs = await extractSignatures(imageDataUrl, dt, 'Full Booklet PDF');
      setSignatures((prev) => {
        const filtered = prev.filter((s) => s.docType !== dt || s.fileName !== 'Full Booklet PDF');
        return [
          ...filtered,
          ...sigs.map((s) => ({
            ...s,
            id: `${s.docType}-${s.signatureKey}-${Date.now()}`,
            status: 'pending' as SignatureStatus,
          })),
        ];
      });
    } catch { /* non-fatal */ }
  }, []);

  const handleSignaturesExtracted = useCallback(
    (incoming: Omit<SignatureEntry, 'id' | 'status'>[]) => {
      if (!incoming.length) return;
      setSignatures((prev) => {
        const filtered = prev.filter(
          (s) => !(s.fileName === incoming[0].fileName && s.docType === incoming[0].docType)
        );
        return [
          ...filtered,
          ...incoming.map((s) => ({
            ...s,
            id: `${s.docType}-${s.signatureKey}-${s.fileName}-${Date.now()}`,
            status: 'pending' as SignatureStatus,
          })),
        ];
      });
    },
    []
  );

  function handleSignatureStatusChange(id: string, status: SignatureStatus) {
    setSignatures((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  }

  function changeDocType(next: DocType) {
    setDocType(next);
    setRightView('fields');
  }

  const pendingSigs = signatures.filter((s) => s.status === 'pending').length;
  const flaggedSigs = signatures.filter((s) => s.status === 'warning').length;
  const sigBadge = flaggedSigs > 0 ? flaggedSigs : pendingSigs;
  const processedDocTypes = ALL_DOC_TYPES.filter((dt) => !!docResults[dt]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* ── Header ── */}
      <Box sx={{ bgcolor: 'primary.main', color: 'white', py: 1.75, px: 3, boxShadow: 3, flexShrink: 0, zIndex: 10 }}>
        <Container maxWidth={false}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <DirectionsCarIcon sx={{ fontSize: 30 }} />
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.2 }}>
                Europcar
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                Document Verification — Oman
              </Typography>
            </Box>
          </Stack>
        </Container>
      </Box>

      {/* ── Body ── */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* ── Sidebar ── */}
        <Box
          component="nav"
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            bgcolor: 'white',
            borderRight: '1px solid',
            borderColor: 'grey.200',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          {/* ── Booklet upload (top of sidebar) ── */}
          <BookletUploader
            onPageResult={handleBookletPageResult}
            onClearAll={clearAllDocData}
            processedDocTypes={processedDocTypes}
          />

          <Divider sx={{ mx: 1, my: 1 }} />

          {/* ── Document type list ── */}
          <Box sx={{ px: 2, pt: 1, pb: 1 }}>
            <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, letterSpacing: 1.2 }}>
              Document Type
            </Typography>
          </Box>
          <List disablePadding sx={{ px: 1 }}>
            {DOC_TYPE_OPTIONS.map((opt) => {
              const active = opt.value === docType && rightView === 'fields';
              const hasData = !!docResults[opt.value];
              return (
                <ListItemButton
                  key={opt.value}
                  selected={active}
                  onClick={() => changeDocType(opt.value)}
                  sx={{
                    borderRadius: 2,
                    mb: 0.5,
                    '&.Mui-selected': {
                      bgcolor: 'primary.main',
                      color: 'white',
                      '&:hover': { bgcolor: 'primary.light' },
                      '& .MuiListItemIcon-root': { color: 'white' },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36, color: active ? 'white' : 'primary.main' }}>
                    <Badge
                      variant="dot"
                      color="success"
                      invisible={!hasData}
                      overlap="circular"
                    >
                      {DOC_ICONS[opt.value]}
                    </Badge>
                  </ListItemIcon>
                  <ListItemText
                    primary={opt.label}
                    slotProps={{
                      primary: { variant: 'body2', sx: { fontWeight: active ? 700 : 500 } },
                    }}
                  />
                  {/* Clear button for each tab */}
                  {hasData && !active && (
                    <Tooltip title={`Clear ${opt.label} data`}>
                      <Box
                        component="span"
                        onClick={(e) => { e.stopPropagation(); handleReset(opt.value); }}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          color: 'text.disabled',
                          '&:hover': { color: 'error.main' },
                          cursor: 'pointer',
                          p: 0.25,
                          borderRadius: 1,
                        }}
                      >
                        <DeleteOutlinedIcon sx={{ fontSize: 14 }} />
                      </Box>
                    </Tooltip>
                  )}
                </ListItemButton>
              );
            })}
          </List>

          {/* ── Signatures nav ── */}
          <Divider sx={{ mx: 2, my: 1 }} />
          <Box sx={{ px: 2, pb: 1 }}>
            <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, letterSpacing: 1.2 }}>
              Verification
            </Typography>
          </Box>
          <List disablePadding sx={{ px: 1 }}>
            <ListItemButton
              selected={rightView === 'signatures'}
              onClick={() => setRightView('signatures')}
              sx={{
                borderRadius: 2,
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'white',
                  '&:hover': { bgcolor: 'primary.light' },
                  '& .MuiListItemIcon-root': { color: 'white' },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: rightView === 'signatures' ? 'white' : 'primary.main' }}>
                <Badge badgeContent={sigBadge} color={flaggedSigs > 0 ? 'error' : 'warning'} invisible={sigBadge === 0}>
                  <GestureIcon />
                </Badge>
              </ListItemIcon>
              <ListItemText
                primary="Signatures"
                slotProps={{ primary: { variant: 'body2', sx: { fontWeight: rightView === 'signatures' ? 700 : 500 } } }}
              />
            </ListItemButton>
          </List>

          {/* Doc type description (bottom of sidebar, only in fields view) */}
          {rightView === 'fields' && (
            <Box sx={{ px: 2, pt: 1.5, pb: 3, mt: 'auto' }}>
              <Divider sx={{ mb: 1.5 }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                {DOC_TYPE_OPTIONS.find((o) => o.value === docType)?.description}
              </Typography>
            </Box>
          )}
        </Box>

        {/* ── Main content ── */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 3, bgcolor: 'background.default' }}>
          {rightView === 'signatures' ? (
            /* ── Full-width signature gallery ── */
            <Card sx={{ minHeight: 480 }}>
              <CardContent>
                <SignaturePanel
                  signatures={signatures}
                  onStatusChange={handleSignatureStatusChange}
                  onClearAll={() => setSignatures([])}
                />
              </CardContent>
            </Card>
          ) : (
            /* ── Per-doc upload + results (all 4 tabs always mounted, display:none hides inactive) ── */
            <>
              {ALL_DOC_TYPES.map((dt) => (
                <Box key={dt} sx={{ display: dt === docType ? 'block' : 'none' }}>
                  <Grid container spacing={3} sx={{ alignItems: 'flex-start' }}>
                    {/* LEFT — upload + preview */}
                    <Grid size={{ xs: 12, xl: 5, lg: 6 }}>
                      <Card sx={{ position: 'sticky', top: 0 }}>
                        <CardContent>
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
                              {docResults[dt] ? 'Document Preview' : 'Upload Document'}
                            </Typography>
                            {docResults[dt] && (
                              <Tooltip title="Clear this document's data">
                                <Button
                                  size="small"
                                  color="error"
                                  variant="outlined"
                                  startIcon={<DeleteOutlinedIcon />}
                                  onClick={() => handleReset(dt)}
                                  sx={{ fontSize: '0.7rem' }}
                                >
                                  Clear
                                </Button>
                              </Tooltip>
                            )}
                          </Stack>
                          <Divider sx={{ mb: 2 }} />
                          <DocumentUploader
                            docType={dt}
                            onResult={(rawText, fields) => handleResult(dt, rawText, fields)}
                            onSignaturesExtracted={handleSignaturesExtracted}
                            onReset={() => handleReset(dt)}
                            hasResult={!!docResults[dt]}
                            externalPreview={docPreviews[dt] ?? null}
                            resetToken={resetTokens[dt]}
                          />
                        </CardContent>
                      </Card>
                    </Grid>

                    {/* RIGHT — extracted fields */}
                    <Grid size={{ xs: 12, xl: 7, lg: 6 }}>
                      <Card sx={{ minHeight: 480 }}>
                        <CardContent>
                          {docResults[dt] ? (
                            <OcrResultPanel
                              rawText={docResults[dt]!.rawText}
                              fields={docResults[dt]!.fields}
                            />
                          ) : (
                            <Box
                              sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minHeight: 440,
                                textAlign: 'center',
                                gap: 2,
                              }}
                            >
                              <CloudUploadIcon sx={{ fontSize: 72, color: 'grey.200' }} />
                              <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                No document uploaded yet
                              </Typography>
                              <Typography variant="body2" sx={{ color: 'text.disabled', maxWidth: 300 }}>
                                Upload a scanned document on the left and click{' '}
                                <strong>Run OCR</strong>, or use the{' '}
                                <strong>Full Booklet PDF</strong> option in the sidebar.
                              </Typography>
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                </Box>
              ))}
            </>
          )}

          <Typography
            variant="caption"
            sx={{ color: 'text.disabled', display: 'block', textAlign: 'center', mt: 3 }}
          >
            Europcar Oman — CDS Document Verification · Powered by Google Vision OCR
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
