'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Tooltip,
  Collapse,
  Button,
  Stack,
  Alert,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  IconButton,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VerifiedIcon from '@mui/icons-material/Verified';

interface Props {
  rawText: string;
  fields: Record<string, { label: string; value: string | null }>;
}

type FieldStatus = 'pending' | 'ok' | 'warning';

const STATUS_CYCLE: Record<FieldStatus, FieldStatus> = {
  pending: 'ok',
  ok: 'warning',
  warning: 'pending',
};

const STATUS_TOOLTIP: Record<FieldStatus, string> = {
  pending: 'Click to mark as verified',
  ok: 'Click to flag as an issue',
  warning: 'Click to reset to pending',
};

function StatusChip({
  status,
  onClick,
}: {
  status: FieldStatus;
  onClick: () => void;
}) {
  const config = ({
    pending: {
      icon: <RadioButtonUncheckedIcon />,
      label: 'Pending',
      color: 'default' as const,
      variant: 'outlined' as const,
    },
    ok: {
      icon: <CheckCircleIcon />,
      label: 'Verified',
      color: 'success' as const,
      variant: 'filled' as const,
    },
    warning: {
      icon: <WarningAmberIcon />,
      label: 'Flagged',
      color: 'warning' as const,
      variant: 'filled' as const,
    },
  } as Record<string, { icon: React.ReactElement; label: string; color: 'default' | 'success' | 'warning'; variant: 'outlined' | 'filled' }>)[status ?? 'pending'] ?? {
    icon: <RadioButtonUncheckedIcon />,
    label: 'Pending',
    color: 'default' as const,
    variant: 'outlined' as const,
  };

  return (
    <Tooltip title={STATUS_TOOLTIP[status]} placement="left">
      <Chip
        icon={config.icon}
        label={config.label}
        color={config.color}
        variant={config.variant}
        size="small"
        onClick={onClick}
        clickable
        sx={{ cursor: 'pointer', fontWeight: 600 }}
      />
    </Tooltip>
  );
}

export default function OcrResultPanel({ rawText, fields }: Props) {
  const fieldKeys = Object.keys(fields);

  const [statuses, setStatuses] = useState<Record<string, FieldStatus>>(
    () =>
      Object.fromEntries(
        fieldKeys.map((k) => [k, fields[k].value ? 'pending' : 'warning'])
      )
  );
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Reset statuses whenever the fields prop changes (e.g. after re-running OCR).
  // The first render after fields change is guarded by the `?? 'pending'` fallback
  // in the table — this effect cleans up old keys and sets the correct initial state.
  useEffect(() => {
    setStatuses(
      Object.fromEntries(
        Object.keys(fields).map((k) => [k, fields[k].value ? 'pending' : 'warning'])
      )
    );
  }, [fields]);

  function cycleStatus(key: string) {
    setStatuses((prev) => ({ ...prev, [key]: STATUS_CYCLE[prev[key]] }));
  }

  function doVerifyAll() {
    setStatuses(Object.fromEntries(fieldKeys.map((k) => [k, 'ok'])));
    setConfirmOpen(false);
  }

  function copyRaw() {
    navigator.clipboard.writeText(rawText ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const verified = fieldKeys.filter((k) => statuses[k] === 'ok').length;
  const flagged  = fieldKeys.filter((k) => statuses[k] === 'warning').length;
  const missing  = fieldKeys.filter((k) => !fields[k].value).length;

  return (
    <Box>
      {/* ── Confirm dialog ── */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Verify all fields?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This marks all <strong>{fieldKeys.length} fields</strong> as verified — including
            any not detected by OCR. Only confirm after manually reviewing the document.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={doVerifyAll} variant="contained" color="success">
            Yes, verify all
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Summary bar ── */}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Extracted Fields
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Chip label={`${verified} / ${fieldKeys.length} verified`} color="success" size="small" />
        {flagged > 0 && <Chip label={`${flagged} flagged`} color="warning" size="small" />}
        {missing > 0 && (
          <Chip label={`${missing} not found`} size="small" variant="outlined" />
        )}
        <Tooltip title="Marks every field as verified — use only after manual review">
          <span>
            <Button
              variant="outlined"
              size="small"
              startIcon={<VerifiedIcon />}
              onClick={() => setConfirmOpen(true)}
              disabled={verified === fieldKeys.length}
              color="success"
            >
              Verify All
            </Button>
          </span>
        </Tooltip>
      </Stack>

      {missing > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {missing} field{missing > 1 ? 's were' : ' was'} not detected — review manually before
          verifying.
        </Alert>
      )}

      {/* ── Field table ── */}
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 700, width: '32%' }}>Field</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Extracted Value</TableCell>
              <TableCell sx={{ fontWeight: 700, width: '130px' }}>
                Status
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ display: 'block', color: 'text.disabled', fontWeight: 400 }}
                >
                  click to change
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {fieldKeys.map((key) => {
              const { label, value } = fields[key];
              const status: FieldStatus = statuses[key] ?? 'pending';
              return (
                <TableRow
                  key={key}
                  sx={{
                    bgcolor:
                      status === 'ok'
                        ? 'success.50'
                        : status === 'warning'
                        ? 'warning.50'
                        : undefined,
                    transition: 'background-color 0.15s',
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      {label}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {value ? (
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {value}
                      </Typography>
                    ) : (
                      <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                        Not detected
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusChip status={status} onClick={() => cycleStatus(key)} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── Raw OCR text ── */}
      <Divider sx={{ my: 2 }} />
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Button
          size="small"
          variant="text"
          color="inherit"
          startIcon={showRaw ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          onClick={() => setShowRaw((v) => !v)}
        >
          {showRaw ? 'Hide' : 'Show'} raw OCR text
        </Button>
        {showRaw && (
          <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
            <IconButton size="small" onClick={copyRaw}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <Collapse in={showRaw}>
        <Box
          component="pre"
          sx={{
            mt: 1,
            p: 2,
            bgcolor: 'grey.900',
            color: 'grey.100',
            borderRadius: 2,
            fontSize: '0.72rem',
            overflow: 'auto',
            maxHeight: 320,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'monospace',
          }}
        >
          {rawText || '(no text returned)'}
        </Box>
      </Collapse>
    </Box>
  );
}
