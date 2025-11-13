import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { formatDateForDisplay } from '../utils/dateUtils';
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
  CircularProgress,
  TextField,
  Chip,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  Avatar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar
} from '@mui/material';
import { auth } from '../firebase';
import { useLocation } from 'react-router-dom';
import { Delete as DeleteIcon } from '@mui/icons-material';
import {
  doc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  deleteDoc
} from 'firebase/firestore';

import { db } from '../firebase';
import { usePrintPermissions } from '../hooks/usePrintPermissions'; // ✅ Import the print permissions hook
import { decryptData } from '../utils/encryption';  // Import decryptData function
import Notifications from './Notifications';
import { getApiUrl } from '../config';


// Function to calculate ISO week number
const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7) + 1;
};

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getStartOfWeek = (date: Date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};

// Week key calculation functions
// All functions return the Monday of the respective week in YYYY-MM-DD format

// Get current week key (Monday of current week)
const getCurrentWeekKey = () => {
  return formatDateKey(getStartOfWeek(new Date()));
};

// Get next week key (Monday of next week)
const getNextWeekKey = () => {
  const start = getStartOfWeek(new Date());
  start.setDate(start.getDate() + 7);
  return formatDateKey(start);
};

// Get past week key (Monday of previous week)
const getPastWeekKey = () => {
  const start = getStartOfWeek(new Date());
  start.setDate(start.getDate() - 7);
  return formatDateKey(start);
};

// Get available years from weekKeys
const getAvailableYears = (weekKeys: string[]) => {
  const years = new Set(weekKeys.map(weekKey => new Date(weekKey).getFullYear().toString()));
  return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
};
interface Company {
  id: string;
  name: string;
  logoBase64?: string;
}

interface CheckItem {
  id: string;
  companyId: string;
  employeeName: string;
  amount: number;
  memo?: string;
  date: any;
  createdBy?: string;
  hours?: number;
  otHours?: number;
  holidayHours?: number;
  payRate?: number;
  payType?: string;
  checkNumber?: number;
  reviewed?: boolean;
  paid?: boolean;
  clientId?: string;
  weekKey?: string;
  perdiemAmount?: number;
  perdiemBreakdown?: boolean;
  perdiemMonday?: number;
  perdiemTuesday?: number;
  perdiemWednesday?: number;
  perdiemThursday?: number;
  perdiemFriday?: number;
  perdiemSaturday?: number;
  perdiemSunday?: number;
  selectedRelationshipIds?: string[];
  relationshipDetails?: Array<{
    id: string;
    clientId: string;
    clientName: string;
    payType: string;
    payRate?: number;
    hours?: number;
    otHours?: number;
    holidayHours?: number;
    perdiemAmount?: number;
    perdiemBreakdown?: boolean;
    perdiemMonday?: number;
    perdiemTuesday?: number;
    perdiemWednesday?: number;
    perdiemThursday?: number;
    perdiemFriday?: number;
    perdiemSaturday?: number;
    perdiemSunday?: number;
    otherPay?: Array<{
      id: string;
      description: string;
      amount: string;
    }>;
  }>;
  relationshipHours?: { [key: string]: number };
  otherPay?: Array<{
    id: string;
    description: string;
    amount: string;
  }>;
}

interface Client {
  id: string;
  name: string;
  companyIds?: string[];
  active: boolean;
  division?: string;
}

interface UserMap {
  [uid: string]: string;
}

interface ChecksProps {
  filter: {
    companyId?: string | { in: string[] };
    weekKey?: string;
    createdBy?: string;
  };
  onClearFilter: () => void;
  users: any[];
  companies: any[];
  banks: any[];
  checks: any[];
  usersLoading: boolean;
  companiesLoading: boolean;
  banksLoading: boolean;
  checksLoading: boolean;
  onReviewUpdated: () => void;
  refetchChecks: () => void;
  currentRole: string;
  companyIds: string[];
  visibleClientIds: string[]; // IDs of clients this user can see
}

const OptimizedViewChecks: React.FC<ChecksProps> = ({ filter, onClearFilter, users, companies, banks, checks, usersLoading, companiesLoading, banksLoading, checksLoading, onReviewUpdated, refetchChecks, currentRole, companyIds, visibleClientIds }) => {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const [selectedCreatedBy, setSelectedCreatedBy] = useState<string | null>(null);
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<string>('past');
  const [selectedYear, setSelectedYear] = useState<string>('2025');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  
  // Admin review floating menu states
  const [showReviewMenu, setShowReviewMenu] = useState(false);
  const [pendingReviewChecks, setPendingReviewChecks] = useState<CheckItem[]>([]);
  const [reviewMenuPosition, setReviewMenuPosition] = useState({ x: 0, y: 0 });
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedChecks, setSelectedChecks] = useState<Set<string>>(new Set());
  const [selectedCheck, setSelectedCheck] = useState<CheckItem | null>(null);
  const [openPendingChecksDialog, setOpenPendingChecksDialog] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showBulkReviewConfirm, setShowBulkReviewConfirm] = useState(false);
  const [bulkReviewData, setBulkReviewData] = useState<{
    companyId: string;
    weekKey: string;
    count: number;
    companyName: string;
    isSelectedChecks: boolean;
  } | null>(null);

  const location = useLocation();

  const [visibleCompanies, setVisibleCompanies] = useState<Company[]>([]);
