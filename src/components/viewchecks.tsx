import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Box,
  Typography,
  Button,
  Paper,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Skeleton,
  CircularProgress
} from '@mui/material';
import {
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  query,
  where
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useLocation } from 'react-router-dom';
import { TextField } from '@mui/material';
import { getApiUrl } from '../config';
import { logger } from '../utils/logger';


interface Company {
  id: string;
  name: string;
}

interface CheckItem {
  id: string;
  companyId: string;
  employeeName: string;
  amount: number;
  memo?: string;
  date: Timestamp;
  createdBy?: string;
  hours?: number;
  otHours?: number;
  holidayHours?: number;
  payRate?: number;
  payType?: string;
  checkNumber?: number;   // ✅ add this
  reviewed?: boolean;
}



interface UserMap {
  [uid: string]: string;
}

interface ChecksProps {
  filter: {
    companyId?: string;
    weekKey?: string;
    createdBy?: string;
  };
  onClearFilter: () => void;
  users: any[];
  companies: any[];
  checks: any[];
  usersLoading: boolean;
  companiesLoading: boolean;
  checksLoading: boolean;
  onReviewUpdated: () => void;
  refetchChecks: () => void;
  currentRole: string;
  companyIds?: string[];
}

// Helper function to get ISO week number
const getISOWeek = (date: Date): number => {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  // January 4 is always in week 1
  const week1 = new Date(d.getFullYear(), 0, 4);
  // Adjust to Thursday in week 1 and count weeks
  const week = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return week;
};

const Checks: React.FC<ChecksProps> = ({ filter, onClearFilter }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const [selectedCreatedBy, setSelectedCreatedBy] = useState<string | null>(null);

  const [currentRole, setCurrentRole] = useState<string>('user');
  const [userMap, setUserMap] = useState<UserMap>({});
  const [showReviewedBanner, setShowReviewedBanner] = useState(false);

  const [searchText, setSearchText] = useState('');
  const dataReady = checks.length > 0;
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [forceRefresh, setForceRefresh] = useState<number>(0);

  // Only refresh when needed, not on initial mount
  



  
  const fetchData = async () => {
    const checksSnap = await getDocs(collection(db, 'checks'));
    const rawChecks = checksSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  
    const user = auth.currentUser;
    if (!user) return;
  
    let filtered = rawChecks;
    if (currentRole !== 'admin') {
      filtered = rawChecks.filter((c: any) => c.createdBy === user.uid);
    }
  
    const companyToFilter = filter?.companyId || selectedCompanyId;
    const weekToFilter = filter?.weekKey || selectedWeekKey;
    const createdByToFilter = filter?.createdBy || selectedCreatedBy;
  
    if (companyToFilter) {
      filtered = filtered.filter((c: any) => c.companyId === companyToFilter);
    }
    if (weekToFilter) {
      filtered = filtered.filter((c: any) => {
        const dateObj = (c.date instanceof Timestamp) ? c.date.toDate() : new Date(c.date);
        // Inline week key calculation
        const d = new Date(dateObj);
        const weekKey = new Date(d.setDate(d.getDate() - d.getDay())).toISOString().slice(0, 10);
        return weekKey === weekToFilter;
      });
    }
    if (createdByToFilter) {
      filtered = filtered.filter((c: any) => c.createdBy === createdByToFilter);
    }
  
    setChecks(filtered);
    if (companyToFilter) setSelectedCompanyId(companyToFilter);
  };
  
  


  const handleOpenDialog = (check: CheckItem) => {
  setSelectedCheck(check);
  setOpenDialog(true);
};

const handleCloseDialog = () => {
  setOpenDialog(false);
  setSelectedCheck(null);
};


const handleMarkCheckReviewed = async () => {
  if (!selectedCheck) return;

  try {
    // Update check in Firestore
    await updateDoc(doc(db, 'checks', selectedCheck.id), {
      reviewed: true
    });

    // Refresh the local state
    setChecks(prev =>
      prev.map(c =>
        c.id === selectedCheck.id ? { ...c, reviewed: true } : c
      )
    );

    // Optionally close dialog after marking
    setOpenDialog(false);
    setSelectedCheck(null);
  }  catch (err) {
    console.error("Error sending review request", err instanceof Error ? err.message : err);
    alert("❌ Failed to send review request");
  }
  
};
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<CheckItem | null>(null);


  const location = useLocation();

  // Parse filters from URL if present
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlCompany = params.get('companyId');
    const urlWeek = params.get('weekKey');
    const urlCreatedBy = params.get('createdBy');
    if (urlCompany) setSelectedCompanyId(urlCompany);
    if (urlWeek) setSelectedWeekKey(urlWeek);
    if (urlCreatedBy) setSelectedCreatedBy(urlCreatedBy);
  }, [location.search]);

  // Smart refresh when selectedCompanyId changes (user clicks on a company)
  useEffect(() => {
    if (selectedCompanyId) {
      logger.log('Company selected, refreshing checks');
      setForceRefresh(prev => prev + 1);
    }
  }, [selectedCompanyId]);

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, 'users'));
      const map: UserMap = {};
      snap.docs.forEach((d) => {
        const data = d.data() as any;
        map[d.id] = data.username || data.email || 'Unknown';
      });
      setUserMap(map);
    };
    fetchUsers();
  }, []);

  // Fetch companies
  useEffect(() => {
    const fetchCompanies = async () => {
      const user = auth.currentUser;
      if (!user) return;
  
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if (!userSnap.exists()) return;
  
      const userData = userSnap.data() as any;
      const role = userData.role || 'user';
  
      if (role === 'admin') {
        // Load ALL companies for admin
        const compSnap = await getDocs(collection(db, 'companies'));
        setCompanies(
          compSnap.docs.map((doc) => ({
            id: doc.id,
            name: doc.data()?.name || 'Unnamed',
          }))
        );
      } else {
        // Load only assigned companies
        const companyIds: string[] = userData.companyIds || [];
        const companyDocs = await Promise.all(
          companyIds.map((id) => getDoc(doc(db, 'companies', id)))
        );
        const filteredCompanies = companyDocs
          .filter((doc) => doc.exists())
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data?.name || 'Unnamed',
            };
          });
        setCompanies(filteredCompanies);
      }
    };
  
    fetchCompanies();
  }, []);
  
  


