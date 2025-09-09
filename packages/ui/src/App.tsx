import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { store } from './store';
import { router } from './router';
import { lightTheme, darkTheme } from './theme';
import { useAppSelector } from './hooks/redux';
import { AuthProvider } from './contexts/AuthContext';
import './styles/dnd-animations.css';

function ThemedApp() {
  const themeMode = useAppSelector((state) => state.theme.mode);
  const theme = themeMode === 'light' ? lightTheme : darkTheme;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}

function App() {
  return (
    <Provider store={store}>
      <AuthProvider>
        <ThemedApp />
      </AuthProvider>
    </Provider>
  );
}

export default App;