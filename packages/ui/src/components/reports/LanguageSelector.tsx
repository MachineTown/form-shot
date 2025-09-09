import React from 'react';
import {
  Box,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Typography,
  Paper,
  Stack,
  Chip,
  Grid,
  Button,
} from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { LanguageOption } from '@form-shot/shared/src/types/report-types';

interface LanguageSelectorProps {
  availableLanguages: LanguageOption[];
  selectedLanguages: string[];
  onLanguageChange: (languages: string[]) => void;
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  availableLanguages,
  selectedLanguages,
  onLanguageChange,
}) => {
  const handleToggle = (languageCode: string) => {
    const currentIndex = selectedLanguages.indexOf(languageCode);
    const newSelected = [...selectedLanguages];

    if (currentIndex === -1) {
      newSelected.push(languageCode);
    } else {
      newSelected.splice(currentIndex, 1);
    }

    onLanguageChange(newSelected);
  };

  const handleSelectAll = () => {
    onLanguageChange(availableLanguages.map(lang => lang.code));
  };

  const handleSelectNone = () => {
    onLanguageChange([]);
  };

  const getFlagEmoji = (languageCode: string): string => {
    // Map language codes to flag emojis (simplified)
    const flagMap: Record<string, string> = {
      en: '🇬🇧',
      es: '🇪🇸',
      fr: '🇫🇷',
      de: '🇩🇪',
      it: '🇮🇹',
      pt: '🇵🇹',
      nl: '🇳🇱',
      ja: '🇯🇵',
      zh: '🇨🇳',
      ko: '🇰🇷',
      ar: '🇸🇦',
      ru: '🇷🇺',
    };
    return flagMap[languageCode] || '🌐';
  };

  if (availableLanguages.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          No languages available for this package
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Button size="small" onClick={handleSelectAll}>
          Select All
        </Button>
        <Button size="small" onClick={handleSelectNone}>
          Clear Selection
        </Button>
        <Typography variant="body2" sx={{ ml: 'auto', alignSelf: 'center' }}>
          {selectedLanguages.length} of {availableLanguages.length} languages selected
        </Typography>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Grid container spacing={2}>
          {availableLanguages.map((language) => {
            const isSelected = selectedLanguages.includes(language.code);
            
            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={language.code}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    cursor: 'pointer',
                    border: isSelected ? 2 : 1,
                    borderColor: isSelected ? 'primary.main' : 'divider',
                    backgroundColor: isSelected ? 'action.selected' : 'background.paper',
                    '&:hover': {
                      backgroundColor: isSelected ? 'action.selected' : 'action.hover',
                    },
                    transition: 'all 0.2s',
                  }}
                  onClick={() => handleToggle(language.code)}
                >
                  <Stack spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={isSelected}
                            onChange={() => handleToggle(language.code)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                        label={
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="h6">
                              {getFlagEmoji(language.code)}
                            </Typography>
                            <Box>
                              <Typography variant="body1" fontWeight="medium">
                                {language.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {language.code.toUpperCase()}
                              </Typography>
                            </Box>
                          </Stack>
                        }
                        sx={{ m: 0, width: '100%' }}
                      />
                    </Stack>
                    
                    <Stack direction="row" spacing={0.5}>
                      {language.isAvailable && (
                        <Chip
                          icon={<CheckCircleIcon />}
                          label="Available"
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                      )}
                      {language.lastUpdated && (
                        <Chip
                          label={`Updated ${new Date(language.lastUpdated as any).toLocaleDateString()}`}
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Stack>
                  </Stack>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      </Paper>

      {selectedLanguages.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Selected languages for PDF generation:
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {selectedLanguages.map((code) => {
              const language = availableLanguages.find(l => l.code === code);
              return (
                <Chip
                  key={code}
                  icon={<LanguageIcon />}
                  label={`${getFlagEmoji(code)} ${language?.name || code}`}
                  size="small"
                  onDelete={() => handleToggle(code)}
                  color="primary"
                  variant="outlined"
                />
              );
            })}
          </Stack>
        </Box>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        Note: One PDF will be generated for each selected language
      </Typography>
    </Box>
  );
};

export default LanguageSelector;