// Removed auto-refresh timer as requested by user



  // Fetch current user role
  useEffect(() => {
    const fetchRole = async () => {
      const user = auth.currentUser;
      if (!user) return;
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const data = snap.data() as any;
        setCurrentRole(data.role || 'user');
      }
    };
    fetchRole();
  }, []);

  // Fetch pending reviews
  useEffect(() => {
    const fetchPending = async () => {
      if (currentRole !== 'admin') return;
      const qSnap = await getDocs(
        query(collection(db, 'reviewRequest'), where('reviewed', '==', false))
      );
      setPendingReviews(qSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchPending();
  }, [currentRole, showReviewedBanner]);

  // Single efficient data fetching effect
  useEffect(() => {
    const fetchChecks = async () => {
      if (!auth.currentUser || !currentRole) {
        logger.log('⏳ Waiting for auth and role...');
        return;
      }

      // Cache check - don't refetch if we just fetched in the last 2 seconds
      const now = Date.now();
      if (now - lastFetchTime < 2000 && forceRefresh === 0) {
        logger.log('⏭️ Skipping fetch - data is fresh');
        return;
      }

      // If force refresh is active, clear the cache
      if (forceRefresh > 0) {
        logger.log('🔄 Force refresh active, bypassing cache');
      }

      logger.log('🚀 Fetching checks...');
      const startTime = performance.now();

      // Build server-side query for better performance
      let checksQuery: any = collection(db, 'checks');
      
      // Apply company filter on server if available
      const companyToFilter = filter?.companyId || selectedCompanyId;
      if (companyToFilter) {
        checksQuery = query(checksQuery, where('companyId', '==', companyToFilter));
      }
      
      // Apply user filter on server for non-admin users
      if (currentRole !== 'admin') {
        checksQuery = query(checksQuery, where('createdBy', '==', auth.currentUser?.uid));
      }

      // Only fetch if we have a company selected or a filter
      if (!companyToFilter && !filter?.companyId) {
        logger.log('⏭️ No company selected, skipping fetch');
        return;
      }

      const checksSnap = await getDocs(checksQuery);
      const rawChecks = checksSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      // Apply remaining filters on client (week and createdBy)
      let filtered = rawChecks;
      const weekToFilter = filter?.weekKey || selectedWeekKey;
      const createdByToFilter = filter?.createdBy || selectedCreatedBy;

          if (weekToFilter) {
      filtered = filtered.filter((c: any) => {
        const dateObj = c.date instanceof Timestamp ? c.date.toDate() : new Date(c.date);
        // Inline week key calculation
        const d = new Date(dateObj);
        const weekKey = new Date(d.setDate(d.getDate() - d.getDay())).toISOString().slice(0, 10);
        return weekKey === weekToFilter;
      });
    }
      if (createdByToFilter) {
        filtered = filtered.filter((c: any) => c.createdBy === createdByToFilter);
      }

      const endTime = performance.now();
      logger.log(`✅ Fetched ${filtered.length} checks in ${(endTime - startTime).toFixed(2)}ms`);
      
      setChecks(filtered);
      setLastFetchTime(Date.now());
      setForceRefresh(0); // Reset force refresh after successful fetch
      // Only set selectedCompanyId if we have a specific filter from props
      if (filter?.companyId) {
        setSelectedCompanyId(filter.companyId);
      }
      // Don't clear selectedCompanyId here - let the user's selection persist
    };

    fetchChecks();
  }, [auth.currentUser, currentRole, filter, selectedCompanyId, selectedWeekKey, selectedCreatedBy, forceRefresh]);
  

  
  


  // Prevent duplicate review
  const handleSendForReview = async (weekKey: string) => {
    const user = auth.currentUser;
    if (!user || !selectedCompanyId) return;
    const existingSnap = await getDocs(query(
      collection(db, 'reviewRequest'),
      where('companyId', '==', selectedCompanyId),
      where('weekKey', '==', weekKey),
      where('createdBy', '==', user.uid),
      where('reviewed', '==', false)
    ));
    if (!existingSnap.empty) {
      alert('⚠️ Already sent for review.');
      return;
    }

    await addDoc(collection(db, 'reviewRequest'), {
      companyId: selectedCompanyId,
      weekKey,
      createdBy: user.uid,
      reviewed: false,
      createdAt: serverTimestamp()
    });
    alert(`✅ Checks for week ${weekKey} sent to admin for review!`);
  };



  // Mark all reviewed
  const handleMarkAllReviewed = async () => {
    if (!selectedCompanyId || !selectedWeekKey) return;
  
    // ✅ update reviewRequest
    const qRef = query(
      collection(db, 'reviewRequest'),
      where('companyId', '==', selectedCompanyId),
      where('weekKey', '==', selectedWeekKey),
      where('reviewed', '==', false)
    );
    const qSnap = await getDocs(qRef);
    await Promise.all(
      qSnap.docs.map((d) =>
        updateDoc(doc(db, 'reviewRequest', d.id), { reviewed: true })
      )
    );
  
    // ✅ update checks for same company/week
    const checksRef = collection(db, 'checks');
    const checksSnap = await getDocs(
      query(checksRef, where('companyId', '==', selectedCompanyId))
    );
  
    const weekStart = new Date(selectedWeekKey);
    weekStart.setHours(0, 0, 0, 0);
  
    const updates: Promise<void>[] = [];
    checksSnap.forEach((d) => {
      const c = d.data() as any;
      const cDate = (c.date instanceof Timestamp) ? c.date.toDate() : new Date(c.date);
              // Inline week key calculation
        const dateObj = new Date(cDate);
        const weekKey = new Date(dateObj.setDate(dateObj.getDate() - dateObj.getDay())).toISOString().slice(0, 10);
        if (weekKey === selectedWeekKey) {
          updates.push(updateDoc(doc(db, 'checks', d.id), { reviewed: true }));
        }
    });
    await Promise.all(updates);
  
    // ✅ UI updates
    setShowReviewedBanner(true);
    setSelectedCompanyId(null);
    setSelectedWeekKey(null);
    setSelectedCreatedBy(null);
    if (onClearFilter) onClearFilter();
  };
  

  const filteredChecks = React.useMemo(() => {
    if (!selectedCompanyId) return [];
    if (checks.length === 0) return [];
    return checks.filter(c => c.companyId === selectedCompanyId);
  }, [selectedCompanyId, checks]);
  

  const checksByWeek: { [week: string]: CheckItem[] } = {};
  filteredChecks.forEach(c => {
    const dateObj = (c.date instanceof Timestamp) ? c.date.toDate() : new Date(c.date);
          // Inline week key calculation
      const d = new Date(dateObj);
      const key = new Date(d.setDate(d.getDate() - d.getDay())).toISOString().slice(0, 10);
    if (!checksByWeek[key]) checksByWeek[key] = [];
    checksByWeek[key].push(c);
  });

  let sortedWeekKeys = Object.keys(checksByWeek).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );
  if (selectedWeekKey) {
    sortedWeekKeys = sortedWeekKeys.filter(k => k === selectedWeekKey);
  }

  const handlePrintWeek = async (weekKey: string) => {
    if (!selectedCompanyId) return;
    const printWeekUrl = getApiUrl(`/api/print_week?companyId=${selectedCompanyId}&weekKey=${weekKey}`);
    const response = await fetch(printWeekUrl);
    if (!response.ok) {
      alert('Error fetching PDF.');
      return;
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `checks_${weekKey}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Checks</Typography>

      {showReviewedBanner && (
        <Box sx={{ p:2, mb:2, backgroundColor:'#e6f4ea', border:'1px solid #b7e1cd', borderRadius:1 }}>
          <Typography variant="body1" fontWeight="bold">
            ✅ All checks for that company have been reviewed.
          </Typography>
          <Typography variant="body2">You are now viewing the list of all companies.</Typography>
        </Box>
      )}

{!selectedCompanyId ? (
  <>
    {/* ✅ Pending Review Requests */}
    {currentRole === 'admin' && pendingReviews.length > 0 && (
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>Pending Review Requests</Typography>
        {pendingReviews.map(req => (
          <Paper
            key={req.id}
            sx={{
              p: 2,
              mb: 1,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 'bold' }}>
                📌 Week {req.weekKey} – {companies.find(c => c.id === req.companyId)?.name || 'Unknown'}
              </Typography>
              <Typography variant="body2">
  Made by: {req.createdBy ? userMap[req.createdBy] || 'Unknown' : 'Unknown'}
</Typography>

              <Typography variant="body2" color="text.secondary">
                Requires review before printing
              </Typography>
            </Box>
            <Button
              variant="outlined"
              onClick={() => {
                setSelectedCompanyId(req.companyId);
                setSelectedWeekKey(req.weekKey);
                setSelectedCreatedBy(req.createdBy);
              }}
            >
              REVIEW
            </Button>
          </Paper>
        ))}
      </Box>
    )}

    {/* ✅ Always show the company list */}
    <Typography variant="h6">Select a Company:</Typography>
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 2 }}>
      {companies.map(c => (
        <Button
          key={c.id}
          variant="contained"
          onClick={() => setSelectedCompanyId(c.id)}
          sx={{ maxWidth: 300, textAlign: 'left' }}
        >
          {c.name}
        </Button>
      ))}
    </Box>
  </>
) : (
  <>
          <Button
            variant="outlined"
            sx={{ mb: 3 }}
            onClick={() => {
              setSelectedCompanyId(null);
              setSelectedWeekKey(null);
              setSelectedCreatedBy(null);
              if (onClearFilter) onClearFilter();
            }}
          >
            ← Back to Companies
          </Button>
          {/* ✅ Show reviewer name if selected */}
{selectedCreatedBy && (
  <Typography variant="h6" sx={{ mb: 1 }}>
    🔎 Review for {userMap[selectedCreatedBy] || 'Unknown user'}
  </Typography>
)}

          <Typography variant="h6" gutterBottom>
            Checks for {companies.find(c => c.id === selectedCompanyId)?.name}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', my: 2 }}>
              <TextField
                label="Search by Employee or Creator"
                variant="outlined"
                sx={{ maxWidth: 400 }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value.toLowerCase())}
              />
              <Button
                variant="outlined"
                onClick={() => {
                  logger.log('🔄 Manual refresh triggered');
                  setForceRefresh(prev => prev + 1);
                }}
              >
                 Refresh
              </Button>
            </Box>
          </Typography>
          


          {currentRole === 'admin' &&
 selectedWeekKey &&
 pendingReviews.some(
   (req) => req.companyId === selectedCompanyId && req.weekKey === selectedWeekKey && req.reviewed === false
 ) && (
  <Button
    variant="contained"
    color="success"
    sx={{ my: 2 }}
    onClick={handleMarkAllReviewed}
  >
     Mark All as Reviewed
  </Button>
)}


          {sortedWeekKeys.length === 0 ? (
            <Typography>No checks found for this company.</Typography>
          ) : (
            sortedWeekKeys.map(weekKey => {
              // Calculate work week number (pay week = current week - 1)
              const weekKeyDate = new Date(weekKey);
              const currentWeekNumber = getISOWeek(weekKeyDate);
              const payWeekNumber = currentWeekNumber - 1;
              
              return (
              <Paper key={weekKey} sx={{ p: 2, mb: 3 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  Pay Week {payWeekNumber} - Week starting: {weekKey}
                </Typography>

                {currentRole === 'admin' ? (
                  <Button
                    variant="contained"
                    color="secondary"
                    sx={{ my: 1 }}
                    onClick={() => handlePrintWeek(weekKey)}
                  >
                     Export PDF
                  </Button>
                ) : (
                  <Button
                    variant="outlined"
                    color="primary"
                    sx={{ my: 1 }}
                    onClick={() => handleSendForReview(weekKey)}
                  >
                     Send to Admin for Review
                  </Button>
                )}

                <Divider sx={{ my: 1 }} />

                {checksByWeek[weekKey]
  .filter(check => {
    const nameMatch = check.employeeName?.toLowerCase().includes(searchText);
    const madeByMatch = check.createdBy && userMap[check.createdBy]
    ? userMap[check.createdBy].toLowerCase().includes(searchText)
    : false;
  
    return nameMatch || madeByMatch;
  })
  .sort((a, b) => (b.checkNumber ?? 0) - (a.checkNumber ?? 0))

// ✅ sort by checkNumber ascending
  .map(check => {
    const d = (check.date instanceof Timestamp) ? check.date.toDate() : new Date(check.date);
    const madeByName = check.createdBy ? userMap[check.createdBy] || 'Unknown' : 'Unknown';


    
    return (
      <Box
        key={check.id}
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          border: '1px solid #ddd',
          borderRadius: 1,
          p: 1,
          mb: 1
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {/* ✅ show check number */}
          
          <Typography><strong>Check #:</strong> {check.checkNumber ?? 'N/A'}</Typography>
          <Typography><strong>Employee:</strong> {check.employeeName}</Typography>
          <Typography><strong>Amount:</strong> ${check.amount.toFixed(2)}</Typography>

          {check.reviewed ? (
  <Typography sx={{ color: 'green', fontWeight: 'bold' }}>✅ Reviewed</Typography>
) : (
  <Typography sx={{ color: 'orange', fontWeight: 'bold' }}>⏳ Pending</Typography>
)}

          
          {check.memo && (
            <Typography><strong>Memo:</strong> {check.memo}</Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            Date: {d.toLocaleDateString()}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            sx={{ mt: 1 }}
            onClick={() => handleOpenDialog(check)}
          >
            🔎 Details
          </Button>
        </Box>
        <Box sx={{ textAlign: 'right', minWidth: 120 }}>
          <Typography variant="body2" color="text.secondary">
            Made by: {madeByName}
          </Typography>
        </Box>
      </Box>
    );
  })}


              </Paper>
              );
            })
          )}
        </>
      )}
<Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
  <DialogTitle>Check Details</DialogTitle>
  <DialogContent dividers>
    {selectedCheck ? (
      <>
        <Typography><strong>Employee:</strong> {selectedCheck.employeeName}</Typography>
        <Typography><strong>Company:</strong> {companies.find(c => c.id === selectedCheck.companyId)?.name}</Typography>
        <Divider sx={{ my: 1 }} />
        <Typography><strong>Regular Hours:</strong> {selectedCheck.hours || 0}</Typography>
        <Typography><strong>OT Hours:</strong> {selectedCheck.otHours || 0}</Typography>
        <Typography><strong>Holiday Hours:</strong> {selectedCheck.holidayHours || 0}</Typography>
        <Divider sx={{ my: 1 }} />
        <Typography><strong>Base Rate:</strong> ${selectedCheck.payRate?.toFixed(2) || '0.00'}</Typography>
        <Typography><strong>Calculated Amount:</strong> ${selectedCheck.amount?.toFixed(2)}</Typography>
        {selectedCheck.memo && (
          <Typography><strong>Memo:</strong> {selectedCheck.memo}</Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          Date: {selectedCheck.date instanceof Timestamp
            ? selectedCheck.date.toDate().toLocaleString()
            : new Date(selectedCheck.date).toLocaleString()}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Made by: {selectedCheck.createdBy ? userMap[selectedCheck.createdBy] || 'Unknown' : 'Unknown'}
        </Typography>
        {currentRole === 'admin' && selectedCheck && !selectedCheck.reviewed && (
          <Button
            variant="contained"
            color="success"
            sx={{ mt: 2 }}
            onClick={handleMarkCheckReviewed}
          >
             Mark as Reviewed
          </Button>
        )}
      </>
    ) : (
      <Typography>No check selected.</Typography>
    )}
  </DialogContent>
  <DialogActions>
    <Button onClick={handleCloseDialog}>Close</Button>
  </DialogActions>
</Dialog>

      
    </Box>
  );
  
};

export default Checks;
