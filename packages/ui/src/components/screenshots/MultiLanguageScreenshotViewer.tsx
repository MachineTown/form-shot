import { useState, useEffect } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Paper,
  Typography,
  CircularProgress,
  Divider,
  IconButton,
  Dialog,
  DialogContent,
  DialogTitle,
  Tooltip,
  Stack,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import Carousel from 'react-material-ui-carousel';
import {
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Close as CloseIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { useGetAnalysisWithFormsQuery, useGetFormFieldsQuery } from '../../store/services/firestoreApi';
import { SurveyAnalysis } from '../../store/services/firestoreApi';

interface MultiLanguageScreenshotViewerProps {
  analysesMap: Map<string, SurveyAnalysis>;
  primaryLanguage: string;
  availableLanguages: string[];
}

const MultiLanguageScreenshotViewer: React.FC<MultiLanguageScreenshotViewerProps> = ({ 
  analysesMap, 
  primaryLanguage, 
  availableLanguages 
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [selectedFormIndex, setSelectedFormIndex] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [selectedSecondaryLanguage, setSelectedSecondaryLanguage] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<{ url: string; language: string } | null>(null);
  const [imageZoom, setImageZoom] = useState(1);

  // Get non-primary languages for the tab panel
  const secondaryLanguages = availableLanguages.filter(lang => lang !== primaryLanguage);
  
  // Set initial language selections
  useEffect(() => {
    if (isMobile) {
      // On mobile, show primary language by default
      if (!selectedLanguage) {
        setSelectedLanguage(primaryLanguage);
      }
    } else {
      // On desktop, set initial secondary language
      if (secondaryLanguages.length > 0 && !selectedSecondaryLanguage) {
        setSelectedSecondaryLanguage(secondaryLanguages[0]);
      }
    }
  }, [secondaryLanguages, selectedSecondaryLanguage, selectedLanguage, isMobile, primaryLanguage]);

  // Get primary language analysis data
  const primaryAnalysis = analysesMap.get(primaryLanguage);
  const { data: primaryData, isLoading: primaryLoading } = useGetAnalysisWithFormsQuery(
    primaryAnalysis?.id || '',
    { skip: !primaryAnalysis }
  );

  // Get selected language data for mobile view
  const selectedAnalysis = isMobile ? analysesMap.get(selectedLanguage) : analysesMap.get(selectedSecondaryLanguage);
  const { data: selectedData, isLoading: selectedLoading } = useGetAnalysisWithFormsQuery(
    selectedAnalysis?.id || '',
    { skip: !selectedAnalysis }
  );

  // Get fields for primary language
  const primaryForm = primaryData?.forms[selectedFormIndex];
  const { data: primaryFields, isLoading: primaryFieldsLoading } = useGetFormFieldsQuery(
    { analysisId: primaryAnalysis?.id || '', formId: primaryForm?.id || '' },
    { skip: !primaryForm || !primaryAnalysis }
  );

  // Get fields for selected language (mobile) or secondary language (desktop)
  const selectedForm = selectedData?.forms[selectedFormIndex];
  const { data: selectedFields, isLoading: selectedFieldsLoading } = useGetFormFieldsQuery(
    { analysisId: selectedAnalysis?.id || '', formId: selectedForm?.id || '' },
    { skip: !selectedForm || !selectedAnalysis }
  );

  const handleFormTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setSelectedFormIndex(newValue);
  };

  const handleLanguageChange = (event: React.SyntheticEvent, newValue: string) => {
    if (isMobile) {
      setSelectedLanguage(newValue);
    } else {
      setSelectedSecondaryLanguage(newValue);
    }
  };

  const handleImageClick = (url: string, language: string) => {
    setSelectedImage({ url, language });
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

  if (primaryLoading || (selectedAnalysis && selectedLoading)) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!primaryData || !primaryData.forms.length) {
    return (
      <Typography variant="body1" color="text.secondary">
        No forms found for this analysis.
      </Typography>
    );
  }

  // Render screenshot section for a specific language
  const renderLanguageSection = (
    data: typeof primaryData,
    fields: typeof primaryFields,
    fieldsLoading: boolean,
    language: string,
    form: typeof primaryForm,
    isRightColumn: boolean = false
  ) => {
    if (!form) return null;

    return (
      <Box sx={{ width: '100%', overflow: 'hidden' }}>
        
        {/* On-Entry/On-Exit Screenshots */}
        {(form.onEntryScreenshotUrl || form.onExitScreenshotUrl) && (
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
                mx: 'auto',
              }}
            >
              {form.onEntryScreenshotUrl && (
                <Paper
                  sx={{
                    p: 1,
                    cursor: 'pointer',
                  }}
                  onClick={() => handleImageClick(form.onEntryScreenshotUrl, language)}
                >
                  <Typography variant="subtitle2" gutterBottom align="center">
                    On-Entry Screenshot
                  </Typography>
                  <Box
                    component="img"
                    src={form.onEntryScreenshotUrl}
                    alt="On-Entry"
                    sx={{
                      width: '100%',
                      height: 300,
                      objectFit: 'contain',
                      bgcolor: 'grey.100',
                    }}
                  />
                </Paper>
              )}
              
              {form.onExitScreenshotUrl && (
                <Paper
                  sx={{
                    p: 1,
                    cursor: 'pointer',
                  }}
                  onClick={() => handleImageClick(form.onExitScreenshotUrl, language)}
                >
                  <Typography variant="subtitle2" gutterBottom align="center">
                    On-Exit Screenshot
                  </Typography>
                  <Box
                    component="img"
                    src={form.onExitScreenshotUrl}
                    alt="On-Exit"
                    sx={{
                      width: '100%',
                      height: 300,
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
        <Typography variant="subtitle1" gutterBottom>
          Field Screenshots
        </Typography>
        
        {fieldsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : fields && fields.length > 0 ? (
          <Box sx={{ width: '100%' }}>
            {fields.map((field) => (
              <Paper
                key={field.id}
                sx={{
                  mb: 2,
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
                onClick={() => handleImageClick(field.screenshotUrl, language)}
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
                      height: 250,
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
    );
  };

  return (
    <Box sx={{ width: '100%', maxWidth: '100vw', overflow: 'hidden' }}>
      {/* Form Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={selectedFormIndex}
          onChange={handleFormTabChange}
          variant="scrollable"
          scrollButtons="auto"
        >
          {primaryData.forms.map((form, index) => (
            <Tab
              key={form.id}
              label={`Form ${index + 1}: ${form.shortName}`}
              wrapped
            />
          ))}
        </Tabs>
      </Paper>

      {isMobile ? (
        // Mobile Layout - All languages in tabs
        <Box>
          {/* Language Tabs */}
          <Paper sx={{ mb: 2 }}>
            <Tabs
              value={selectedLanguage}
              onChange={handleLanguageChange}
              variant="scrollable"
              scrollButtons="auto"
            >
              {availableLanguages.map((lang) => (
                <Tab
                  key={lang}
                  value={lang}
                  label={lang.toUpperCase()}
                />
              ))}
            </Tabs>
          </Paper>
          
          {/* Selected Language Content */}
          {selectedLanguage && (() => {
            const analysis = analysesMap.get(selectedLanguage);
            const form = selectedData?.forms[selectedFormIndex];
            const fields = selectedLanguage === primaryLanguage ? primaryFields : selectedFields;
            const fieldsLoading = selectedLanguage === primaryLanguage ? primaryFieldsLoading : selectedFieldsLoading;
            
            return renderLanguageSection(
              selectedData || primaryData,
              fields,
              fieldsLoading,
              selectedLanguage,
              form,
              false
            );
          })()}
        </Box>
      ) : (
        // Desktop Layout - Side by side
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr',
          gap: 2,
          alignItems: 'start',
          width: '100%',
          maxWidth: '100%',
          overflow: 'hidden',
        }}>
          {/* Primary Language (Left Column) */}
          <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
            {/* Add spacing to align with right column tabs */}
            {secondaryLanguages.length > 1 && (
              <Box sx={{ height: 48, mb: 2 }} />
            )}
            {renderLanguageSection(
              primaryData,
              primaryFields,
              primaryFieldsLoading,
              primaryLanguage,
              primaryForm,
              false
            )}
          </Box>

          {/* Secondary Languages (Right Column) */}
          {secondaryLanguages.length > 0 && (
            <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
              {/* Language Tabs (only if more than one secondary language) */}
              {secondaryLanguages.length > 1 && (
                <Paper sx={{ mb: 2 }}>
                  <Tabs
                    value={selectedSecondaryLanguage}
                    onChange={handleLanguageChange}
                    variant="scrollable"
                    scrollButtons="auto"
                  >
                    {secondaryLanguages.map((lang) => (
                      <Tab
                        key={lang}
                        value={lang}
                        label={lang.toUpperCase()}
                      />
                    ))}
                  </Tabs>
                </Paper>
              )}
              
              {/* Secondary Language Content */}
              {selectedSecondaryLanguage && selectedData && renderLanguageSection(
                selectedData,
                selectedFields,
                selectedFieldsLoading,
                selectedSecondaryLanguage,
                selectedForm,
                true
              )}
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
            <Typography variant="h6">
              Screenshot Viewer - {selectedImage?.language.toUpperCase()}
            </Typography>
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
                src={selectedImage.url}
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

export default MultiLanguageScreenshotViewer;