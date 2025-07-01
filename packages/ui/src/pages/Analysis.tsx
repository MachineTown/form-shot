import { useParams } from 'react-router-dom';
import { Box, Typography, Stack } from '@mui/material';
import PackageGrid from '../components/analysis/PackageGrid';
import DownloadButton from '../components/analysis/DownloadButton';

const Analysis: React.FC = () => {
  const { customerId, studyId } = useParams();

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Analysis Explorer
          </Typography>
          
          {customerId && (
            <Typography variant="subtitle1" color="text.secondary" gutterBottom>
              Customer: {customerId} {studyId && `• Study: ${studyId}`}
            </Typography>
          )}
        </Box>

        {/* Study-level download button when viewing a specific study */}
        {customerId && studyId && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Download Study:
            </Typography>
            <DownloadButton
              customerId={customerId}
              studyId={studyId}
            />
          </Box>
        )}
      </Stack>

      <PackageGrid customerId={customerId} studyId={studyId} />
    </Box>
  );
};

export default Analysis;