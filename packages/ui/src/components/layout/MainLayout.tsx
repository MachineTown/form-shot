import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
} from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '../../hooks/redux';
import { toggleTheme } from '../../store/slices/themeSlice';
import { toggleSidebar } from '../../store/slices/navigationSlice';
import Sidebar from './Sidebar';

const DRAWER_WIDTH = 240;
const APP_BAR_HEIGHT = 64;

const MainLayout: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const themeMode = useAppSelector((state) => state.theme.mode);
  const sidebarOpen = useAppSelector((state) => state.navigation.sidebarOpen);

  const handleThemeToggle = () => {
    dispatch(toggleTheme());
  };

  const handleSidebarToggle = () => {
    dispatch(toggleSidebar());
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          height: APP_BAR_HEIGHT,
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="toggle sidebar"
            edge="start"
            onClick={handleSidebarToggle}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Form-Shot Analysis
          </Typography>

          <IconButton
            color="inherit"
            aria-label="toggle theme"
            onClick={handleThemeToggle}
          >
            {themeMode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          pt: `calc(${APP_BAR_HEIGHT}px + 24px)`,
          width: '100%',
          height: '100vh',
          overflow: 'auto',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default MainLayout;