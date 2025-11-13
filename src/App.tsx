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

import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth } from './firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';

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
  { text: 'Insert Data', icon: <UploadIcon />, section: 'InsertData' },
];
const ensureUserDocExists = async (user: FirebaseUser) => {
  const userRef = doc(db, 'users', user.uid);
  const docSnap = await getDoc(userRef);

  if (!docSnap.exists()) {
    console.warn('🆕 No user doc found. Creating one...');
    await setDoc(userRef, {
      role: 'user',
      active: true,
      email: user.email || '',
      companyIds: [], // You can update this based on app logic
    });
  } else {
    console.log('✅ User doc already exists');
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
    console.log('🧹 handleClearFilter called, resetting filter');
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
   
  useEffect(() => {
    console.log('setting up auth listener');
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('onAuthStateChanged', firebaseUser);
      // Always clear state first!
      setUser(firebaseUser);
      setCurrentRole('user');
      setUserId(null);
      setCompanyIds([]);
      setVisibleClientIds([]); // Clear visible client IDs
      setViewFilter({});
      setSelectedSection('Dashboard');
      if (firebaseUser) {
        try {
          await ensureUserDocExists(firebaseUser); 
          const docSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (docSnap.exists()) {
            const data = docSnap.data();
            setCurrentRole(data.role || 'user');
            setUserId(firebaseUser.uid);
            setCompanyIds(data.companyIds || []);
            setVisibleClientIds(data.visibleClientIds || []); // Load visible client IDs
            console.log('[CHECKPOINT] User doc loaded:', data);
            
            // Fetch notifications after user data is loaded
            setTimeout(() => fetchAndShowNotifications(), 1000);
          } else {
            console.warn('[CHECKPOINT] User doc not found for uid:', firebaseUser.uid);
          }
        } catch (err) {
          console.error('[CHECKPOINT] Error fetching user doc:', err);
        }
      } else {
        console.log('user signed out');
        setCurrentRole('user');
      }
      setAuthChecked(true);
      if (typeof refetchChecks === 'function') refetchChecks();
    });
    return () => unsubscribe();
  }, []);

  // Load user info once
  useEffect(() => {
    const fetchUser = async () => {
      const user = auth.currentUser;
      if (!user) return;
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if (!userSnap.exists()) return;
      const userData = userSnap.data();
      setCurrentRole(userData.role || 'user');
      setCompanyIds(userData.companyIds || []);
      setVisibleClientIds(userData.visibleClientIds || []); // Load visible client IDs
    };
    fetchUser();
  }, []);

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

  console.log('[CHECKPOINT] [App] Dashboard checks filter:', checksFilter, 'currentRole:', currentRole, 'companyIds:', companyIds);
  const { data: checks, loading: checksLoading, refetch: refetchChecks } = useOptimizedData<any>(
    'checks',
    checksFilter,
    { ...checksOptions, skip: !shouldFetch }
  );

  const handleLogout = async () => {
    console.log('handleLogout called');
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
    console.log('🛑 not logged in, showing login');
    return <Login onLogin={() => setUser(auth.currentUser)} />;
  }
  // Only render main app after user info is loaded
  if (!authChecked || !user) {
    console.log('🛑 not logged in, showing login');
    return <Login onLogin={() => setUser(auth.currentUser)} />;
  }

  const stillLoadingData =
    currentRole !== 'admin' && (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0);

  if (stillLoadingData) {
    console.log('⏳ Waiting for companyIds to load...');
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

  console.log('🔎 rendering App, selectedSection=', selectedSection);
  console.log('🔎 current viewFilter=', viewFilter);

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
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
        variant="permanent"
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
                  console.log(`🖱️ Menu click: ${item.section}`);
                    if (
                    item.section === 'View Checks' &&
                      selectedSection !== 'View Checks' &&
                      Object.keys(viewFilter).length === 0
                    ) {
                      console.log('🧹 Clearing viewFilter because menu clicked without active filter');
                      setViewFilter({});
                    }
                    setNavigatedFromDashboard(false);
                  setSelectedSection(item.section);
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
                    {createSubMenuItems.map((item) => (
                      <ListItemButton
                        key={item.section}
                        selected={selectedSection === item.section}
                        onClick={() => {
                          console.log(`🖱️ Submenu click: ${item.section}`);
                          setSelectedSection(item.section);
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
                  console.log(`🖱️ Menu click: Employees`);
                  setSelectedSection('Employees');
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
        <Container>
          {selectedSection === 'Dashboard' && (
            <Dashboard
              ref={dashboardRef}
              onGoToViewChecks={(companyId, weekKey, createdBy) => {
                console.log('➡️ Dashboard → View Checks with filter', {
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
          {selectedSection === 'InsertData' && <InsertData />}

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
