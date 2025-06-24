import { useParams } from 'react-router-dom';
import { Box, Typography, Paper, Tabs, Tab } from '@mui/material';
import { useState } from 'react';
import ScreenshotViewer from '../components/screenshots/ScreenshotViewer';
import { useGetAnalysesQuery } from '../store/services/firestoreApi';

const PackageDetail: React.FC = () => {
  const { customerId, studyId, packageName } = useParams();
  const [selectedTab, setSelectedTab] = useState(0);

  // Find the specific analysis
  const { data: analyses } = useGetAnalysesQuery({
    customerId,
    studyId,
    packageName,
  });

  const analysis = analyses?.[0];

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue);
  };

  if (!analysis) {
    return (
      <Box>
        <Typography variant="h5">Package not found</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {analysis.longTitle || analysis.packageName}
      </Typography>
      
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        {customerId} / {studyId} / {packageName}
      </Typography>

      <Paper sx={{ mt: 2 }}>
        <Tabs value={selectedTab} onChange={handleTabChange}>
          <Tab label="Screenshots" />
          <Tab label="Test Data" />
          <Tab label="Metadata" />
        </Tabs>

        <Box sx={{ p: 2 }}>
          {selectedTab === 0 && (
            <ScreenshotViewer analysisId={analysis.id} />
          )}
          {selectedTab === 1 && (
            <Typography>Test Data View (Coming Soon)</Typography>
          )}
          {selectedTab === 2 && (
            <Box>
              <Typography variant="body2">
                <strong>Analysis Date:</strong> {new Date(analysis.analysisDate.toDate()).toLocaleString()}
              </Typography>
              <Typography variant="body2">
                <strong>URL:</strong> {analysis.url}
              </Typography>
              <Typography variant="body2">
                <strong>Fields Count:</strong> {analysis.fieldsCount}
              </Typography>
              <Typography variant="body2">
                <strong>Viewport Height:</strong> {analysis.viewportHeight}px
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default PackageDetail;