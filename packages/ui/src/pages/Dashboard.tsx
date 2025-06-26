import { 
  Box, 
  Typography, 
  Grid, 
  Card, 
  CardContent,
  CardMedia,
  Chip,
} from '@mui/material';
import { 
  Assessment as AssessmentIcon,
  People as PeopleIcon,
  Science as ScienceIcon,
  Folder as FolderIcon,
  Language as LanguageIcon,
  Schedule as ScheduleIcon,
  Description as DescriptionIcon,
  Preview as PreviewIcon,
} from '@mui/icons-material';
import { useGetCustomersQuery, useGetAnalysesQuery } from '../store/services/firestoreApi';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { data: customers, isLoading: customersLoading } = useGetCustomersQuery();
  const { data: analyses, isLoading: analysesLoading } = useGetAnalysesQuery({ limit: 10 });

  // Group analyses by package
  const groupedPackages = useMemo(() => {
    if (!analyses) return [];
    
    // First, get latest version for each customer/study/package/language combination
    const latestVersionMap = new Map<string, typeof analyses[0]>();
    
    analyses.forEach(analysis => {
      const key = `${analysis.customerId}/${analysis.studyId}/${analysis.packageName}/${analysis.language}`;
      const existing = latestVersionMap.get(key);
      
      if (!existing || 
          (analysis.analysisDate?.toMillis ? analysis.analysisDate.toMillis() : new Date(analysis.analysisDate as any).getTime()) >
          (existing.analysisDate?.toMillis ? existing.analysisDate.toMillis() : new Date(existing.analysisDate as any).getTime())) {
        latestVersionMap.set(key, analysis);
      }
    });
    
    // Now group by package name
    const packageGroups = new Map<string, {
      packageName: string;
      analyses: typeof analyses;
      latestDate: Date;
      primaryAnalysis: typeof analyses[0];
    }>();
    
    Array.from(latestVersionMap.values()).forEach(analysis => {
      const packageKey = `${analysis.customerId}/${analysis.studyId}/${analysis.packageName}`;
      const existing = packageGroups.get(packageKey);
      
      if (existing) {
        existing.analyses.push(analysis);
        const analysisDate = analysis.analysisDate?.toDate ? analysis.analysisDate.toDate() : new Date(analysis.analysisDate as any);
        if (analysisDate > existing.latestDate) {
          existing.latestDate = analysisDate;
          existing.primaryAnalysis = analysis;
        }
      } else {
        packageGroups.set(packageKey, {
          packageName: analysis.packageName,
          analyses: [analysis],
          latestDate: analysis.analysisDate?.toDate ? analysis.analysisDate.toDate() : new Date(analysis.analysisDate as any),
          primaryAnalysis: analysis
        });
      }
    });
    
    // Convert to array and sort by date
    return Array.from(packageGroups.values())
      .sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime())
      .slice(0, 6);
  }, [analyses]);

  const stats = {
    totalCustomers: customers?.length || 0,
    totalAnalyses: analyses?.length || 0,
    activeStudies: new Set(analyses?.map(a => a.studyId)).size,
    totalPackages: new Set(analyses?.map(a => a.packageName)).size,
  };

  const handlePackageClick = (packageGroup: typeof groupedPackages[0], language?: string) => {
    const analysis = language 
      ? packageGroup.analyses.find(a => a.language === language) || packageGroup.primaryAnalysis
      : packageGroup.primaryAnalysis;
    
    // If clicking a specific language chip, navigate to that language
    // If clicking the card and there's only one language, navigate to that language
    // If clicking the card and there are multiple languages, navigate without language
    if (language || packageGroup.analyses.length === 1) {
      navigate(`/analysis/${analysis.customerId}/${analysis.studyId}/${analysis.packageName}/${analysis.language}`);
    } else {
      navigate(`/analysis/${analysis.customerId}/${analysis.studyId}/${analysis.packageName}`);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      
      <Grid container spacing={3}>
        {/* Stats Cards */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
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
        
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
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
        
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
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
        
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
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
        <Grid size={12}>
          <Typography variant="h5" gutterBottom sx={{ mt: 2 }}>
            Recent Analyses
          </Typography>
          <Grid container spacing={2}>
            {groupedPackages.map((packageGroup) => {
              const primaryAnalysis = packageGroup.primaryAnalysis;
              const packageKey = `${primaryAnalysis.customerId}/${primaryAnalysis.studyId}/${primaryAnalysis.packageName}`;
              
              return (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={packageKey}>
                  <Card
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      overflow: 'hidden',
                      bgcolor: 'grey.100',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: 4,
                      },
                    }}
                    onClick={() => handlePackageClick(packageGroup)}
                  >
                    {/* Top bar with chips */}
                    <Box
                      sx={{
                        bgcolor: 'grey.100',
                        px: 1.5,
                        py: 0.75,
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        borderBottom: 1,
                        borderColor: 'divider',
                      }}
                    >
                      {/* Language chips */}
                      <Box
                        sx={{
                          display: 'flex',
                          gap: 0.5,
                          flexWrap: 'wrap',
                        }}
                      >
                        {packageGroup.analyses
                          .sort((a, b) => a.language.localeCompare(b.language))
                          .map((analysis) => (
                            <Chip
                              key={analysis.language}
                              label={analysis.language.toUpperCase()}
                              size="small"
                              color="primary"
                              icon={<LanguageIcon />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePackageClick(packageGroup, analysis.language);
                              }}
                            />
                          ))}
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
                      {primaryAnalysis.firstFormOnEntryScreenshotUrl ? (
                        <Box
                          component="img"
                          src={primaryAnalysis.firstFormOnEntryScreenshotUrl}
                          alt={`${primaryAnalysis.packageName} preview`}
                          sx={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: 'top',
                          }}
                        />
                      ) : (
                        <PreviewIcon sx={{ fontSize: 48, color: 'grey.400' }} />
                      )}
                    </CardMedia>

                    <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography gutterBottom variant="h6" component="div">
                          {primaryAnalysis.packageName}
                        </Typography>
                        
                        <Typography variant="body2" color="text.secondary">
                          {primaryAnalysis.longTitle || primaryAnalysis.shortName}
                        </Typography>
                      </Box>

                      {/* Bottom row with field count and date */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <DescriptionIcon sx={{ fontSize: 16, mr: 0.5 }} color="action" />
                          <Typography variant="caption" color="text.secondary">
                            {primaryAnalysis.fieldsCount} fields
                          </Typography>
                        </Box>
                        
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <ScheduleIcon sx={{ fontSize: 16, mr: 0.5 }} color="action" />
                          <Typography variant="caption" color="text.secondary">
                            {packageGroup.latestDate.toLocaleDateString()}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;