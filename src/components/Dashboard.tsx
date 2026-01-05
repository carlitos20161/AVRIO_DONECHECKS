import React, { useEffect, useState, forwardRef } from "react";
import {
  Box,
  Typography,
  Avatar,
  Paper,
  Divider,
  CircularProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ButtonBase,
  Card,
  CardContent,
  Alert,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from "@mui/material";
import BusinessIcon from '@mui/icons-material/Business';
import PeopleIcon from '@mui/icons-material/People';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AddBusinessIcon from '@mui/icons-material/AddBusiness';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PrintIcon from '@mui/icons-material/Print';
import NotificationImportantIcon from '@mui/icons-material/NotificationImportant';
import CloseIcon from '@mui/icons-material/Close';
import WorkIcon from '@mui/icons-material/Work';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  orderBy,
  query,
  where,
  updateDoc,
  writeBatch,
  serverTimestamp,
  deleteDoc,
  addDoc,
  onSnapshot,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid
  // Tooltip is intentionally NOT imported from recharts
} from "recharts";
import { logger } from '../utils/logger';
// Remove Grid import
// import Grid from "@mui/material/Grid";

interface DashboardProps {
  onGoToViewChecks: (companyId: string, weekKey: string, createdBy: string) => void;
  onGoToSection: (section: string) => void;
  currentRole: string;
  onReviewUpdated?: () => void;
  companies?: any[];
  clients?: any[];
}



interface Company {
  id: string;
  name: string;
  address: string;
  logoBase64?: string;
}
interface Employee {
  id: string;
  name: string;
}
interface Client {
  id: string;
  name: string;
  division?: string;
}
interface Check {
  id: string;
  amount: number;
  companyId: string;
  employeeName: string;
  memo?: string;
  status?: string;
  date?: any;
  checkNumber?: number;
  createdBy?: string;
  reviewed?: boolean;
  relationshipDetails?: any[];
}

interface UserInfo {
  id: string;
  username: string;
  email?: string;
}