const [userLoaded, setUserLoaded] = useState(false);

  // Add a state to track if we are in 'review only' mode (admin only)
  const [reviewOnly, setReviewOnly] = useState(false);

  // Snackbar notification state
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  
  // Delete confirmation dialog state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [checkToDelete, setCheckToDelete] = useState<CheckItem | null>(null);
  
  // Bulk delete confirmation dialog state
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteChecks, setBulkDeleteChecks] = useState<CheckItem[]>([]);
  
  // Track checks sent for review to disable buttons
  const [checksSentForReview, setChecksSentForReview] = useState<Set<string>>(new Set());

  // Clear sent for review state when checks are refreshed
  useEffect(() => {
    setChecksSentForReview(new Set());
  }, [checks]);

  // When filter with companyId and weekKey is set, enable reviewOnly mode
  useEffect(() => {
    if (filter && filter.companyId && filter.weekKey && currentRole === 'admin') {
      console.log('[DEBUG] Filter detected, enabling reviewOnly mode for admin');
      setReviewOnly(true);
    } else {
      console.log('[DEBUG] No filter or not admin, reviewOnly mode disabled');
      setReviewOnly(false);
    }
  }, [filter, currentRole]);

  // Fetch pending review checks for admin users
  useEffect(() => {
    if (currentRole === 'admin') {
      const fetchPendingReviews = async () => {
        try {
          const reviewSnap = await getDocs(collection(db, "reviewRequest"));
          const pendingReviews = reviewSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter((review) => !review.reviewed && review.status === "pending");

          // Get the actual check data for pending reviews
          const pendingCheckIds = pendingReviews.map(review => review.checkId);
          const pendingChecks = checks.filter(check => pendingCheckIds.includes(check.id));
          setPendingReviewChecks(pendingChecks);
        } catch (err) {
          console.error("Error fetching pending reviews:", err);
        }
      };
      fetchPendingReviews();
    }
  }, [currentRole, checks]);

  // Admin review floating menu functions
  const handleShowReviewMenu = (event: React.MouseEvent) => {
    if (pendingReviewChecks.length > 0) {
      setReviewMenuPosition({ x: event.clientX, y: event.clientY });
      setShowReviewMenu(true);
    }
  };

  const handleCloseReviewMenu = () => {
    setShowReviewMenu(false);
  };

  const handleReviewCheck = async (checkId: string, approved: boolean) => {
    try {
      // Update the check's reviewed status
      const checkRef = doc(db, 'checks', checkId);
      await updateDoc(checkRef, { reviewed: approved });

      // Update the review request status
      const reviewQuery = query(
        collection(db, "reviewRequest"),
        where("checkId", "==", checkId)
      );
      const reviewSnap = await getDocs(reviewQuery);
      const batch = writeBatch(db);
      reviewSnap.docs.forEach(doc => {
        batch.update(doc.ref, { 
          reviewed: approved, 
          status: approved ? "approved" : "rejected",
          reviewedAt: serverTimestamp()
        });
      });
      await batch.commit();

      // Remove from pending reviews
      setPendingReviewChecks(prev => prev.filter(check => check.id !== checkId));
      
      // Refresh data
      if (refetchChecks) {
        refetchChecks();
      }
      if (onReviewUpdated) {
        onReviewUpdated();
      }

      setSnackbarMessage(`✅ Check ${approved ? 'approved' : 'rejected'} successfully!`);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      
    } catch (err) {
      console.error("Error reviewing check:", err);
      setSnackbarMessage(`❌ Failed to ${approved ? 'approve' : 'reject'} check`);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  // Add a button to clear reviewOnly mode
  const calculatePerDiemTotal = (check: CheckItem) => {
    if (check.perdiemBreakdown) {
      // Calculate from daily breakdown
      const monday = check.perdiemMonday || 0;
      const tuesday = check.perdiemTuesday || 0;
      const wednesday = check.perdiemWednesday || 0;
      const thursday = check.perdiemThursday || 0;
      const friday = check.perdiemFriday || 0;
      const saturday = check.perdiemSaturday || 0;
      const sunday = check.perdiemSunday || 0;
      
      return (monday + tuesday + wednesday + thursday + friday + saturday + sunday).toFixed(2);
    } else {
      // Use full amount
      return (check.perdiemAmount || 0).toFixed(2);
    }
  };

  const handleClearReviewOnly = () => setReviewOnly(false);

  // Debounce search text to reduce re-renders
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchText]);

  // Parse filters from URL if present
  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlCompany = params.get('companyId');
    const urlWeek = params.get('weekKey');
    const urlCreatedBy = params.get('createdBy');
    const urlClientId = params.get('clientId');
    
    if (urlCompany) setSelectedCompanyId(urlCompany);
    if (urlWeek) setSelectedWeekKey(urlWeek);
    if (urlCreatedBy) setSelectedCreatedBy(urlCreatedBy);
    if (urlClientId) setSelectedClientId(urlClientId);
    
    // Clear URL parameters after setting them to avoid confusion
    if (urlCompany || urlWeek || urlCreatedBy || urlClientId) {
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [location.search]);

  // Add effect to sync filter prop to state
  useEffect(() => {
    if (filter) {
      console.log('[DEBUG] Filter received:', filter);
      if (filter.companyId && typeof filter.companyId === 'string' && filter.companyId !== selectedCompanyId) {
        console.log('[DEBUG] Setting selectedCompanyId from filter:', filter.companyId);
        setSelectedCompanyId(filter.companyId);
        // Reset week selection when company changes
        setSelectedWeekKey(null);
        setIsSelectingWeek(false);
      }
      if (filter.weekKey && filter.weekKey !== selectedWeekKey) {
        console.log('[DEBUG] Setting selectedWeekKey from filter:', filter.weekKey);
        setSelectedWeekKey(filter.weekKey);
        setIsSelectingWeek(false);
      }
      if (filter.createdBy && filter.createdBy !== selectedCreatedBy) {
        console.log('[DEBUG] Setting selectedCreatedBy from filter:', filter.createdBy);
        setSelectedCreatedBy(filter.createdBy);
      }
    }
    // eslint-disable-next-line
  }, [filter]);

  // Fetch current user role
  const handleSendForReview = async (check: CheckItem, weekKey: string) => {
    try {
      const currentUser = auth.currentUser;
      console.log('[DEBUG] handleSendForReview - currentUser:', currentUser?.uid);
      console.log('[DEBUG] handleSendForReview - check:', check.id, check.companyId);
      console.log('[DEBUG] handleSendForReview - weekKey:', weekKey);
      
      if (!currentUser) {
        alert("❌ You must be logged in to send review requests");
        return;
      }
      
      const reviewRequestData = {
        checkId: check.id,
        createdBy: currentUser.uid, // Use current user's UID, not the check's createdBy
        createdAt: serverTimestamp(),
        companyId: check.companyId,
        weekKey: weekKey,
        status: "pending"
      };
      
      console.log('[DEBUG] handleSendForReview - reviewRequestData:', reviewRequestData);
      
      const docRef = await addDoc(collection(db, "reviewRequest"), reviewRequestData);
      console.log('[DEBUG] handleSendForReview - created doc with ID:', docRef.id);
      
      // Add check to sent for review set
      setChecksSentForReview(prev => new Set(prev).add(check.id));
      
      // Show success notification
      setSnackbarMessage("✅ Check sent for admin review successfully!");
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (err: any) {
      console.error("Error sending review request", err);
      console.error("Error details:", {
        code: err.code,
        message: err.message,
        stack: err.stack
      });
      
      // Show error notification
      setSnackbarMessage("❌ Failed to send review request. Please try again.");
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  // Bulk send selected checks for review (for regular users)
  const handleBulkSendSelectedForReview = async () => {
    if (selectedChecks.size === 0) {
      alert("❌ Please select at least one check to send for review");
      return;
    }

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        alert("❌ You must be logged in to send review requests");
        return;
      }

      // Get the selected checks
      const selectedChecksList = Array.from(selectedChecks);
      const checksToSend = checks.filter((check: CheckItem) => 
        selectedChecksList.includes(check.id) && !check.reviewed
      );

      if (checksToSend.length === 0) {
        alert("❌ No valid checks found to send for review (some may already be reviewed)");
        return;
      }

      console.log(`[DEBUG] Sending ${checksToSend.length} selected checks for review`);

      // Create review requests for all selected checks
      const batch = writeBatch(db);
      let successCount = 0;

      for (const check of checksToSend) {
        const reviewRequestData = {
          checkId: check.id,
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
          companyId: check.companyId,
          weekKey: check.weekKey || 'global',
          status: "pending"
        };

        const docRef = doc(collection(db, "reviewRequest"));
        batch.set(docRef, reviewRequestData);
        successCount++;
      }

      await batch.commit();
      
      // Add checks to sent for review set
      const checkIds = checksToSend.map(check => check.id);
      setChecksSentForReview(prev => {
        const newSet = new Set(prev);
        checkIds.forEach(id => newSet.add(id));
        return newSet;
      });
      
      // Clear selection after successful send
      setSelectedChecks(new Set());
      
      // Show success notification
      setSnackbarMessage(`✅ Successfully sent ${successCount} check(s) for admin review!`);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      
    } catch (err: any) {
      console.error("Error sending selected checks for review", err);
      console.error("Error details:", {
        code: err.code,
        message: err.message,
        stack: err.stack
      });
      
      // Show error notification
      setSnackbarMessage("❌ Failed to send checks for review. Please try again.");
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  // Send all unreviewed checks for review (for regular users)
  const handleSendAllUnreviewedForReview = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        alert("❌ You must be logged in to send review requests");
        return;
      }

      // Get all unreviewed checks for the current company and week
      const unreviewedChecks = filteredChecks.filter((check: CheckItem) => !check.reviewed);

      if (unreviewedChecks.length === 0) {
        alert("❌ No unreviewed checks found to send for review");
        return;
      }

      console.log(`[DEBUG] Sending ${unreviewedChecks.length} unreviewed checks for review`);

      // Create review requests for all unreviewed checks
      const batch = writeBatch(db);
      let successCount = 0;

      for (const check of unreviewedChecks) {
        const reviewRequestData = {
          checkId: check.id,
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
          companyId: check.companyId,
          weekKey: check.weekKey || 'global',
          status: "pending"
        };

        const docRef = doc(collection(db, "reviewRequest"));
        batch.set(docRef, reviewRequestData);
        successCount++;
      }

      await batch.commit();
      
      // Add checks to sent for review set
      const checkIds = unreviewedChecks.map(check => check.id);
      setChecksSentForReview(prev => {
        const newSet = new Set(prev);
        checkIds.forEach(id => newSet.add(id));
        return newSet;
      });
      
      // Clear selection after successful send
      setSelectedChecks(new Set());
      
      // Show success notification
      setSnackbarMessage(`✅ Successfully sent ${successCount} unreviewed check(s) for admin review!`);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      
    } catch (err: any) {
      console.error("Error sending all unreviewed checks for review", err);
      console.error("Error details:", {
        code: err.code,
        message: err.message,
        stack: err.stack
      });
      
      // Show error notification
      setSnackbarMessage("❌ Failed to send checks for review. Please try again.");
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const handleDeleteCheck = async (check: CheckItem) => {
    // Show confirmation dialog for all users
    setCheckToDelete(check);
    setShowDeleteConfirm(true);
  };

  // Bulk delete selected checks (for regular users - only unreviewed checks)
  const handleBulkDeleteSelected = async () => {
    if (selectedChecks.size === 0) {
      alert("❌ Please select at least one check to delete");
      return;
    }

    // Filter to only unreviewed checks for regular users
    const selectedChecksList = Array.from(selectedChecks);
    const checksToDelete = filteredChecks.filter((check: CheckItem) => 
      selectedChecksList.includes(check.id) && !check.reviewed
    );

    if (checksToDelete.length === 0) {
      alert("❌ No valid checks found to delete (only unreviewed checks can be deleted)");
      return;
    }

    // Show confirmation dialog
    setBulkDeleteChecks(checksToDelete);
    setShowBulkDeleteConfirm(true);
  };

  // Confirm bulk delete operation
  const confirmBulkDelete = async () => {
    if (bulkDeleteChecks.length === 0) return;

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        alert("❌ You must be logged in to delete checks");
        return;
      }

      console.log(`[DEBUG] Deleting ${bulkDeleteChecks.length} selected checks`);

      // Delete all selected checks
      const batch = writeBatch(db);
      let successCount = 0;

      for (const check of bulkDeleteChecks) {
        const checkRef = doc(db, "checks", check.id);
        batch.delete(checkRef);
        successCount++;
      }

      await batch.commit();
      
      // Close confirmation dialog
      setShowBulkDeleteConfirm(false);
      setBulkDeleteChecks([]);
      
      // Clear selection after successful delete
      setSelectedChecks(new Set());
      
      // Show success message
      setSnackbarMessage(`✅ Successfully deleted ${successCount} check(s)`);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      
    } catch (err: any) {
      console.error("Error deleting selected checks", err);
      console.error("Error details:", {
        code: err.code,
        message: err.message,
        stack: err.stack
      });
      
      // Show error message
      setSnackbarMessage("❌ Failed to delete checks. Please try again.");
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const confirmDeleteCheck = async () => {
    if (!checkToDelete) return;

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        alert('❌ You must be logged in to delete checks');
        return;
      }

      // Check permissions based on user role
      if (currentRole === 'admin') {
        // Admins can delete unpaid checks
        if (checkToDelete.paid) {
          alert('❌ Cannot delete paid (printed) checks');
          return;
        }
      } else {
        // Regular users can only delete unreviewed checks
        if (checkToDelete.reviewed) {
          alert('❌ Cannot delete reviewed checks. Only unreviewed checks can be deleted.');
          return;
        }
      }

      console.log('[OptimizedViewChecks] 🗑️ Deleting check:', checkToDelete.id);

      // Get the check document from Firestore
      const checkRef = doc(db, 'checks', checkToDelete.id);
      const checkDoc = await getDoc(checkRef);
      
      if (!checkDoc.exists()) {
        throw new Error('Check not found');
      }

      const checkData = checkDoc.data();
      const checkNumber = checkData?.checkNumber;
      const companyId = checkData?.companyId;

      // Delete the check
      await deleteDoc(checkRef);
      console.log('[OptimizedViewChecks] ✅ Check deleted from Firestore');

      // Decrease subsequent check numbers if this check had a number
      if (checkNumber && companyId) {
        console.log(`🔍 DEBUG: Deleted check #${checkNumber} for company ${companyId}`);

        // Get all checks for this company first (avoid composite index requirement)
        const companyChecksQuery = query(
          collection(db, 'checks'),
          where('companyId', '==', companyId)
        );

        const companyChecksSnapshot = await getDocs(companyChecksQuery);

        // Filter and update checks with numbers greater than the deleted one
        const batch = writeBatch(db);
        companyChecksSnapshot.docs.forEach((docSnapshot) => {
          const checkData = docSnapshot.data();
          const currentCheckNumber = checkData.checkNumber;
          
          // Only update checks with numbers greater than the deleted one
          if (currentCheckNumber && currentCheckNumber > checkNumber) {
            const newCheckNumber = currentCheckNumber - 1;
            
            batch.update(docSnapshot.ref, {
              checkNumber: newCheckNumber
            });
            
            console.log(`🔍 DEBUG: Will decrease check #${currentCheckNumber} to #${newCheckNumber}`);
          }
        });

        // Also update the bank's nextCheckNumber to reflect the decrease
        const banksQuery = query(collection(db, 'banks'), where('companyId', '==', companyId));
        const banksSnapshot = await getDocs(banksQuery);

        banksSnapshot.docs.forEach((docSnapshot) => {
          const bankData = docSnapshot.data();
          const currentNextNumber = bankData.nextCheckNumber || 0;

          // Only decrease if the next number is greater than the deleted check number
          if (currentNextNumber > checkNumber) {
            const newNextNumber = currentNextNumber - 1;
            batch.update(docSnapshot.ref, {
              nextCheckNumber: newNextNumber
            });
            console.log(`🔍 DEBUG: Will update bank nextCheckNumber from ${currentNextNumber} to ${newNextNumber}`);
          }
        });

        // Commit all updates
        await batch.commit();
        console.log('[OptimizedViewChecks] ✅ Check numbers updated');
      }

      setSnackbarMessage('✅ Check deleted successfully!');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);

      // Refresh the checks list
      if (refetchChecks) {
        refetchChecks();
      }

      // Close both dialogs
      setShowDeleteConfirm(false);
      setCheckToDelete(null);
      handleCloseDialog();

    } catch (err: any) {
      console.error('[OptimizedViewChecks] Error deleting check:', err);
      alert(`❌ Failed to delete check: ${err.message}`);
    }
  };

  // Bulk mark all checks as reviewed for a specific company and week
  const handleBulkMarkAsReviewed = async (companyId: string, weekKey: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        alert("❌ You must be logged in to mark checks as reviewed");
        return;
      }

      // Get all checks for this company and week that haven't been reviewed yet
      const checksToReview = checks.filter((check: CheckItem) => 
        check.companyId === companyId && 
        check.weekKey === weekKey && 
        !check.reviewed
      );

      if (checksToReview.length === 0) {
        alert("All checks for this company and week are already reviewed!");
        return;
      }

      // Set confirmation data and show dialog
      setBulkReviewData({
        companyId,
        weekKey,
        count: checksToReview.length,
        companyName: companies.find(c => c.id === companyId)?.name || 'Unknown Company',
        isSelectedChecks: false
      });
      setShowBulkReviewConfirm(true);
    } catch (err: any) {
      console.error("Error preparing bulk review", err);
      alert("❌ Failed to prepare bulk review. Please try again.");
    }
  };

  // Execute the actual bulk review after confirmation
  const executeBulkReview = async () => {
    if (!bulkReviewData) return;
    
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        alert("❌ You must be logged in to mark checks as reviewed");
        return;
      }

      console.log(`[DEBUG] Bulk marking ${bulkReviewData.count} checks as reviewed`);

      let checksToReview: CheckItem[] = [];
      
      // Check if this is for selected checks or all checks
      if (bulkReviewData.isSelectedChecks) {
        // Get the selected checks
        const selectedChecksList = Array.from(selectedChecks);
        checksToReview = checks.filter((check: CheckItem) => 
          selectedChecksList.includes(check.id)
        );
      } else {
        // Get all checks for this company and week that haven't been reviewed yet
        checksToReview = checks.filter((check: CheckItem) => 
          check.companyId === bulkReviewData.companyId && 
          check.weekKey === bulkReviewData.weekKey && 
          !check.reviewed
        );
      }

      if (checksToReview.length === 0) {
        alert("❌ No checks found to review");
        return;
      }

      if (currentRole === 'admin') {
        // Admin: directly update the reviewed field
        const batch = writeBatch(db);
        checksToReview.forEach((check) => {
          const checkRef = doc(db, 'checks', check.id);
          batch.update(checkRef, { reviewed: true });
        });
        await batch.commit();
        
        console.log(`[DEBUG] Successfully marked ${checksToReview.length} checks as reviewed`);
      } else {
        // Non-admin: create review requests
        const reviewRequests = checksToReview.map((check: CheckItem) => ({
          checkId: check.id,
          createdBy: currentUser!.uid, // We know currentUser is not null here due to the check above
          createdAt: serverTimestamp(),
          companyId: check.companyId,
          weekKey: check.weekKey || 'global',
          status: "pending"
        }));

        const batch = writeBatch(db);
        reviewRequests.forEach((request) => {
          const docRef = doc(collection(db, "reviewRequest"));
          batch.set(docRef, request);
        });
        await batch.commit();
        
        console.log(`[DEBUG] Successfully created ${reviewRequests.length} review requests`);
      }
      
      // Clear selections if this was for selected checks
      if (bulkReviewData.isSelectedChecks) {
        setSelectedChecks(new Set());
      }
      
      // Refresh the checks data to show updated review status IMMEDIATELY
      if (refetchChecks) {
        await refetchChecks();
      }
      if (onReviewUpdated) {
        onReviewUpdated();
      }
      
      // Show success message after refresh
      if (currentRole === 'admin') {
        showNotification(`Successfully marked ${checksToReview.length} checks as reviewed!`, 'success');
      } else {
        showNotification(`✅ Successfully sent ${checksToReview.length} checks for review!`, 'success');
      }
    } catch (err: any) {
      console.error("Error bulk marking checks as reviewed", err);
      console.error("Error details:", {
        code: err.code,
        message: err.message,
        stack: err.stack
      });
      alert("❌ Failed to mark checks as reviewed. Please try again.");
    } finally {
      // Close confirmation dialog
      setShowBulkReviewConfirm(false);
      setBulkReviewData(null);
    }
  };

  // Bulk send for review (for non-admin users)
  const handleBulkSendForReview = async (companyId: string, weekKey: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        alert("❌ You must be logged in to send checks for review");
        return;
      }

      // Build user role map to identify admin users
      const userRoleMap: { [userId: string]: string } = {};
      try {
        const userDocs = await getDocs(collection(db, 'users'));
        userDocs.forEach(doc => {
          const data = doc.data();
          const uid = data.uid || doc.id;
          userRoleMap[uid] = data.role || 'user';
        });
      } catch (error) {
        console.error('Error fetching user roles:', error);
      }

      // Get all checks for this company and week that haven't been sent for review yet
      // BUT only include checks created by non-admin users
      const checksToSend = checks.filter((check: CheckItem) => {
        const createdByRole = check.createdBy ? userRoleMap[check.createdBy] || 'user' : 'user';
        return check.companyId === companyId && 
               check.weekKey === weekKey && 
               !check.reviewed &&
               createdByRole !== 'admin'; // Only send user-created checks
      });

      if (checksToSend.length === 0) {
        alert("No user-created checks found for review! (Admin-created checks are automatically approved)");
        return;
      }

      // Create review requests for all user-created checks
      const reviewRequests = checksToSend.map((check: CheckItem) => ({
        checkId: check.id,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        companyId: check.companyId,
        weekKey: check.weekKey || 'global',
        status: "pending",
        reviewed: false
      }));

      const batch = writeBatch(db);
      reviewRequests.forEach((request) => {
        const docRef = doc(collection(db, "reviewRequest"));
        batch.set(docRef, request);
      });
      await batch.commit();
      
      console.log(`[DEBUG] Successfully created ${reviewRequests.length} review requests for user-created checks`);
      alert(`✅ Successfully sent ${reviewRequests.length} user-created checks for admin review!`);
      
      // Refresh the checks data
      if (refetchChecks) {
        refetchChecks();
      }
      if (onReviewUpdated) {
        onReviewUpdated();
      }
    } catch (err: any) {
      console.error("Error sending checks for review", err);
      alert("❌ Failed to send checks for review. Please try again.");
    }
  };

  // Review only the selected checks
  const handleReviewSelectedChecks = async () => {
    if (selectedChecks.size === 0) {
      alert("❌ Please select at least one check to review");
      return;
    }

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        alert("❌ You must be logged in to mark checks as reviewed");
        return;
      }

      // Get the selected checks
      const selectedChecksList = Array.from(selectedChecks);
      const checksToReview = checks.filter((check: CheckItem) => 
        selectedChecksList.includes(check.id)
      );

      if (checksToReview.length === 0) {
        alert("❌ No valid checks found to review");
        return;
      }

      // Set confirmation data and show dialog
      setBulkReviewData({
        companyId: checksToReview[0].companyId,
        weekKey: checksToReview[0].weekKey || 'global',
        count: checksToReview.length,
        companyName: companies.find(c => c.id === checksToReview[0].companyId)?.name || 'Unknown Company',
        isSelectedChecks: true
      });
      setShowBulkReviewConfirm(true);
      return; // Exit early, the actual review will happen in executeBulkReview

      console.log(`[DEBUG] Reviewing ${checksToReview.length} selected checks`);

      if (currentRole === 'admin') {
        // Admin: directly update the reviewed field
        const batch = writeBatch(db);
        checksToReview.forEach((check) => {
          const checkRef = doc(db, 'checks', check.id);
          batch.update(checkRef, { reviewed: true });
        });
        await batch.commit();
        
        console.log(`[DEBUG] Successfully marked ${checksToReview.length} checks as reviewed`);
        alert(`✅ Successfully marked ${checksToReview.length} selected checks as reviewed!`);
      } else {
        // Non-admin: create review requests
        const reviewRequests = checksToReview.map((check: CheckItem) => ({
          checkId: check.id,
          createdBy: currentUser!.uid, // We know currentUser is not null here due to the check above
          createdAt: serverTimestamp(),
          companyId: check.companyId,
          weekKey: check.weekKey || 'global',
          status: "pending"
        }));

        const batch = writeBatch(db);
        reviewRequests.forEach((request) => {
          const docRef = doc(collection(db, "reviewRequest"));
          batch.set(docRef, request);
        });
        await batch.commit();
        
        console.log(`[DEBUG] Successfully created ${reviewRequests.length} review requests`);
        alert(`✅ Successfully sent ${reviewRequests.length} selected checks for review!`);
      }
      
      // Clear selections and refresh data
      setSelectedChecks(new Set());
      if (refetchChecks) {
        refetchChecks();
      }
      if (onReviewUpdated) {
        onReviewUpdated();
      }
    } catch (err: any) {
      console.error("Error reviewing selected checks", err);
      console.error("Error details:", {
        code: err.code,
        message: err.message,
        stack: err.stack
      });
      alert("❌ Failed to review selected checks. Please try again.");
    }
  };
  

  // Optimized data fetching with staggered loading
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if (!userSnap.exists()) return;
      // const userData = userSnap.data();
      // setCurrentRole(userData.role || 'user'); // This line is now passed as a prop
      // setCompanyIds(userData.companyIds || []); // This line is now passed as a prop
      setUserLoaded(true);
    });
    return () => unsubscribe();
  }, []);

  // Update visibleCompanies logic
  useEffect(() => {
    if (!userLoaded) return;
    console.log('[DEBUG] visibleCompanies - currentRole:', currentRole);
    console.log('[DEBUG] visibleCompanies - companies:', companies.map(c => ({ id: c.id, name: c.name })));
    console.log('[DEBUG] visibleCompanies - companyIds:', companyIds);
    
    if (currentRole === 'admin') {
      setVisibleCompanies(companies);
      console.log('[DEBUG] visibleCompanies - admin: showing all companies');
    } else {
      const filtered = companies.filter(c => companyIds.includes(c.id));
      setVisibleCompanies(filtered);
      console.log('[DEBUG] visibleCompanies - user: filtered companies:', filtered.map(c => ({ id: c.id, name: c.name })));
    }
  }, [userLoaded, currentRole, companies, companyIds]);

  // Check for pending filters from floating menu navigation
  useEffect(() => {
    if (!userLoaded || !companies.length) return;
    
    const pendingCompanyFilter = localStorage.getItem('pendingCompanyFilter');
    const pendingClientFilter = localStorage.getItem('pendingClientFilter');
    const pendingWeekFilter = localStorage.getItem('pendingWeekFilter');
    
    if (pendingCompanyFilter) {
      console.log('[DEBUG] Found pending company filter:', pendingCompanyFilter);
      setSelectedCompanyId(pendingCompanyFilter);
      localStorage.removeItem('pendingCompanyFilter');
      
      // If there's also a client filter, set it
      if (pendingClientFilter) {
        console.log('[DEBUG] Found pending client filter:', pendingClientFilter);
        setSelectedClientId(pendingClientFilter);
        localStorage.removeItem('pendingClientFilter');
      }
      
      // If there's a week filter, set it to show recent checks automatically
      if (pendingWeekFilter) {
        console.log('[DEBUG] Found pending week filter:', pendingWeekFilter);
        setSelectedWeekKey(pendingWeekFilter);
        localStorage.removeItem('pendingWeekFilter');
      }
    }
  }, [userLoaded, companies]);

  // Track if user has manually cleared company or week selection
  const hasUserClearedCompany = React.useRef(false);
  const hasUserClearedWeek = React.useRef(false);

  // Reset week-cleared ref when company changes
  useEffect(() => {
    hasUserClearedWeek.current = false;
  }, [selectedCompanyId]);

  // State to track if user is in week selection mode
  const [isSelectingWeek, setIsSelectingWeek] = useState(false);

  // ✅ Check print permissions for current user
  const { canPrintChecks, loading: permissionsLoading, error: permissionsError } = usePrintPermissions();

  // Handler for Back to Companies
  const handleBackToCompanies = () => {
    console.log('[ACTION] handleBackToCompanies');
    hasUserClearedCompany.current = true;
    setSelectedCompanyId(null);
    setSelectedWeekKey(null);
    setIsSelectingWeek(false);
  };

  // Handler for Back to Weeks
  const handleBackToWeeks = () => {
    console.log('[ACTION] handleBackToWeeks');
    hasUserClearedWeek.current = true;
    setSelectedWeekKey(null);
    setIsSelectingWeek(true);
  };

  // When a week is selected (user click or auto-select), exit week selection mode
  useEffect(() => {
    console.log('[EFFECT] selectedWeekKey changed:', selectedWeekKey);
    if (selectedWeekKey) {
      setIsSelectingWeek(false);
    }
  }, [selectedWeekKey]);

  // Auto-select first available company when companies change, unless user cleared
  useEffect(() => {
    console.log('[EFFECT] companies or selectedCompanyId changed:', companies, selectedCompanyId);
    if (!selectedCompanyId && companies.length > 0 && !hasUserClearedCompany.current) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [companies, selectedCompanyId]);

  // Reset week-cleared ref when company changes
  useEffect(() => {
    console.log('[EFFECT] selectedCompanyId changed:', selectedCompanyId);
    hasUserClearedWeek.current = false;
  }, [selectedCompanyId]);

  // On initial mount, only reset state if no filter is provided
  useEffect(() => {
    console.log('[EFFECT] initial mount, filter:', filter);
    if (!filter || (!filter.companyId && !filter.weekKey)) {
      console.log('[EFFECT] No filter provided, resetting state');
      setSelectedCompanyId(null);
      setSelectedWeekKey(null);
      setIsSelectingWeek(false);
      hasUserClearedCompany.current = false;
      hasUserClearedWeek.current = false;
    } else {
      console.log('[EFFECT] Filter provided, not resetting state');
    }
  }, [filter]);

  // Advanced userMap logic: for admins, use all users; for users, fetch only needed user docs
  const [userMap, setUserMap] = React.useState<UserMap>({});
  React.useEffect(() => {
    async function buildUserMap() {
      console.log('[DEBUG] buildUserMap called, currentRole:', currentRole, 'checks.length:', checks.length);
      
      if (currentRole === 'admin') {
        // Admin: use all users
    const map: UserMap = {};
    users.forEach((user: any) => {
          const key = user.uid || user.id;
          map[key] = user.username || user.email || 'Unknown';
        });
        setUserMap(map);
        console.log('[CHECKPOINT] userMap (admin) keys:', Object.keys(map), 'sample:', map[Object.keys(map)[0]]);
      } else {
        // User: fetch only needed user docs for createdBy UIDs
        const createdByUids = Array.from(new Set(checks.map((c: any) => c.createdBy).filter(Boolean)));
        console.log('[DEBUG] createdByUids for user:', createdByUids);
        
        if (createdByUids.length === 0) {
          console.log('[DEBUG] No createdBy UIDs found, setting empty userMap');
          setUserMap({});
          return;
        }
        
        try {
          let userDocs: any[] = [];
          for (let i = 0; i < createdByUids.length; i += 10) {
            const chunk = createdByUids.slice(i, i + 10);
            console.log('[DEBUG] Fetching user chunk:', chunk);
            
            // Try different approaches to fetch user documents
            let snap;
            try {
              // First try: query by uid field
              const q = query(collection(db, 'users'), where('uid', 'in', chunk));
              snap = await getDocs(q);
              console.log('[DEBUG] User chunk result (uid query):', snap.docs.map(d => ({ id: d.id, data: d.data() })));
            } catch (error) {
              console.log('[DEBUG] uid query failed, trying direct document gets');
              // Second try: get documents directly by ID
              const docPromises = chunk.map(uid => getDoc(doc(db, 'users', uid)));
              const docSnaps = await Promise.all(docPromises);
              snap = { docs: docSnaps.filter(snap => snap.exists()).map(snap => ({ id: snap.id, data: () => snap.data() })) };
              console.log('[DEBUG] User chunk result (direct gets):', snap.docs.map(d => ({ id: d.id, data: d.data() })));
            }
            
            userDocs.push(...snap.docs);
          }
          const map: UserMap = {};
          userDocs.forEach(doc => {
            const data = doc.data();
            const uid = data.uid || doc.id;
            const name = data.username || data.email || 'Unknown';
            map[uid] = name;
            console.log('[DEBUG] Added to userMap:', uid, '->', name);
          });
          
          // Add fallback entries for missing users
          const foundUids = Object.keys(map);
          const missingUids = createdByUids.filter(uid => !foundUids.includes(uid));
          missingUids.forEach(uid => {
            // Try to create a friendly name from the UID or use a default
            const shortUid = uid.substring(0, 8);
            map[uid] = `User-${shortUid}`;
            console.log('[DEBUG] Added fallback to userMap:', uid, '-> User-' + shortUid);
          });
          
          setUserMap(map);
          console.log('[CHECKPOINT] userMap (user) keys:', Object.keys(map), 'sample:', map[Object.keys(map)[0]]);
        } catch (error) {
          console.error('[DEBUG] Error building userMap:', error);
          setUserMap({});
        }
      }
    }
    buildUserMap();
  }, [users, checks, currentRole]);

  // Fetch clients
  React.useEffect(() => {
    async function fetchClients() {
      try {
        const clientSnap = await getDocs(collection(db, "clients"));
        const clientList: Client[] = clientSnap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          companyIds: d.data().companyId || [], // Note: field is 'companyId' in Firestore but contains array
          active: d.data().active ?? true,
          division: d.data().division || '',
        }));
        setClients(clientList);
        console.log('[OptimizedViewChecks] fetched clients:', clientList);
      } catch (error) {
        console.error('[OptimizedViewChecks] Error fetching clients:', error);
        setClients([]);
      }
    }
    fetchClients();
  }, []);

  // Memoized filtered checks with client-side companyId filter
  const filteredChecks = useMemo(() => {
    // For admins, show ALL checks regardless of companyIds
    // For users, only show checks for their assigned companies
    let allowedChecks = currentRole === 'admin'
      ? checks  // Admin sees all checks
      : checks.filter((c: any) => companyIds.includes(c.companyId));  // Users see only their company checks
    
    // 🔒 SECURITY: Filter by visibleClientIds (only show checks for clients user has access to)
    // Admins see all clients, managers/users only see their assigned clients
    if (currentRole !== 'admin' && visibleClientIds.length > 0) {
      allowedChecks = allowedChecks.filter((c: any) => {
        // Check if check's client is in visible clients
        if (c.clientId && visibleClientIds.includes(c.clientId)) {
          return true;
        }
        // Also check relationship details for multi-client checks
        if (c.relationshipDetails && c.relationshipDetails.length > 0) {
          return c.relationshipDetails.some((rel: any) => 
            rel.clientId && visibleClientIds.includes(rel.clientId)
          );
        }
        return false;
      });
      console.log('🔒 [ViewChecks Security] Filtered checks by visibleClientIds:', {
        originalCount: checks.length,
        afterCompanyFilter: allowedChecks.length,
        visibleClientIds
      });
    }
    
    console.log('[DEBUG] Filtering - currentRole:', currentRole);
    console.log('[DEBUG] Filtering - companyIds:', companyIds);
    console.log('[DEBUG] Filtering - allowedChecks.length:', allowedChecks.length);
    console.log('[DEBUG] Filtering - selectedCompanyId:', selectedCompanyId);
    console.log('[DEBUG] Filtering - checksLoading:', checksLoading);
    
    if (!selectedCompanyId || checksLoading) return [];
    let filtered = allowedChecks.filter(c => c.companyId === selectedCompanyId);
    console.log('[DEBUG] Filtering - filtered after companyId filter:', filtered.length);
    console.log('[DEBUG] Filtering - sample check companyId:', allowedChecks[0]?.companyId);
    // Apply week filter
    if (selectedWeekKey) {
      filtered = filtered.filter((c: any) => {
        const dateObj = c.date?.toDate ? c.date.toDate() : new Date(c.date);
        const weekKey = formatDateKey(getStartOfWeek(dateObj));
        return weekKey === selectedWeekKey;
      });
    }
    // Apply createdBy filter
    if (selectedCreatedBy) {
      filtered = filtered.filter((c: any) => c.createdBy === selectedCreatedBy);
    }
    // Apply client filter
    if (selectedClientId) {
      filtered = filtered.filter((c: any) => {
        // Check if the check has the selected client in its relationships
        if (c.relationshipDetails && c.relationshipDetails.length > 0) {
          return c.relationshipDetails.some((rel: any) => rel.clientId === selectedClientId);
        }
        // Fallback to legacy clientId field
        return c.clientId === selectedClientId;
      });
    }
    // Apply search filter
    if (debouncedSearchText) {
      filtered = filtered.filter((c: any) => {
        const nameMatch = c.employeeName?.toLowerCase().includes(debouncedSearchText.toLowerCase());
        const madeByMatch = typeof c.createdBy === 'string' && userMap[c.createdBy]?.toLowerCase().includes(debouncedSearchText.toLowerCase());
        return nameMatch || madeByMatch;
      });
    }
    // If reviewOnly is true, filter to only unreviewed
    if (reviewOnly) {
      filtered = filtered.filter((c: any) => c.reviewed === false);
    }
    return filtered.sort((a, b) => (b.checkNumber || 0) - (a.checkNumber || 0));
  }, [selectedCompanyId, checks, selectedWeekKey, selectedCreatedBy, selectedClientId, debouncedSearchText, userMap, checksLoading, reviewOnly, companyIds, currentRole, visibleClientIds]);

  // Memoized checks by week
  const checksByWeek = useMemo(() => {
    const grouped: { [week: string]: CheckItem[] } = {};
    filteredChecks.forEach(c => {
      const dateObj = c.date?.toDate ? c.date.toDate() : new Date(c.date);
      const key = formatDateKey(getStartOfWeek(dateObj));
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(c);
    });
    return grouped;
  }, [filteredChecks]);

  // Get sorted week keys for the selected company
  const weekKeys = useMemo(() => {
    if (!selectedCompanyId) return [];
    return Object.keys(checksByWeek).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [selectedCompanyId, checksByWeek]);
  useEffect(() => {
    if (!checksLoading) {
      console.log('[OptimizedViewChecks] (debug) fetched checks:', checks);
      console.log('[OptimizedViewChecks] (debug) selectedCompanyId:', selectedCompanyId);
      console.log('[OptimizedViewChecks] (debug) filteredChecks:', filteredChecks);
      console.log('[OptimizedViewChecks] (debug) checksByWeek:', checksByWeek);
      console.log('[OptimizedViewChecks] (debug) weekKeys:', weekKeys);
    }
  }, [checks, checksLoading, selectedCompanyId, filteredChecks, checksByWeek, weekKeys]);

  // Manual debug: try to fetch a known check by ID to test Firestore rules
  useEffect(() => {
    if (companyIds && companyIds.length > 0) {
      const testCheckId = 'pszgkumWWhSdHxyGFv42'; // Use the ID from your screenshot
      import('firebase/firestore').then(({ getDoc, doc }) => {
        getDoc(doc(db, 'checks', testCheckId)).then(snap => {
          console.log('[DEBUG] Manual getDoc for check:', snap.exists() ? snap.data() : 'not found');
        }).catch(err => {
          console.error('[DEBUG] Manual getDoc error:', err);
        });
      });
    }
  }, [companyIds]);

  // Helper to print all checks for a week
  const handlePrintWeek = async (companyId: string | null, weekKey: string | null) => {
    if (!companyId || !weekKey) return;
    try {
      const printWeekUrl = getApiUrl(
        `/api/print_week?companyId=${companyId}&weekKey=${weekKey}`
      );
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
      
      // Mark all checks for this week as paid (only if not already paid)
      const checksToMarkAsPaid = (checksByWeek[weekKey] || []).filter((c: any) => !c.paid);
      if (checksToMarkAsPaid.length > 0) {
        try {
          await Promise.all(
            checksToMarkAsPaid.map((check: any) =>
              updateDoc(doc(db, 'checks', check.id), { paid: true })
            )
          );
          console.log(`✅ Marked ${checksToMarkAsPaid.length} checks as paid`);
          if (refetchChecks) refetchChecks();
        } catch (err) {
          console.error('Error marking checks as paid:', err);
        }
      }
    } catch (err) {
      alert('Error printing checks.');
    }
  };

  const handlePrintReviewedChecks = async (companyId: string | null, weekKey: string | null) => {
    if (!companyId || !weekKey) return;
    
    // Filter reviewed checks for the selected week
    const reviewedChecks = (checksByWeek[weekKey] || []).filter((c: any) => c.reviewed === true);
    if (reviewedChecks.length === 0) {
      alert('No reviewed checks to print for this week.');
      return;
    }
    
    const checkIds = reviewedChecks.map((c: any) => c.id);
    
    try {
      // Get the selected company data
      const selectedCompany = companies.find(c => c.id === companyId);
      console.log('🔍 Selected company data:', selectedCompany);
      
      // Get the selected banks data - find banks for the selected company
      const selectedBanks = banks.filter(bank => bank.companyId === companyId);
      
      // Always use the company's own banks, even if they don't have signatures
      if (selectedBanks.length === 0) {
        console.log('🔍 No banks found for this company, using fallback');
        // Only use fallback if no banks exist for this company at all
        const banksWithSignature = banks.filter(bank => bank.digitalSignature);
        if (banksWithSignature.length > 0) {
          console.log('🔍 Using fallback bank with signature:', banksWithSignature[0].bankName);
          selectedBanks.length = 0; // Clear the array
          selectedBanks.push(banksWithSignature[0]); // Add the bank with signature
        }
      } else {
        console.log('🔍 Using company banks:', selectedBanks.map(b => b.bankName).join(', '));
      }
      
      console.log('🔍 Selected banks data:', selectedBanks);
      
      // Get current user's username
      const currentUser = auth.currentUser;
      let createdByUsername = 'Unknown User';

      if (currentUser) {
        // Try to get username from Firebase user doc
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            createdByUsername = userData.username || userData.email || 'Unknown User';
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          createdByUsername = 'Unknown User';
        }
      }
      
      // Before sending the request, decrypt the bank data
      const decryptedBankData = selectedBanks.map(bank => ({
        ...bank,
        routingNumber: decryptData(bank.routingNumber),  // Decrypt routing number
        accountNumber: decryptData(bank.accountNumber)    // Decrypt account number
      }));
      
      // Send the complete data to backend
      const requestBody = {
        checkIds: checkIds,
        weekKey: weekKey,
        checksData: reviewedChecks,  // Send the actual check data
        companyData: selectedCompany,    // Send company data
        bankData: decryptedBankData,      // Send decrypted bank data
        createdByUsername: createdByUsername  // Add this line
      };
      
      const printSelectedUrl = getApiUrl('/api/print_selected_checks');
      console.log('🔍 Sending request to:', printSelectedUrl);
      console.log('🔍 Request body:', requestBody);
      
      const response = await fetch(printSelectedUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 Error response:', errorText);
        alert(`Error fetching reviewed checks PDF: ${response.status} - ${errorText}`);
        return;
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reviewed_checks_${weekKey}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      // Mark reviewed checks as paid (only if not already paid)
      const checksToMarkAsPaid = reviewedChecks.filter((c: any) => !c.paid);
      if (checksToMarkAsPaid.length > 0) {
        try {
          await Promise.all(
            checksToMarkAsPaid.map((check: any) =>
              updateDoc(doc(db, 'checks', check.id), { paid: true })
            )
          );
          console.log(`✅ Marked ${checksToMarkAsPaid.length} reviewed checks as paid`);
          if (refetchChecks) refetchChecks();
        } catch (err) {
          console.error('Error marking reviewed checks as paid:', err);
        }
      }
    } catch (err) {
      console.error('Error printing reviewed checks:', err);
      alert('Error printing reviewed checks.');
    }
  };

  // Optimized handlers
  const handleCompanySelect = useCallback((companyId: string) => {
    console.log('[ACTION] handleCompanySelect', companyId);
    setSelectedCompanyId(companyId);
    setSelectedWeekKey(null);
    setSelectedCreatedBy(null);
  }, []);

  const handleOpenDialog = useCallback((check: CheckItem) => {
    setSelectedCheck(check);
    setOpenDialog(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setOpenDialog(false);
    setSelectedCheck(null);
  }, []);

  // Checkbox selection functions
  const handleCheckboxChange = (checkId: string) => {
    setSelectedChecks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(checkId)) {
        newSet.delete(checkId);
      } else {
        newSet.add(checkId);
      }
      return newSet;
    });
  };

  const handleSelectAllChecks = () => {
    if (selectedWeekKey && checksByWeek[selectedWeekKey]) {
      const allCheckIds = checksByWeek[selectedWeekKey].map(check => check.id);
      setSelectedChecks(new Set(allCheckIds));
    }
  };

  const handleDeselectAllChecks = () => {
    setSelectedChecks(new Set());
  };

  const handlePrintSelectedChecks = async () => {
    if (selectedChecks.size === 0) {
      alert('Please select at least one check to print.');
      return;
    }
    
    if (selectedCompanyId && selectedWeekKey) {
      const selectedChecksList = Array.from(selectedChecks);
      console.log('Printing selected checks:', selectedChecksList);
      
      // Get the actual check data from the filtered checks
      const selectedChecksData = filteredChecks.filter(check => selectedChecksList.includes(check.id));
      console.log('🔍 Selected checks data:', selectedChecksData);
      
      // Get the selected company data
      const selectedCompany = companies.find(c => c.id === selectedCompanyId);
      console.log(' Selected company data:', selectedCompany);
      console.log(' Company logo data:', selectedCompany?.logoBase64 ? 'Present' : 'Missing');
      if (selectedCompany?.logoBase64) {
        console.log('🔍 Logo data length:', selectedCompany.logoBase64.length);
        console.log('🔍 Logo data starts with:', selectedCompany.logoBase64.substring(0, 50));
      }
      
      // Get the selected banks data - find banks for the selected company
      const selectedBanks = banks.filter(bank => bank.companyId === selectedCompanyId);
      
      // Always use the company's own banks, even if they don't have signatures
      if (selectedBanks.length === 0) {
        console.log('🔍 No banks found for this company');
        // Don't use fallback - let the backend handle missing banks
      } else {
        console.log('🔍 Using company banks:', selectedBanks.map(b => b.bankName).join(', '));
      }
      
      console.log(' Selected banks data:', selectedBanks);
      console.log('🔍 Bank signature data:', selectedBanks[0]?.digitalSignature ? 'Present' : 'Missing');
      if (selectedBanks[0]?.digitalSignature) {
        console.log('🔍 Signature data length:', selectedBanks[0].digitalSignature.length);
        console.log('🔍 Signature data starts with:', selectedBanks[0].digitalSignature.substring(0, 50));
      }
      
      try {
        const printSelectedUrl = getApiUrl('/api/print_selected_checks');
        console.log('🔍 Sending request to:', printSelectedUrl);
        console.log('🔍 Request body:', { 
          checkIds: selectedChecksList, 
          weekKey: selectedWeekKey,
          checksData: selectedChecksData,  // Send the actual check data
          companyData: selectedCompany,    // Send company data
          bankData: selectedBanks          // Send bank data
        });
        
        // Before sending the request, decrypt the bank data
        const decryptedBankData = selectedBanks.map(bank => ({
          ...bank,
          routingNumber: decryptData(bank.routingNumber),  // Decrypt routing number
          accountNumber: decryptData(bank.accountNumber)    // Decrypt account number
        }));
        
        // Get current user's username
        const currentUser = auth.currentUser;
        let createdByUsername = 'Unknown User';

        if (currentUser) {
          // Try to get username from Firebase user doc
          try {
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              createdByUsername = userData.username || userData.email || 'Unknown User';
            }
          } catch (error) {
            console.error('Error fetching user data:', error);
            createdByUsername = 'Unknown User';
          }
        }
        
        // Add username to request body
        const requestBody = {
          checkIds: selectedChecksList,
          weekKey: selectedWeekKey,
          checksData: selectedChecksData,
          companyData: selectedCompany,
          bankData: decryptedBankData,
          createdByUsername: createdByUsername  // Add this line
        };
        
        // Add timeout to the request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        console.log('🔍 About to send fetch request...');
        const response = await fetch(printSelectedUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        
        console.log('🔍 Fetch request completed, got response');
        clearTimeout(timeoutId);
        
        console.log('�� Response status:', response.status);
        console.log('🔍 Response headers:', response.headers);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('🔍 Error response:', errorText);
          alert(`Error fetching selected checks PDF: ${response.status} - ${errorText}`);
          return;
        }
        
        const blob = await response.blob();
        console.log('🔍 Blob size:', blob.size);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `selected_checks_${selectedWeekKey}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        
        // Mark selected checks as paid (only if not already paid)
        const checksToMarkAsPaid = checksByWeek[selectedWeekKey]?.filter(check => 
          selectedChecksList.includes(check.id) && !check.paid
        ) || [];
        
        if (checksToMarkAsPaid.length > 0) {
          try {
            await Promise.all(
              checksToMarkAsPaid.map((check: any) =>
                updateDoc(doc(db, 'checks', check.id), { paid: true })
              )
            );
            console.log(`✅ Marked ${checksToMarkAsPaid.length} selected checks as paid`);
            if (refetchChecks) refetchChecks();
          } catch (err) {
            console.error('Error marking selected checks as paid:', err);
          }
        }
        
        // Clear selection after successful print
        setSelectedChecks(new Set());
        
      } catch (error) {
        const errorDetails = error instanceof Error ? `Name: ${error.name}, Message: ${error.message}` : String(error);
        console.error('🔍 Request failed:', errorDetails, error);
        console.error('🔍 Error type:', typeof error);
        console.error('🔍 Error constructor:', error?.constructor?.name);
        
        if (error instanceof Error && error.name === 'AbortError') {
          alert('Request timed out. Backend server may not be responding.');
        } else {
          const errorMessage = error instanceof Error ? error.message : String(error);
          alert(`Request failed: ${errorMessage}`);
        }
      }
    }
  };

  // Helper function to show notifications
  const showNotification = (message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  // Direct bulk review handler (for admin users)
  const handleDirectReviewAll = async () => {
    if (!selectedCompanyId || !selectedWeekKey) return;
    const checksToReview = checksByWeek[selectedWeekKey]?.filter((c: any) => c.reviewed === false) || [];
    if (checksToReview.length === 0) return;
    try {
      await Promise.all(
        checksToReview.map((check: any) =>
          updateDoc(doc(db, 'checks', check.id), { reviewed: true })
        )
      );
      
      // Refresh the checks data IMMEDIATELY
      if (refetchChecks) await refetchChecks();
      if (onReviewUpdated) onReviewUpdated();
      setReviewOnly(false);
      
      // Show success notification after refresh
      showNotification(`All ${checksToReview.length} checks marked as reviewed!`, 'success');
    } catch (err) {
      showNotification('Failed to mark all as reviewed.', 'error');
    }
  };

  // Add logs for user role
  useEffect(() => {
    console.log('[OptimizedViewChecks] currentRole:', currentRole);
  }, [currentRole]);

  // Global debug log at every render
  console.log('[RENDER] selectedCompanyId:', selectedCompanyId, 'selectedWeekKey:', selectedWeekKey, 'isSelectingWeek:', isSelectingWeek, 'weekKeys:', weekKeys);



  // Handler for selecting a company
  const handleSelectCompany = (companyId: string) => {
    console.log('[ACTION] handleSelectCompany', companyId);
    setSelectedCompanyId(companyId);
    setIsSelectingWeek(true);
    setSelectedWeekKey(null);
  };

  // Use usersLoading, companiesLoading, checksLoading for loading state
  if (checksLoading || usersLoading || companiesLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>Checks</Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  // Show week selection UI if a company is selected but week is not, or if isSelectingWeek is true
  if (selectedCompanyId && (isSelectingWeek || !selectedWeekKey)) {
    console.log('[RENDER] Rendering week selection UI', weekKeys, 'isSelectingWeek:', isSelectingWeek, 'selectedWeekKey:', selectedWeekKey);
    return (
      <Box sx={{ p: 3 }}>
        <Button variant="outlined" sx={{ mb: 3 }} onClick={handleBackToCompanies}>
          ← Back to Companies
        </Button>
        
        
        
        {/* Client Filter Indicator */}
        {selectedClientId && (
          <Box sx={{ mb: 2, p: 2, bgcolor: 'info.50', borderRadius: 1, border: '1px solid', borderColor: 'info.200' }}>
            <Typography variant="body2" color="info.main">
              🔍 Filtering by client: <strong>{clients.find(c => c.id === selectedClientId)?.name || 'Unknown Client'}</strong>
              <Button
                size="small" 
                sx={{ ml: 2 }} 
                onClick={() => setSelectedClientId(null)}
              >
                Clear Filter
              </Button>
            </Typography>
          </Box>
        )}
        
        {/* Enhanced Week Selection */}
        <Box sx={{ 
          mb: 3, 
          p: 3, 
          backgroundColor: 'grey.50', 
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'grey.200'
        }}>
          <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold', color: 'primary.main' }}>
            Select a Work Week
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {weekKeys.length} week{weekKeys.length !== 1 ? 's' : ''} available for {companies.find(c => c.id === selectedCompanyId)?.name}
          </Typography>
          
          {/* Main Week Options - Always Visible */}
          <Box sx={{ mb: 3 }}>
            {/* Week Filter Options */}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Week View</InputLabel>
                <Select
                  value={selectedWeekFilter}
                  label="Week View"
                  size="small"
                  onChange={(e) => {
                    setSelectedWeekFilter(e.target.value);
                  }}
                >
                  <MenuItem value="past">Default</MenuItem>
                  <MenuItem value="all">All Weeks (Current Year)</MenuItem>
                  <MenuItem value="year">Show by Year</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>

          {/* Year Selector - Show when "Show by Year" is selected */}
          {selectedWeekFilter === 'year' && (
            <Box sx={{ mb: 3 }}>
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Select Year</InputLabel>
                <Select
                  value={selectedYear}
                  label="Select Year"
                  size="small"
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                  }}
                >
                  {getAvailableYears(weekKeys).map((year) => (
                    <MenuItem key={year} value={year}>
                      {year}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}
          
          {/* Week Grid Layout */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
            gap: 2,
            maxHeight: 400,
            overflowY: 'auto',
            p: 1
          }}>
            {(() => {
              let filteredWeeks: string[] = [];

              if (selectedWeekFilter === 'past') {
                const baseWeekDate = getStartOfWeek(new Date());
                const candidateWeeks: string[] = [];

                for (let offset = -2; offset <= 2; offset += 1) {
                  const weekDate = new Date(baseWeekDate);
                  weekDate.setDate(baseWeekDate.getDate() + offset * 7);
                  candidateWeeks.push(formatDateKey(weekDate));
                }

                filteredWeeks = candidateWeeks
                  .filter(weekKey => {
                    const weekChecks = checksByWeek[weekKey] || [];
                    const companyChecks = selectedCompanyId
                      ? weekChecks.filter((c: any) => c.companyId === selectedCompanyId)
                      : weekChecks;
                    return companyChecks.length > 0;
                  })
                  .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

                console.log('[DEBUG] Default view - showing weeks around current week with checks:', filteredWeeks);
              } else if (selectedWeekFilter === 'all') {
                const currentYear = new Date().getFullYear().toString();
                filteredWeeks = weekKeys.filter(weekKey =>
                  new Date(weekKey).getFullYear().toString() === currentYear
                );
              } else if (selectedWeekFilter === 'year') {
                const allWeeksInYear: string[] = [];
                const startDate = new Date(`${selectedYear}-01-01`);
                const endDate = new Date(`${selectedYear}-12-31`);

                let currentDate = getStartOfWeek(startDate);

                while (currentDate <= endDate) {
                  allWeeksInYear.push(formatDateKey(currentDate));
                  currentDate.setDate(currentDate.getDate() + 7);
                }

                filteredWeeks = allWeeksInYear;
              }

              console.log('[DEBUG] Final filteredWeeks:', filteredWeeks);

              if (filteredWeeks.length === 0) {
                return (
                  <Box key="no-weeks" sx={{ gridColumn: '1 / -1' }}>
                    <Alert severity="info">
                      No checks were found for the current week, the previous two weeks, or the next two weeks.
                      Try switching the Week View to “All” to see older checks.
                    </Alert>
                  </Box>
                );
              }

              return filteredWeeks.map((weekKey, index) => {
                console.log('[DEBUG] Rendering week:', weekKey, 'index:', index);
                const weekDate = new Date(weekKey);
                const weekEndDate = new Date(weekDate);
                weekEndDate.setDate(weekDate.getDate() + 6);

                // For "All Weeks" view, only show checks for the selected company
                const weekChecks = checksByWeek[weekKey] || [];
                const companyChecks = selectedCompanyId
                  ? weekChecks.filter((c: any) => c.companyId === selectedCompanyId)
                  : weekChecks;

                const checkCount = companyChecks.length;
                const pendingReview = companyChecks.filter((c: any) => !c.reviewed).length;
                const isCurrentWeek = weekKey === getCurrentWeekKey();
                const isNextWeek = weekKey === getNextWeekKey();
                const isPastWeek = weekKey === getPastWeekKey();
                const isSpecialWeek = isCurrentWeek || isNextWeek || isPastWeek;

                return (
                  <Box
                    key={weekKey}
                    sx={{
                      border: '2px solid',
                      borderColor: isSpecialWeek ? 'primary.main' : 'grey.200',
                      borderRadius: 2,
                      p: 2,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      backgroundColor: isSpecialWeek ? 'primary.50' : 'white',
                      '&:hover': {
                        borderColor: 'primary.main',
                        backgroundColor: 'primary.50',
                        transform: 'translateY(-1px)',
                        boxShadow: 2
                      },
                      position: 'relative'
                    }}
                    onClick={() => {
                      console.log('[ACTION] Week button clicked', weekKey);
                      setSelectedWeekKey(weekKey);
                      setIsSelectingWeek(false);
                    }}
                  >
                    {/* Week Date Range */}
                    <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                      Week {getWeekNumber(weekDate)} - Week of{' '}
                      {weekDate.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </Typography>
                  
                  {/* Date Range */}
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {weekDate.toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric'
                    })} - {weekEndDate.toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric'
                    })}
                  </Typography>
                  
                  {/* Check Counts */}
                  <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                    <Chip 
                      label={`${checkCount} checks`} 
                      size="small" 
                      color="primary"
                      variant="outlined"
                    />
                    {pendingReview > 0 && (
                      <Chip 
                        label={`${pendingReview} pending review`} 
                        size="small" 
                        color="warning"
                        variant="outlined"
                      />
                    )}
                  </Box>
                  
                  {/* Week Type Indicator */}
                  {(() => {
                    if (isSpecialWeek) {
                      return (
                        <Box sx={{ 
                          position: 'absolute', 
                          top: 8, 
                          right: 8,
                          backgroundColor: 'success.main',
                          color: 'white',
                          borderRadius: '50%',
                          width: 20,
                          height: 20,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.7rem'
                        }}>
                          ⭐
                        </Box>
                      );
                    }
                    return null;
                  })()}
                  
                  {/* Click Instruction */}
                  <Typography variant="caption" color="text.secondary">
                    Click to view checks for this week
                  </Typography>
                </Box>
              );
            });
          })()}
          </Box>
          
          {/* Quick Actions */}
          {weekKeys.length > 10 && (
            <Box sx={{ mt: 2, p: 2, backgroundColor: 'white', borderRadius: 2, border: '1px solid', borderColor: 'grey.200' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Quick Actions:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button size="small" variant="outlined" onClick={() => {
                  const mostRecent = weekKeys[0];
                  setSelectedWeekKey(mostRecent);
                  setIsSelectingWeek(false);
                }}>
                  Most Recent Week
              </Button>
                <Button size="small" variant="outlined" onClick={() => {
                  const weekWithMostChecks = weekKeys.reduce((max, current) => 
                    (checksByWeek[current]?.length || 0) > (checksByWeek[max]?.length || 0) ? current : max
                  );
                  setSelectedWeekKey(weekWithMostChecks);
                  setIsSelectingWeek(false);
                }}>
                  Week with Most Checks
                </Button>
              </Box>
          </Box>
        )}
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Checks</Typography>

      {!selectedCompanyId ? (
        <>
          {/* Global Pending Checks Button - Only show when no company is selected */}
          <Button
            variant="contained"
            color="warning"
            sx={{ mb: 3 }}
            onClick={() => setOpenPendingChecksDialog(true)}
            
          >
            View All Pending Checks
          </Button>


          
          <Typography variant="h5" gutterBottom sx={{ mb: 3, fontWeight: 'bold', color: 'text.primary' }}>
            Select a Company
          </Typography>
          
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
            gap: 3,
            maxWidth: 1200
          }}>
          {visibleCompanies.map(company => (
              <Box
                key={company.id}
                sx={{
                  border: '2px solid',
                  borderColor: 'grey.200',
                  borderRadius: 3,
                  p: 3,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  backgroundColor: 'white',
                  '&:hover': {
                    borderColor: 'primary.main',
                    backgroundColor: 'primary.50',
                    transform: 'translateY(-2px)',
                    boxShadow: 3
                  },
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onClick={() => handleSelectCompany(company.id)}
              >
                {/* Company Logo */}
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  mb: 2,
                  position: 'relative'
                }}>
                  {company.logoBase64 ? (
                    <Avatar
                      src={company.logoBase64}
                      sx={{ 
                        width: 80, 
                        height: 80,
                        border: '3px solid',
                        borderColor: 'grey.300'
                      }}
                    />
                  ) : (
                    <Avatar
                      sx={{ 
                        width: 80, 
                        height: 80,
                        backgroundColor: 'primary.main',
                        fontSize: '2rem',
                        border: '3px solid',
                        borderColor: 'grey.300'
                      }}
                    >
                      {company.name ? company.name[0].toUpperCase() : '?'}
                    </Avatar>
                    )}
                </Box>
                
                {/* Company Name */}
                <Typography 
                  variant="h6" 
                  sx={{ 
                    textAlign: 'center', 
                    fontWeight: 'bold',
                    color: 'text.primary',
                    mb: 1
                  }}
              >
                {company.name}
                </Typography>
                
                {/* Company Info */}
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Click to view checks for this company
                  </Typography>
                </Box>
                
                {/* Check Count Badge */}
                <Box sx={{ 
                  position: 'absolute', 
                  top: 10, 
                  left: 10,
                  backgroundColor: 'secondary.main',
                  color: 'white',
                  borderRadius: '12px',
                  px: 1.5,
                  py: 0.5,
                  fontSize: '0.75rem',
                  fontWeight: 'bold'
                }}>
                  {checks.filter((c: any) => c.companyId === company.id).length} checks
                </Box>
              </Box>
            ))}
          </Box>
        </>
      ) : (
        <>
          {/* Company Header */}
          <Box sx={{ 
            mb: 3, 
            p: 3, 
            backgroundColor: 'grey.50', 
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'grey.200',
            display: 'flex',
            alignItems: 'center',
            gap: 3
          }}>
            {(() => {
              const selectedCompany = companies.find(c => c.id === selectedCompanyId);
              return (
                <>
                  {selectedCompany?.logoBase64 ? (
                    <Avatar
                      src={selectedCompany.logoBase64}
                      sx={{ 
                        width: 60, 
                        height: 60,
                        border: '2px solid',
                        borderColor: 'primary.main'
                      }}
                    />
                  ) : (
                    <Avatar
                      sx={{ 
                        width: 60, 
                        height: 60,
                        backgroundColor: 'primary.main',
                        fontSize: '1.5rem',
                        border: '2px solid',
                        borderColor: 'primary.main'
                      }}
                    >
                      {selectedCompany?.name ? selectedCompany.name[0].toUpperCase() : '?'}
                    </Avatar>
                  )}
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      {selectedCompany?.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Viewing and managing checks
                    </Typography>
                  </Box>
          <Button
            variant="outlined"
            onClick={handleBackToCompanies}
                    sx={{
                      borderRadius: 2,
                      px: 3,
                      py: 1.5,
                      borderWidth: 2,
                      fontWeight: 'bold',
                      '&:hover': {
                        borderWidth: 2,
                        transform: 'translateY(-1px)',
                        boxShadow: 2
                      },
                      transition: 'all 0.2s ease'
                    }}
          >
            ← Back to Companies
          </Button>
                </>
              );
            })()}
          </Box>

          {/* Enhanced Week Selection */}
          {!selectedWeekKey ? (
            <>
              {/* Week Selection Header */}
              <Box sx={{ 
                mb: 3, 
                p: 3, 
                backgroundColor: 'grey.50', 
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'grey.200'
              }}>
                <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold', color: 'primary.main' }}>
                  📅 Select a Work Week
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {weekKeys.length} week{weekKeys.length !== 1 ? 's' : ''} available for {companies.find(c => c.id === selectedCompanyId)?.name}
                </Typography>
                
                {/* Week Search and Filter */}
                <Box sx={{ mb: 3 }}>
                  <TextField
                    placeholder="Search weeks by date..."
                    size="small"
                    sx={{ width: 300, mr: 2 }}
                    InputProps={{
                      startAdornment: <span style={{ marginRight: '8px' }}>🔍</span>
                    }}
                  />
                  <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>Sort By</InputLabel>
                    <Select
                      value="newest"
                      label="Sort By"
                      size="small"
                    >
                      <MenuItem value="newest">Newest First</MenuItem>
                      <MenuItem value="oldest">Oldest First</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
                
                {/* Week Grid Layout */}
                <Box sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                  gap: 2,
                  maxHeight: 400,
                  overflowY: 'auto',
                  p: 1
                }}>
                  {weekKeys.map((weekKey, index) => {
                    const weekDate = new Date(weekKey);
                    const weekEndDate = new Date(weekDate);
                    weekEndDate.setDate(weekDate.getDate() + 6);
                    
                    const checkCount = checksByWeek[weekKey]?.length || 0;
                    const pendingReview = checksByWeek[weekKey]?.filter((c: any) => !c.reviewed).length || 0;
                    const isRecent = new Date().getTime() - weekDate.getTime() < 7 * 24 * 60 * 60 * 1000; // Within 7 days
                    
                    return (
                      <Box
                    key={weekKey}
                        sx={{
                          border: '2px solid',
                          borderColor: isRecent ? 'primary.main' : 'grey.200',
                          borderRadius: 2,
                          p: 2,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          backgroundColor: isRecent ? 'primary.50' : 'white',
                          '&:hover': {
                            borderColor: 'primary.main',
                            backgroundColor: 'primary.50',
                            transform: 'translateY(-1px)',
                            boxShadow: 2
                          },
                          position: 'relative'
                        }}
                    onClick={() => {
                      setSelectedWeekKey(weekKey);
                          setReviewOnly(false);
                        }}
                      >
                        {/* Week Date Range */}
                        <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                          Week {getWeekNumber(weekDate)} - Week of {weekDate.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </Typography>
                        
                        {/* Date Range */}
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          {weekDate.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric'
                          })} - {weekEndDate.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric'
                          })}
                        </Typography>
                        
                        {/* Check Counts */}
                        <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                          <Chip 
                            label={`${checkCount} checks`} 
                            size="small" 
                            color="primary"
                            variant="outlined"
                          />
                          {pendingReview > 0 && (
                            <Chip 
                              label={`${pendingReview} pending review`} 
                              size="small" 
                              color="warning"
                              variant="outlined"
                            />
                          )}
                        </Box>
                        
                        {/* Recent Week Indicator */}
                        {isRecent && (
                          <Box sx={{ 
                            position: 'absolute', 
                            top: 8, 
                            right: 8,
                            backgroundColor: 'success.main',
                            color: 'white',
                            borderRadius: '50%',
                            width: 20,
                            height: 20,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem'
                          }}>
                            ⭐
                          </Box>
                        )}
                        
                        {/* Click Instruction */}
                        <Typography variant="caption" color="text.secondary">
                          Click to view checks for this week
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
                
                {/* Quick Actions */}
                {weekKeys.length > 10 && (
                  <Box sx={{ mt: 2, p: 2, backgroundColor: 'white', borderRadius: 2, border: '1px solid', borderColor: 'grey.200' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Quick Actions:
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Button size="small" variant="outlined" onClick={() => {
                        const mostRecent = weekKeys[0];
                        setSelectedWeekKey(mostRecent);
                        setReviewOnly(false);
                      }}>
                        Most Recent Week
                  </Button>
                      <Button size="small" variant="outlined" onClick={() => {
                        const weekWithMostChecks = weekKeys.reduce((max, current) => 
                          (checksByWeek[current]?.length || 0) > (checksByWeek[max]?.length || 0) ? current : max
                        );
                        setSelectedWeekKey(weekWithMostChecks);
                        setReviewOnly(false);
                      }}>
                        Week with Most Checks
                      </Button>
                    </Box>
                  </Box>
                )}
              </Box>
            </>
          ) : (
            <>
              <Button
                variant="outlined"
                sx={{ mb: 3, ml: 2 }}
                onClick={handleBackToWeeks}
              >
                ← Back to Weeks
              </Button>
              <Typography variant="h6" gutterBottom>
                Checks for {companies.find(c => c.id === selectedCompanyId)?.name} - Week starting: {selectedWeekKey}
              </Typography>
              
              {/* Review Mode Toggle - Admin Only */}
              {currentRole === 'admin' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Button
                    variant={reviewOnly ? "contained" : "outlined"}
                    color="warning"
                    size="small"
                    onClick={() => setReviewOnly(!reviewOnly)}
                    startIcon={reviewOnly ? <span></span> : <span></span>}
                  >
                    {reviewOnly ? "Show All Checks"  : "Review Mode " }
                  </Button>
                  {reviewOnly && (
                    <Typography variant="body2" color="text.secondary">
                      Showing {filteredChecks.filter((c: any) => !c.reviewed).length} checks that need review
                    </Typography>
                  )}
                </Box>
              )}



              {/* Selection Controls and Print Buttons */}
              {selectedCompanyId && selectedWeekKey && (
                <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                  {/* Selection Controls */}
                  <Box sx={{ display: 'flex', gap: 1, mr: 2 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleSelectAllChecks}
                    >
                       Select All
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleDeselectAllChecks}
                    >
                       Deselect All
                    </Button>
                    <Chip 
                      label={`${selectedChecks.size} selected`} 
                      color="primary" 
                      variant="outlined"
                      size="small"
                    />
                  </Box>

                  {/* Send for Review Buttons - Only show for regular users */}
                  {currentRole !== 'admin' && (
                    <>
                      <Button
                        variant="contained"
                        color="warning"
                        onClick={handleBulkSendSelectedForReview}
                        disabled={selectedChecks.size === 0 || Array.from(selectedChecks).some(checkId => checksSentForReview.has(checkId))}
                        sx={{ ml: 1 }}
                      >
                        Send Selected for Review ({selectedChecks.size})
                      </Button>
                      <Button
                        variant="contained"
                        color="error"
                        onClick={handleSendAllUnreviewedForReview}
                        disabled={filteredChecks.filter((check: CheckItem) => !check.reviewed && !checksSentForReview.has(check.id)).length === 0}
                        sx={{ ml: 1 }}
                      >
                        Send All Unreviewed for Review ({filteredChecks.filter((check: CheckItem) => !check.reviewed).length})
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        onClick={handleBulkDeleteSelected}
                        disabled={selectedChecks.size === 0 || !Array.from(selectedChecks).some(checkId => {
                          const check = filteredChecks.find(c => c.id === checkId);
                          return check && !check.reviewed;
                        })}
                        sx={{ ml: 1 }}
                      >
                        Delete Selected ({selectedChecks.size})
                      </Button>
                    </>
                  )}

                  {/* Print Buttons - Only show if user has permission */}
                  {canPrintChecks && (
                    <>
                      <Button
                        variant="contained"
                        color="secondary"
                        onClick={() => handlePrintReviewedChecks(selectedCompanyId, selectedWeekKey)}
                        disabled={!selectedCompanyId || !selectedWeekKey}
                      >
                         Print Reviewed Checks
                      </Button>
                <Button
                  variant="contained"
                  color="success"
                        onClick={handlePrintSelectedChecks}
                        disabled={selectedChecks.size === 0}
                >
                        Print Selected ({selectedChecks.size})
                </Button>
                    </>
              )}

                  {/* Bulk Review Buttons - Admin Only */}
                  {currentRole === 'admin' && selectedCompanyId && selectedWeekKey && (
                <>
                      {/* Review Selected Checks Button */}
                  <Button
                    variant="contained"
                    color="primary"
                        onClick={() => handleReviewSelectedChecks()}
                        disabled={selectedChecks.size === 0}
                        sx={{ ml: 1 }}
                      >
                         Review Selected ({selectedChecks.size})
                      </Button>
                      
                      {/* For admin users: Direct review all */}
                  <Button
                    variant="contained"
                          color="info"
                          onClick={() => handleDirectReviewAll()}
                    disabled={!selectedCompanyId || !selectedWeekKey}
                          sx={{ ml: 1 }}
                  >
                           Mark All as Reviewed (Admin)
                  </Button>
                </>
                  )}
                </Box>
              )}

              {/* Permission Denied Message */}
              {selectedCompanyId && selectedWeekKey && !canPrintChecks && !permissionsLoading && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>Printing Restricted:</strong> You don't have permission to print checks. 
                    Contact an administrator to enable this feature.
                  </Typography>
                </Alert>
              )}

              {/* Loading State for Permissions */}
              {selectedCompanyId && selectedWeekKey && permissionsLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2" color="text.secondary">
                    Checking print permissions...
                  </Typography>
                </Box>
              )}
              <Divider sx={{ my: 1 }} />
              {selectedWeekKey && checksByWeek[selectedWeekKey]?.length ? (
                checksByWeek[selectedWeekKey]?.map((check: CheckItem) => {
                  const d = check.date?.toDate ? check.date.toDate() : new Date(check.date);
                  const madeByName = typeof check.createdBy === 'string' ? userMap[check.createdBy] || 'Unknown' : 'Unknown';
                  const isSelected = selectedChecks.has(check.id);
                  
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
                        mb: 0.5,
                        backgroundColor: isSelected ? '#f0f8ff' : 'white',
                        '&:hover': {
                          backgroundColor: isSelected ? '#e3f2fd' : '#f5f5f5'
                        }
                      }}
                    >
                      {/* Checkbox */}
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handleCheckboxChange(check.id)}
                        size="small"
                        sx={{ mr: 1 }}
                      />
                      
                      {/* Compact Check Info */}
                      <Box sx={{ display: 'flex', flex: 1, justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 'bold', minWidth: 80 }}>
                            #{check.checkNumber ?? 'N/A'}
                          </Typography>
                          <Typography variant="body2" sx={{ minWidth: 120 }}>
                            {check.employeeName}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main', minWidth: 100 }}>
                            ${(parseFloat(check.amount?.toString() || '0')).toFixed(2)}
                          </Typography>
                        </Box>
                        
                        {/* Status Chips */}
                        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        {check.reviewed ? (
                            <Chip label="✓" color="success" size="small" sx={{ minWidth: 32 }} />
) : (
                            <Chip label="⏳" color="warning" size="small" sx={{ minWidth: 32 }} />
                          )}
                          {check.paid ? (
                            <Chip label="💰" color="success" size="small" sx={{ minWidth: 32 }} />
                          ) : (
                            <Chip label="💳" color="default" size="small" sx={{ minWidth: 32 }} />
    )}
  </Box>

                        {/* Date and Actions */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80 }}>
                            {formatDateForDisplay(check.date)}
                        </Typography>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleOpenDialog(check)}
                            sx={{ minWidth: 60 }}
                        >
                            Details
                        </Button>
                          {!check.reviewed && currentRole !== 'admin' && (
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleSendForReview(check, selectedWeekKey!)}
                              disabled={checksSentForReview.has(check.id)}
                              sx={{ minWidth: 60 }}
                            >
                              {checksSentForReview.has(check.id) ? 'Sent' : 'Review'}
                            </Button>
                          )}
                      </Box>
                      </Box>
                    </Box>
                  );
                })
              ) : (
                <Typography>No checks found for this week.</Typography>
              )}
            </>
          )}
        </>
      )}

      {reviewOnly && currentRole === 'admin' && (
        <Box sx={{ p: 2, mb: 2, backgroundColor: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 1 }}>
          <Typography variant="body1" fontWeight="bold">
             Review Mode: Showing only checks that need to be reviewed for this company and week.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Found {filteredChecks.filter((c: any) => !c.reviewed).length} checks pending review
          </Typography>
          <Button variant="outlined" size="small" sx={{ mt: 1 }} onClick={() => setReviewOnly(false)}>
            Show all checks for this company/week
          </Button>
        </Box>
      )}

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Check Details</DialogTitle>
        <DialogContent dividers>
          {selectedCheck ? (
            <>
              <Typography><strong>Employee:</strong> {selectedCheck.employeeName}</Typography>
              <Typography><strong>Company:</strong> {companies.find(c => c.id === selectedCheck.companyId)?.name}</Typography>
              <Typography><strong>Client:</strong> {
                selectedCheck.relationshipDetails && selectedCheck.relationshipDetails.length > 0
                  ? selectedCheck.relationshipDetails.map(rel => {
                      const client = clients.find(c => c.name === rel.clientName);
                      return client && client.division 
                        ? `${rel.clientName} (${client.division})`
                        : rel.clientName;
                    }).join(' + ')
                  : selectedCheck.clientId && selectedCheck.clientId !== 'multiple'
                    ? (() => {
                        const client = clients.find(c => c.id === selectedCheck.clientId);
                        return client && client.division 
                          ? `${client.name} (${client.division})`
                          : client?.name || 'Unknown Client';
                      })()
                    : 'Multiple Clients'
              }</Typography>
              <Divider sx={{ my: 1 }} />
              {/* Show relationship-based data if available, otherwise show basic fields */}
              {selectedCheck.relationshipDetails && selectedCheck.relationshipDetails.length > 0 ? (
                // Relationship-based check - show detailed relationship breakdown
                <>
                  {/* Detailed Relationship Breakdown */}
              <Box sx={{ mt: 2, p: 2, backgroundColor: '#f8f9fa', borderRadius: 1, border: '1px solid #e9ecef' }}>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5, color: '#495057', fontSize: '1rem' }}>
                      Relationship Breakdown
                </Typography>
                    
                    {/* Individual Relationship Cards */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
                      {selectedCheck.relationshipDetails.map((rel, index) => {
                        // Comprehensive debug logging for each relationship
                        console.log('🔍 DEBUG relationshipDetails mapping:', {
                          index,
                          relationshipId: rel.id,
                          clientName: rel.clientName,
                          payType: rel.payType,
                          payRate: rel.payRate,
                          hours: rel.hours,
                          otHours: rel.otHours,
                          holidayHours: rel.holidayHours,
                          perdiemAmount: rel.perdiemAmount,
                          perdiemBreakdown: rel.perdiemBreakdown,
                          perdiemMonday: rel.perdiemMonday,
                          perdiemTuesday: rel.perdiemTuesday,
                          perdiemWednesday: rel.perdiemWednesday,
                          perdiemThursday: rel.perdiemThursday,
                          perdiemFriday: rel.perdiemFriday,
                          perdiemSaturday: rel.perdiemSaturday,
                          perdiemSunday: rel.perdiemSunday,
                          otherPay: rel.otherPay,
                          fullRelationship: rel
                        });
                        
                        return (
                        <Box key={index} sx={{ 
                          p: 1.5, 
                          backgroundColor: 'white', 
                          borderRadius: 1, 
                          border: `2px solid ${rel.payType === 'hourly' ? '#e3f2fd' : '#fff8e1'}`,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}>
                          {/* Relationship Header */}
                          <Box sx={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            mb: 1,
                            pb: 0.5,
                            borderBottom: `1px solid ${rel.payType === 'hourly' ? '#e3f2fd' : '#fff8e1'}`
                          }}>
                            <Typography variant="subtitle1" fontWeight="bold" sx={{ 
                              color: rel.payType === 'hourly' ? '#1976d2' : '#f57c00',
                              fontSize: '0.95rem'
                            }}>
                              {(() => {
                                const client = clients.find(c => c.name === rel.clientName);
                                return client && client.division 
                                  ? `${rel.clientName} (${client.division})`
                                  : rel.clientName;
                              })()}
                            </Typography>
                            <Chip 
                              label={rel.payType === 'hourly' ? 'Hourly' : 'Per Diem'} 
                              size="small"
                              sx={{ 
                                backgroundColor: rel.payType === 'hourly' ? '#e3f2fd' : '#fff8e1',
                                color: rel.payType === 'hourly' ? '#1976d2' : '#f57c00',
                                fontWeight: 'bold',
                                fontSize: '0.75rem'
                              }}
                            />
                          </Box>
                          
                          {/* Relationship Details */}
                          {rel.payType === 'hourly' && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.85rem' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Hourly Rate:</span>
                                <span style={{ fontWeight: 'bold' }}>
                                  ${(rel.payRate || parseFloat(selectedCheck.payRate?.toString() || '0')).toFixed(2)}/hr
                                </span>
                    </Box>
                              {/* For relationship-based checks, show the specific hours for this relationship */}
                              {(() => {
                                // Get the hours for this specific relationship, fallback to main hours field
                                const relHours = rel.hours || selectedCheck.relationshipHours?.[rel.id] || 0;
                                const mainHours = selectedCheck.hours || 0;
                                const hoursToShow = relHours > 0 ? relHours : mainHours;
                                
                                // Debug logging
                                console.log('🔍 DEBUG relationshipHours:', {
                                  relationshipId: rel.id,
                                  relationshipHours: selectedCheck.relationshipHours,
                                  relHours: relHours,
                                  mainHours: mainHours,
                                  hoursToShow: hoursToShow,
                                  selectedCheck: selectedCheck
                                });
                                
                                if (hoursToShow > 0) {
                                  return (
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span>Hours:</span>
                                      <span>{hoursToShow}h × ${(rel.payRate || parseFloat(selectedCheck.payRate?.toString() || '0')).toFixed(2)} = ${(hoursToShow * (rel.payRate || parseFloat(selectedCheck.payRate?.toString() || '0'))).toFixed(2)}</span>
                                    </Box>
                                  );
                                }
                                
                                // If no hours data at all, show fallback message
                                return (
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Hours:</span>
                                    <span style={{ color: '#999', fontStyle: 'italic' }}>No hours data available</span>
                                  </Box>
                                );
                              })()}
                              {/* Show OT and Holiday hours - relationship-specific first, then fallback to check-wide */}
                              {(() => {
                                // Debug logging for OT/Holiday/Other pay
                                console.log('🔍 DEBUG relationship OT/Holiday/Other:', {
                                  relationshipId: rel.id,
                                  relOtHours: rel.otHours,
                                  relHolidayHours: rel.holidayHours,
                                  relOtherPay: rel.otherPay,
                                  checkOtHours: selectedCheck.otHours,
                                  checkHolidayHours: selectedCheck.holidayHours,
                                  checkOtherPay: selectedCheck.otherPay
                                });
                                
                                const hasOtHours = (rel.otHours && rel.otHours > 0) || (selectedCheck.otHours && selectedCheck.otHours > 0);
                                if (hasOtHours) {
                                  const otHours = rel.otHours || selectedCheck.otHours || 0;
                                  const payRate = rel.payRate || parseFloat(selectedCheck.payRate?.toString() || '0');
                                  return (
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span>OT Hours:</span>
                                      <span>{otHours}h × ${(payRate * 1.5).toFixed(2)} = ${(otHours * payRate * 1.5).toFixed(2)}</span>
                                    </Box>
                                  );
                                }
                                return null;
                              })()}
                              {(() => {
                                const hasHolidayHours = (rel.holidayHours && rel.holidayHours > 0) || (selectedCheck.holidayHours && selectedCheck.holidayHours > 0);
                                if (hasHolidayHours) {
                                  const holidayHours = rel.holidayHours || selectedCheck.holidayHours || 0;
                                  const payRate = rel.payRate || parseFloat(selectedCheck.payRate?.toString() || '0');
                                  return (
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span>Holiday Hours:</span>
                                      <span>{holidayHours}h × ${(payRate * 2).toFixed(2)} = ${(holidayHours * payRate * 2).toFixed(2)}</span>
                                    </Box>
                                  );
                                }
                                return null;
                              })()}
                              {/* Show Other Pay - relationship-specific first, then fallback to check-wide */}
                              {(() => {
                                // Check for relationship-specific other pay first
                                const hasRelOtherPay = rel.otherPay && rel.otherPay.length > 0 && rel.otherPay.some((item: any) => parseFloat(item.amount || '0') > 0);
                                const hasCheckOtherPay = selectedCheck.otherPay && selectedCheck.otherPay.length > 0 && selectedCheck.otherPay.some((item: any) => parseFloat(item.amount || '0') > 0);
                                
                                if (hasRelOtherPay && rel.otherPay) {
                                  return (
                                    <>
                                      {rel.otherPay!.map((item: any, index: number) => (
                                        parseFloat(item.amount || '0') > 0 && (
                                          <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>{item.description || 'Other Pay'}:</span>
                                            <span style={{ fontWeight: 'bold' }}>
                                              ${parseFloat(item.amount || '0').toFixed(2)}
                                            </span>
                                          </Box>
                                        )
                                      ))}
                                    </>
                                  );
                                } else if (hasCheckOtherPay && selectedCheck.otherPay) {
                                  return (
                                    <>
                                      {selectedCheck.otherPay!.map((item: any, index: number) => (
                                        parseFloat(item.amount || '0') > 0 && (
                                          <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>{item.description || 'Other Pay'}:</span>
                                            <span style={{ fontWeight: 'bold' }}>
                                              ${parseFloat(item.amount || '0').toFixed(2)}
                                            </span>
                                          </Box>
                                        )
                                      ))}
                                    </>
                                  );
                                }
                                return null;
                              })()}
                            </Box>
                          )}
                          
                          {rel.payType === 'perdiem' && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.85rem' }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Per Diem Type:</span>
                                <span style={{ fontWeight: 'bold' }}>
                                  {rel.perdiemBreakdown ? 'Daily Breakdown' : 'Full Amount'}
                                </span>
                              </Box>
                              {/* Only show daily breakdown if there are actual daily amounts > 0 */}
                              {(() => {
                                // Check for relationship-specific daily amounts first
                                const relDailyAmounts = [
                                  rel.perdiemMonday,
                                  rel.perdiemTuesday,
                                  rel.perdiemWednesday,
                                  rel.perdiemThursday,
                                  rel.perdiemFriday,
                                  rel.perdiemSaturday,
                                  rel.perdiemSunday
                                ].some(amount => amount !== undefined && amount > 0);
                                
                                if (relDailyAmounts) {
                                  // Show relationship-specific daily breakdown
                                  const totalRelDaily = (rel.perdiemMonday || 0) + (rel.perdiemTuesday || 0) + (rel.perdiemWednesday || 0) + 
                                                      (rel.perdiemThursday || 0) + (rel.perdiemFriday || 0) + (rel.perdiemSaturday || 0) + (rel.perdiemSunday || 0);
                                  
                                  return (
                                    <Box sx={{ mt: 0.5 }}>
                                      <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                        <span>Total Amount:</span>
                                        <span style={{ fontWeight: 'bold' }}>${totalRelDaily.toFixed(2)}</span>
                                      </Box>
                                      <Typography variant="caption" sx={{ color: '#666', display: 'block', mb: 0.5 }}>
                                        Daily Amounts:
                                      </Typography>
                                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.5, fontSize: '0.75rem' }}>
                                        {rel.perdiemMonday && rel.perdiemMonday > 0 && (
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Monday:</span>
                                            <span>${rel.perdiemMonday.toFixed(2)}</span>
                                          </Box>
                                        )}
                                        {rel.perdiemTuesday && rel.perdiemTuesday > 0 && (
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Tuesday:</span>
                                            <span>${rel.perdiemTuesday.toFixed(2)}</span>
                                          </Box>
                                        )}
                                        {rel.perdiemWednesday && rel.perdiemWednesday > 0 && (
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Wednesday:</span>
                                            <span>${rel.perdiemWednesday.toFixed(2)}</span>
                                          </Box>
                                        )}
                                        {rel.perdiemThursday && rel.perdiemThursday > 0 && (
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Thursday:</span>
                                            <span>${rel.perdiemThursday.toFixed(2)}</span>
                                          </Box>
                                        )}
                                        {rel.perdiemFriday && rel.perdiemFriday > 0 && (
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Friday:</span>
                                            <span>${rel.perdiemFriday.toFixed(2)}</span>
                                          </Box>
                                        )}
                                        {rel.perdiemSaturday && rel.perdiemSaturday > 0 && (
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Saturday:</span>
                                            <span>${rel.perdiemSaturday.toFixed(2)}</span>
                                          </Box>
                                        )}
                                        {rel.perdiemSunday && rel.perdiemSunday > 0 && (
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Sunday:</span>
                                            <span>${rel.perdiemSunday.toFixed(2)}</span>
                                          </Box>
                                        )}
                                      </Box>
                                    </Box>
                                  );
                                }
                                
                                // If no daily amounts, check for total amount
                                if (!relDailyAmounts) {
                                  // Try multiple sources for per diem amount - prioritize relationship-specific
                                  let perDiemAmount = 0;
                                  
                                  // Check relationship-specific perdiemAmount first
                                  if (rel.perdiemAmount && rel.perdiemAmount > 0) {
                                    perDiemAmount = rel.perdiemAmount;
                                  }
                                  // Check selectedCheck.perdiemAmount as fallback
                                  else if (selectedCheck.perdiemAmount && selectedCheck.perdiemAmount > 0) {
                                    perDiemAmount = selectedCheck.perdiemAmount;
                                  }
                                  // Check if there's a relationship-specific amount in the check's amount calculation
                                  else if (selectedCheck.amount && selectedCheck.relationshipDetails && selectedCheck.relationshipDetails.length === 1 && rel.payType === 'perdiem') {
                                    // If this is the only relationship and it's per diem, use the total check amount
                                    perDiemAmount = selectedCheck.amount;
                                  }
                                  // Calculate from the total check amount proportionally if multiple relationships
                                  else if (selectedCheck.amount && selectedCheck.relationshipDetails && selectedCheck.relationshipDetails.length > 1) {
                                    // For multi-relationship checks, we need to estimate the per diem portion
                                    const perDiemRelationships = selectedCheck.relationshipDetails.filter(r => r.payType === 'perdiem').length;
                                    const totalRelationships = selectedCheck.relationshipDetails.length;
                                    if (perDiemRelationships > 0) {
                                      perDiemAmount = (selectedCheck.amount / totalRelationships) * perDiemRelationships;
                                    }
                                  }
                                  
                                  if (perDiemAmount > 0) {
                                    return (
                                      <Box sx={{ mt: 0.5 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                          <span>Total Amount:</span>
                                          <span style={{ fontWeight: 'bold' }}>${Number(perDiemAmount).toFixed(2)}</span>
                                        </Box>
                                      </Box>
                                    );
                                  }
                                  
                                  // If still no amount found, show a message
                                  return (
                                    <Box sx={{ mt: 0.5 }}>
                                      <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#666' }}>
                                        <span>Per Diem Amount:</span>
                                        <span>Not specified</span>
                                      </Box>
                                    </Box>
                                  );
                                }
                                
                                return null;
                              })()}
                              
                              {/* Show Other Pay for per diem relationships */}
                              {(() => {
                                // Check for relationship-specific other pay first
                                const hasRelOtherPay = rel.otherPay && rel.otherPay.length > 0 && rel.otherPay.some((item: any) => parseFloat(item.amount || '0') > 0);
                                const hasCheckOtherPay = selectedCheck.otherPay && selectedCheck.otherPay.length > 0 && selectedCheck.otherPay.some((item: any) => parseFloat(item.amount || '0') > 0);
                                
                                if (hasRelOtherPay && rel.otherPay) {
                                  return (
                                    <>
                                      {rel.otherPay!.map((item: any, index: number) => (
                                        parseFloat(item.amount || '0') > 0 && (
                                          <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                                            <span>{item.description || 'Other Pay'}:</span>
                                            <span style={{ fontWeight: 'bold' }}>
                                              ${parseFloat(item.amount || '0').toFixed(2)}
                                            </span>
                                          </Box>
                                        )
                                      ))}
                                    </>
                                  );
                                } else if (hasCheckOtherPay && selectedCheck.otherPay) {
                                  return (
                                    <>
                                      {selectedCheck.otherPay!.map((item: any, index: number) => (
                                        parseFloat(item.amount || '0') > 0 && (
                                          <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                                            <span>{item.description || 'Other Pay'}:</span>
                                            <span style={{ fontWeight: 'bold' }}>
                                              ${parseFloat(item.amount || '0').toFixed(2)}
                                            </span>
                                          </Box>
                                        )
                                      ))}
                                    </>
                                  );
                                }
                                return null;
                              })()}
                            </Box>
                          )}
                          
                          {/* Legacy per diem section - keep for backward compatibility */}
                          {!rel.payType && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.85rem' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Per Diem Type:</span>
                                <span style={{ fontWeight: 'bold' }}>Daily Breakdown</span>
                              </Box>
                              {/* Only show daily breakdown if there are actual daily amounts > 0 */}
                              {(() => {
                                // Debug logging for per diem - show the full check data
                                console.log('🔍 DEBUG perDiem FULL CHECK DATA:', {
                                  relationshipId: rel.id,
                                  fullCheckData: selectedCheck,
                                  perdiemBreakdown: selectedCheck.perdiemBreakdown,
                                  perdiemAmount: selectedCheck.perdiemAmount,
                                  perdiemMonday: selectedCheck.perdiemMonday,
                                  perdiemTuesday: selectedCheck.perdiemTuesday,
                                  perdiemWednesday: selectedCheck.perdiemWednesday,
                                  perdiemThursday: selectedCheck.perdiemThursday,
                                  perdiemFriday: selectedCheck.perdiemFriday,
                                  perdiemSaturday: selectedCheck.perdiemSaturday,
                                  perdiemSunday: selectedCheck.perdiemSunday,
                                  relationshipDetails: selectedCheck.relationshipDetails
                                });
                                
                                // Check if any daily amounts exist and are > 0
                                const hasDailyAmounts = [
                                  selectedCheck.perdiemMonday,
                                  selectedCheck.perdiemTuesday,
                                  selectedCheck.perdiemWednesday,
                                  selectedCheck.perdiemThursday,
                                  selectedCheck.perdiemFriday,
                                  selectedCheck.perdiemSaturday,
                                  selectedCheck.perdiemSunday
                                ].some(amount => amount !== undefined && amount > 0);
                                
                                // Check for relationship-specific daily amounts first
                                const relDailyAmounts = [
                                  rel.perdiemMonday,
                                  rel.perdiemTuesday,
                                  rel.perdiemWednesday,
                                  rel.perdiemThursday,
                                  rel.perdiemFriday,
                                  rel.perdiemSaturday,
                                  rel.perdiemSunday
                                ].some(amount => amount !== undefined && amount > 0);
                                
                                if (relDailyAmounts) {
                                  // Show relationship-specific daily breakdown
                                  const totalRelDaily = (rel.perdiemMonday || 0) + (rel.perdiemTuesday || 0) + (rel.perdiemWednesday || 0) + 
                                                      (rel.perdiemThursday || 0) + (rel.perdiemFriday || 0) + (rel.perdiemSaturday || 0) + (rel.perdiemSunday || 0);
                                  
                                  return (
                                    <Box sx={{ mt: 0.5 }}>
                                      <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                        <span>Total Amount:</span>
                                        <span style={{ fontWeight: 'bold' }}>${totalRelDaily.toFixed(2)}</span>
                                      </Box>
                                      <Typography variant="caption" sx={{ color: '#666', display: 'block', mb: 0.5 }}>
                                        Daily Amounts:
                                      </Typography>
                                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.5, fontSize: '0.75rem' }}>
                                        {rel.perdiemMonday && rel.perdiemMonday > 0 && (
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Monday:</span>
                                            <span>${rel.perdiemMonday.toFixed(2)}</span>
                                          </Box>
                                        )}
                                        {rel.perdiemTuesday && rel.perdiemTuesday > 0 && (
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Tuesday:</span>
                                            <span>${rel.perdiemTuesday.toFixed(2)}</span>
                                          </Box>
                                        )}
                                        {rel.perdiemWednesday && rel.perdiemWednesday > 0 && (
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Wednesday:</span>
                                            <span>${rel.perdiemWednesday.toFixed(2)}</span>
                                          </Box>
                                        )}
                                        {rel.perdiemThursday && rel.perdiemThursday > 0 && (
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Thursday:</span>
                                            <span>${rel.perdiemThursday.toFixed(2)}</span>
                                          </Box>
                                        )}
                                        {rel.perdiemFriday && rel.perdiemFriday > 0 && (
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Friday:</span>
                                            <span>${rel.perdiemFriday.toFixed(2)}</span>
                                          </Box>
                                        )}
                                        {rel.perdiemSaturday && rel.perdiemSaturday > 0 && (
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Saturday:</span>
                                            <span>${rel.perdiemSaturday.toFixed(2)}</span>
                                          </Box>
                                        )}
                                        {rel.perdiemSunday && rel.perdiemSunday > 0 && (
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Sunday:</span>
                                            <span>${rel.perdiemSunday.toFixed(2)}</span>
                                          </Box>
                                        )}
                                      </Box>
                                    </Box>
                                  );
                                }
                                
                                if (!hasDailyAmounts) {
                                  console.log('🔍 DEBUG perDiem: No daily amounts found, checking for total amount');
                                  
                                  // Try multiple sources for per diem amount - prioritize relationship-specific
                                  let perDiemAmount = 0;
                                  
                                  // Check relationship-specific perdiemAmount first
                                  if (rel.perdiemAmount && rel.perdiemAmount > 0) {
                                    perDiemAmount = rel.perdiemAmount;
                                    console.log('🔍 DEBUG perDiem: Using relationship-specific amount:', perDiemAmount);
                                  }
                                  // Check selectedCheck.perdiemAmount as fallback - but only if no relationship-specific amount
                                  else if (selectedCheck.perdiemAmount && selectedCheck.perdiemAmount > 0) {
                                    perDiemAmount = selectedCheck.perdiemAmount;
                                    console.log('🔍 DEBUG perDiem: Using check-wide fallback amount:', perDiemAmount);
                                  }
                                  // Check if there's a relationship-specific amount in the check's amount calculation
                                  else if (selectedCheck.amount && selectedCheck.relationshipDetails && selectedCheck.relationshipDetails.length === 1 && rel.payType === 'perdiem') {
                                    // If this is the only relationship and it's per diem, use the total check amount
                                    perDiemAmount = selectedCheck.amount;
                                  }
                                  // Calculate from the total check amount proportionally if multiple relationships
                                  else if (selectedCheck.amount && selectedCheck.relationshipDetails && selectedCheck.relationshipDetails.length > 1) {
                                    // For multi-relationship checks, we need to estimate the per diem portion
                                    // This is a rough estimation - in a real scenario, you'd want more precise tracking
                                    const perDiemRelationships = selectedCheck.relationshipDetails.filter(r => r.payType === 'perdiem').length;
                                    const totalRelationships = selectedCheck.relationshipDetails.length;
                                    if (perDiemRelationships > 0) {
                                      perDiemAmount = (selectedCheck.amount / totalRelationships) * perDiemRelationships;
                                    }
                                  }
                                  
                                  console.log('🔍 DEBUG perDiem: Calculated amount:', perDiemAmount);
                                  
                                  if (perDiemAmount > 0) {
                                    return (
                                      <Box sx={{ mt: 0.5 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                          <span>Total Amount:</span>
                                          <span style={{ fontWeight: 'bold' }}>${Number(perDiemAmount).toFixed(2)}</span>
                                        </Box>
                                      </Box>
                                    );
                                  }
                                  
                                  // If still no amount found, show a message
                                  return (
                                    <Box sx={{ mt: 0.5 }}>
                                      <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#666' }}>
                                        <span>Per Diem Amount:</span>
                                        <span>Not specified</span>
                                      </Box>
                                    </Box>
                                  );
                                }
                                
                                return (
                                  <Box sx={{ mt: 0.5 }}>
                                    <Typography variant="caption" sx={{ color: '#666', display: 'block', mb: 0.5 }}>
                                      Daily Amounts:
                                    </Typography>
                                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.5, fontSize: '0.75rem' }}>
                                      {selectedCheck.perdiemMonday && selectedCheck.perdiemMonday > 0 && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span>Monday:</span>
                                          <span>${selectedCheck.perdiemMonday.toFixed(2)}</span>
                    </Box>
                  )}
                                      {selectedCheck.perdiemTuesday && selectedCheck.perdiemTuesday > 0 && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span>Tuesday:</span>
                                          <span>${selectedCheck.perdiemTuesday.toFixed(2)}</span>
                        </Box>
                      )}
                                      {selectedCheck.perdiemWednesday && selectedCheck.perdiemWednesday > 0 && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span>Wednesday:</span>
                                          <span>${selectedCheck.perdiemWednesday.toFixed(2)}</span>
                        </Box>
                      )}
                                      {selectedCheck.perdiemThursday && selectedCheck.perdiemThursday > 0 && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span>Thursday:</span>
                                          <span>${selectedCheck.perdiemThursday.toFixed(2)}</span>
                        </Box>
                      )}
                                      {selectedCheck.perdiemFriday && selectedCheck.perdiemFriday > 0 && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span>Friday:</span>
                                          <span>${selectedCheck.perdiemFriday.toFixed(2)}</span>
                        </Box>
                      )}
                                      {selectedCheck.perdiemSaturday && selectedCheck.perdiemSaturday > 0 && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span>Saturday:</span>
                                          <span>${selectedCheck.perdiemSaturday.toFixed(2)}</span>
                        </Box>
                      )}
                                      {selectedCheck.perdiemSunday && selectedCheck.perdiemSunday > 0 && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span>Sunday:</span>
                                          <span>${selectedCheck.perdiemSunday.toFixed(2)}</span>
                        </Box>
                      )}
                                    </Box>
                                  </Box>
                                );
                              })()}
                              {/* Show relationship-specific perdiem amount if no breakdown */}
                              {!rel.perdiemBreakdown && rel.perdiemAmount && rel.perdiemAmount > 0 && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Total Per Diem:</span>
                                  <span style={{ fontWeight: 'bold' }}>${rel.perdiemAmount.toFixed(2)}</span>
                                </Box>
                              )}
                              {/* Fallback to check-wide perdiem amount - but only if no relationship-specific amount exists */}
                              {!rel.perdiemBreakdown && (!rel.perdiemAmount || rel.perdiemAmount === 0) && selectedCheck.perdiemAmount && selectedCheck.perdiemAmount > 0 && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Total Per Diem:</span>
                                  <span style={{ fontWeight: 'bold' }}>${selectedCheck.perdiemAmount.toFixed(2)}</span>
                                </Box>
                              )}
                    </Box>
                  )}
                  </Box>
                        );
                      })}
                </Box>
                    
                   
                    
                    {/* Total Amount */}
                    <Box sx={{ 
                      mt: 1.5, 
                      p: 1.5, 
                      backgroundColor: '#f5f5f5', 
                      borderRadius: 1, 
                      border: '2px solid #e0e0e0',
                      textAlign: 'center'
                    }}>
                      <Typography variant="h6" fontWeight="bold" color="#1976d2">
                        Total Amount: ${(parseFloat(selectedCheck.amount?.toString() || '0')).toFixed(2)}
                      </Typography>
                    </Box>
                  </Box>
                </>
              ) : (
                // Basic check - show traditional fields with better formatting
                <>
                  {/* Basic Check Information */}
                  <Box sx={{ mt: 2, p: 2, backgroundColor: '#f8f9fa', borderRadius: 1, border: '1px solid #e9ecef' }}>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5, color: '#495057', fontSize: '1rem' }}>
                      Check Details
                    </Typography>
                    
                    {/* Hourly Information */}
                    {(selectedCheck.hours && selectedCheck.hours > 0) || (selectedCheck.otHours && selectedCheck.otHours > 0) || (selectedCheck.holidayHours && selectedCheck.holidayHours > 0) || (selectedCheck.otherPay && selectedCheck.otherPay.length > 0 && selectedCheck.otherPay.some((item: any) => parseFloat(item.amount || '0') > 0)) ? (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1, color: '#1976d2' }}>
                          Hourly Breakdown
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.85rem' }}>
                          {selectedCheck.hours && selectedCheck.hours > 0 && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 0.5, backgroundColor: 'white', borderRadius: 0.5 }}>
                              <span>Regular Hours:</span>
                              <span style={{ fontWeight: 'bold' }}>
                                {selectedCheck.hours}h × ${(parseFloat(selectedCheck.payRate?.toString() || '0')).toFixed(2)} = ${((selectedCheck.hours || 0) * (parseFloat(selectedCheck.payRate?.toString() || '0'))).toFixed(2)}
                              </span>
                            </Box>
                          )}
                          {selectedCheck.otHours && selectedCheck.otHours > 0 && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 0.5, backgroundColor: 'white', borderRadius: 0.5 }}>
                              <span>OT Hours:</span>
                              <span style={{ fontWeight: 'bold' }}>
                                {selectedCheck.otHours}h × ${(parseFloat(selectedCheck.payRate?.toString() || '0') * 1.5).toFixed(2)} = ${((selectedCheck.otHours || 0) * (parseFloat(selectedCheck.payRate?.toString() || '0')) * 1.5).toFixed(2)}
                              </span>
                            </Box>
                          )}
                          {selectedCheck.holidayHours && selectedCheck.holidayHours > 0 && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 0.5, backgroundColor: 'white', borderRadius: 0.5 }}>
                              <span>Holiday Hours:</span>
                              <span style={{ fontWeight: 'bold' }}>
                                {selectedCheck.holidayHours}h × ${(parseFloat(selectedCheck.payRate?.toString() || '0') * 2).toFixed(2)} = ${((selectedCheck.holidayHours || 0) * (parseFloat(selectedCheck.payRate?.toString() || '0')) * 2).toFixed(2)}
                              </span>
                            </Box>
                          )}
                          {/* Other Pay Items */}
                          {selectedCheck.otherPay && selectedCheck.otherPay.length > 0 && selectedCheck.otherPay.some((item: any) => parseFloat(item.amount || '0') > 0) && (
                            <>
                              {selectedCheck.otherPay.map((item: any, index: number) => (
                                parseFloat(item.amount || '0') > 0 && (
                                  <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', p: 0.5, backgroundColor: 'white', borderRadius: 0.5 }}>
                                    <span>{item.description || 'Other Pay'}:</span>
                                    <span style={{ fontWeight: 'bold' }}>
                                      ${parseFloat(item.amount || '0').toFixed(2)}
                                    </span>
                                  </Box>
                                )
                              ))}
                            </>
                          )}
                        </Box>
                      </Box>
                    ) : null}
                    
                    {/* Per Diem Information */}
                    {parseFloat(calculatePerDiemTotal(selectedCheck)) > 0 ? (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1, color: '#f57c00' }}>
                          Per Diem Breakdown
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.85rem' }}>
                          {!selectedCheck.perdiemBreakdown && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 0.5, backgroundColor: 'white', borderRadius: 0.5 }}>
                              <span>Total Per Diem:</span>
                              <span style={{ fontWeight: 'bold' }}>${calculatePerDiemTotal(selectedCheck)}</span>
                            </Box>
                          )}
                          
                          {/* Daily Breakdown - Show when perdiemBreakdown is true */}
                          {selectedCheck.perdiemBreakdown && (
                            <Box sx={{ p: 0.5, backgroundColor: 'white', borderRadius: 0.5 }}>
                              <Typography variant="caption" sx={{ color: '#666', display: 'block', mb: 0.5 }}>
                                Daily Amounts:
                              </Typography>
                              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.5, fontSize: '0.75rem' }}>
                                {selectedCheck.perdiemMonday && selectedCheck.perdiemMonday > 0 && (
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Monday:</span>
                                    <span>${selectedCheck.perdiemMonday.toFixed(2)}</span>
                                  </Box>
                                )}
                                {selectedCheck.perdiemTuesday && selectedCheck.perdiemTuesday > 0 && (
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Tuesday:</span>
                                    <span>${selectedCheck.perdiemTuesday.toFixed(2)}</span>
                                  </Box>
                                )}
                                {selectedCheck.perdiemWednesday && selectedCheck.perdiemWednesday > 0 && (
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Wednesday:</span>
                                    <span>${selectedCheck.perdiemWednesday.toFixed(2)}</span>
                                  </Box>
                                )}
                                {selectedCheck.perdiemThursday && selectedCheck.perdiemThursday > 0 && (
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Thursday:</span>
                                    <span>${selectedCheck.perdiemThursday.toFixed(2)}</span>
                                  </Box>
                                )}
                                {selectedCheck.perdiemFriday && selectedCheck.perdiemFriday > 0 && (
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Friday:</span>
                                    <span>${selectedCheck.perdiemFriday.toFixed(2)}</span>
                                  </Box>
                                )}
                                {selectedCheck.perdiemSaturday && selectedCheck.perdiemSaturday > 0 && (
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Saturday:</span>
                                    <span>${selectedCheck.perdiemSaturday.toFixed(2)}</span>
                                  </Box>
                                )}
                                {selectedCheck.perdiemSunday && selectedCheck.perdiemSunday > 0 && (
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Sunday:</span>
                                    <span>${selectedCheck.perdiemSunday.toFixed(2)}</span>
                                  </Box>
                                )}
                              </Box>
                            </Box>
                          )}
                        </Box>
                      </Box>
                    ) : null}
                    
                    {/* Total Amount */}
                    <Box sx={{ 
                      mt: 1.5, 
                      p: 1.5, 
                      backgroundColor: '#f5f5f5', 
                      borderRadius: 1, 
                      border: '2px solid #e0e0e0',
                      textAlign: 'center'
                    }}>
                      <Typography variant="h6" fontWeight="bold" color="#1976d2">
                        Total Amount: ${(parseFloat(selectedCheck.amount?.toString() || '0')).toFixed(2)}
                      </Typography>
                    </Box>
                  </Box>
                </>
              )}
              {selectedCheck.memo && (
                <Typography><strong>Memo:</strong> {selectedCheck.memo}</Typography>
              )}
              <Divider sx={{ my: 1 }} />
              <Box sx={{ mt: 2, p: 2, backgroundColor: '#f8f9fa', borderRadius: 1, border: '1px solid #e9ecef' }}>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1, color: '#495057' }}>
                  Status Information
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                {selectedCheck.reviewed ? (
                    <Chip label="Reviewed" color="success" size="small" />
                ) : (
                    <Chip label="Pending Review" color="warning" size="small" />
                )}
                {selectedCheck.paid ? (
                    <Chip label="Paid" color="success" size="small" />
                ) : (
                    <Chip label="Unpaid" color="default" size="small" />
                )}
              </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.85rem' }}>
              <Typography variant="body2" color="text.secondary">
                Date: {formatDateForDisplay(selectedCheck.date)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                    Created by: {selectedCheck && typeof selectedCheck.createdBy === 'string' ? userMap[selectedCheck.createdBy] || 'Unknown' : 'Unknown'}
              </Typography>
                </Box>
                              </Box>
            </>
          ) : (
            <Typography>No check selected.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          {selectedCheck && !selectedCheck.reviewed && currentRole === 'admin' && (
            <Button
              variant="contained"
              color="success"
              sx={{ mt: 2 }}
              onClick={async () => {
                try {
                  console.log('[OptimizedViewChecks] Admin marking as reviewed:', selectedCheck.id);
                  await updateDoc(doc(db, 'checks', selectedCheck.id), { reviewed: true });
                  const qSnap = await getDocs(query(
                    collection(db, 'reviewRequest'),
                    where('companyId', '==', selectedCheck.companyId),
                    where('weekKey', '==', selectedWeekKey),
                    where('createdBy', '==', selectedCheck.createdBy)
                  ));
                  console.log('[OptimizedViewChecks] reviewRequest docs found:', qSnap.docs.map(d => ({ id: d.id, data: d.data() })));
                  if (qSnap.docs.length === 0) {
                    // Create reviewRequest if not found
                    const newDoc = await addDoc(collection(db, 'reviewRequest'), {
                      companyId: selectedCheck.companyId,
                      weekKey: selectedWeekKey,
                      createdBy: selectedCheck.createdBy,
                      reviewed: true,
                      status: 'reviewed',
                      createdAt: serverTimestamp()
                    });
                    console.log('[OptimizedViewChecks] Created new reviewRequest:', newDoc.id);
                  } else {
                    await Promise.all(qSnap.docs.map(async d => {
                      await updateDoc(doc(db, 'reviewRequest', d.id), { reviewed: true, status: 'reviewed' });
                      const updated = (await getDoc(doc(db, 'reviewRequest', d.id))).data();
                      console.log('[OptimizedViewChecks] reviewRequest after update:', d.id, updated);
                    }));
                  }
                  if (onReviewUpdated) {
                    console.log('[OptimizedViewChecks] Calling onReviewUpdated after mark as reviewed');
                    onReviewUpdated();
                  }
                  if (refetchChecks) {
                    console.log('[OptimizedViewChecks] Calling refetchChecks after mark as reviewed');
                    refetchChecks();
                  }
                  handleCloseDialog();
                } catch (err) {
                  console.error('[OptimizedViewChecks] Error marking as reviewed:', err);
                  alert('❌ Failed to mark as reviewed. Please try again.');
                }
              }}
            >
              Mark as Reviewed
            </Button>
          )}
          {selectedCheck && selectedCheck.reviewed && currentRole === 'admin' && (
            <Typography sx={{ mt: 2, color: 'green' }}>Already reviewed (admin)</Typography>
          )}
          {selectedCheck && !selectedCheck.reviewed && currentRole !== 'admin' && (
            <Button
              variant="outlined"
              color="primary"
              sx={{ mt: 2 }}
              disabled={checksSentForReview.has(selectedCheck.id)}
              onClick={async () => {
                console.log('[OptimizedViewChecks] User sending for review:', selectedCheck.id);
                try {
                  await handleSendForReview(selectedCheck, selectedWeekKey!);
                } catch (err) {
                  console.error("Error sending review request", err);
                }
                handleCloseDialog();
              }}
            >
              {checksSentForReview.has(selectedCheck.id) ? 'Already Sent for Review' : 'Send for Review'}
            </Button>
          )}
          {selectedCheck && selectedCheck.reviewed && currentRole === 'admin' && (
            <Button
              variant="outlined"
              color="warning"
              sx={{ mt: 2, ml: 2 }}
              onClick={async () => {
                try {
                  console.log('[OptimizedViewChecks] Undoing review (admin):', selectedCheck.id);
                  await updateDoc(doc(db, 'checks', selectedCheck.id), { reviewed: false });
                  console.log('[OptimizedViewChecks] Check updated to reviewed: false');
                  const qSnap = await getDocs(query(
                    collection(db, 'reviewRequest'),
                    where('companyId', '==', selectedCheck.companyId),
                    where('weekKey', '==', selectedWeekKey),
                    where('createdBy', '==', selectedCheck.createdBy)
                  ));
                  console.log('[OptimizedViewChecks] reviewRequest docs found:', qSnap.docs.map(d => ({ id: d.id, data: d.data() })));
                  if (qSnap.docs.length === 0) {
                    // Create reviewRequest if not found
                    const newDoc = await addDoc(collection(db, 'reviewRequest'), {
                      companyId: selectedCheck.companyId,
                      weekKey: selectedWeekKey,
                      createdBy: selectedCheck.createdBy,
                      reviewed: false,
                      status: 'pending',
                      createdAt: serverTimestamp()
                    });
                    console.log('[OptimizedViewChecks] Created new reviewRequest:', newDoc.id);
                  } else {
                    await Promise.all(qSnap.docs.map(async d => {
                      await updateDoc(doc(db, 'reviewRequest', d.id), { reviewed: false, status: 'pending' });
                      const updated = (await getDoc(doc(db, 'reviewRequest', d.id))).data();
                      console.log('[OptimizedViewChecks] reviewRequest after update:', d.id, updated);
                    }));
                  }
                  if (onReviewUpdated) {
                    console.log('[OptimizedViewChecks] Calling onReviewUpdated after undo');
                    onReviewUpdated();
                  }
                  if (refetchChecks) {
                    console.log('[OptimizedViewChecks] Calling refetchChecks after undo review');
                    refetchChecks();
                  }
                  handleCloseDialog();
                } catch (err) {
                  console.error('[OptimizedViewChecks] Error undoing review:', err);
                  alert('❌ Failed to undo review. Please try again.');
                }
              }}
            >
              Undo Review
            </Button>
          )}
          {selectedCheck && selectedCheck.paid && currentRole === 'admin' && (
            <Button
              variant="outlined"
              color="error"
              sx={{ mt: 2, ml: 2 }}
              onClick={async () => {
                try {
                  console.log('[OptimizedViewChecks] Unmarking as paid (admin):', selectedCheck.id);
                  await updateDoc(doc(db, 'checks', selectedCheck.id), { paid: false });
                  console.log('[OptimizedViewChecks] Check updated to paid: false');
                  if (onReviewUpdated) {
                    console.log('[OptimizedViewChecks] Calling onReviewUpdated after unmark paid');
                    onReviewUpdated();
                  }
                  if (refetchChecks) {
                    console.log('[OptimizedViewChecks] Calling refetchChecks after unmark paid');
                    refetchChecks();
                  }
                  handleCloseDialog();
                } catch (err) {
                  console.error('[OptimizedViewChecks] Error unmarking as paid:', err);
                  alert('❌ Failed to unmark as paid. Please try again.');
                }
              }}
            >
               Unmark as Paid
            </Button>
          )}
          
          {/* Delete Check Button - Admin can delete unpaid checks, regular users can delete unreviewed checks */}
          {selectedCheck && (
            ((currentRole === 'admin' && !selectedCheck.paid) || 
             (currentRole !== 'admin' && !selectedCheck.reviewed)) && (
              <Button
                variant="contained"
                color="error"
                onClick={() => handleDeleteCheck(selectedCheck)}
                sx={{ mr: 'auto' }}
              >
               Delete Check
              </Button>
            )
          )}
          
          <Button onClick={handleCloseDialog}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Global Pending Checks Dialog */}
      <Dialog 
        open={openPendingChecksDialog} 
        onClose={() => setOpenPendingChecksDialog(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          📋 All Pending Checks Across All Companies
        </DialogTitle>
        <DialogContent>
          <Box sx={{ maxHeight: '70vh', overflow: 'auto' }}>
            {(() => {
              // Group checks by company
              const pendingChecks = checks?.filter((check: CheckItem) => !check.reviewed) || [];
              const checksByCompany: { [companyId: string]: CheckItem[] } = {};
              
              pendingChecks.forEach((check: CheckItem) => {
                if (!checksByCompany[check.companyId]) {
                  checksByCompany[check.companyId] = [];
                }
                checksByCompany[check.companyId].push(check);
              });

              const companyIds = Object.keys(checksByCompany).sort((a, b) => {
                const companyA = companies.find(c => c.id === a)?.name || '';
                const companyB = companies.find(c => c.id === b)?.name || '';
                return companyA.localeCompare(companyB);
              });

              return companyIds.map(companyId => {
                const companyChecks = checksByCompany[companyId];
                const companyName = companies.find(c => c.id === companyId)?.name || 'Unknown Company';
                
                return (
                  <Box key={companyId} sx={{ mb: 3 }}>
                    {/* Company Header */}
                    <Box sx={{ 
                      backgroundColor: '#1976d2', 
                      color: 'white', 
                      p: 2, 
                      borderRadius: 1,
                      mb: 1,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <Typography variant="h6" fontWeight="bold">
                        {companyName}
                      </Typography>
                      <Chip 
                        label={`${companyChecks.length} pending check${companyChecks.length !== 1 ? 's' : ''}`}
                        color="warning"
                        sx={{ backgroundColor: '#ff9800', color: 'white' }}
                      />
                    </Box>

                    {/* Company Checks Table */}
                    <TableContainer component={Paper} sx={{ mb: 2 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                            <TableCell><strong>Check #</strong></TableCell>
                            <TableCell><strong>Employee</strong></TableCell>
                            <TableCell><strong>Amount</strong></TableCell>
                            <TableCell><strong>Date</strong></TableCell>
                            <TableCell><strong>Status</strong></TableCell>
                            <TableCell><strong>Made By</strong></TableCell>
                            <TableCell><strong>Actions</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {companyChecks.map((check: CheckItem) => {
                            const d = check.date?.toDate ? check.date.toDate() : new Date(check.date);
                            const madeByName = typeof check.createdBy === 'string' ? userMap[check.createdBy] || 'Unknown' : 'Unknown';
                            return (
                              <TableRow key={check.id} sx={{ '&:hover': { backgroundColor: '#f9f9f9' } }}>
                                <TableCell><strong>{check.checkNumber ?? 'N/A'}</strong></TableCell>
                                <TableCell>{check.employeeName}</TableCell>
                                <TableCell><strong>${(parseFloat(check.amount?.toString() || '0')).toFixed(2)}</strong></TableCell>
                                <TableCell>{formatDateForDisplay(check.date)}</TableCell>
                                <TableCell>
                                  <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Chip label="⏳ Pending" color="warning" size="small" />
                                    {check.paid ? (
                                      <Chip label="💰 Paid" color="success" size="small" />
                                    ) : (
                                      <Chip label="💳 Unpaid" color="default" size="small" />
                                    )}
                                  </Box>
                                </TableCell>
                                <TableCell>{madeByName}</TableCell>
                                <TableCell>
                                  <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
                                      size="small"
                                      variant="outlined"
                                      onClick={() => {
                                        setOpenPendingChecksDialog(false);
                                        setSelectedCheck(check);
                                        setOpenDialog(true);
                                      }}
                                    >
                                      🔎 Details
                                    </Button>
                                    {currentRole === 'admin' && (
                                      <Button
                                        size="small"
          variant="contained"
          color="success"
          onClick={async () => {
                                          try {
                                            await updateDoc(doc(db, 'checks', check.id), { reviewed: true });
                                            if (refetchChecks) refetchChecks();
                                            if (onReviewUpdated) onReviewUpdated();
                                          } catch (err) {
                                            console.error('Error marking as reviewed:', err);
                                            alert('❌ Failed to mark as reviewed');
                                          }
                                        }}
                                      >
                                        ✅ Review
                                      </Button>
                                    )}
                                    {!check.reviewed && currentRole !== 'admin' && (
                                      <Button
                                        size="small"
                                        variant="outlined"
                                        disabled={checksSentForReview.has(check.id)}
                                        onClick={() => {
                                          setOpenPendingChecksDialog(false);
                                          handleSendForReview(check, 'global');
                                        }}
                                      >
                                        {checksSentForReview.has(check.id) ? '✅ Sent' : '📤 Send for Review'}
        </Button>
      )}
                                  </Box>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                );
              });
            })()}
            
            {checks?.filter((check: CheckItem) => !check.reviewed).length === 0 && (
              <Typography sx={{ mt: 2, textAlign: 'center', color: 'text.secondary' }}>
                No pending checks found across all companies.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenPendingChecksDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Review Confirmation Dialog */}
      <Dialog open={showBulkReviewConfirm} onClose={() => setShowBulkReviewConfirm(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm Review</DialogTitle>
        <DialogContent dividers>
          {bulkReviewData && (
            <Box>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Are you sure you want to mark <strong>{bulkReviewData.count} checks</strong> as reviewed?
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                <strong>Company:</strong> {bulkReviewData.companyName}
              </Typography>
              {!bulkReviewData.isSelectedChecks && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  <strong>Week:</strong> {bulkReviewData.weekKey}
                </Typography>
              )}
              <Typography variant="body2" color="warning.main" sx={{ fontStyle: 'italic' }}>
                {bulkReviewData.isSelectedChecks 
                  ? `This action will review the ${bulkReviewData.count} selected checks.`
                  : `This action will create review requests for all pending checks in this company and week.`
                }
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBulkReviewConfirm(false)} color="inherit">
            Cancel
          </Button>
          <Button onClick={executeBulkReview} color="warning" variant="contained">
            Confirm Review ({bulkReviewData?.count || 0} checks)
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setSnackbarOpen(false)} 
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm Check Deletion</DialogTitle>
        <DialogContent>
          {checkToDelete && (
            <Box>
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body1" fontWeight="bold">
                  This action cannot be undone!
                </Typography>
              </Alert>
              
              <Typography variant="body1" sx={{ mb: 2 }}>
                Are you sure you want to delete this check?
              </Typography>
              
              <Box sx={{ p: 2, backgroundColor: '#f5f5f5', borderRadius: 1, mb: 2 }}>
                <Typography variant="subtitle2" fontWeight="bold">Check Details:</Typography>
                <Typography><strong>Employee:</strong> {checkToDelete.employeeName}</Typography>
                <Typography><strong>Amount:</strong> ${(parseFloat(checkToDelete.amount?.toString() || '0')).toFixed(2)}</Typography>
                <Typography><strong>Check #:</strong> {checkToDelete.checkNumber || 'N/A'}</Typography>
                <Typography><strong>Date:</strong> {formatDateForDisplay(checkToDelete.date)}</Typography>
              </Box>
              
              <Alert severity="info">
                <Typography variant="body2">
                  <strong>Note:</strong> This will also decrease the check numbers of all subsequent checks for this company.
                </Typography>
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteConfirm(false)} color="inherit">
            Cancel
          </Button>
          <Button onClick={confirmDeleteCheck} color="error" variant="contained" startIcon={<DeleteIcon />}>
            Delete Check
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showBulkDeleteConfirm} onClose={() => setShowBulkDeleteConfirm(false)} maxWidth="md" fullWidth>
        <DialogTitle>Confirm Bulk Check Deletion</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body1" fontWeight="bold">
              This action cannot be undone!
            </Typography>
          </Alert>
          
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to delete {bulkDeleteChecks.length} check(s)?
          </Typography>
          
          <Box sx={{ maxHeight: 300, overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: 1, p: 1 }}>
            {bulkDeleteChecks.map((check, index) => (
              <Box key={check.id} sx={{ p: 1, borderBottom: index < bulkDeleteChecks.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                <Typography variant="body2">
                  <strong>Employee:</strong> {check.employeeName} | 
                  <strong> Amount:</strong> ${(parseFloat(check.amount?.toString() || '0')).toFixed(2)} | 
                  <strong> Date:</strong> {formatDateForDisplay(check.date)}
                </Typography>
              </Box>
            ))}
          </Box>
          
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Note:</strong> This will also decrease the check numbers of all subsequent checks for the affected companies.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBulkDeleteConfirm(false)} color="inherit">
            Cancel
          </Button>
          <Button onClick={confirmBulkDelete} color="error" variant="contained" startIcon={<DeleteIcon />}>
            Delete {bulkDeleteChecks.length} Check{bulkDeleteChecks.length !== 1 ? 's' : ''}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Admin Review Floating Menu */}
      {currentRole === 'admin' && pendingReviewChecks.length > 0 && (
        <>
          {/* Floating Review Button */}
          <Box
            sx={{
              position: 'fixed',
              bottom: 20,
              right: 20,
              zIndex: 1000,
            }}
          >
            <Button
              variant="contained"
              color="warning"
              size="large"
              onClick={handleShowReviewMenu}
              sx={{
                borderRadius: '50%',
                width: 60,
                height: 60,
                boxShadow: 4,
                '&:hover': {
                  boxShadow: 8,
                  transform: 'scale(1.05)',
                },
                transition: 'all 0.2s ease-in-out',
              }}
            >
              {pendingReviewChecks.length}
            </Button>
          </Box>

          {/* Floating Menu */}
          {showReviewMenu && (
            <Box
              sx={{
                position: 'fixed',
                top: reviewMenuPosition.y - 10,
                left: reviewMenuPosition.x - 200,
                zIndex: 1001,
                backgroundColor: 'white',
                borderRadius: 2,
                boxShadow: 8,
                border: '1px solid #e0e0e0',
                maxHeight: '400px',
                overflowY: 'auto',
                minWidth: '300px',
              }}
            >
              <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
                  Pending Reviews ({pendingReviewChecks.length})
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  User-created checks awaiting approval
                </Typography>
              </Box>
              
              <Box sx={{ maxHeight: '300px', overflowY: 'auto' }}>
                {pendingReviewChecks.map((check) => (
                  <Box
                    key={check.id}
                    sx={{
                      p: 2,
                      borderBottom: '1px solid #f0f0f0',
                      '&:hover': {
                        backgroundColor: '#f5f5f5',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                          Check #{check.checkNumber}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {check.employeeName}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
                          ${parseFloat(check.amount?.toString() || '0').toFixed(2)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          onClick={() => handleReviewCheck(check.id, true)}
                          sx={{ minWidth: 'auto', px: 1 }}
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          color="error"
                          onClick={() => handleReviewCheck(check.id, false)}
                          sx={{ minWidth: 'auto', px: 1 }}
                        >
                          Reject
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
              
              <Box sx={{ p: 2, borderTop: '1px solid #e0e0e0', textAlign: 'center' }}>
                <Button
                  size="small"
                  onClick={handleCloseReviewMenu}
                  sx={{ textTransform: 'none' }}
                >
                  Close Menu
                </Button>
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default OptimizedViewChecks; 