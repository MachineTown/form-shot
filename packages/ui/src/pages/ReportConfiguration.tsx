import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Alert,
  Container,
  Stack,
  Divider,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Snackbar,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import PreviewIcon from '@mui/icons-material/Preview';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import FormList from '../components/reports/FormList';
import LanguageSelector from '../components/reports/LanguageSelector';
import SaveConfigDialog from '../components/reports/SaveConfigDialog';
import {
  useGetAvailableFormsQuery,
  useGetAvailableLanguagesQuery,
  useCreateConfigurationMutation,
  useUpdateConfigurationMutation,
  useGetConfigurationQuery,
  useListConfigurationsQuery,
} from '../store/services/reportApi';
import { ReportForm, LanguageOption } from '@form-shot/shared/src/types/report-types';
import { useAuth } from '../contexts/AuthContext';

const ReportConfiguration: React.FC = () => {
  const { customerId, studyId, packageName, configId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // State for configuration
  const [configName, setConfigName] = useState('');
  const [configDescription, setConfigDescription] = useState('');
  const [configIsDefault, setConfigIsDefault] = useState(false);
  const [selectedForms, setSelectedForms] = useState<string[]>([]);
  const [formOrder, setFormOrder] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [pageOrientation, setPageOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [pageSize, setPageSize] = useState<'A4' | 'Letter' | 'Legal'>('A4');
  const [screenshotType, setScreenshotType] = useState<'on-exit' | 'on-entry' | 'both'>('on-exit');
  
  // UI state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');


  // RTK Query hooks
  const { data: existingConfig, isLoading: configLoading } = useGetConfigurationQuery(
    configId || '',
    { skip: !configId }
  );

  const { data: availableLanguages, isLoading: languagesLoading } = useGetAvailableLanguagesQuery({
    customerId: customerId!,
    studyId: studyId!,
    packageName: packageName!,
  });

  const { data: availableForms, isLoading: formsLoading } = useGetAvailableFormsQuery({
    customerId: customerId!,
    studyId: studyId!,
    packageName: packageName!,
    language: availableLanguages?.[0]?.code || 'en',
  });

  const [createConfiguration, { isLoading: creating }] = useCreateConfigurationMutation();
  const [updateConfiguration, { isLoading: updating }] = useUpdateConfigurationMutation();
  
  const { data: savedConfigurations } = useListConfigurationsQuery({
    filters: {
      customerId: customerId!,
      studyId: studyId!,
      packageName: packageName!,
    },
  });

  // Load existing configuration if editing
  useEffect(() => {
    if (existingConfig) {
      setConfigName(existingConfig.name);
      setConfigDescription(existingConfig.description || '');
      setConfigIsDefault(existingConfig.isDefault || false);
      setFormOrder(existingConfig.formOrder);
      setSelectedForms(existingConfig.formOrder);
      setSelectedLanguages(existingConfig.selectedLanguages);
      setIncludeMetadata(existingConfig.includeMetadata);
      setPageOrientation(existingConfig.pageOrientation);
      setPageSize(existingConfig.pageSize);
      setScreenshotType(existingConfig.screenshotType);
    }
  }, [existingConfig]);

  // Initialize with all forms selected by default
  useEffect(() => {
    if (availableForms && !configId) {
      const allFormIds = availableForms.map(f => f.id);
      setSelectedForms(allFormIds);
      setFormOrder(allFormIds);
    }
  }, [availableForms, configId]);

  // Initialize with first language selected by default
  useEffect(() => {
    if (availableLanguages && availableLanguages.length > 0 && !configId) {
      setSelectedLanguages([availableLanguages[0].code]);
    }
  }, [availableLanguages, configId]);

  const handleSaveConfig = async (name: string, description: string, isDefault: boolean) => {
    if (selectedForms.length === 0) {
      const errorMsg = 'Please select at least one form';
      setSnackbarMessage(errorMsg);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      throw new Error(errorMsg);
    }

    if (selectedLanguages.length === 0) {
      const errorMsg = 'Please select at least one language';
      setSnackbarMessage(errorMsg);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      throw new Error(errorMsg);
    }

    try {
      // Only include selected forms in the saved configuration
      const selectedFormOrder = formOrder.filter(id => selectedForms.includes(id));
      
      const configData = {
        customerId: customerId!,
        studyId: studyId!,
        packageName: packageName!,
        name,
        description,
        formOrder: selectedFormOrder,
        selectedLanguages,
        includeMetadata,
        pageOrientation,
        pageSize,
        screenshotType,
        includeQuestionScreenshots: false,
        isDefault,
        createdBy: user?.email || 'unknown',
      };

      if (configId) {
        await updateConfiguration({
          configId,
          input: configData,
        }).unwrap();
        setSnackbarMessage('Configuration updated successfully');
      } else {
        await createConfiguration(configData).unwrap();
        setSnackbarMessage('Configuration saved successfully');
      }
      
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      setSaveDialogOpen(false);
      
      // Navigate to the reports management page after successful save
      setTimeout(() => {
        navigate(`/analysis/${customerId}/${studyId}/${packageName}/reports`);
      }, 100);
      
    } catch (error: any) {
      const errorMessage = error?.data?.error || error?.message || 'Failed to save configuration';
      setSnackbarMessage(errorMessage);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      throw new Error(errorMessage);
    }
  };

  const handleCancel = () => {
    navigate(`/analysis/${customerId}/${studyId}/${packageName}`);
  };

  const handleFormSelectionChange = (selectedFormIds: string[]) => {
    setSelectedForms(selectedFormIds);
    // Update formOrder to include only selected forms, maintaining existing order
    const newOrder = formOrder.filter(id => selectedFormIds.includes(id));
    // Add any newly selected forms at the end
    const newForms = selectedFormIds.filter(id => !newOrder.includes(id));
    setFormOrder([...newOrder, ...newForms]);
  };

  const handleFormOrderChange = (newOrder: string[]) => {
    // Only update the order, don't change selection
    // newOrder contains ALL forms in their new positions
    // We need to maintain the current selection
    setFormOrder(newOrder);
    // Don't change selectedForms here - maintain the current selection
  };

  const handleLanguageChange = (languages: string[]) => {
    setSelectedLanguages(languages);
  };

  if (configLoading || languagesLoading || formsLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!availableForms || !availableLanguages) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">
          Failed to load form data. Please try again.
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        {/* Header */}
        <Box>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={handleCancel}
            >
              Back to Package
            </Button>
            {savedConfigurations && savedConfigurations.length > 0 && (
              <Button
                startIcon={<FolderOpenIcon />}
                onClick={() => navigate(`/analysis/${customerId}/${studyId}/${packageName}/reports`)}
                variant="outlined"
              >
                View Saved Configurations ({savedConfigurations.length})
              </Button>
            )}
          </Stack>
          <Typography variant="h4" gutterBottom>
            {configId ? 'Edit Report Configuration' : 'Create Report Configuration'}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            {customerId} / {studyId} / {packageName}
          </Typography>
        </Box>

        <Divider />

        {/* Form Selection */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Select Forms
          </Typography>
          <FormList
            availableForms={availableForms}
            selectedForms={selectedForms}
            formOrder={formOrder}
            onSelectionChange={handleFormSelectionChange}
            onOrderChange={handleFormOrderChange}
          />
        </Paper>

        {/* Language Selection */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Select Languages
          </Typography>
          <LanguageSelector
            availableLanguages={availableLanguages}
            selectedLanguages={selectedLanguages}
            onLanguageChange={handleLanguageChange}
          />
        </Paper>

        {/* Report Settings */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Report Settings
          </Typography>
          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={includeMetadata}
                  onChange={(e) => setIncludeMetadata(e.target.checked)}
                />
              }
              label="Include form metadata in PDF"
            />
            
            <FormControl fullWidth>
              <InputLabel>Page Orientation</InputLabel>
              <Select
                value={pageOrientation}
                onChange={(e) => setPageOrientation(e.target.value as 'portrait' | 'landscape')}
                label="Page Orientation"
              >
                <MenuItem value="portrait">Portrait</MenuItem>
                <MenuItem value="landscape">Landscape</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Page Size</InputLabel>
              <Select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as 'A4' | 'Letter' | 'Legal')}
                label="Page Size"
              >
                <MenuItem value="A4">A4</MenuItem>
                <MenuItem value="Letter">Letter</MenuItem>
                <MenuItem value="Legal">Legal</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Screenshot Type</InputLabel>
              <Select
                value={screenshotType}
                onChange={(e) => setScreenshotType(e.target.value as 'on-exit' | 'on-entry' | 'both')}
                label="Screenshot Type"
              >
                <MenuItem value="on-exit">On Exit (After form completion)</MenuItem>
                <MenuItem value="on-entry">On Entry (Before form completion)</MenuItem>
                <MenuItem value="both">Both Entry and Exit</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Paper>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            onClick={handleCancel}
            disabled={creating || updating}
          >
            Cancel
          </Button>
          <Button
            variant="outlined"
            startIcon={<PreviewIcon />}
            disabled
            title="Preview will be available in future update"
          >
            Preview
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={() => setSaveDialogOpen(true)}
            disabled={creating || updating || selectedForms.length === 0 || selectedLanguages.length === 0}
          >
            {creating || updating ? 'Saving...' : 'Save Configuration'}
          </Button>
        </Box>
      </Stack>

      {/* Save Configuration Dialog */}
      <SaveConfigDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSave={handleSaveConfig}
        existingName={configName}
        existingDescription={configDescription}
        existingIsDefault={configIsDefault}
        isEdit={!!configId}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default ReportConfiguration;