const Dashboard = forwardRef<any, DashboardProps>(({ onGoToViewChecks, onGoToSection, currentRole, onReviewUpdated, companies: propCompanies, clients: propClients }, ref) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [allChecks, setAllChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentChecks, setRecentChecks] = useState<Check[]>([]);
  const [usersMap, setUsersMap] = useState<{ [uid: string]: UserInfo }>({});
  // Add companyIds state for use in queries
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [showReviewFloatingMenu, setShowReviewFloatingMenu] = useState(false);
  const [pendingChecks, setPendingChecks] = useState<Check[]>([]);
  const [selectedCheckForDetails, setSelectedCheckForDetails] = useState<Check | null>(null);

  // Helper function to safely format amounts
  const formatAmount = (amount: any): string => {
    if (amount === null || amount === undefined) return '0.00';
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return '0.00';
    return numAmount.toFixed(2);
  };

  useEffect(() => {
    const fetchBaseData = async () => {
      try {
        // Fetch companies for all users (not just admin)
        const cSnap = await getDocs(collection(db, "companies"));
        setCompanies(cSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));

        if (currentRole === 'admin') {
          const clSnap = await getDocs(collection(db, "clients"));
          setClients(clSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));

          const uSnap = await getDocs(collection(db, "users"));
          const map: { [uid: string]: UserInfo } = {};
          uSnap.docs.forEach((docu) => {
            const data = docu.data() as any;
            map[data.uid || docu.id] = {
              id: docu.id,
              username: data.username || data.email || "Unknown",
              email: data.email,
            };
          });
          setUsersMap(map);
        }

        const eSnap = await getDocs(collection(db, "employees"));
        setEmployees(eSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));

        setLoading(false);
      } catch (err) {
        console.error("Error fetching data:", err);
        setLoading(false);
      }
    };
    fetchBaseData();
  }, [currentRole]);

  useEffect(() => {
    const fetchRoleAndChecks = async () => {
      const user = auth.currentUser;
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        let role = "user";
        let fetchedCompanyIds: string[] = [];
        if (snap.exists()) {
          const data = snap.data() as any;
          role = data.role || "user";
          fetchedCompanyIds = data.companyIds || [];
        }
        setCompanyIds(fetchedCompanyIds);
        logger.log('[CHECKPOINT] Dashboard companyIds:', fetchedCompanyIds);
        // setCurrentRole(role); // Now passed as prop

        let checks: Check[] = [];
        if (role === "admin") {
          const q = query(collection(db, "checks"), orderBy("date", "desc"));
          const snapChecks = await getDocs(q);
          checks = snapChecks.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }));
        } else {
          // For users, only fetch checks for their assigned companies
          if (fetchedCompanyIds.length === 0) {
            setRecentChecks([]);
            return;
          }
          // Chunk companyIds into groups of 10 for Firestore 'in' queries
          const chunks: string[][] = [];
          for (let i = 0; i < fetchedCompanyIds.length; i += 10) {
            chunks.push(fetchedCompanyIds.slice(i, i + 10));
          }
          for (const chunk of chunks) {
            const q = query(
              collection(db, "checks"),
              where("companyId", "in", chunk),
              orderBy("date", "desc")
            );
            const snap = await getDocs(q);
            logger.log('[CHECKPOINT] Dashboard: fetched checks for chunk', chunk, snap.docs.map(d => d.id));
            snap.docs.forEach(d => {
              checks.push({ id: d.id, ...(d.data() as any) });
            });
          }
          logger.log('[CHECKPOINT] Dashboard: all fetched checks:', checks);
        }
        setRecentChecks(checks.slice(0, 6));
      } catch (err) {
        console.error("Error fetching checks:", err);
      }
    };
    fetchRoleAndChecks();
  }, []);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      const user = auth.currentUser;
      if (!user) return;
      
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data() as any;
          setCurrentUser({
            id: user.uid,
            username: data.username || data.email || "Unknown",
            email: data.email,
          });
        }
      } catch (err) {
        console.error("Error fetching current user:", err);
      }
    };
    
    fetchCurrentUser();
  }, []);


  // Fetch all checks for admin users with real-time listener
  useEffect(() => {
    if (currentRole === 'admin') {
      logger.log('[Dashboard] Setting up real-time listener for checks');
      
      // Set up real-time listener for checks
      const unsubscribe = onSnapshot(collection(db, "checks"), (snap) => {
        try {
          setAllChecks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
          logger.log('[Dashboard] Checks updated in real-time:', snap.docs.length);
        } catch (err) {
          console.error("Error processing checks:", err);
        }
      }, (err) => {
        console.error("Error in checks listener:", err);
      });
      
      // Cleanup listener on unmount
      return () => {
        logger.log('[Dashboard] Cleaning up checks listener');
        unsubscribe();
      };
    }
  }, [currentRole]);

  // Fetch pending reviews for admin users with real-time listener
  useEffect(() => {
    if (currentRole === 'admin') {
      logger.log('[Dashboard] Setting up real-time listener for review requests');
      
      // Set up real-time listener for review requests
      const unsubscribe = onSnapshot(collection(db, "reviewRequest"), (reviewSnap) => {
        try {
          const pending = reviewSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter((review) => !review.reviewed && review.status === "pending");
          setPendingReviews(pending);

          // Get the actual check data for pending reviews
          const pendingCheckIds = pending.map(review => review.checkId);
          const pendingChecksData = allChecks.filter(check => pendingCheckIds.includes(check.id));
          setPendingChecks(pendingChecksData);
          
          logger.log(`[DEBUG] Dashboard: Found ${pending.length} review requests and ${pendingChecksData.length} matching checks`);
        } catch (err) {
          console.error("Error processing pending reviews:", err);
        }
      }, (err) => {
        console.error("Error in review request listener:", err);
      });
      
      // Cleanup listener on unmount
      return () => {
        logger.log('[Dashboard] Cleaning up review request listener');
        unsubscribe();
      };
    }
  }, [currentRole, allChecks]);

  // Review check function
  const handleReviewCheck = async (checkId: string, approved: boolean) => {
    try {
      if (approved) {
        // APPROVE: Update the check's reviewed status
        const checkRef = doc(db, 'checks', checkId);
        await updateDoc(checkRef, { reviewed: true });

        // Update the review request status
        const reviewQuery = query(
          collection(db, "reviewRequest"),
          where("checkId", "==", checkId)
        );
        const reviewSnap = await getDocs(reviewQuery);
        const batch = writeBatch(db);
        reviewSnap.docs.forEach(doc => {
          batch.update(doc.ref, { 
            reviewed: true, 
            status: "approved",
            reviewedAt: serverTimestamp()
          });
        });
        await batch.commit();

        logger.log('Check approved successfully');
      } else {
        // REJECT: Delete the check and update check numbers
        const checkRef = doc(db, 'checks', checkId);
        const checkDoc = await getDoc(checkRef);

        if (!checkDoc.exists()) {
          throw new Error('Check not found');
        }

        const checkData = checkDoc.data();
        const checkNumber = checkData?.checkNumber;
        const companyId = checkData?.companyId;

        // Delete the check
        await deleteDoc(checkRef);
        logger.log('Check deleted from Firestore');

        // Decrease subsequent check numbers if this check had a number
        if (checkNumber && companyId) {
          logger.log(`Deleting check #${checkNumber} for company ${companyId}`);

          // Get all checks for this company
          const allCompanyChecksQuery = query(
            collection(db, 'checks'),
            where('companyId', '==', companyId)
          );
          const allCompanyChecksSnapshot = await getDocs(allCompanyChecksQuery);

          const batch = writeBatch(db);
          let bankToUpdate: any = null;
          let currentNextCheckNumber = 0;

          allCompanyChecksSnapshot.docs.forEach((docSnapshot) => {
            const currentCheckNumber = docSnapshot.data().checkNumber;
            if (currentCheckNumber > checkNumber) {
              const newCheckNumber = currentCheckNumber - 1;
              batch.update(docSnapshot.ref, {
                checkNumber: newCheckNumber
              });
              logger.log(`Decreasing check #${currentCheckNumber} to #${newCheckNumber}`);
            }
          });

          // Also update the bank's nextCheckNumber to reflect the decrease
          const banksQuery = query(collection(db, 'banks'), where('companyId', '==', companyId));
          const banksSnapshot = await getDocs(banksQuery);

          banksSnapshot.docs.forEach((docSnapshot) => {
            const bankData = docSnapshot.data();
            currentNextCheckNumber = bankData.nextCheckNumber || 0;

            // Only decrease if the next number is greater than the deleted check number
            if (currentNextCheckNumber > checkNumber) {
              const newNextNumber = currentNextCheckNumber - 1;
              batch.update(docSnapshot.ref, {
                nextCheckNumber: newNextNumber
              });
              bankToUpdate = docSnapshot.ref;
              logger.log(`Updated bank nextCheckNumber from ${currentNextCheckNumber} to ${newNextNumber}`);
            }
          });

          await batch.commit();
          logger.log('Firestore batch update committed successfully');
        }

        // Update the review request status to rejected
        const reviewQuery = query(
          collection(db, "reviewRequest"),
          where("checkId", "==", checkId)
        );
        const reviewSnap = await getDocs(reviewQuery);
        const reviewBatch = writeBatch(db);
        reviewSnap.docs.forEach(doc => {
          reviewBatch.update(doc.ref, { 
            reviewed: false, 
            status: "rejected",
            reviewedAt: serverTimestamp()
          });
        });
        await reviewBatch.commit();

        // Get admin username for the notification
        const adminUserDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
        const adminUsername = adminUserDoc.exists() ? adminUserDoc.data().username || 'Admin' : 'Admin';

        // Get company and client information
        const company = companies.find(c => c.id === checkData.companyId);
        const client = clients.find(c => c.id === checkData.clientId);
        
        // Format client name with division if available
        const clientDisplay = client && client.division
          ? `${client.name} (${client.division})`
          : client?.name || 'Unknown Client';

        // Create notification for the user whose check was rejected
        const notificationData = {
          userId: checkData.createdBy, // The user who created the check
          type: 'check_rejected',
          title: 'Check Rejected',
          message: `Check #${checkNumber} for ${checkData.employeeName} was rejected. Please make the check again.`,
          checkNumber: checkNumber,
          employeeName: checkData.employeeName,
          rejectedBy: adminUsername,
          rejectedAt: serverTimestamp(),
          read: false,
          createdAt: serverTimestamp(),
          // Add additional details
          companyName: company?.name || 'Unknown Company',
          companyId: checkData.companyId,
          clientName: client?.name || 'Unknown Client',
          clientDivision: client?.division || '',
          clientDisplay: clientDisplay,
          clientId: checkData.clientId
        };

        await addDoc(collection(db, "notifications"), notificationData);
        logger.log('Notification created for rejected check with company and client details');

        logger.log('Check rejected and deleted successfully');
      }

      // Remove from pending lists
      setPendingReviews(prev => prev.filter(review => review.checkId !== checkId));
      setPendingChecks(prev => prev.filter(check => check.id !== checkId));
      
      // Refresh all checks data
      const snap = await getDocs(collection(db, "checks"));
      setAllChecks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      
      // Notify parent components to refresh their data
      if (onReviewUpdated) {
        onReviewUpdated();
      }
      
    } catch (err) {
      console.error("Error reviewing check:", err);
    }
  };

  // Auto-close floating menu when no more pending checks
  useEffect(() => {
    if (pendingChecks.length === 0 && showReviewFloatingMenu) {
      setShowReviewFloatingMenu(false);
    }
  }, [pendingChecks.length, showReviewFloatingMenu]);

  if (loading) {
    return (
      <Box sx={{ mt: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  const chartData = [
    { name: "Companies", count: companies.length },
    { name: "Batch a Checks", count: allChecks.length },
    { name: "Clients", count: clients.length },
  ];

  return (
    <Box
      sx={{
        mt: 4,
        display: "flex",
        justifyContent: "center",
        background: "linear-gradient(to bottom right, #f0f4ff, #ffffff)",
        minHeight: "100vh",
        p: 3,
      }}
    >
      <Paper
        elevation={4}
        sx={{
          p: 4,
          borderRadius: 4,
          width: "100%",
          maxWidth: 1400,
          backgroundColor: "#ffffff",
          boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
        }}
      >
        {/* WELCOME BANNER */}
        {currentRole === 'admin' ? (
          <>
            <Box
              sx={{ mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#1976d2', color: '#fff', borderRadius: 3, p: 3, boxShadow: '0 2px 8px rgba(25,118,210,0.08)' }}
            >
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 'bold', letterSpacing: 1 }}>
                  Welcome, {currentUser?.username || 'Admin'}!
                </Typography>
                <Typography variant="subtitle1">Payroll Checks</Typography>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                
                <Typography variant="body2">Today: {new Date().toLocaleDateString()}</Typography>
              </Box>
            </Box>
            
            {/* PENDING REVIEWS NOTIFICATION */}
            {pendingChecks.length > 0 && (
              <Alert 
                severity="warning" 
                sx={{ 
                  mb: 3, 
                  borderRadius: 2,
                  backgroundColor: '#fff3cd',
                  borderColor: '#ffeaa7',
                  '& .MuiAlert-icon': {
                    color: '#856404'
                  }
                }}
                icon={<NotificationImportantIcon />}
                action={
                  <Button 
                    color="inherit" 
                    size="small"
                    onClick={() => setShowReviewFloatingMenu(true)}
                    sx={{ 
                      fontWeight: 'bold',
                      textTransform: 'none',
                      borderRadius: 1
                    }}
                  >
                    Review Now
                  </Button>
                }
              >
                <Box>
                  <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
                    {pendingChecks.length} Check{pendingChecks.length !== 1 ? 's' : ''} Awaiting Review
                  </Typography>
                  <Typography variant="body2">
                    User-created checks need your approval before they can be printed.
                  </Typography>
                  {pendingChecks.length > 0 && (
                    <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {pendingChecks.slice(0, 3).map((check, index) => (
                        <Chip 
                          key={check.id}
                          label={`Check #${check.checkNumber || check.id ? check.id.slice(-6).toUpperCase() : index + 1}`}
                          size="small"
                          color="warning"
                          variant="outlined"
                        />
                      ))}
                      {pendingChecks.length > 3 && (
                        <Chip 
                          label={`+${pendingChecks.length - 3} more`}
                          size="small"
                          color="warning"
                          variant="outlined"
                        />
                      )}
                    </Box>
                  )}
                </Box>
              </Alert>
            )}
            
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 4 }}>
              <ButtonBase
                sx={{ flex: '1 1 220px', minWidth: 220, maxWidth: 350, borderRadius: 3, display: 'block' }}
                onClick={() => onGoToSection('Companies')}
                focusRipple
              >
                <Card sx={{ p: 2, borderRadius: 3, background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)', color: '#fff', boxShadow: '0 4px 20px rgba(25,118,210,0.3)' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <BusinessIcon sx={{ fontSize: 40 }} />
                    <Box>
                      <Typography variant="h6">Companies</Typography>
                      <Typography variant="h4">{companies.length}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              </ButtonBase>
              <ButtonBase
                sx={{ flex: '1 1 220px', minWidth: 220, maxWidth: 350, borderRadius: 3, display: 'block' }}
                onClick={() => onGoToSection('Clients')}
                focusRipple
              >
                <Card sx={{ p: 2, borderRadius: 3, background: 'linear-gradient(135deg, #43a047 0%, #66bb6a 100%)', color: '#fff', boxShadow: '0 4px 20px rgba(67,160,71,0.3)' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <PeopleIcon sx={{ fontSize: 40 }} />
                    <Box>
                      <Typography variant="h6">Deparments</Typography>
                      <Typography variant="h4">{clients.length}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              </ButtonBase>
              <ButtonBase
                sx={{ flex: '1 1 220px', minWidth: 220, maxWidth: 350, borderRadius: 3, display: 'block' }}
                onClick={() => onGoToSection('Checks')}
                focusRipple
              >
                <Card sx={{ p: 2, borderRadius: 3, background: 'linear-gradient(135deg, #ef6c00 0%, #ffa726 100%)', color: '#fff', boxShadow: '0 4px 20px rgba(239,108,0,0.3)' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <AssignmentIcon sx={{ fontSize: 40 }} />
                    <Box>
                      <Typography variant="h6">Batch a Checks</Typography>
                      <Typography variant="h4">{allChecks.length}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              </ButtonBase>
              <ButtonBase
                sx={{ flex: '1 1 220px', minWidth: 220, maxWidth: 350, borderRadius: 3, display: 'block' }}
                onClick={() => onGoToSection('Employees')}
                focusRipple
              >
                <Card sx={{ p: 2, borderRadius: 3, background: 'linear-gradient(135deg, #7b1fa2 0%, #9c27b0 100%)', color: '#fff', boxShadow: '0 4px 20px rgba(123,31,162,0.3)' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <WorkIcon sx={{ fontSize: 40 }} />
                    <Box>
                      <Typography variant="h6">Employees</Typography>
                      <Typography variant="h4">{employees.length}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              </ButtonBase>
            </Box>
          </>
        ) : (
          <Box sx={{ mb: 4, p: 3, borderRadius: 3, bgcolor: '#1976d2', color: '#fff', boxShadow: '0 2px 8px rgba(25,118,210,0.08)', textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', letterSpacing: 1 }}>
              Welcome, {currentUser?.username || 'User'}!
            </Typography>
            <Typography variant="subtitle1">Payroll System</Typography>
            <Typography variant="body2" sx={{ mt: 2 }}>Today: {new Date().toLocaleDateString()}</Typography>
          </Box>
        )}
        {/* For users, show only their last 6 checks */}
        {currentRole !== 'admin' && recentChecks.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold', textAlign: 'center' }}>Your Recent Checks</Typography>
            <List>
              {recentChecks.slice(0, 6).map((check) => {
                const company = companies.find((c) => c.id === check.companyId);
                return (
                  <ListItem key={check.id}>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: '#1976d2' }}>{company?.name?.charAt(0) || 'C'}</Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={<span><b>{company?.name || 'Unknown Company'}</b> - <b>{check.employeeName}</b> (${formatAmount(check.amount)})</span>}
                      secondary={<span>Date: {check.date?.toDate ? check.date.toDate().toLocaleString() : check.date}</span>}
                    />
                  </ListItem>
                );
              })}
            </List>
          </Box>
        )}
        {/* QUICK ACTIONS */}
        {/* Only show admin recent activity if admin */}
        {currentRole === 'admin' && (
          <>
            {/* RECENT ACTIVITY TIMELINE */}
            <Divider sx={{ my: 3 }} />
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>Recent Activity</Typography>
            <List>
              {recentChecks.length > 0 ? recentChecks.map((check) => {
                const company = companies.find((c) => c.id === check.companyId);
                const creatorName = check.createdBy && usersMap[check.createdBy] ? usersMap[check.createdBy].username : 'Unknown';
                return (
                  <ListItem key={check.id}>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: '#1976d2' }}>{company?.name?.charAt(0) || 'C'}</Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={<span><b>{company?.name || 'Unknown Company'}</b> - <b>{check.employeeName}</b> (${formatAmount(check.amount)})</span>}
                      secondary={<span>By {creatorName} on {check.date?.toDate ? check.date.toDate().toLocaleString() : check.date}</span>}
                    />
                  </ListItem>
                );
              }) : <Typography>No recent activity found.</Typography>}
            </List>
          </>
        )}
        {/* APP INFO CARD */}
        <Divider sx={{ my: 3 }} />
        <Box sx={{ mt: 4, p: 3, borderRadius: 3, bgcolor: '#f5f5f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}> Support</Typography>
          
          <Typography variant="body2">For support, contact: <a href="mailto:carlos@avriologistics.com">carlos@avriologistics.com</a></Typography>
        </Box>
      </Paper>

      {/* Review Floating Menu */}
      {showReviewFloatingMenu && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowReviewFloatingMenu(false)}
        >
          <Box
            sx={{
              backgroundColor: 'white',
              borderRadius: 3,
              boxShadow: 8,
              maxWidth: '800px',
              width: '90%',
              maxHeight: '80%',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <Box sx={{ p: 3, borderBottom: '1px solid #e0e0e0', backgroundColor: '#f5f5f5' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
                    Pending Reviews ({pendingChecks.length})
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    User-created checks awaiting approval
                  </Typography>
                </Box>
                <Button
                  onClick={() => setShowReviewFloatingMenu(false)}
                  sx={{ minWidth: 'auto', px: 2 }}
                >
                  Close
                </Button>
              </Box>
            </Box>
            
            {/* Content */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 0 }}>
              {pendingChecks.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                  <Typography variant="h6" color="text.secondary">
                    No pending reviews
                  </Typography>
                </Box>
              ) : (
                pendingChecks.map((check) => (
                  <Box
                    key={check.id}
                    sx={{
                      p: 3,
                      borderBottom: '1px solid #f0f0f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      '&:hover': {
                        backgroundColor: '#f9f9f9',
                      },
                    }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                        <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
                          Check #{check.checkNumber || (check.id ? check.id.slice(-6).toUpperCase() : 'N/A')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {check.employeeName}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#2e7d32', mb: 0.5 }}>
                        ${formatAmount(check.amount)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        Company: {companies.find(c => c.id === check.companyId)?.name || 'Unknown'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Created by: {check.createdBy && usersMap[check.createdBy] ? usersMap[check.createdBy].username : 'Unknown User'}
                      </Typography>
                    </Box>
                    
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Button
                        variant="outlined"
                        color="primary"
                        onClick={() => {
              logger.log('🔍 [Dashboard] Opening details for check:', check);
              logger.log('🔍 [Dashboard] relationshipDetails:', check.relationshipDetails);
              if (check.relationshipDetails && check.relationshipDetails.length > 0) {
                logger.log('🔍 [Dashboard] First relationship object:', check.relationshipDetails[0]);
              }
              logger.log('🔍 [Dashboard] hours:', (check as any).hours);
              logger.log('🔍 [Dashboard] otHours:', (check as any).otHours);
              logger.log('🔍 [Dashboard] otRate:', (check as any).otRate);
              logger.log('🔍 [Dashboard] holidayHours:', (check as any).holidayHours);
              logger.log('🔍 [Dashboard] holidayRate:', (check as any).holidayRate);
              logger.log('🔍 [Dashboard] perDiemDays:', (check as any).perDiemDays);
              logger.log('🔍 [Dashboard] otherPay:', (check as any).otherPay);
                          setSelectedCheckForDetails(check);
                        }}
                        sx={{ minWidth: '100px' }}
                      >
                        Details
                      </Button>
                      <Button
                        variant="contained"
                        color="success"
                        onClick={() => handleReviewCheck(check.id, true)}
                        sx={{ minWidth: '100px' }}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="contained"
                        color="error"
                        onClick={() => handleReviewCheck(check.id, false)}
                        sx={{ minWidth: '100px' }}
                      >
                        Reject
                      </Button>
                    </Box>
                  </Box>
                ))
              )}
            </Box>
            
            {/* Footer */}
            <Box sx={{ p: 2, borderTop: '1px solid #e0e0e0', backgroundColor: '#f5f5f5', textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Click Approve to allow printing, or Reject to delete the check
              </Typography>
            </Box>
          </Box>
        </Box>
      )}

      {/* Check Details Dialog */}
      <Dialog
        open={!!selectedCheckForDetails}
        onClose={() => setSelectedCheckForDetails(null)}
        maxWidth="md"
        fullWidth
        slotProps={{
          backdrop: {
            sx: {
              zIndex: 10000
            }
          }
        }}
        sx={{
          zIndex: 10000,
          '& .MuiDialog-container': {
            zIndex: 10000
          },
          '& .MuiDialog-paper': {
            zIndex: 10000
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              Check Details - #{selectedCheckForDetails?.checkNumber || 'N/A'}
            </Typography>
            <IconButton onClick={() => setSelectedCheckForDetails(null)} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedCheckForDetails && (
            <Box>
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Employee:
                </Typography>
                <Typography variant="h6" fontWeight="bold">
                  {selectedCheckForDetails.employeeName}
                </Typography>
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Company:
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {companies.find(c => c.id === selectedCheckForDetails.companyId)?.name || 'Unknown'}
                </Typography>
              </Box>

              {/* Payment Details */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  Payment Details:
                </Typography>
                <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                  {/* Check relationshipDetails first - display main pay items only */}
                  {selectedCheckForDetails.relationshipDetails && selectedCheckForDetails.relationshipDetails.length > 0 ? (
                    selectedCheckForDetails.relationshipDetails.map((rel: any, index: number) => (
                      <Box key={index} sx={{ mb: index < selectedCheckForDetails.relationshipDetails!.length - 1 ? 2 : 0 }}>
                        {rel.clientName && (
                          <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
                            {rel.clientName}
                          </Typography>
                        )}
                        
                        {/* Hourly - use relationship data if available */}
                        {(rel.hours && rel.hours > 0 && rel.payRate) && (
                          <Typography variant="body2">
                            Hours: {rel.hours} @ ${rel.payRate}/hr = ${(rel.hours * rel.payRate).toFixed(2)}
                          </Typography>
                        )}
                        
                        {/* OT Hours - use relationship data if available */}
                        {(rel.otHours && rel.otHours > 0 && rel.otRate) && (
                          <Typography variant="body2">
                            OT Hours: {rel.otHours} @ ${rel.otRate}/hr = ${(rel.otHours * rel.otRate).toFixed(2)}
                          </Typography>
                        )}
                        
                        {/* Holiday Hours - use relationship data if available */}
                        {(rel.holidayHours && rel.holidayHours > 0 && rel.holidayRate) && (
                          <Typography variant="body2">
                            Holiday Hours: {rel.holidayHours} @ ${rel.holidayRate}/hr = ${(rel.holidayHours * rel.holidayRate).toFixed(2)}
                          </Typography>
                        )}
                        
                        {/* Per Diem - use relationship data if available */}
                        {(rel.perDiemDays && rel.perDiemDays > 0 && rel.perDiemRate) && (
                          <Typography variant="body2">
                            Per Diem: {rel.perDiemDays} days @ ${rel.perDiemRate}/day = ${(rel.perDiemDays * rel.perDiemRate).toFixed(2)}
                          </Typography>
                        )}
                        
                        {rel.total && parseFloat(rel.total) > 0 && (
                          <Typography variant="body2" fontWeight="bold" sx={{ mt: 1, color: '#2e7d32' }}>
                            Subtotal: ${rel.total}
                          </Typography>
                        )}
                      </Box>
                    ))
                  ) : null}

                  {/* Display top-level fields if no relationshipDetails, or if relationships don't cover these specific fields */}
                  {/* Hourly */}
                  {(!selectedCheckForDetails.relationshipDetails || selectedCheckForDetails.relationshipDetails.length === 0 || 
                    !selectedCheckForDetails.relationshipDetails.some((rel: any) => rel.hours && rel.hours > 0 && rel.payRate)) &&
                    (selectedCheckForDetails as any).hours && (selectedCheckForDetails as any).hours > 0 && (selectedCheckForDetails as any).payRate && (
                      <Typography variant="body2">
                        Hours: {(selectedCheckForDetails as any).hours} @ ${(selectedCheckForDetails as any).payRate}/hr = ${((selectedCheckForDetails as any).hours * (selectedCheckForDetails as any).payRate).toFixed(2)}
                      </Typography>
                  )}

                  {/* OT Hours - check if relationship has otHours AND otRate */}
                  {(!selectedCheckForDetails.relationshipDetails || selectedCheckForDetails.relationshipDetails.length === 0 ||
                    !selectedCheckForDetails.relationshipDetails.some((rel: any) => rel.otHours && rel.otRate)) &&
                    (selectedCheckForDetails as any).otHours && (selectedCheckForDetails as any).otHours > 0 && (
                      <Typography variant="body2">
                        OT Hours: {(selectedCheckForDetails as any).otHours} @ ${((selectedCheckForDetails as any).otRate || parseFloat((selectedCheckForDetails as any).payRate || '0') * 1.5).toFixed(2)}/hr = ${((selectedCheckForDetails as any).otHours * ((selectedCheckForDetails as any).otRate || parseFloat((selectedCheckForDetails as any).payRate || '0') * 1.5)).toFixed(2)}
                      </Typography>
                  )}

                  {/* Holiday Hours - check if relationship has holidayHours AND holidayRate */}
                  {(!selectedCheckForDetails.relationshipDetails || selectedCheckForDetails.relationshipDetails.length === 0 ||
                    !selectedCheckForDetails.relationshipDetails.some((rel: any) => rel.holidayHours && rel.holidayRate)) &&
                    (selectedCheckForDetails as any).holidayHours && (selectedCheckForDetails as any).holidayHours > 0 && (
                      <Typography variant="body2">
                        Holiday Hours: {(selectedCheckForDetails as any).holidayHours} @ ${((selectedCheckForDetails as any).holidayRate || parseFloat((selectedCheckForDetails as any).payRate || '0') * 1.5).toFixed(2)}/hr = ${((selectedCheckForDetails as any).holidayHours * ((selectedCheckForDetails as any).holidayRate || parseFloat((selectedCheckForDetails as any).payRate || '0') * 1.5)).toFixed(2)}
                      </Typography>
                  )}

                  {/* Per Diem */}
                  {(!selectedCheckForDetails.relationshipDetails || selectedCheckForDetails.relationshipDetails.length === 0 ||
                    !selectedCheckForDetails.relationshipDetails.some((rel: any) => rel.perDiemDays && rel.perDiemDays > 0 && rel.perDiemRate)) &&
                    (selectedCheckForDetails as any).perDiemDays && (selectedCheckForDetails as any).perDiemDays > 0 && (selectedCheckForDetails as any).perDiemRate && (
                      <Typography variant="body2">
                        Per Diem: {(selectedCheckForDetails as any).perDiemDays} days @ ${(selectedCheckForDetails as any).perDiemRate}/day = ${((selectedCheckForDetails as any).perDiemDays * (selectedCheckForDetails as any).perDiemRate).toFixed(2)}
                      </Typography>
                  )}

                  {/* Per Diem Breakdown (always top-level if present and enabled) */}
                  {(selectedCheckForDetails as any).perdiemBreakdown && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="body2" fontWeight="bold">
                        Per Diem Breakdown:
                      </Typography>
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, idx) => {
                        const amount = (selectedCheckForDetails as any)[`perdiem${day}`];
                        return amount !== undefined && amount > 0 ? (
                          <Typography key={idx} variant="body2" sx={{ ml: 2 }}>
                            {day}: ${parseFloat(amount || '0').toFixed(2)}
                          </Typography>
                        ) : null;
                      })}
                    </Box>
                  )}

                  {/* Other Pay - ALWAYS shown last, from relationship or top-level */}
                  {(() => {
                    // Collect all "Other Pay" items
                    const allOtherPayItems: any[] = [];
                    
                    // Add relationship-specific other pay
                    if (selectedCheckForDetails.relationshipDetails && selectedCheckForDetails.relationshipDetails.length > 0) {
                      selectedCheckForDetails.relationshipDetails.forEach((rel: any) => {
                        if (rel.otherPay && rel.otherPay.length > 0) {
                          allOtherPayItems.push(...rel.otherPay);
                        }
                      });
                    }
                    
                    // Add top-level other pay (if not already in relationship)
                    if ((selectedCheckForDetails as any).otherPay && (selectedCheckForDetails as any).otherPay.length > 0) {
                      const topLevelOtherPay = (selectedCheckForDetails as any).otherPay;
                      // Only add if not already covered by relationship
                      if (!selectedCheckForDetails.relationshipDetails || 
                          !selectedCheckForDetails.relationshipDetails.some((rel: any) => rel.otherPay && rel.otherPay.length > 0)) {
                        allOtherPayItems.push(...topLevelOtherPay);
                      }
                    }
                    
                    // Display all "Other Pay" items at the end
                    return allOtherPayItems.length > 0 ? (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="body2" fontWeight="bold">
                          Other Pay:
                        </Typography>
                        {allOtherPayItems.map((item: any, idx: number) => (
                          <Typography key={idx} variant="body2" sx={{ ml: 2 }}>
                            {item.description}: ${parseFloat(item.amount || '0').toFixed(2)}
                          </Typography>
                        ))}
                      </Box>
                    ) : null;
                  })()}
                </Box>
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Total Amount:
                </Typography>
                <Typography variant="h5" fontWeight="bold" color="#2e7d32">
                  ${formatAmount(selectedCheckForDetails.amount)}
                </Typography>
              </Box>

              {selectedCheckForDetails.memo && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Memo:
                  </Typography>
                  <Typography variant="body2">
                    {selectedCheckForDetails.memo}
                  </Typography>
                </Box>
              )}

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Created by:
                </Typography>
                <Typography variant="body2">
                  {selectedCheckForDetails.createdBy && usersMap[selectedCheckForDetails.createdBy] 
                    ? usersMap[selectedCheckForDetails.createdBy].username 
                    : 'Unknown User'}
                </Typography>
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Date:
                </Typography>
                <Typography variant="body2">
                  {selectedCheckForDetails.date?.toDate?.()?.toLocaleDateString() || 'N/A'}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedCheckForDetails(null)}>Close</Button>
          {selectedCheckForDetails && (
            <>
              <Button
                variant="contained"
                color="success"
                onClick={() => {
                  handleReviewCheck(selectedCheckForDetails.id, true);
                  setSelectedCheckForDetails(null);
                }}
              >
                Approve
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={() => {
                  handleReviewCheck(selectedCheckForDetails.id, false);
                  setSelectedCheckForDetails(null);
                }}
              >
                Reject
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );

});

Dashboard.displayName = 'Dashboard';
export default Dashboard;
