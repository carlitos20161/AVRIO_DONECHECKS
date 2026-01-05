import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  List,
  ListItemText,
  CssBaseline,
  Box,
  Container,
  ListItemButton,
  Button,
  CircularProgress,
  Collapse,
  ListItemIcon,
  Snackbar,
  Alert
} from '@mui/material';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import MenuIcon from '@mui/icons-material/Menu';
import CreateIcon from '@mui/icons-material/Create';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ReceiptIcon from '@mui/icons-material/Receipt';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AssessmentIcon from '@mui/icons-material/Assessment';
import BusinessIcon from '@mui/icons-material/Business';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PeopleIcon from '@mui/icons-material/People';
import GroupIcon from '@mui/icons-material/Group';
import WorkIcon from '@mui/icons-material/Work';
import UploadIcon from '@mui/icons-material/CloudUpload';
import IconButton from '@mui/material/IconButton';

import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth } from './firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { saveLoginTime, clearLoginTime, isSessionExpired, getFormattedTimeRemaining, getLoginTime } from './utils/sessionTimeout';

import Login from './Login';
import Clients from './components/Clients';
import Employees from './components/Employees';
import Companies from './components/Companies';
import Bank from './components/Bank';
import Dashboard from './components/Dashboard';
import UsersPage from './components/users';
import BatchChecks from './components/checks';
import Checks from './components/viewchecks';
import OptimizedViewChecks from './components/OptimizedViewChecks';
import Report from './components/Report';
import InsertData from './components/InsertData';
import Notifications from './components/Notifications';
import { useOptimizedData } from './hooks/useOptimizedData';
import { logger } from './utils/logger';

const drawerWidth = 220;

// Base menu items
const baseMenuItems = [
         { text: 'Dashboard', icon: <DashboardIcon />, section: 'Dashboard' },
         { text: 'Create Checks', icon: <ReceiptIcon />, section: 'Checks' },
         { text: 'View Checks', icon: <VisibilityIcon />, section: 'View Checks' },
  { text: 'Report', icon: <AssessmentIcon />, section: 'Report', adminOnly: true },
];

const createSubMenuItems = [
  { text: 'Companies', icon: <BusinessIcon />, section: 'Companies' },
  { text: 'Banks', icon: <AccountBalanceIcon />, section: 'Banks' },
  { text: 'Users', icon: <PeopleIcon />, section: 'Users' },
  { text: 'Department', icon: <GroupIcon />, section: 'Clients' },
  { text: 'Employees', icon: <WorkIcon />, section: 'Employees' },
  { text: 'Insert Data', icon: <UploadIcon />, section: 'InsertData', adminOnly: true },
];
const ensureUserDocExists = async (user: FirebaseUser) => {
  const userRef = doc(db, 'users', user.uid);
  const docSnap = await getDoc(userRef);

  if (!docSnap.exists()) {
    logger.warn('🆕 No user doc found. Creating one...');
    await setDoc(userRef, {
      role: 'user',
      active: true,
      email: user.email || '',
      companyIds: [], // You can update this based on app logic
    });
  } else {
    logger.log('✅ User doc already exists');
  }
};



