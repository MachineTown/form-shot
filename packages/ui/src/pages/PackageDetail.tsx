import { useParams } from 'react-router-dom';
import { Box, Typography, CircularProgress } from '@mui/material';
import { useMemo } from 'react';
import ScreenshotViewer from '../components/screenshots/ScreenshotViewer';
import MultiLanguageScreenshotViewer from '../components/screenshots/MultiLanguageScreenshotViewer';
import { useGetAnalysesQuery, SurveyAnalysis } from '../store/services/firestoreApi';

const PackageDetail: React.FC = () => {
  const { customerId, studyId, packageName, language } = useParams();

  // Get all analyses for this package to check for multiple languages
  const { data: allAnalyses, isLoading: allAnalysesLoading } = useGetAnalysesQuery({
    customerId,
    studyId,
    packageName,
  });

  // Get specific language analysis if provided
  const { data: languageAnalyses, isLoading: languageLoading } = useGetAnalysesQuery({
    customerId,
    studyId,
    packageName,
    language,
  });

  // Process analyses to get latest version for each language
  const languageAnalysesMap = useMemo(() => {
    if (!allAnalyses) return new Map<string, SurveyAnalysis>();
    
    const latestByLanguage = new Map<string, SurveyAnalysis>();
    
    allAnalyses.forEach(analysis => {
      const existing = latestByLanguage.get(analysis.language);
      if (!existing || 
          (analysis.analysisDate?.toMillis ? analysis.analysisDate.toMillis() : new Date(analysis.analysisDate as any).getTime()) >
          (existing.analysisDate?.toMillis ? existing.analysisDate.toMillis() : new Date(existing.analysisDate as any).getTime())) {
        latestByLanguage.set(analysis.language, analysis);
      }
    });
    
    return latestByLanguage;
  }, [allAnalyses]);

  const availableLanguages = Array.from(languageAnalysesMap.keys()).sort();
  const hasMultipleLanguages = availableLanguages.length > 1;
  
  // Determine primary language (EN if exists, otherwise oldest)
  const primaryLanguage = useMemo(() => {
    if (hasMultipleLanguages) {
      if (languageAnalysesMap.has('en')) {
        return 'en';
      }
      // Get oldest analysis
      let oldestAnalysis: SurveyAnalysis | null = null;
      let oldestDate = Infinity;
      languageAnalysesMap.forEach(analysis => {
        const date = analysis.analysisDate?.toMillis ? analysis.analysisDate.toMillis() : new Date(analysis.analysisDate as any).getTime();
        if (date < oldestDate) {
          oldestDate = date;
          oldestAnalysis = analysis;
        }
      });
      return (oldestAnalysis as SurveyAnalysis | null)?.language || availableLanguages[0];
    }
    return language || availableLanguages[0];
  }, [languageAnalysesMap, hasMultipleLanguages, language, availableLanguages]);

  const currentAnalysis = language ? languageAnalyses?.[0] : languageAnalysesMap.get(primaryLanguage);

  if (allAnalysesLoading || languageLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!currentAnalysis) {
    return (
      <Box>
        <Typography variant="h5">Package not found</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {customerId} / {studyId} / {packageName}
        {!hasMultipleLanguages && ` / ${currentAnalysis.language.toUpperCase()}`}
      </Typography>
      
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        {hasMultipleLanguages 
          ? `Available in ${availableLanguages.length} languages: ${availableLanguages.map(l => l.toUpperCase()).join(', ')}`
          : new Date(currentAnalysis.analysisDate.toDate()).toLocaleString()
        }
      </Typography>

      <Box sx={{ mt: 2 }}>
        {hasMultipleLanguages ? (
          <MultiLanguageScreenshotViewer 
            analysesMap={languageAnalysesMap}
            primaryLanguage={primaryLanguage}
            availableLanguages={availableLanguages}
          />
        ) : (
          <ScreenshotViewer analysisId={currentAnalysis.id} />
        )}
      </Box>
    </Box>
  );
};

export default PackageDetail;