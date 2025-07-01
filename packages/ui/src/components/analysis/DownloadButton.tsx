import { useState } from 'react';
import {
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Box,
  LinearProgress,
  Typography,
  Divider,
  Alert,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Archive as ArchiveIcon,
  Folder as FolderIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { 
  downloadStudyZip, 
  downloadPackageZip,
  pollDownloadStatus,
  type DownloadRequest,
  type DownloadStatus 
} from '../../services/functions';

interface DownloadButtonProps {
  customerId: string;
  studyId: string;
  packageName?: string; // If provided, this is a package-level button
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

interface DownloadState {
  isDownloading: boolean;
  requestId?: string;
  progress?: number;
  status?: DownloadStatus;
  error?: string;
}

const DownloadButton: React.FC<DownloadButtonProps> = ({ 
  customerId, 
  studyId, 
  packageName,
  disabled = false,
  size = 'medium'
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>({
    isDownloading: false
  });

  const isMenuOpen = Boolean(anchorEl);
  const isPackageLevel = !!packageName;

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation(); // Prevent card click
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const initiateDownload = async (downloadType: 'study' | 'package', includeMetadata = false) => {
    try {
      handleClose();
      setDownloadState({ isDownloading: true, error: undefined });

      const request: DownloadRequest = {
        customerId,
        studyId,
        ...(downloadType === 'package' && packageName && { packageName }),
        includeMetadata
      };

      // Start the download
      const response = downloadType === 'study' 
        ? await downloadStudyZip(request)
        : await downloadPackageZip(request);

      setDownloadState(prev => ({
        ...prev,
        requestId: response.requestId,
        progress: 0
      }));

      // Poll for status updates
      const finalStatus = await pollDownloadStatus(
        response.requestId,
        (status) => {
          setDownloadState(prev => ({
            ...prev,
            progress: status.progress,
            status
          }));
        }
      );

      setDownloadState(prev => ({
        ...prev,
        status: finalStatus,
        isDownloading: false
      }));

      // Auto-download the file if completed successfully
      if (finalStatus.status === 'completed' && finalStatus.downloadUrl) {
        const link = document.createElement('a');
        link.href = finalStatus.downloadUrl;
        link.download = response.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clear success state after a delay
        setTimeout(() => {
          setDownloadState({ isDownloading: false });
        }, 3000);
      }

    } catch (error) {
      console.error('Download failed:', error);
      setDownloadState({
        isDownloading: false,
        error: error instanceof Error ? error.message : 'Download failed'
      });

      // Clear error state after a delay
      setTimeout(() => {
        setDownloadState({ isDownloading: false });
      }, 5000);
    }
  };

  const getTooltipText = () => {
    if (downloadState.isDownloading) {
      return `Downloading... ${downloadState.progress || 0}%`;
    }
    if (downloadState.status?.status === 'completed') {
      return 'Download completed!';
    }
    if (downloadState.error) {
      return `Error: ${downloadState.error}`;
    }
    return isPackageLevel 
      ? 'Download package screenshots'
      : 'Download study screenshots';
  };

  const getIconColor = () => {
    if (downloadState.status?.status === 'completed') return 'success';
    if (downloadState.error) return 'error';
    return 'default';
  };

  const renderIcon = () => {
    if (downloadState.isDownloading) {
      return (
        <Box sx={{ position: 'relative', display: 'flex' }}>
          <CircularProgress 
            size={20} 
            variant={downloadState.progress ? 'determinate' : 'indeterminate'}
            value={downloadState.progress}
          />
        </Box>
      );
    }
    if (downloadState.status?.status === 'completed') {
      return <CheckCircleIcon color="success" />;
    }
    if (downloadState.error) {
      return <ErrorIcon color="error" />;
    }
    return <DownloadIcon />;
  };

  return (
    <>
      <Tooltip title={getTooltipText()}>
        <span> {/* Span wrapper needed for disabled tooltip */}
          <IconButton
            size={size}
            onClick={handleClick}
            disabled={disabled || downloadState.isDownloading}
            color={getIconColor() as any}
            sx={{ 
              ml: size === 'small' ? 0.5 : 1,
              '&.Mui-disabled': {
                opacity: 0.6
              }
            }}
          >
            {renderIcon()}
          </IconButton>
        </span>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={isMenuOpen}
        onClose={handleClose}
        onClick={(e) => e.stopPropagation()}
        PaperProps={{
          sx: { minWidth: 200 }
        }}
      >
        {/* Package Downloads */}
        {isPackageLevel ? (
          <>
            <MenuItem onClick={() => initiateDownload('package', false)}>
              <ListItemIcon>
                <ArchiveIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText 
                primary="Download Package"
                secondary="Screenshots only"
              />
            </MenuItem>
            <MenuItem onClick={() => initiateDownload('package', true)}>
              <ListItemIcon>
                <ArchiveIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText 
                primary="Package + Metadata"
                secondary="With analysis data"
              />
            </MenuItem>
          </>
        ) : (
          /* Study Downloads */
          <>
            <MenuItem onClick={() => initiateDownload('study', false)}>
              <ListItemIcon>
                <FolderIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText 
                primary="Download Study"
                secondary="All packages, screenshots only"
              />
            </MenuItem>
            <MenuItem onClick={() => initiateDownload('study', true)}>
              <ListItemIcon>
                <FolderIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText 
                primary="Study + Metadata"
                secondary="All packages with analysis data"
              />
            </MenuItem>
          </>
        )}
        
        {downloadState.isDownloading && (
          <>
            <Divider />
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Progress: {downloadState.progress || 0}%
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={downloadState.progress || 0}
                sx={{ mt: 0.5 }}
              />
              {downloadState.status?.totalFiles && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {downloadState.status.totalFiles} files
                </Typography>
              )}
            </Box>
          </>
        )}

        {downloadState.error && (
          <>
            <Divider />
            <Box sx={{ px: 2, py: 1 }}>
              <Alert severity="error" sx={{ fontSize: '0.75rem' }}>
                {downloadState.error}
              </Alert>
            </Box>
          </>
        )}
      </Menu>
    </>
  );
};

export default DownloadButton;