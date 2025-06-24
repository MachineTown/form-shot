import { useParams } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import PackageGrid from '../components/analysis/PackageGrid';

const Analysis: React.FC = () => {
  const { customerId, studyId } = useParams();

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Analysis Explorer
      </Typography>
      
      {customerId && (
        <Typography variant="subtitle1" color="text.secondary" gutterBottom>
          Customer: {customerId} {studyId && `• Study: ${studyId}`}
        </Typography>
      )}

      <PackageGrid customerId={customerId} studyId={studyId} />
    </Box>
  );
};

export default Analysis;