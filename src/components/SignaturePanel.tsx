'use client';

import {
  Box,
  Typography,
  Chip,
  Tooltip,
  Stack,
  Divider,
  Button,
  Alert,
  Grid,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import GestureIcon from '@mui/icons-material/Gesture';
import { SignatureEntry, SignatureStatus } from '@/lib/types';

interface Props {
  signatures: SignatureEntry[];
  onStatusChange: (id: string, status: SignatureStatus) => void;
  onClearAll: () => void;
}

const STATUS_CYCLE: Record<SignatureStatus, SignatureStatus> = {
  pending: 'ok',
  ok: 'warning',
  warning: 'pending',
};

const STATUS_TOOLTIP: Record<SignatureStatus, string> = {
  pending: 'Click to mark as verified',
  ok: 'Click to flag as an issue',
  warning: 'Click to reset to pending',
};

function SigChip({
  status,
  onClick,
}: {
  status: SignatureStatus;
  onClick: () => void;
}) {
  const cfg = {
    pending: { icon: <RadioButtonUncheckedIcon />, label: 'Pending', color: 'default' as const, variant: 'outlined' as const },
    ok:      { icon: <CheckCircleIcon />,          label: 'Verified', color: 'success' as const, variant: 'filled'   as const },
    warning: { icon: <WarningAmberIcon />,          label: 'Flagged',  color: 'warning' as const, variant: 'filled'   as const },
  }[status];

  return (
    <Tooltip title={STATUS_TOOLTIP[status]}>
      <Chip
        icon={cfg.icon}
        label={cfg.label}
        color={cfg.color}
        variant={cfg.variant}
        size="small"
        onClick={onClick}
        clickable
        sx={{ cursor: 'pointer', fontWeight: 600 }}
      />
    </Tooltip>
  );
}

export default function SignaturePanel({ signatures, onStatusChange, onClearAll }: Props) {
  if (signatures.length === 0) {
    return (
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
        <GestureIcon sx={{ fontSize: 72, color: 'grey.200' }} />
        <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 600 }}>
          No signatures captured yet
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.disabled', maxWidth: 300 }}>
          Run OCR on any image document — signature areas will be automatically
          cropped and collected here for visual verification.
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          (PDF documents are not supported for auto-crop — verify those manually)
        </Typography>
      </Box>
    );
  }

  const pending  = signatures.filter((s) => s.status === 'pending').length;
  const flagged  = signatures.filter((s) => s.status === 'warning').length;
  const verified = signatures.filter((s) => s.status === 'ok').length;

  // Group by doc label + file name
  const groups = signatures.reduce<Record<string, SignatureEntry[]>>((acc, sig) => {
    const key = `${sig.docLabel} — ${sig.fileName}`;
    (acc[key] ??= []).push(sig);
    return acc;
  }, {});

  return (
    <Box>
      {/* Summary bar */}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Signatures
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Chip label={`${verified} verified`} color="success" size="small" />
        {flagged  > 0 && <Chip label={`${flagged} flagged`}  color="warning" size="small" />}
        {pending  > 0 && <Chip label={`${pending} pending`}  size="small" variant="outlined" />}
        <Tooltip title="Remove all captured signature crops">
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={onClearAll}
          >
            Clear all
          </Button>
        </Tooltip>
      </Stack>

      {flagged > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {flagged} signature{flagged > 1 ? 's are' : ' is'} flagged — review before completing
          the audit.
        </Alert>
      )}

      {/* Signature groups */}
      {Object.entries(groups).map(([groupKey, sigs]) => (
        <Box key={groupKey} sx={{ mb: 3 }}>
          <Typography
            variant="overline"
            sx={{ color: 'text.disabled', fontWeight: 700, letterSpacing: 1.1 }}
          >
            {groupKey}
          </Typography>
          <Divider sx={{ mb: 1.5, mt: 0.5 }} />

          <Grid container spacing={2}>
            {sigs.map((sig) => (
              <Grid key={sig.id} size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    border: '1px solid',
                    borderColor:
                      sig.status === 'ok'
                        ? 'success.300'
                        : sig.status === 'warning'
                        ? 'warning.300'
                        : 'grey.200',
                    borderRadius: 2,
                    overflow: 'hidden',
                    bgcolor: 'white',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <Box
                    sx={{
                      bgcolor: 'grey.50',
                      borderBottom: '1px solid',
                      borderColor: 'grey.100',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 90,
                      p: 1,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sig.imageDataUrl}
                      alt={sig.label}
                      style={{
                        maxWidth: '100%',
                        maxHeight: 120,
                        objectFit: 'contain',
                        display: 'block',
                      }}
                    />
                  </Box>

                  {/* Label + status chip */}
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: 'center', px: 1.5, py: 1 }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ flex: 1, fontWeight: 600, color: 'text.secondary' }}
                    >
                      {sig.label}
                    </Typography>
                    <SigChip
                      status={sig.status}
                      onClick={() =>
                        onStatusChange(sig.id, STATUS_CYCLE[sig.status])
                      }
                    />
                  </Stack>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}
    </Box>
  );
}
