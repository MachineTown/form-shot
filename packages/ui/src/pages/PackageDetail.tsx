import { useParams } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import ScreenshotViewer from '../components/screenshots/ScreenshotViewer';
import { useGetAnalysesQuery } from '../store/services/firestoreApi';

const PackageDetail: React.FC = () => {
  const { customerId, studyId, packageName, language } = useParams();

  // Find the specific analysis
  const { data: analyses } = useGetAnalysesQuery({
    customerId,
    studyId,
    packageName,
    language,
  });

  const analysis = analyses?.[0];

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
        {customerId} / {studyId} / {packageName} / {language?.toUpperCase()}
      </Typography>
      
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        {new Date(analysis.analysisDate.toDate()).toLocaleString()}
      </Typography>

      <Box sx={{ mt: 2 }}>
        <ScreenshotViewer analysisId={analysis.id} />
      </Box>
    </Box>
  );
};

export default PackageDetail;