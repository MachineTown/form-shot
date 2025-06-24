import { useState, useEffect } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Paper,
  IconButton,
  Dialog,
  DialogContent,
  DialogTitle,
  Typography,
  CircularProgress,
  useTheme,
  useMediaQuery,
  Tooltip,
  Stack,
} from '@mui/material';
import Carousel from 'react-material-ui-carousel';
import {
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Fullscreen as FullscreenIcon,
  Close as CloseIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { useGetAnalysisWithFormsQuery, useGetFormFieldsQuery } from '../../store/services/firestoreApi';

interface ScreenshotViewerProps {
  analysisId: string;
}

const ScreenshotViewer: React.FC<ScreenshotViewerProps> = ({ analysisId }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [selectedFormIndex, setSelectedFormIndex] = useState(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  
  const { data, isLoading } = useGetAnalysisWithFormsQuery(analysisId);
  const selectedForm = data?.forms[selectedFormIndex];
  
  const { data: fields, isLoading: fieldsLoading } = useGetFormFieldsQuery(
    { analysisId, formId: selectedForm?.id || '' },
    { skip: !selectedForm }
  );

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setSelectedFormIndex(newValue);
    setSelectedImage(null);
  };

  const handleImageClick = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setImageZoom(1);
  };

  const handleCloseDialog = () => {
    setSelectedImage(null);
    setImageZoom(1);
  };

  const handleZoomIn = () => {
    setImageZoom(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setImageZoom(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!data || !data.forms.length) {
    return (
      <Typography variant="body1" color="text.secondary">
        No forms found for this analysis.
      </Typography>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
      {/* Form Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={selectedFormIndex}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
        >
          {data.forms.map((form, index) => (
            <Tab
              key={form.id}
              label={`Form ${index + 1}: ${form.shortName}`}
              wrapped
            />
          ))}
        </Tabs>
      </Paper>

      {/* Form Screenshots */}
      {selectedForm && (
        <Box sx={{ width: '100%', overflow: 'hidden' }}>
          {/* On-Entry/On-Exit Screenshots */}
          {(selectedForm.onEntryScreenshotUrl || selectedForm.onExitScreenshotUrl) && (
            <Box sx={{ mb: 3 }}>
              <Carousel
                autoPlay={false}
                cycleNavigation={false}
                navButtonsAlwaysInvisible
                indicators={true}
                animation="slide"
                swipe={true}
                sx={{
                  width: '100%',
                  maxWidth: isMobile ? '100%' : '600px',
                  mx: 'auto',
                }}
              >
                {selectedForm.onEntryScreenshotUrl && (
                  <Paper
                    sx={{
                      p: 2,
                      cursor: 'pointer',
                    }}
                    onClick={() => handleImageClick(selectedForm.onEntryScreenshotUrl)}
                  >
                    <Typography variant="subtitle2" gutterBottom align="center">
                      On-Entry Screenshot
                    </Typography>
                    <Box
                      component="img"
                      src={selectedForm.onEntryScreenshotUrl}
                      alt="On-Entry"
                      sx={{
                        width: '100%',
                        height: 400,
                        objectFit: 'contain',
                        bgcolor: 'grey.100',
                      }}
                    />
                  </Paper>
                )}
                
                {selectedForm.onExitScreenshotUrl && (
                  <Paper
                    sx={{
                      p: 2,
                      cursor: 'pointer',
                    }}
                    onClick={() => handleImageClick(selectedForm.onExitScreenshotUrl)}
                  >
                    <Typography variant="subtitle2" gutterBottom align="center">
                      On-Exit Screenshot
                    </Typography>
                    <Box
                      component="img"
                      src={selectedForm.onExitScreenshotUrl}
                      alt="On-Exit"
                      sx={{
                        width: '100%',
                        height: 400,
                        objectFit: 'contain',
                        bgcolor: 'grey.100',
                      }}
                    />
                  </Paper>
                )}
              </Carousel>
            </Box>
          )}

          {/* Field Screenshots */}
          <Typography variant="h6" gutterBottom>
            Field Screenshots
          </Typography>
          
          {fieldsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : fields && fields.length > 0 ? (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, minmax(0, 1fr))',
                },
                gap: 2,
                width: '100%',
                maxWidth: '100%',
                overflow: 'hidden',
              }}
            >
              {fields.map((field) => (
                <Paper
                  key={field.id}
                  sx={{
                    p: 1,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    width: '100%',
                    overflow: 'hidden',
                    '&:hover': { 
                      boxShadow: 3,
                      transform: 'translateY(-2px)',
                    },
                  }}
                  onClick={() => handleImageClick(field.screenshotUrl)}
                >
                  <Stack spacing={1}>
                    <Box sx={{ p: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" noWrap>
                            {field.questionNumber} {field.questionText}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {field.inputType} {field.isRequired && '• Required'}
                          </Typography>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(field.screenshotUrl, field.screenshotFilename);
                          }}
                          sx={{ ml: 1 }}
                        >
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                    <Box
                      component="img"
                      src={field.screenshotUrl}
                      alt={field.questionText}
                      loading="lazy"
                      sx={{
                        width: '100%',
                        height: 300,
                        objectFit: 'contain',
                        bgcolor: 'grey.100',
                        borderRadius: 1,
                      }}
                    />
                    {field.choices && field.choices.length > 0 && (
                      <Box sx={{ px: 1, pb: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          {field.choices.length} choices
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                </Paper>
              ))}
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', p: 4 }}>
              <Typography variant="body2" color="text.secondary">
                No screenshots available
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Full Screen Dialog */}
      <Dialog
        open={!!selectedImage}
        onClose={handleCloseDialog}
        maxWidth={false}
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'background.default',
            position: 'fixed',
            margin: 0,
            top: '8px',
            left: '8px',
            right: '8px',
            bottom: '8px',
            width: 'calc(100vw - 16px)',
            height: 'calc(100vh - 16px)',
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: 'calc(100vh - 16px)',
          },
        }}
      >
        <DialogTitle sx={{ m: 0, p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">Screenshot Viewer</Typography>
            <Box>
              <Tooltip title="Zoom In">
                <IconButton onClick={handleZoomIn} disabled={imageZoom >= 3}>
                  <ZoomInIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Zoom Out">
                <IconButton onClick={handleZoomOut} disabled={imageZoom <= 0.5}>
                  <ZoomOutIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Close">
                <IconButton onClick={handleCloseDialog}>
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 1, overflow: 'auto', height: 'calc(100% - 64px)' }}>
          {selectedImage && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                height: '100%',
                p: 1,
              }}
            >
              <Box
                component="img"
                src={selectedImage}
                alt="Full screen view"
                sx={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  transform: `scale(${imageZoom})`,
                  transition: 'transform 0.3s',
                  transformOrigin: 'center',
                }}
              />
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default ScreenshotViewer;