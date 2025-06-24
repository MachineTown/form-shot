import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid,
  Card,
  CardContent,
  CardActions,
  CardMedia,
  Typography,
  Button,
  Chip,
  Box,
  Skeleton,
  TextField,
  MenuItem,
  Stack,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Language as LanguageIcon,
  Schedule as ScheduleIcon,
  Description as DescriptionIcon,
  Preview as PreviewIcon,
} from '@mui/icons-material';
import { useGetAnalysesQuery } from '../../store/services/firestoreApi';
import { useAppDispatch } from '../../hooks/redux';
import { addToRecentlyViewed } from '../../store/slices/navigationSlice';

interface PackageGridProps {
  customerId?: string;
  studyId?: string;
}

const PackageGrid: React.FC<PackageGridProps> = ({ customerId, studyId }) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');

  const { data: analyses, isLoading, error } = useGetAnalysesQuery({
    customerId,
    studyId,
  });

  // Debug logging
  console.log('PackageGrid debug:', {
    customerId,
    studyId,
    analyses,
    isLoading,
    error,
    analysesLength: analyses?.length
  });

  // Extract unique languages for filter
  const languages = useMemo(() => {
    if (!analyses) return [];
    const langs = new Set(analyses.map(a => a.language));
    return Array.from(langs).sort();
  }, [analyses]);

  // Filter and sort analyses
  const filteredAnalyses = useMemo(() => {
    if (!analyses) return [];
    
    let filtered = analyses;
    if (languageFilter !== 'all') {
      filtered = filtered.filter(a => a.language === languageFilter);
    }

    return filtered.sort((a, b) => {
      if (sortBy === 'date') {
        return b.analysisDate.toMillis() - a.analysisDate.toMillis();
      } else {
        return a.packageName.localeCompare(b.packageName);
      }
    });
  }, [analyses, languageFilter, sortBy]);

  const handlePackageClick = (analysis: typeof filteredAnalyses[0]) => {
    dispatch(addToRecentlyViewed({
      id: analysis.id,
      customerId: analysis.customerId,
      studyId: analysis.studyId,
      packageName: analysis.packageName,
    }));
    navigate(`/analysis/${analysis.customerId}/${analysis.studyId}/${analysis.packageName}`);
  };

  if (isLoading) {
    return (
      <Grid container spacing={3}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
            <Card>
              <Skeleton variant="rectangular" height={140} />
              <CardContent>
                <Skeleton variant="text" />
                <Skeleton variant="text" width="60%" />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    );
  }

  return (
    <Box>
      {/* Filters */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <TextField
          select
          size="small"
          label="Language"
          value={languageFilter}
          onChange={(e) => setLanguageFilter(e.target.value)}
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="all">All Languages</MenuItem>
          {languages.map((lang) => (
            <MenuItem key={lang} value={lang}>
              {lang.toUpperCase()}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          label="Sort By"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'date' | 'name')}
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="date">Recent First</MenuItem>
          <MenuItem value="name">Name (A-Z)</MenuItem>
        </TextField>
      </Stack>

      {/* Package Grid */}
      <Grid container spacing={3}>
        {filteredAnalyses.map((analysis) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={analysis.id}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer',
                transition: 'all 0.3s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4,
                },
              }}
              onClick={() => handlePackageClick(analysis)}
            >
              {/* Screenshot Preview */}
              <CardMedia
                component="div"
                sx={{
                  height: 140,
                  bgcolor: 'grey.200',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                <PreviewIcon sx={{ fontSize: 48, color: 'grey.400' }} />
                <Box
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    display: 'flex',
                    gap: 0.5,
                  }}
                >
                  <Chip
                    label={analysis.language.toUpperCase()}
                    size="small"
                    color="primary"
                    icon={<LanguageIcon />}
                  />
                  <Chip
                    label={analysis.version}
                    size="small"
                    variant="outlined"
                  />
                </Box>
              </CardMedia>

              <CardContent sx={{ flexGrow: 1 }}>
                <Typography gutterBottom variant="h6" component="div">
                  {analysis.packageName}
                </Typography>
                
                <Typography variant="body2" color="text.secondary">
                  {analysis.longTitle || analysis.shortName}
                </Typography>

                <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <DescriptionIcon sx={{ fontSize: 16, mr: 0.5 }} color="action" />
                    <Typography variant="caption">
                      {analysis.fieldsCount} fields
                    </Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <ScheduleIcon sx={{ fontSize: 16, mr: 0.5 }} color="action" />
                    <Typography variant="caption">
                      {new Date(analysis.analysisDate.toDate()).toLocaleDateString()}
                    </Typography>
                  </Box>
                </Box>

                {analysis.hasTestData && (
                  <Chip
                    label="Test Data Available"
                    size="small"
                    color="success"
                    sx={{ mt: 1 }}
                  />
                )}
              </CardContent>

              <CardActions>
                <Button size="small" fullWidth>
                  View Details
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {filteredAnalyses.length === 0 && (
        <Box
          sx={{
            textAlign: 'center',
            py: 8,
          }}
        >
          <Typography variant="h6" color="text.secondary">
            No packages found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {languageFilter !== 'all' ? 'Try changing the language filter' : 'No analyses available'}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default PackageGrid;