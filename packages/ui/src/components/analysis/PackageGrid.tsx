import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid,
  Card,
  CardContent,
  CardMedia,
  Typography,
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
  Check as CheckIcon,
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
  const [studyFilter, setStudyFilter] = useState<string>(studyId || 'all');
  const [sortBy, setSortBy] = useState<'date-asc' | 'date-desc' | 'name'>('date-asc');

  const { data: analyses, isLoading, error } = useGetAnalysesQuery({
    customerId,
    studyId,
  });

  // Update study filter when studyId prop changes
  useEffect(() => {
    setStudyFilter(studyId || 'all');
  }, [studyId]);

  // Debug logging
  console.log('PackageGrid debug:', {
    customerId,
    studyId,
    analyses,
    isLoading,
    error,
    analysesLength: analyses?.length
  });

  // Extract unique languages and studies for filters
  const languages = useMemo(() => {
    if (!analyses) return [];
    const langs = new Set(analyses.map(a => a.language));
    return Array.from(langs).sort();
  }, [analyses]);

  const studies = useMemo(() => {
    if (!analyses) return [];
    const studySet = new Set(analyses.map(a => a.studyId));
    return Array.from(studySet).sort();
  }, [analyses]);

  // Filter and sort analyses
  const filteredAnalyses = useMemo(() => {
    if (!analyses) return [];
    
    // Create a shallow copy to avoid mutating the immutable array
    let filtered = [...analyses];
    
    // Apply language filter
    if (languageFilter !== 'all') {
      filtered = filtered.filter(a => a.language === languageFilter);
    }
    
    // Apply study filter
    if (studyFilter !== 'all') {
      filtered = filtered.filter(a => a.studyId === studyFilter);
    }

    return filtered.sort((a, b) => {
      if (sortBy === 'date-asc' || sortBy === 'date-desc') {
        // Handle both Timestamp objects and already converted dates
        const dateA = a.analysisDate?.toMillis ? a.analysisDate.toMillis() : new Date(a.analysisDate as any).getTime();
        const dateB = b.analysisDate?.toMillis ? b.analysisDate.toMillis() : new Date(b.analysisDate as any).getTime();
        return sortBy === 'date-asc' ? dateA - dateB : dateB - dateA;
      } else {
        return a.packageName.localeCompare(b.packageName);
      }
    });
  }, [analyses, languageFilter, studyFilter, sortBy]);

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

  if (error) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="h6" color="error" gutterBottom>
          Error loading analyses
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {error.toString()}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Filters */}
      <Stack 
        direction={{ xs: 'column', sm: 'row' }} 
        spacing={2} 
        sx={{ mb: 3 }}
      >
        <TextField
          select
          size="small"
          label="Study"
          value={studyFilter}
          onChange={(e) => setStudyFilter(e.target.value)}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="all">All Studies</MenuItem>
          {studies.map((study) => (
            <MenuItem key={study} value={study}>
              {study}
            </MenuItem>
          ))}
        </TextField>

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
          onChange={(e) => setSortBy(e.target.value as 'date-asc' | 'date-desc' | 'name')}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="date-asc">Oldest First</MenuItem>
          <MenuItem value="date-desc">Newest First</MenuItem>
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
                overflow: 'hidden',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4,
                },
              }}
              onClick={() => handlePackageClick(analysis)}
            >
              {/* Top bar with chips */}
              <Box
                sx={{
                  bgcolor: 'grey.100',
                  px: 1.5,
                  py: 0.75,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                {/* Test data chip on the left */}
                <Box>
                  {analysis.hasTestData ? (
                    <Chip
                      label="Test Data"
                      size="small"
                      color="success"
                      icon={<CheckIcon />}
                    />
                  ) : (
                    <Box /> // Empty box to maintain layout
                  )}
                </Box>
                
                {/* Language and version chips on the right */}
                <Box
                  sx={{
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
              </Box>

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
                  overflow: 'hidden',
                }}
              >
                {analysis.firstFormOnEntryScreenshotUrl ? (
                  <Box
                    component="img"
                    src={analysis.firstFormOnEntryScreenshotUrl}
                    alt={`${analysis.packageName} preview`}
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <PreviewIcon sx={{ fontSize: 48, color: 'grey.400' }} />
                )}
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
                      {analysis.analysisDate?.toDate 
                        ? new Date(analysis.analysisDate.toDate()).toLocaleDateString()
                        : new Date(analysis.analysisDate as any).toLocaleDateString()}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
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
            {(languageFilter !== 'all' || studyFilter !== 'all') 
              ? 'Try changing the filters' 
              : 'No analyses available'}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default PackageGrid;