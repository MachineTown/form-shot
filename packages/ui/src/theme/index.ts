import { createTheme, ThemeOptions } from '@mui/material/styles';

// Custom breakpoints as per spec
declare module '@mui/material/styles' {
  interface BreakpointOverrides {
    xs: true; // 0px
    sm: true; // 320px
    md: true; // 768px
    lg: true; // 992px
    xl: true; // 1200px
  }

  interface Palette {
    hover?: Palette['primary'];
    focus?: Palette['primary'];
    selected?: Palette['primary'];
  }

  interface PaletteOptions {
    hover?: PaletteOptions['primary'];
    focus?: PaletteOptions['primary'];
    selected?: PaletteOptions['primary'];
  }
}

const lightThemeOptions: ThemeOptions = {
  breakpoints: {
    values: {
      xs: 0,
      sm: 320,
      md: 768,
      lg: 992,
      xl: 1200,
    },
  },
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
    },
    secondary: {
      main: '#dc004e',
      light: '#e33371',
      dark: '#9a0036',
    },
    hover: {
      main: '#f5f5f5',
      light: '#fafafa',
      dark: '#e0e0e0',
    },
    focus: {
      main: '#90caf9',
      light: '#bbdefb',
      dark: '#64b5f6',
    },
    selected: {
      main: '#e3f2fd',
      light: '#f3f9ff',
      dark: '#bbdefb',
    },
    background: {
      default: '#fafafa',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontSize: '2.5rem',
      fontWeight: 600,
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          '&:hover': {
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          width: 240,
          boxSizing: 'border-box',
        },
      },
    },
  },
};

const darkThemeOptions: ThemeOptions = {
  ...lightThemeOptions,
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
      light: '#bbdefb',
      dark: '#64b5f6',
    },
    secondary: {
      main: '#f48fb1',
      light: '#ffc1e3',
      dark: '#bf5f82',
    },
    hover: {
      main: '#424242',
      light: '#616161',
      dark: '#212121',
    },
    focus: {
      main: '#64b5f6',
      light: '#90caf9',
      dark: '#42a5f5',
    },
    selected: {
      main: '#1e3a5f',
      light: '#2c4a6f',
      dark: '#0d2a4f',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
};

export const lightTheme = createTheme(lightThemeOptions);
export const darkTheme = createTheme(darkThemeOptions);

export default lightTheme;