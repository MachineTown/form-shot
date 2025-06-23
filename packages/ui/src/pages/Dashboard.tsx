import { 
  Box, 
  Typography, 
  Grid, 
  Card, 
  CardContent,
  CardActions,
  Button,
  Chip,
} from '@mui/material';
import { 
  Assessment as AssessmentIcon,
  People as PeopleIcon,
  Science as ScienceIcon,
  Folder as FolderIcon,
} from '@mui/icons-material';
import { useGetCustomersQuery, useGetAnalysesQuery } from '../store/services/firestoreApi';

const Dashboard: React.FC = () => {
  const { data: customers, isLoading: customersLoading } = useGetCustomersQuery();
  const { data: analyses, isLoading: analysesLoading } = useGetAnalysesQuery({ limit: 10 });

  const stats = {
    totalCustomers: customers?.length || 0,
    totalAnalyses: analyses?.length || 0,
    activeStudies: new Set(analyses?.map(a => a.studyId)).size,
    totalPackages: new Set(analyses?.map(a => a.packageName)).size,
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      
      <Grid container spacing={3}>
        {/* Stats Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <PeopleIcon color="primary" sx={{ mr: 1 }} />
                <Typography color="text.secondary" gutterBottom>
                  Customers
                </Typography>
              </Box>
              <Typography variant="h4">
                {stats.totalCustomers}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <AssessmentIcon color="primary" sx={{ mr: 1 }} />
                <Typography color="text.secondary" gutterBottom>
                  Total Analyses
                </Typography>
              </Box>
              <Typography variant="h4">
                {stats.totalAnalyses}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <ScienceIcon color="primary" sx={{ mr: 1 }} />
                <Typography color="text.secondary" gutterBottom>
                  Active Studies
                </Typography>
              </Box>
              <Typography variant="h4">
                {stats.activeStudies}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <FolderIcon color="primary" sx={{ mr: 1 }} />
                <Typography color="text.secondary" gutterBottom>
                  Packages
                </Typography>
              </Box>
              <Typography variant="h4">
                {stats.totalPackages}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Analyses */}
        <Grid item xs={12}>
          <Typography variant="h5" gutterBottom sx={{ mt: 2 }}>
            Recent Analyses
          </Typography>
          <Grid container spacing={2}>
            {analyses?.slice(0, 6).map((analysis) => (
              <Grid item xs={12} sm={6} md={4} key={analysis.id}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {analysis.packageName}
                    </Typography>
                    <Typography color="text.secondary" variant="body2">
                      {analysis.customerId} / {analysis.studyId}
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                      <Chip 
                        label={analysis.language} 
                        size="small" 
                        sx={{ mr: 1 }}
                      />
                      <Chip 
                        label={analysis.version} 
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                      {analysis.fieldsCount} fields • {new Date(analysis.analysisDate.toDate()).toLocaleDateString()}
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Button size="small" href={`/analysis/${analysis.customerId}/${analysis.studyId}/${analysis.packageName}`}>
                      View Details
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;