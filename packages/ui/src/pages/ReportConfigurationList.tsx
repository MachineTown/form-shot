import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Container,
  Stack,
  Snackbar,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import ConfigurationList from '../components/reports/ConfigurationList';
import SaveConfigDialog from '../components/reports/SaveConfigDialog';
import {
  useListConfigurationsQuery,
  useDeleteConfigurationMutation,
  useCreateConfigurationMutation,
  useSetDefaultConfigurationMutation,
} from '../store/services/reportApi';
import { ReportConfiguration } from '@form-shot/shared/src/types/report-types';
import { useAuth } from '../contexts/AuthContext';

const ReportConfigurationList: React.FC = () => {
  const { customerId, studyId, packageName } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error' | 'info'>('success');
  
  // RTK Query hooks
  const { data: configurations, isLoading, refetch } = useListConfigurationsQuery({
    filters: {
      customerId: customerId!,
      studyId: studyId!,
      packageName: packageName!,
    },
  });
  
  const [deleteConfiguration] = useDeleteConfigurationMutation();
  const [createConfiguration] = useCreateConfigurationMutation();
  const [setDefaultConfiguration] = useSetDefaultConfigurationMutation();
  
  const handleLoad = (config: ReportConfiguration) => {
    // Navigate to report generation page
    // TODO: Implement report generation page/dialog
    // For now, show a message that this feature is coming soon
    setSnackbarMessage('Report generation feature coming soon');
    setSnackbarSeverity('info');
    setSnackbarOpen(true);
    
    // Future implementation would navigate to:
    // navigate(`/analysis/${customerId}/${studyId}/${packageName}/generate/${config.id}`);
  };
  
  const handleEdit = (config: ReportConfiguration) => {
    navigate(`/analysis/${customerId}/${studyId}/${packageName}/report/${config.id}`);
  };
  
  const handleDelete = async (configId: string) => {
    try {
      await deleteConfiguration(configId).unwrap();
      setSnackbarMessage('Configuration deleted successfully');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      refetch();
    } catch (error) {
      console.error('Failed to delete configuration:', error);
      setSnackbarMessage('Failed to delete configuration');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };
  
  const handleDuplicate = async (config: ReportConfiguration) => {
    try {
      const duplicatedConfig = {
        ...config,
        name: `${config.name} (Copy)`,
        description: config.description,
        customerId: customerId!,
        studyId: studyId!,
        packageName: packageName!,
        isDefault: false,
        createdBy: user?.email || 'unknown',
      };
      
      // Remove id and timestamps from the duplicated config
      const { id, createdAt, updatedAt, lastGeneratedAt, ...configData } = duplicatedConfig;
      
      await createConfiguration(configData).unwrap();
      setSnackbarMessage('Configuration duplicated successfully');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      refetch();
    } catch (error) {
      console.error('Failed to duplicate configuration:', error);
      setSnackbarMessage('Failed to duplicate configuration');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };
  
  const handleSetDefault = async (configId: string) => {
    try {
      await setDefaultConfiguration({
        configId,
        customerId: customerId!,
        studyId: studyId!,
        packageName: packageName!,
      }).unwrap();
      setSnackbarMessage('Default configuration updated');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      refetch();
    } catch (error) {
      console.error('Failed to set default configuration:', error);
      setSnackbarMessage('Failed to set default configuration');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };
  
  const handleCreateNew = () => {
    navigate(`/analysis/${customerId}/${studyId}/${packageName}/report`);
  };
  
  const handleBack = () => {
    navigate(`/analysis/${customerId}/${studyId}/${packageName}`);
  };
  
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }
  
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        {/* Header */}
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={handleBack}
            >
              Back to Package
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleCreateNew}
            >
              Create New Configuration
            </Button>
          </Stack>
          <Typography variant="h4" gutterBottom>
            Report Configurations
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            {customerId} / {studyId} / {packageName}
          </Typography>
        </Box>
        
        {/* Configuration List */}
        {configurations && configurations.length > 0 ? (
          <ConfigurationList
            configurations={configurations}
            onLoad={handleLoad}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onSetDefault={handleSetDefault}
          />
        ) : (
          <Alert severity="info">
            No saved configurations yet. Create your first configuration to get started.
          </Alert>
        )}
      </Stack>
      
      {/* Success/Error Snackbar */}
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

export default ReportConfigurationList;