import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Drawer,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Divider,
  TextField,
  InputAdornment,
  Typography,
  Collapse,
  CircularProgress,
  useTheme,
  useMediaQuery,
  IconButton,
  Chip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Business as BusinessIcon,
  Science as ScienceIcon,
  Folder as FolderIcon,
  ExpandLess,
  ExpandMore,
  History as HistoryIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '../../hooks/redux';
import { 
  setSearchQuery, 
  setSidebarOpen,
  setSelectedCustomer,
  setSelectedStudy,
  clearRecentlyViewed,
} from '../../store/slices/navigationSlice';
import { useGetCustomersQuery, useGetAnalysesQuery } from '../../store/services/firestoreApi';

const DRAWER_WIDTH = 240;
const APP_BAR_HEIGHT = 64;

const Sidebar: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const params = useParams();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const sidebarOpen = useAppSelector((state) => state.navigation.sidebarOpen);
  const searchQuery = useAppSelector((state) => state.navigation.searchQuery);
  const selectedCustomer = useAppSelector((state) => state.navigation.selectedCustomer);
  const selectedStudy = useAppSelector((state) => state.navigation.selectedStudy);
  const recentlyViewed = useAppSelector((state) => state.navigation.recentlyViewed);

  // Fetch data
  const { data: customers, isLoading: customersLoading } = useGetCustomersQuery();
  const { data: analyses, isLoading: analysesLoading } = useGetAnalysesQuery({
    customerId: selectedCustomer || undefined,
  });

  // Group analyses by study
  const studiesByCustomer = useMemo(() => {
    if (!analyses) return {};
    
    const grouped: Record<string, Set<string>> = {};
    analyses.forEach((analysis) => {
      if (!grouped[analysis.customerId]) {
        grouped[analysis.customerId] = new Set();
      }
      grouped[analysis.customerId].add(analysis.studyId);
    });
    
    return Object.entries(grouped).reduce((acc, [customerId, studies]) => {
      acc[customerId] = Array.from(studies);
      return acc;
    }, {} as Record<string, string[]>);
  }, [analyses]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setSearchQuery(event.target.value));
  };

  const handleCustomerClick = (customerId: string) => {
    if (selectedCustomer === customerId) {
      dispatch(setSelectedCustomer(null));
    } else {
      dispatch(setSelectedCustomer(customerId));
      navigate(`/analysis/${customerId}`);
    }
  };

  const handleStudyClick = (customerId: string, studyId: string) => {
    dispatch(setSelectedStudy(studyId));
    navigate(`/analysis/${customerId}/${studyId}`);
  };

  const handleRecentClick = (item: typeof recentlyViewed[0]) => {
    dispatch(setSelectedCustomer(item.customerId));
    dispatch(setSelectedStudy(item.studyId));
    navigate(`/analysis/${item.customerId}/${item.studyId}/${item.packageName}`);
  };

  const handleDrawerClose = () => {
    dispatch(setSidebarOpen(false));
  };

  const drawerContent = (
    <Box sx={{ overflow: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search Box */}
      <Box sx={{ p: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search..."
          value={searchQuery}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Divider />

      {/* Customer/Study Tree */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {customersLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <List>
            {customers?.filter(customer => 
              !searchQuery || 
              customer.customerId.toLowerCase().includes(searchQuery.toLowerCase()) ||
              customer.name.toLowerCase().includes(searchQuery.toLowerCase())
            ).map((customer) => (
              <Box key={customer.customerId}>
                <ListItemButton
                  onClick={() => handleCustomerClick(customer.customerId)}
                  selected={selectedCustomer === customer.customerId}
                >
                  <ListItemIcon>
                    <BusinessIcon />
                  </ListItemIcon>
                  <ListItemText 
                    primary={customer.name}
                    secondary={`${customer.totalAnalyses} analyses`}
                  />
                  {selectedCustomer === customer.customerId ? <ExpandLess /> : <ExpandMore />}
                </ListItemButton>
                
                <Collapse in={selectedCustomer === customer.customerId} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding>
                    {studiesByCustomer[customer.customerId]?.map((studyId) => (
                      <ListItemButton
                        key={studyId}
                        sx={{ pl: 4 }}
                        onClick={() => handleStudyClick(customer.customerId, studyId)}
                        selected={selectedStudy === studyId}
                      >
                        <ListItemIcon>
                          <ScienceIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={studyId} />
                      </ListItemButton>
                    ))}
                  </List>
                </Collapse>
              </Box>
            ))}
          </List>
        )}
      </Box>

      <Divider />

      {/* Recently Viewed */}
      {recentlyViewed.length > 0 && (
        <Box sx={{ p: 1 }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            px: 1,
            mb: 1,
          }}>
            <Typography variant="caption" color="text.secondary">
              Recently Viewed
            </Typography>
            <IconButton
              size="small"
              onClick={() => dispatch(clearRecentlyViewed())}
              aria-label="clear recently viewed"
            >
              <ClearIcon fontSize="small" />
            </IconButton>
          </Box>
          <List dense>
            {recentlyViewed.slice(0, 5).map((item) => (
              <ListItemButton
                key={item.id}
                onClick={() => handleRecentClick(item)}
              >
                <ListItemIcon>
                  <FolderIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={item.packageName}
                  secondary={`${item.customerId} / ${item.studyId}`}
                  primaryTypographyProps={{ variant: 'body2' }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>
      )}
    </Box>
  );

  return (
    <Drawer
      variant="temporary"
      open={sidebarOpen}
      onClose={handleDrawerClose}
      sx={{
        width: sidebarOpen ? DRAWER_WIDTH : 0,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          mt: `${APP_BAR_HEIGHT}px`,
          height: `calc(100% - ${APP_BAR_HEIGHT}px)`,
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
};

export default Sidebar;