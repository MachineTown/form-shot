import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  useTheme,
  useMediaQuery,
  Button,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '../../hooks/redux';
import { toggleTheme } from '../../store/slices/themeSlice';
import { toggleSidebar } from '../../store/slices/navigationSlice';
import { useAuth } from '../../hooks/useAuth';
import Sidebar from './Sidebar';

const DRAWER_WIDTH = 240;
const APP_BAR_HEIGHT = 64;

const MainLayout: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const themeMode = useAppSelector((state) => state.theme.mode);
  const sidebarOpen = useAppSelector((state) => state.navigation.sidebarOpen);

  const handleThemeToggle = () => {
    dispatch(toggleTheme());
  };

  const handleSidebarToggle = () => {
    dispatch(toggleSidebar());
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
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

          {user && (
            <Typography variant="body2" sx={{ mr: 2 }}>
              {user.email}
            </Typography>
          )}

          <IconButton
            color="inherit"
            aria-label="toggle theme"
            onClick={handleThemeToggle}
            sx={{ mr: 1 }}
          >
            {themeMode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>

          <Button
            color="inherit"
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
            sx={{ textTransform: 'none' }}
          >
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          position: 'absolute',
          top: APP_BAR_HEIGHT,
          left: !isMobile && sidebarOpen ? DRAWER_WIDTH : 0,
          right: 0,
          bottom: 0,
          p: 2,
          overflow: 'auto',
          transition: theme.transitions.create(['left'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default MainLayout;