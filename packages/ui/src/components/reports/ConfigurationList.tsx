import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  IconButton,
  Chip,
  Stack,
  Grid,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Alert,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import DescriptionIcon from '@mui/icons-material/Description';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { ReportConfiguration } from '@form-shot/shared/src/types/report-types';

// Simple date formatter (replace with date-fns when available)
const formatDistanceToNow = (date: Date, options?: { addSuffix?: boolean }) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  let result = '';
  if (days > 0) {
    result = `${days} day${days > 1 ? 's' : ''}`;
  } else if (hours > 0) {
    result = `${hours} hour${hours > 1 ? 's' : ''}`;
  } else if (minutes > 0) {
    result = `${minutes} minute${minutes > 1 ? 's' : ''}`;
  } else {
    result = `${seconds} second${seconds > 1 ? 's' : ''}`;
  }
  
  return options?.addSuffix ? `${result} ago` : result;
};

interface ConfigurationListProps {
  configurations: ReportConfiguration[];
  onLoad: (config: ReportConfiguration) => void;
  onEdit: (config: ReportConfiguration) => void;
  onDelete: (configId: string) => Promise<void>;
  onDuplicate: (config: ReportConfiguration) => Promise<void>;
  onSetDefault: (configId: string) => Promise<void>;
  isLoading?: boolean;
}

const ConfigurationList: React.FC<ConfigurationListProps> = ({
  configurations,
  onLoad,
  onEdit,
  onDelete,
  onDuplicate,
  onSetDefault,
  isLoading = false,
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedConfig, setSelectedConfig] = useState<ReportConfiguration | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<ReportConfiguration | null>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, config: ReportConfiguration) => {
    setAnchorEl(event.currentTarget);
    setSelectedConfig(config);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedConfig(null);
  };

  const handleDelete = async () => {
    if (!configToDelete) return;
    
    setDeleteLoading(true);
    try {
      await onDelete(configToDelete.id);
      setDeleteDialogOpen(false);
      setConfigToDelete(null);
    } catch (error) {
      console.error('Failed to delete configuration:', error);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDuplicate = async () => {
    if (!selectedConfig) return;
    
    try {
      await onDuplicate(selectedConfig);
      handleMenuClose();
    } catch (error) {
      console.error('Failed to duplicate configuration:', error);
    }
  };

  const handleSetDefault = async () => {
    if (!selectedConfig) return;
    
    try {
      await onSetDefault(selectedConfig.id);
      handleMenuClose();
    } catch (error) {
      console.error('Failed to set default configuration:', error);
    }
  };

  const formatDate = (date: any): string => {
    if (!date) return 'Unknown';
    
    const timestamp = date.toDate ? date.toDate() : new Date(date);
    return formatDistanceToNow(timestamp, { addSuffix: true });
  };

  if (configurations.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <DescriptionIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No Saved Configurations
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Save your first report configuration to see it here
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Grid container spacing={3}>
        {configurations.map((config) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={config.id}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                ...(config.isDefault && {
                  borderColor: 'primary.main',
                  borderWidth: 2,
                }),
              }}
              variant={config.isDefault ? 'outlined' : 'elevation'}
            >
              {config.isDefault && (
                <Chip
                  icon={<StarIcon />}
                  label="Default"
                  color="primary"
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 48,
                  }}
                />
              )}
              
              <IconButton
                size="small"
                onClick={(e) => handleMenuOpen(e, config)}
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                }}
              >
                <MoreVertIcon />
              </IconButton>

              <CardContent sx={{ flexGrow: 1, pt: 4 }}>
                <Typography variant="h6" gutterBottom>
                  {config.name}
                </Typography>
                
                {config.description && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mb: 2,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {config.description}
                  </Typography>
                )}

                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Chip
                      label={`${config.formOrder?.length || 0} forms`}
                      size="small"
                      variant="outlined"
                    />
                    <Chip
                      label={`${config.selectedLanguages?.length || 0} languages`}
                      size="small"
                      variant="outlined"
                    />
                    {config.pageOrientation && (
                      <Chip
                        label={config.pageOrientation}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Stack>

                  <Stack direction="row" spacing={1} alignItems="center">
                    <CalendarTodayIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary">
                      Updated {formatDate(config.updatedAt)}
                    </Typography>
                  </Stack>

                  {config.lastGeneratedAt && (
                    <Typography variant="caption" color="text.secondary">
                      Last generated {formatDate(config.lastGeneratedAt)}
                    </Typography>
                  )}
                </Stack>
              </CardContent>

              <CardActions>
                <Button
                  size="small"
                  onClick={() => onLoad(config)}
                  variant="contained"
                >
                  Generate Report
                </Button>
                <Button
                  size="small"
                  onClick={() => onEdit(config)}
                  startIcon={<EditIcon />}
                >
                  Edit
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        {selectedConfig && !selectedConfig.isDefault && (
          <MenuItem onClick={handleSetDefault}>
            <StarBorderIcon sx={{ mr: 1 }} fontSize="small" />
            Set as Default
          </MenuItem>
        )}
        <MenuItem onClick={handleDuplicate}>
          <ContentCopyIcon sx={{ mr: 1 }} fontSize="small" />
          Duplicate
        </MenuItem>
        <MenuItem
          onClick={() => {
            setConfigToDelete(selectedConfig);
            setDeleteDialogOpen(true);
            handleMenuClose();
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
          Delete
        </MenuItem>
      </Menu>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setConfigToDelete(null);
        }}
      >
        <DialogTitle>Delete Configuration?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone.
          </Alert>
          <Typography>
            Are you sure you want to delete the configuration "{configToDelete?.name}"?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setDeleteDialogOpen(false);
            setConfigToDelete(null);
          }} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={deleteLoading}
          >
            {deleteLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ConfigurationList;