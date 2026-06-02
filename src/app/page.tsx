'use client';

import { useState } from 'react';
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
} from '@mui/material';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PersonIcon from '@mui/icons-material/Person';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ChecklistIcon from '@mui/icons-material/Checklist';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DocumentUploader from '@/components/DocumentUploader';
import OcrResultPanel from '@/components/OcrResultPanel';
import { DocType } from '@/lib/types';
import { DOC_TYPE_OPTIONS } from '@/lib/fieldParsers';

const SIDEBAR_WIDTH = 260;

const DOC_ICONS: Record<DocType, React.ReactNode> = {
  rental_agreement: <AssignmentIcon />,
  driver_details: <PersonIcon />,
  vehicle_checklist: <ChecklistIcon />,
  charge_slip: <ReceiptIcon />,
};

export default function Home() {
  const [docType, setDocType] = useState<DocType>('rental_agreement');
  const [rawText, setRawText] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<
    string,
    { label: string; value: string | null }
  > | null>(null);

  function handleResult(
    text: string,
    extractedFields: Record<string, { label: string; value: string | null }>
  ) {
    setRawText(text);
    setFields(extractedFields);
  }

  function handleReset() {
    setRawText(null);
    setFields(null);
  }

  function changeDocType(next: DocType) {
    setDocType(next);
    handleReset();
  }

  const hasResult = rawText !== null && fields !== null;
  const selectedOption = DOC_TYPE_OPTIONS.find((o) => o.value === docType)!;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* ── Top header ── */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'white',
          py: 1.75,
          px: 3,
          boxShadow: 3,
          flexShrink: 0,
          zIndex: 10,
        }}
      >
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
      </Box>

      {/* ── Body (sidebar + content) ── */}
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
          <Box sx={{ px: 2, pt: 3, pb: 1 }}>
            <Typography
              variant="overline"
              sx={{ color: 'text.disabled', fontWeight: 700, letterSpacing: 1.2 }}
            >
              Document Type
            </Typography>
          </Box>

          <List disablePadding sx={{ px: 1 }}>
            {DOC_TYPE_OPTIONS.map((opt) => {
              const active = opt.value === docType;
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
                    {DOC_ICONS[opt.value]}
                  </ListItemIcon>
                  <ListItemText
                    primary={opt.label}
                    slotProps={{
                      primary: { variant: 'body2', sx: { fontWeight: active ? 700 : 500 } },
                    }}
                  />
                </ListItemButton>
              );
            })}
          </List>

          {/* Description of selected type */}
          <Box sx={{ px: 2, pt: 2, pb: 3, mt: 'auto' }}>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
              {selectedOption.description}
            </Typography>
          </Box>
        </Box>

        {/* ── Main content ── */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 3, bgcolor: 'background.default' }}>
          <Grid container spacing={3} sx={{ alignItems: 'flex-start', height: '100%' }}>
            {/* LEFT — upload + preview */}
            <Grid size={{ xs: 12, xl: 5, lg: 6 }}>
              <Card sx={{ position: 'sticky', top: 0 }}>
                <CardContent>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                    {hasResult ? 'Document Preview' : 'Upload Document'}
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <DocumentUploader
                    key={docType}
                    docType={docType}
                    onResult={handleResult}
                    onReset={handleReset}
                    hasResult={hasResult}
                  />
                </CardContent>
              </Card>
            </Grid>

            {/* RIGHT — extracted fields + raw OCR text */}
            <Grid size={{ xs: 12, xl: 7, lg: 6 }}>
              <Card sx={{ minHeight: 480 }}>
                <CardContent>
                  {hasResult && fields && rawText !== null ? (
                    <OcrResultPanel rawText={rawText} fields={fields} />
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
                      <Typography
                        variant="body2"
                        sx={{ color: 'text.disabled', maxWidth: 300 }}
                      >
                        Upload a scanned document on the left and click{' '}
                        <strong>Run OCR</strong> to extract and verify its fields here.
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

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