function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [selectedSection, setSelectedSection] = useState('Dashboard');
  const [currentRole, setCurrentRole] = useState<string>('user');
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [visibleClientIds, setVisibleClientIds] = useState<string[]>([]); // Track which clients user can see
  const [userId, setUserId] = useState<string | null>(null);
  const [createSubmenuOpen, setCreateSubmenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [navigatedFromDashboard, setNavigatedFromDashboard] = useState(false);

  // Filter menu items based on user role
  const mainMenuItems = useMemo(() => {
    return baseMenuItems.filter(item => {
      // Show admin-only items to admins and managers
      if (item.adminOnly && currentRole !== 'admin' && currentRole !== 'manager') {
        return false;
      }
      return true;
    });
  }, [currentRole]);

  // Notification state
  const [notification, setNotification] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info'
  });

  // filter for Checks page
  const [viewFilter, setViewFilter] = useState<{
    companyId?: string | { in: string[] };
    weekKey?: string;
    createdBy?: string;
  }>({});
  

  // clear filter
  const handleClearFilter = () => {
    logger.log('🧹 handleClearFilter called, resetting filter');
    setViewFilter({});
    setSelectedSection('View Checks');
  };

  // Show notification function
  const showNotification = (message: string, severity: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setNotification({
      open: true,
      message,
      severity
    });
  };

  // Fetch and show notifications for current user
  const fetchAndShowNotifications = async () => {
    if (!user || currentRole === 'admin') return; // Only show notifications to non-admin users
    
    try {
      const notificationsQuery = query(
        collection(db, 'notifications'),
        where('userId', '==', user.uid),
        where('read', '==', false),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      
      const notificationsSnap = await getDocs(notificationsQuery);
      
      if (!notificationsSnap.empty) {
        const latestNotification = notificationsSnap.docs[0];
        const notificationData = latestNotification.data();
        
        // Show the notification
        showNotification(notificationData.message, 'warning');
        
        // Mark as read
        await updateDoc(doc(db, 'notifications', latestNotification.id), {
          read: true,
          readAt: new Date()
        });
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  useEffect(() => {
    if (selectedSection !== 'View Checks') {
      setNavigatedFromDashboard(false);
    }
  }, [selectedSection]);

  // Redirect non-admin/manager users away from Report section
  useEffect(() => {
    if (selectedSection === 'Report' && currentRole !== 'admin' && currentRole !== 'manager') {
      setSelectedSection('Dashboard');
    }
  }, [selectedSection, currentRole]);

  // Redirect non-admin users away from InsertData section
  useEffect(() => {
    if (selectedSection === 'InsertData' && currentRole !== 'admin') {
      setSelectedSection('Dashboard');
    }
  }, [selectedSection, currentRole]);
   
  useEffect(() => {
    logger.log('setting up auth listener');
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      logger.log('onAuthStateChanged', firebaseUser);
      
      // Always clear state first!
      setUser(firebaseUser);
      setCurrentRole('user');
      setUserId(null);
      setCompanyIds([]);
      setVisibleClientIds([]); // Clear visible client IDs
      setViewFilter({});
      setSelectedSection('Dashboard');
      if (firebaseUser) {
        // On successful login, always save a fresh login time
        // The Login component already calls saveLoginTime(), but we ensure it's set here too
        // This handles cases where the auth state changes but login flow didn't complete
        const existingLoginTime = getLoginTime();
        
        // If there's an existing login time, check if it's expired
        // BUT: Only log out if it's been more than 1 minute since that login time
        // This prevents immediately logging out users who just logged in (race condition)
        if (existingLoginTime) {
          const timeSinceLogin = Date.now() - existingLoginTime;
          const oneMinute = 60 * 1000;
          
          // Only check expiration if it's been more than 1 minute since login
          // This prevents false positives from stale localStorage or timing issues
          if (timeSinceLogin > oneMinute && isSessionExpired()) {
            logger.warn('Session expired. Logging out user.');
            clearLoginTime();
            await signOut(auth);
            setUser(null);
            setAuthChecked(true);
            return;
          }
          
          // If login time exists and is recent (less than 1 minute), it's a fresh login
          // Don't overwrite it, just continue
          if (timeSinceLogin <= oneMinute) {
            logger.log('Fresh login detected, skipping session check');
          }
        } else {
          // No existing login time - this is a fresh login, save it
          saveLoginTime();
        }
        
        // If login time is very old (more than 23 hours), refresh it
        // This handles edge cases where localStorage might have stale data
        if (existingLoginTime) {
          const timeSinceLogin = Date.now() - existingLoginTime;
          const twentyThreeHours = 23 * 60 * 60 * 1000;
          if (timeSinceLogin > twentyThreeHours) {
            logger.log('Login time is very old, refreshing it');
            saveLoginTime();
          }
        }
        
        try {
          await ensureUserDocExists(firebaseUser); 
          const docSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (docSnap.exists()) {
            const data = docSnap.data();
            setCurrentRole(data.role || 'user');
            setUserId(firebaseUser.uid);
            setCompanyIds(data.companyIds || []);
            setVisibleClientIds(data.visibleClientIds || []); // Load visible client IDs
            logger.log('[CHECKPOINT] User doc loaded:', data);
            
            // Fetch notifications after user data is loaded
            setTimeout(() => fetchAndShowNotifications(), 1000);
          } else {
            logger.warn('[CHECKPOINT] User doc not found for uid:', firebaseUser.uid);
          }
        } catch (err) {
          console.error('[CHECKPOINT] Error fetching user doc:', err);
        }
      } else {
        logger.log('user signed out');
        setCurrentRole('user');
        clearLoginTime(); // Clear session timer on logout
      }
      setAuthChecked(true);
      if (typeof refetchChecks === 'function') refetchChecks();
    });
    return () => unsubscribe();
  }, []);

  // Real-time listener for current user's active status
  useEffect(() => {
    if (!user) return;

    logger.log('🔍 Setting up real-time listener for user active status');
    const userDocRef = doc(db, 'users', user.uid);
    
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (!docSnap.exists()) {
        logger.warn('User document not found, logging out');
        signOut(auth);
        setUser(null);
        showNotification('Your account was not found. Please contact support.', 'error');
        return;
      }

      const userData = docSnap.data();
      const isActive = userData.active !== false; // Default to true if not set
      
      if (!isActive) {
        logger.warn('⚠️ User became inactive, logging out immediately');
        signOut(auth);
        setUser(null);
        showNotification('Your account has been deactivated. Please contact your administrator.', 'warning');
        return;
      }

      // Update user data in real-time
      setCurrentRole(userData.role || 'user');
      setCompanyIds(userData.companyIds || []);
      setVisibleClientIds(userData.visibleClientIds || []);
      logger.log('✅ User data updated in real-time:', userData);
    }, (error) => {
      console.error('Error listening to user document:', error);
    });

    return () => {
      logger.log('🔍 Cleaning up user active status listener');
      unsubscribe();
    };
  }, [user]);

  // Session timeout check - runs every minute
  useEffect(() => {
    if (!user) return;

    const checkSessionTimeout = async () => {
      if (isSessionExpired()) {
        logger.warn('Session expired after 24 hours. Logging out...');
        clearLoginTime();
        await signOut(auth);
        setUser(null);
        setCurrentRole('user');
        showNotification('Your session has expired. Please log in again.', 'warning');
      }
    };

    // Check immediately
    checkSessionTimeout();

    // Check every minute
    const interval = setInterval(checkSessionTimeout, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [user]);

  // Memoize options for useOptimizedData
  const usersOptions = useMemo(() => {
    return {
      userRole: currentRole,
      userId: auth.currentUser?.uid
    };
  }, [currentRole]);
  const companiesOptions = useMemo(() => {
    return {
      userRole: currentRole,
      companyIds
    };
  }, [currentRole, companyIds]);
  const checksOptions = useMemo(() => {
    return {
      userRole: currentRole,
      companyIds
    };
  }, [currentRole, companyIds]);

  const { data: users, loading: usersLoading } = useOptimizedData<any>('users', {}, usersOptions);

  // Always call hooks, but skip fetching if companyIds not ready (for non-admins/managers)
  const shouldFetch = currentRole === 'admin' || currentRole === 'manager' || (companyIds && companyIds.length > 0);
  const { data: companies, loading: companiesLoading } = useOptimizedData<any>('companies', {}, { ...companiesOptions, skip: !shouldFetch });
  const { data: banks, loading: banksLoading } = useOptimizedData<any>('banks', {}, { ...companiesOptions, skip: !shouldFetch });
  const { data: clients, loading: clientsLoading } = useOptimizedData<any>('clients', {}, { ...companiesOptions, skip: !shouldFetch });
  // In the Dashboard checks query/filter logic:
  const checksFilter = (currentRole === 'admin' || currentRole === 'manager')
  ? {}
  : (companyIds.length > 0
      ? { companyId: companyIds }
      : {});

  logger.log('[CHECKPOINT] [App] Dashboard checks filter:', checksFilter, 'currentRole:', currentRole, 'companyIds:', companyIds);
  const { data: checks, loading: checksLoading, refetch: refetchChecks } = useOptimizedData<any>(
    'checks',
    checksFilter,
    { ...checksOptions, skip: !shouldFetch }
  );

  const handleLogout = async () => {
    logger.log('handleLogout called');
    clearLoginTime(); // Clear session timer
    await signOut(auth);
    setUser(null);
    setCurrentRole('user');
    setUserId(null);
    setCompanyIds([]);
    if (currentRole !== 'admin') {
      setViewFilter({ companyId: { in: companyIds } });
    } else {
      setViewFilter({});
    }
    
    
    setSelectedSection('Dashboard');
  };

  const dashboardRef = useRef<any>(null);
  const handleReviewUpdated = () => {
    if (dashboardRef.current && typeof dashboardRef.current.fetchReviewRequests === 'function') {
      dashboardRef.current.fetchReviewRequests();
    }
  };

  if (!authChecked) return null;
  if (!user) {
    logger.log('🛑 not logged in, showing login');
    return <Login onLogin={() => setUser(auth.currentUser)} />;
  }
  // Only render main app after user info is loaded
  if (!authChecked || !user) {
    logger.log('🛑 not logged in, showing login');
    return <Login onLogin={() => setUser(auth.currentUser)} />;
  }

  const stillLoadingData =
    currentRole !== 'admin' && (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0);

  if (stillLoadingData) {
    logger.log('⏳ Waiting for companyIds to load...');
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading your data...</Typography>
      </Box>
    );
  }


  // Note: availableSections is used for future reference if needed
  // const availableSections = currentRole === 'admin' 
  //   ? [...mainMenuItems, ...createSubMenuItems]
  //   : [...mainMenuItems, { text: 'Employees', icon: <WorkIcon />, section: 'Employees' }];

  logger.log('🔎 rendering App, selectedSection=', selectedSection);
  logger.log('🔎 current viewFilter=', viewFilter);

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={() => setDrawerOpen(!drawerOpen)}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Payroll Checks
          </Typography>
          {currentRole && (
            <Typography sx={{ mr: 2 }}>
              Logged in as: {currentRole.toUpperCase()}
            </Typography>
          )}
          {currentRole !== 'admin' && <Notifications />}
          <Button color="inherit" onClick={handleLogout}>Logout</Button>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="temporary"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ModalProps={{
          keepMounted: true, // Better open performance on mobile.
        }}
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {/* Main Menu Items */}
            {mainMenuItems.map((item) => (
                <ListItemButton
                key={item.section}
                selected={selectedSection === item.section}
                  onClick={() => {
                  logger.log(`🖱️ Menu click: ${item.section}`);
                    if (
                    item.section === 'View Checks' &&
                      selectedSection !== 'View Checks' &&
                      Object.keys(viewFilter).length === 0
                    ) {
                      logger.log('🧹 Clearing viewFilter because menu clicked without active filter');
                      setViewFilter({});
                    }
                    setNavigatedFromDashboard(false);
                  setSelectedSection(item.section);
                  setDrawerOpen(false); // Close drawer when menu item is clicked
                  }}
                >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            ))}
            
            {/* Create Submenu (Admin and Manager) */}
            {(currentRole === 'admin' || currentRole === 'manager') && (
              <>
                <ListItemButton
                  onClick={() => setCreateSubmenuOpen(!createSubmenuOpen)}
                  sx={{ pl: 2 }}
                >
                  <ListItemIcon><CreateIcon /></ListItemIcon>
                  <ListItemText primary="Manage" />
                  {createSubmenuOpen ? <ExpandLess /> : <ExpandMore />}
                </ListItemButton>
                
                <Collapse in={createSubmenuOpen} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding>
                    {createSubMenuItems
                      .filter(item => {
                        // Show admin-only items only to admins
                        if (item.adminOnly && currentRole !== 'admin') {
                          return false;
                        }
                        return true;
                      })
                      .map((item) => (
                      <ListItemButton
                        key={item.section}
                        selected={selectedSection === item.section}
                        onClick={() => {
                          logger.log(`🖱️ Submenu click: ${item.section}`);
                          setSelectedSection(item.section);
                          setDrawerOpen(false); // Close drawer when submenu item is clicked
                        }}
                        sx={{ pl: 4 }}
                      >
                        <ListItemIcon>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.text} />
                      </ListItemButton>
                    ))}
                  </List>
                </Collapse>
              </>
            )}
            
            {/* Employees for regular users only */}
            {currentRole === 'user' && (
              <ListItemButton
                selected={selectedSection === 'Employees'}
                onClick={() => {
                  logger.log(`🖱️ Menu click: Employees`);
                  setSelectedSection('Employees');
                  setDrawerOpen(false); // Close drawer when menu item is clicked
                }}
              >
                <ListItemIcon><WorkIcon /></ListItemIcon>
                <ListItemText primary="Employees" />
              </ListItemButton>
            )}
          </List>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Container maxWidth={false} sx={{ width: '100%', maxWidth: '100%', px: 2 }}>
          {selectedSection === 'Dashboard' && (
            <Dashboard
              ref={dashboardRef}
              onGoToViewChecks={(companyId, weekKey, createdBy) => {
                logger.log('➡️ Dashboard → View Checks with filter', {
                  companyId,
                  weekKey,
                  createdBy,
                });
                setViewFilter({ companyId, weekKey, createdBy });
                setNavigatedFromDashboard(true);
                setSelectedSection('View Checks');
              }}
              onGoToSection={setSelectedSection}
              currentRole={currentRole}
              onReviewUpdated={handleReviewUpdated}
              companies={companies}
              clients={clients}
            />
          )}

          {selectedSection === 'Companies' && <Companies currentRole={currentRole} />}
          {selectedSection === 'Banks' && <Bank currentRole={currentRole} />}
          {selectedSection === 'Users' && <UsersPage currentRole={currentRole} />}
          {selectedSection === 'Clients' && (
            <Clients 
              companyIds={companyIds} 
              currentRole={currentRole} 
              visibleClientIds={visibleClientIds}
            />
          )}
          {selectedSection === 'Employees' && (
            <Employees currentRole={currentRole} companyIds={companyIds} />
          )}
          {selectedSection === 'Checks' && (
                            <BatchChecks onChecksCreated={refetchChecks} onGoToSection={setSelectedSection} />
          )}
          {selectedSection === 'InsertData' && currentRole === 'admin' && <InsertData />}

          {selectedSection === 'View Checks' && (
            <OptimizedViewChecks
              filter={viewFilter}
              onClearFilter={handleClearFilter}
              users={users}
              companies={currentRole === 'admin' ? companies : companies.filter(c => companyIds.includes(c.id))}
              banks={banks}
              checks={checks}
              usersLoading={usersLoading}
              companiesLoading={companiesLoading}
              banksLoading={banksLoading}
              checksLoading={checksLoading}
              onReviewUpdated={handleReviewUpdated}
              refetchChecks={refetchChecks}
              currentRole={currentRole}
              companyIds={companyIds}
              visibleClientIds={visibleClientIds}
            />
          )}

          {selectedSection === 'Report' && (currentRole === 'admin' || currentRole === 'manager') && (
            <Report 
              currentRole={currentRole} 
              companyIds={companyIds} 
              visibleClientIds={visibleClientIds}
            />
          )}
        </Container>
      </Box>

      {/* Global Notification Snackbar */}
      <Snackbar
        open={notification.open}
        autoHideDuration={8000}
        onClose={() => setNotification(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ mt: 8 }}
      >
        <Alert
          onClose={() => setNotification(prev => ({ ...prev, open: false }))}
          severity={notification.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default App;
