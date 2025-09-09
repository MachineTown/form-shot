import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControlLabel,
  Checkbox,
  Stack,
  Alert,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';

interface SaveConfigDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, description: string, isDefault: boolean) => Promise<void>;
  existingName?: string;
  existingDescription?: string;
  existingIsDefault?: boolean;
  isEdit?: boolean;
}

const SaveConfigDialog: React.FC<SaveConfigDialogProps> = ({
  open,
  onClose,
  onSave,
  existingName = '',
  existingDescription = '',
  existingIsDefault = false,
  isEdit = false,
}) => {
  const [name, setName] = useState(existingName);
  const [description, setDescription] = useState(existingDescription);
  const [isDefault, setIsDefault] = useState(existingIsDefault);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update state when props change (e.g., when configuration data loads)
  useEffect(() => {
    if (open) {
      setName(existingName);
      setDescription(existingDescription);
      setIsDefault(existingIsDefault);
    }
  }, [open, existingName, existingDescription, existingIsDefault]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Configuration name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSave(name.trim(), description.trim(), isDefault);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setName(existingName);
      setDescription(existingDescription);
      setIsDefault(existingIsDefault);
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="save-config-dialog-title"
    >
      <DialogTitle id="save-config-dialog-title">
        {isEdit ? 'Edit Configuration' : 'Save Report Configuration'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          
          <TextField
            autoFocus
            label="Configuration Name"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Full Survey Report, Executive Summary"
            required
            error={!name.trim() && name !== ''}
            helperText={!name.trim() && name !== '' ? 'Name is required' : ''}
            disabled={loading}
          />
          
          <TextField
            label="Description (Optional)"
            fullWidth
            multiline
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the purpose or contents of this configuration"
            disabled={loading}
          />
          
          <FormControlLabel
            control={
              <Checkbox
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                disabled={loading}
              />
            }
            label="Set as default configuration for this package"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={loading || !name.trim()}
        >
          {loading ? 'Saving...' : isEdit ? 'Update' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SaveConfigDialog;