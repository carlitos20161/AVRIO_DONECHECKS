import React, { useEffect, useState, useRef } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Checkbox,
  FormControlLabel,
  Paper,
  Divider,
  Snackbar,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ListItemText,
  Tabs,
  Tab,
  Avatar,
  IconButton,
  Fab,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Tooltip,
  Fade,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Popover,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  InputAdornment,
} from "@mui/material";
import { Add as AddIcon, Delete as DeleteIcon, Print as PrintIcon, ArrowUpward, ArrowDownward, Sort } from "@mui/icons-material";
import { PDFDocument, rgb } from 'pdf-lib';
import { db, auth } from "../firebase";
import {
  collection,
  getDocs,
  runTransaction,
  doc,
  query,
  where,
  getDoc,
  setDoc,
  updateDoc,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { createLocalDate } from "../utils/dateUtils";
import { logger } from '../utils/logger';

interface Company {
  id: string;
  name: string;
  logoBase64?: string;
}

interface Employee {
  id: string;
  name: string;
  payRate: number;
  payType: string;
  payTypes?: string[];
  companyId?: string | null;
  companyIds?: string[];
  clientId?: string | null;
  clientPayTypeRelationships?: Array<{
    id: string;
    clientId: string;
    clientName: string;
    payType: 'hourly' | 'perdiem';
    payRate?: string;
    active: boolean;
  }>;
  active: boolean;  
}

interface Client {
  id: string;
  name: string;
  companyIds?: string[];
  active: boolean;  
  division?: string; // Add division field
  payPeriodStartDay?: 'monday' | 'sunday'; // Day the pay period starts
  payPeriodFrequency?: 'weekly' | 'biweekly'; // How often they pay
}

interface OtherPayItem {
  id: string;
  description: string;
  amount: string;
}

interface ExpenseEntry {
  id: string;
  name: string;
  amount: string;
  description: string;
  checkDate?: Date | null;
}

interface PayInput {
  hours: string;
  otHours: string;
  holidayHours: string;
  memo: string;
  checkDate?: Date | null; // Manual check date
  paymentMethods?: string[]; // Array of 'hourly' and/or 'perdiem'
  selectedRelationshipId?: string; // Selected client-pay type relationship ID (legacy - keeping for backward compatibility)
  selectedRelationshipIds?: string[]; // NEW: Array of selected relationship IDs for multiple relationships
  perdiemAmount?: string; // Separate field for per diem amount
  perdiemBreakdown?: boolean; // Whether to use breakdown or full amount
  perdiemMonday?: string;
  perdiemTuesday?: string;
  perdiemWednesday?: string;
  perdiemThursday?: string;
  perdiemFriday?: string;
  perdiemSaturday?: string;
  perdiemSunday?: string;
  otherPay?: OtherPayItem[]; // Array of other pay items with description and amount
  [key: string]: any; // Allow dynamic relationship-based fields like "relationshipId_hours", "relationshipId_perdiemAmount", etc.
}

// Helper to format currency with commas
function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Helper to chunk an array into groups of size n
function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

// Helper to get the previous pay period ending date (for payroll - checks pay for previous period)
function getPreviousPayPeriodEnd(
  checkDateString: string,
  startDay: 'monday' | 'sunday' = 'monday',
  frequency: 'weekly' | 'biweekly' = 'weekly'
): Date | null {
  if (!checkDateString) return null;
  
  try {
    const checkDate = createLocalDate(checkDateString);
    const d = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate());
    
    // Get the end day of the pay period
    // Monday-Sunday week ends on Sunday
    // Sunday-Saturday week ends on Saturday
    const periodEndDay = startDay === 'monday' ? 0 : 6; // 0 = Sunday, 6 = Saturday
    
    // Find the most recent period end date before or on the check date
    const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    let daysBack = 0;
    if (startDay === 'monday') {
      // Monday-Sunday week ends on Sunday
      if (dayOfWeek === 0) {
        // It's Sunday, this is the end of current period, so go back 7 days for previous period end
        daysBack = 7;
      } else {
        // Go back to the previous Sunday (end of the previous completed week)
        // For Thursday (4): go back 4 days to get to previous Sunday (11/30 from 12/05)
        daysBack = dayOfWeek;
      }
    } else {
      // Sunday-Saturday week ends on Saturday
      if (dayOfWeek === 6) {
        // It's Saturday, this is the end of current period, so go back 7 days for previous period end
        daysBack = 7;
      } else if (dayOfWeek === 0) {
        // It's Sunday, go back 1 day to previous Saturday (end of previous completed week)
        daysBack = 1;
      } else {
        // For Monday-Friday: go back to the previous Saturday (end of previous completed week)
        // Thursday (4) -> previous Saturday = 5 days back (11/29 from 12/05)
        // Formula: dayOfWeek + 1 gives us the Saturday that ended the previous completed week
        daysBack = dayOfWeek + 1;
      }
    }
    
    // For biweekly, we need to go back to the end of the previous biweekly period
    if (frequency === 'biweekly') {
      // First find the current period end
      const currentPeriodEnd = new Date(d);
      currentPeriodEnd.setDate(d.getDate() - daysBack);
      
      // Then go back another week to get the previous biweekly period end
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() - 7);
      return currentPeriodEnd;
    }
    
    // For weekly, just go back to the previous period end
    const previousPeriodEnd = new Date(d);
    previousPeriodEnd.setDate(d.getDate() - daysBack);
    return previousPeriodEnd;
  } catch (e) {
    return null;
  }
}

// Helper to get the work week number for a given date with flexible pay period configuration
function getWorkWeekNumber(
  dateString: string, 
  startDay: 'monday' | 'sunday' = 'monday',
  frequency: 'weekly' | 'biweekly' = 'weekly'
): { weekNumber: number; periodLabel: string; weekEndingDate: Date | null } | null {
  if (!dateString) return null;
  
  try {
    const date = createLocalDate(dateString);
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    // Get the previous pay period ending date (what the check is paying for)
    const weekEndingDate = getPreviousPayPeriodEnd(dateString, startDay, frequency);
    
    // Get the start of the pay period based on startDay
    const getPeriodStart = (date: Date, startDay: 'monday' | 'sunday'): Date => {
      const periodStart = new Date(date);
      const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      
      if (startDay === 'monday') {
        // Monday-Sunday week
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        periodStart.setDate(date.getDate() - daysToMonday);
      } else {
        // Sunday-Saturday week
        const daysToSunday = dayOfWeek === 0 ? 0 : dayOfWeek;
        periodStart.setDate(date.getDate() - daysToSunday);
      }
      
      return periodStart;
    };
    
    // Use the week ending date to calculate the period number
    const periodDate = weekEndingDate || d;
    const periodStart = getPeriodStart(periodDate, startDay);
    
    // Get the first period start of the year
    const yearStart = new Date(periodStart.getFullYear(), 0, 1);
    const firstPeriodStart = getPeriodStart(yearStart, startDay);
    
    // If the first period start is in the previous year, adjust
    if (firstPeriodStart.getFullYear() < yearStart.getFullYear()) {
      firstPeriodStart.setFullYear(yearStart.getFullYear());
      firstPeriodStart.setMonth(0);
      firstPeriodStart.setDate(1);
      const adjustedStart = getPeriodStart(firstPeriodStart, startDay);
      if (adjustedStart.getFullYear() === yearStart.getFullYear()) {
        firstPeriodStart.setTime(adjustedStart.getTime());
      } else {
        // If still in previous year, move to next period
        firstPeriodStart.setDate(firstPeriodStart.getDate() + (frequency === 'biweekly' ? 14 : 7));
      }
    }
    
    // Calculate difference in days
    const diffTime = periodStart.getTime() - firstPeriodStart.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    // Calculate period number
    const periodLength = frequency === 'biweekly' ? 14 : 7;
    const periodNumber = Math.floor(diffDays / periodLength) + 1;
    
    // Generate period label
    const periodLabel = frequency === 'biweekly' 
      ? `Pay Period ${periodNumber}` 
      : startDay === 'monday' 
        ? `Work Week ${periodNumber}` 
        : `Pay Week ${periodNumber}`;
    
    return {
      weekNumber: periodNumber,
      periodLabel: periodLabel,
      weekEndingDate: weekEndingDate
    };
  } catch (e) {
    return null;
  }
}

interface BatchChecksProps {
  onChecksCreated?: () => void;
  onGoToSection: (section: string) => void;
}

// Floating menu state interface
interface FloatingMenuState {
  open: boolean;
  companyId: string | null;
  clientId: string | null;
  checkId: string | null;
  companyName: string;
  clientName: string;
}

const BatchChecks: React.FC<BatchChecksProps> = ({ onChecksCreated, onGoToSection }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [currentUserVisibleClientIds, setCurrentUserVisibleClientIds] = useState<string[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  // Load saved data from localStorage on mount
  const loadSavedData = () => {
    try {
      const savedTabData = localStorage.getItem('batchChecks_tabData');
      const savedCompanyId = localStorage.getItem('batchChecks_companyId');
      const savedClientId = localStorage.getItem('batchChecks_clientId');
      const savedDefaultDate = localStorage.getItem('batchChecks_defaultDate');
      const savedShowReviewPanel = localStorage.getItem('batchChecks_showReviewPanel');
      
      let parsedTabData: { [key: string]: any } = {};
      if (savedTabData) {
        try {
          parsedTabData = JSON.parse(savedTabData);
          
          // Convert date strings back to Date objects
          Object.keys(parsedTabData).forEach(tabId => {
            const tab: any = parsedTabData[tabId];
            if (tab && tab.inputs) {
              Object.keys(tab.inputs).forEach((empId: string) => {
                const input: any = tab.inputs[empId];
                if (input.checkDate && typeof input.checkDate === 'string') {
                  try {
                    input.checkDate = createLocalDate(input.checkDate);
                  } catch (e) {
                    // If date parsing fails, set to null
                    input.checkDate = null;
                  }
                } else if (input.checkDate === null || input.checkDate === undefined) {
                  input.checkDate = null;
                }
              });
            }
          });
        } catch (parseError) {
          console.error('Error parsing saved tabData:', parseError);
          parsedTabData = {};
        }
      }
      
      // Always return an object with all saved values, even if some are null/empty
      const result = {
        tabData: parsedTabData,
        companyId: savedCompanyId,
        clientId: savedClientId || 'multiple',
        defaultDate: savedDefaultDate || '',
        showReviewPanel: savedShowReviewPanel === 'true'
      };
      
      logger.log('📦 [Load Saved Data] Loaded from localStorage:', {
        hasTabData: Object.keys(parsedTabData).length > 0,
        tabDataKeys: Object.keys(parsedTabData),
        companyId: savedCompanyId,
        clientId: result.clientId,
        showReviewPanel: result.showReviewPanel
      });
      
      return result;
    } catch (error) {
      console.error('Error loading saved data:', error);
      // Return empty object instead of null so we can still access properties
      return {
        tabData: {},
        companyId: null,
        clientId: 'multiple',
        defaultDate: '',
        showReviewPanel: false
      };
    }
  };

  const savedData = loadSavedData();
  
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    savedData?.companyId || null
  );
  const [selectedClientId, setSelectedClientId] = useState<string>(savedData?.clientId || 'multiple');
  // Separate state for the default check date (independent of individual employee dates)
  const [defaultCheckDate, setDefaultCheckDate] = useState<string>(savedData?.defaultDate || '');
  
  useEffect(() => {
    logger.log('🔍 DEBUG: selectedClientId changed to:', selectedClientId);
  }, [selectedClientId]);

  // Initialize default check date with today's date if not saved
  useEffect(() => {
    if (!defaultCheckDate) {
      const today = new Date();
      const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      setDefaultCheckDate(todayString);
    }
  }, [defaultCheckDate]);
  
  // Store data per client tab to prevent loss when switching tabs
  const [tabData, setTabData] = useState<{
    [tabId: string]: {
      selectedEmployees: { [id: string]: boolean };
      inputs: { [id: string]: PayInput };
    };
  }>(savedData?.tabData || {});
  
  // Ensure tabData is restored from localStorage if it's empty but localStorage has data
  // This is a safety net in case the initial state wasn't set correctly
  useEffect(() => {
    if (Object.keys(tabData).length === 0) {
      try {
        const savedTabData = localStorage.getItem('batchChecks_tabData');
        if (savedTabData) {
          const parsed = JSON.parse(savedTabData);
          if (Object.keys(parsed).length > 0) {
            // Convert date strings back to Date objects
            Object.keys(parsed).forEach(tabId => {
              const tab: any = parsed[tabId];
              if (tab && tab.inputs) {
                Object.keys(tab.inputs).forEach((empId: string) => {
                  const input: any = tab.inputs[empId];
                  if (input.checkDate && typeof input.checkDate === 'string') {
                    try {
                      input.checkDate = createLocalDate(input.checkDate);
                    } catch (e) {
                      input.checkDate = null;
                    }
                  } else if (input.checkDate === null || input.checkDate === undefined) {
                    input.checkDate = null;
                  }
                });
              }
            });
            logger.log('🔄 [TabData Restore] Restoring tabData from localStorage', {
              tabDataKeys: Object.keys(parsed)
            });
            setTabData(parsed);
          }
        }
      } catch (error) {
        console.error('Error restoring tabData from localStorage:', error);
      }
    }
  }, []); // Only run once on mount
  
  // Save to localStorage whenever tabData changes
  useEffect(() => {
    try {
      // Convert Date objects to ISO strings for serialization
      const serializableTabData: any = {};
      Object.keys(tabData).forEach(tabId => {
        const tab = tabData[tabId];
        serializableTabData[tabId] = {
          selectedEmployees: tab.selectedEmployees,
          inputs: {}
        };
        
        if (tab.inputs) {
          Object.keys(tab.inputs).forEach(empId => {
            const input = tab.inputs[empId];
            const serializableInput: any = { ...input };
            
            // Convert Date to ISO string
            if (input.checkDate instanceof Date) {
              serializableInput.checkDate = input.checkDate.toISOString().split('T')[0];
            }
            
            serializableTabData[tabId].inputs[empId] = serializableInput;
          });
        }
      });
      
      localStorage.setItem('batchChecks_tabData', JSON.stringify(serializableTabData));
    } catch (error) {
      console.error('Error saving tabData:', error);
    }
  }, [tabData]);
  
  // Save selectedCompanyId to localStorage
  useEffect(() => {
    if (selectedCompanyId) {
      localStorage.setItem('batchChecks_companyId', selectedCompanyId);
    } else {
      localStorage.removeItem('batchChecks_companyId');
    }
  }, [selectedCompanyId]);
  
  // Save selectedClientId to localStorage
  useEffect(() => {
    localStorage.setItem('batchChecks_clientId', selectedClientId);
  }, [selectedClientId]);
  
  // Save defaultCheckDate to localStorage
  useEffect(() => {
    if (defaultCheckDate) {
      localStorage.setItem('batchChecks_defaultDate', defaultCheckDate);
    }
  }, [defaultCheckDate]);

  // Clear all saved data (call this when checks are successfully created)
  const clearSavedData = () => {
    localStorage.removeItem('batchChecks_tabData');
    localStorage.removeItem('batchChecks_companyId');
    localStorage.removeItem('batchChecks_clientId');
    localStorage.removeItem('batchChecks_defaultDate');
    localStorage.removeItem('batchChecks_showReviewPanel');
    setShowReviewPanel(false); // Also close the review panel
  };

  // Add this function after your other utility functions
const mergePDFs = async (pdfBlobs: Blob[]) => {
  const mergedPdf = await PDFDocument.create();
  
  for (const pdfBlob of pdfBlobs) {
    const pdfBytes = await pdfBlob.arrayBuffer();
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    pages.forEach((page) => mergedPdf.addPage(page));
  }
  
  return await mergedPdf.save();
};
  // Current tab's data
  const currentTabId = selectedClientId || 'multiple';
  const selectedEmployees = tabData[currentTabId]?.selectedEmployees || {};
  const inputs = tabData[currentTabId]?.inputs || {};

  // Helper functions to update tab data
  const setSelectedEmployees = (newSelectedEmployees: { [id: string]: boolean } | ((prev: { [id: string]: boolean }) => { [id: string]: boolean })) => {
    const tabId = selectedClientId || 'multiple'; // Capture current tab at function call time
    setTabData(prev => {
      const currentData = prev[tabId] || { selectedEmployees: {}, inputs: {} };
      const updatedEmployees = typeof newSelectedEmployees === 'function' 
        ? newSelectedEmployees(currentData.selectedEmployees)
        : newSelectedEmployees;
      
      return {
        ...prev,
        [tabId]: {
          ...currentData,
          selectedEmployees: updatedEmployees
        }
      };
    });
  };

  const setInputs = (newInputs: { [id: string]: PayInput } | ((prev: { [id: string]: PayInput }) => { [id: string]: PayInput })) => {
    const tabId = selectedClientId || 'multiple'; // Capture current tab at function call time
    setTabData(prev => {
      const currentData = prev[tabId] || { selectedEmployees: {}, inputs: {} };
      const updatedInputs = typeof newInputs === 'function'
        ? newInputs(currentData.inputs)
        : newInputs;
      
      return {
        ...prev,
        [tabId]: {
          ...currentData,
          inputs: updatedInputs
        }
      };
    });
  };
  const [isCreatingChecks, setIsCreatingChecks] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showReviewPanel, setShowReviewPanel] = useState(savedData?.showReviewPanel || false);
  const [selectedClientTab, setSelectedClientTab] = useState<string | null>(null);
  const [selectedEmployeeTab, setSelectedEmployeeTab] = useState<string | null>(null);
  const [dropdownSelectedEmployees, setDropdownSelectedEmployees] = useState<string[]>([]);
  const [otherPayDialogOpen, setOtherPayDialogOpen] = useState<string | null>(null);
  const [showPreviousBatchConfirm, setShowPreviousBatchConfirm] = useState(false);
  const [nameSortOrder, setNameSortOrder] = useState<'asc' | 'desc' | null>(null);
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
  // Track the order employees were selected (for preserving order when sort is null)
  const [employeeSelectionOrder, setEmployeeSelectionOrder] = useState<{ [tabId: string]: string[] }>({});
  // Track the currently focused row (for highlighting)
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  
  // Expense entries state (stored per company)
  const [expenseEntries, setExpenseEntries] = useState<{ [companyId: string]: ExpenseEntry[] }>({});
  
  // New expense form state
  const [newExpense, setNewExpense] = useState<{ name: string; amount: string; description: string; checkDate: string }>({
    name: '',
    amount: '',
    description: '',
    checkDate: ''
  });
  
  // Save showReviewPanel to localStorage
  useEffect(() => {
    if (showReviewPanel) {
      localStorage.setItem('batchChecks_showReviewPanel', 'true');
    } else {
      localStorage.removeItem('batchChecks_showReviewPanel');
    }
  }, [showReviewPanel]);
  
  // Sync selected employees into selection order (add missing ones to the end)
  // Only update if not sorting alphabetically (when nameSortOrder is null)
  useEffect(() => {
    if (nameSortOrder !== null) {
      // When sorting, don't update selection order here - it will be handled by the sort logic
      return;
    }
    
    const tabId = selectedClientId || 'multiple';
    const selectedEmpIds = Object.keys(selectedEmployees).filter(id => selectedEmployees[id]);
    
    setEmployeeSelectionOrder(prev => {
      const currentOrder = prev[tabId] || [];
      const missingFromOrder = selectedEmpIds.filter(id => !currentOrder.includes(id));
      const toRemove = currentOrder.filter(id => !selectedEmpIds.includes(id));
      
      // If no changes needed, return previous state
      if (missingFromOrder.length === 0 && toRemove.length === 0) {
        return prev;
      }
      
      // Update: add missing to end, remove unselected
      return {
        ...prev,
        [tabId]: [...currentOrder.filter(id => selectedEmpIds.includes(id)), ...missingFromOrder]
      };
    });
  }, [selectedEmployees, selectedClientId, nameSortOrder]);
  
  // When sorting is applied, update selection order to match sorted order
  useEffect(() => {
    if (nameSortOrder === null) {
      return; // Don't update when sort is cleared
    }
    
    const tabId = selectedClientId || 'multiple';
    const selectedEmpIds = Object.keys(selectedEmployees).filter(id => selectedEmployees[id]);
    
    if (selectedEmpIds.length === 0) {
      return;
    }
    
    // Sort the selected employees alphabetically
    const sortedIds = [...selectedEmpIds].sort((a, b) => {
      const empA = employees.find(e => e.id === a);
      const empB = employees.find(e => e.id === b);
      if (!empA || !empB) return 0;
      const nameA = empA.name.toLowerCase();
      const nameB = empB.name.toLowerCase();
      if (nameSortOrder === 'asc') {
        return nameA.localeCompare(nameB);
      } else {
        return nameB.localeCompare(nameA);
      }
    });
    
    // Update selection order to match sorted order
    setEmployeeSelectionOrder(prev => {
      const currentOrder = prev[tabId] || [];
      // Only update if the order actually changed
      if (currentOrder.length === sortedIds.length && 
          currentOrder.every((id, idx) => id === sortedIds[idx])) {
        return prev;
      }
      
      return {
        ...prev,
        [tabId]: sortedIds
      };
    });
  }, [nameSortOrder, selectedEmployees, selectedClientId, employees]);
  
  const [reviewData, setReviewData] = useState<Array<{
    employee: Employee;
    input: PayInput;
    calculatedAmount: number;
    hourlyTotal: number;
    perDiemTotal: number;
    clientsWorked?: string[];
    clientBreakdown?: Array<{
      clientId: string;
      clientName: string;
      companyName: string;
      division?: string;
      amount: number;
      hourlyAmount: number;
      perDiemAmount: number;
      payType: string;
      details: Array<{label: string; value: string}>;
    }>;
  }>>([]);
  const [clientSearchTerm, setClientSearchTerm] = useState<string>("");
  const [clientStatusFilter, setClientStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const hasRestoredReviewRef = useRef(false);
  // Refs for scrolling and TAB key handling
  const employeeRowRefs = useRef<{ [empId: string]: HTMLTableRowElement | null }>({});
  const employeeDropdownRef = useRef<HTMLInputElement | null>(null);
  const lastAddedEmployeeId = useRef<string | null>(null);

  // Helper function to focus the first input field in a row
  const focusFirstInputInRow = (row: HTMLTableRowElement) => {
    // Find all focusable inputs in the row
    const allInputs = Array.from(row.querySelectorAll('input, textarea')) as HTMLElement[];
    
    // Filter to only visible, focusable inputs
    const focusableInputs = allInputs.filter(input => {
      const inputElement = input as HTMLInputElement;
      if (inputElement.disabled || 
          inputElement.type === 'hidden' || 
          inputElement.type === 'button' || 
          inputElement.type === 'submit' ||
          inputElement.type === 'reset') return false;
      
      const style = window.getComputedStyle(inputElement);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      
      const rect = inputElement.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      
      return true;
    });
    
    // Sort by position (left to right)
    focusableInputs.sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      return aRect.left - bRect.left;
    });
    
    // Focus the first input
    if (focusableInputs.length > 0) {
      const firstInput = focusableInputs[0] as HTMLInputElement;
      firstInput.focus();
      // Select all text for easy editing
      if (firstInput.type !== 'date') {
        setTimeout(() => firstInput.select(), 0);
      }
      return true;
    }
    return false;
  };

  // Helper function to navigate between input fields in the same row using arrow keys
  const navigateToAdjacentField = (currentInput: HTMLElement, direction: 'left' | 'right') => {
    const row = currentInput.closest('tr');
    if (!row) {
      logger.log('🔍 [Navigation] No row found for input');
      return;
    }

    // Get all focusable input elements in the row (including Autocomplete inputs)
    // Use a comprehensive selector to find ALL inputs, including nested ones
    const allInputs: HTMLElement[] = [];
    
    // Find ALL input elements in the row, regardless of type or nesting
    const allInputElements = Array.from(row.querySelectorAll('input, textarea')) as HTMLElement[];
    
    // Filter out disabled, hidden, and non-focusable inputs
    allInputElements.forEach(input => {
      const inputElement = input as HTMLInputElement;
      // Skip if disabled, hidden, or button types
      if (inputElement.disabled || 
          inputElement.type === 'hidden' || 
          inputElement.type === 'button' || 
          inputElement.type === 'submit' ||
          inputElement.type === 'reset') return;
      
      // Check if input is visible (not display:none or visibility:hidden)
      const style = window.getComputedStyle(inputElement);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      
      // Check if input is actually visible (has dimensions)
      const rect = inputElement.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      
      // Add to list if not already there
      if (!allInputs.includes(inputElement)) {
        allInputs.push(inputElement);
      }
    });
    
    // Sort inputs by their position in the DOM (left to right, then top to bottom)
    allInputs.sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      const horizontalDiff = aRect.left - bRect.left;
      // If horizontally aligned (within 10px), sort by top position
      if (Math.abs(horizontalDiff) < 10) {
        return aRect.top - bRect.top;
      }
      return horizontalDiff;
    });
    
    // Find the current input in the sorted list - try multiple ways to match
    let currentIndex = allInputs.findIndex(input => input === currentInput);
    
    // If not found by direct reference, try to find by comparing positions or other attributes
    if (currentIndex === -1) {
      // Try to find by comparing the actual input element (might be nested)
      const currentRect = currentInput.getBoundingClientRect();
      currentIndex = allInputs.findIndex(input => {
        const inputRect = input.getBoundingClientRect();
        // Check if positions match closely
        return Math.abs(inputRect.left - currentRect.left) < 5 && 
               Math.abs(inputRect.top - currentRect.top) < 5;
      });
    }
    
    if (currentIndex === -1) {
      logger.log('🔍 [Navigation] Current input not found in row inputs', { 
        currentInputType: (currentInput as HTMLInputElement).type,
        currentInputValue: (currentInput as HTMLInputElement).value,
        allInputsCount: allInputs.length,
        allInputTypes: allInputs.map(i => (i as HTMLInputElement).type),
        allInputValues: allInputs.map(i => (i as HTMLInputElement).value?.substring(0, 20))
      });
      return;
    }

    let nextIndex: number;
    if (direction === 'right') {
      nextIndex = currentIndex + 1;
      if (nextIndex >= allInputs.length) return; // Already at the end
    } else {
      nextIndex = currentIndex - 1;
      if (nextIndex < 0) return; // Already at the beginning
    }

    const nextInput = allInputs[nextIndex];
    if (nextInput) {
      // Determine the row ID for focus tracking
      const rowKey = row.getAttribute('key') || '';
      if (rowKey.includes('new-row')) {
        setFocusedRowId('new-row');
      } else {
        // Try to find the employee ID from the row's data or refs
        const empId = Object.keys(employeeRowRefs.current).find(id => employeeRowRefs.current[id] === row) || null;
        if (empId) {
          setFocusedRowId(empId);
        }
      }
      
      // Focus the next input
      nextInput.focus();
      
      // If it's a text/number input, select all text for easy editing
      if (nextInput.tagName === 'INPUT') {
        const inputType = (nextInput as HTMLInputElement).type;
        if (inputType !== 'date' && inputType !== 'button' && inputType !== 'submit') {
          // Use setTimeout to ensure focus happens before selection
          setTimeout(() => {
            (nextInput as HTMLInputElement).select();
          }, 0);
        }
      }
    }
  };
  
  // Employee search
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState<string>("");
  
  // Floating menu state
  const [floatingMenu, setFloatingMenu] = useState<FloatingMenuState>({
    open: false,
    companyId: null,
    clientId: null,
    checkId: null,
    companyName: '',
    clientName: ''
  });

  // Real-time listener for user data (including visibleClientIds)
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    logger.log('[BatchChecks] Setting up real-time user listener');
    const userDocRef = doc(db, "users", user.uid);
    
    const unsubscribe = onSnapshot(userDocRef, (doc) => {
      if (!doc.exists()) return;
      
      const userData = doc.data();
      const role = userData.role || 'user';
      const companyIds: string[] = userData.companyIds || [];
      const visibleClientIds: string[] = userData.visibleClientIds || [];
      
      logger.log('[BatchChecks] Real-time user data update:', { role, companyIds, visibleClientIds });
      setCurrentUserVisibleClientIds(visibleClientIds);
      setCurrentUserRole(role);
    });

    return () => {
      logger.log('[BatchChecks] Cleaning up user listener');
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const user = auth.currentUser;
      if (!user) return;

      // Get current user data from the real-time listener
      const userDocRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userDocRef);
      if (!userSnap.exists()) return;

      const userData = userSnap.data();
      const role = userData.role || 'user';
      const companyIds: string[] = userData.companyIds || [];

      let filteredCompanies: Company[] = [];
      if (role === 'admin') {
        // Admin: fetch ALL companies
        const compSnap = await getDocs(collection(db, "companies"));
        filteredCompanies = compSnap.docs.map((doc) => ({
          id: doc.id,
          name: doc.data()?.name || "Unnamed",
          logoBase64: doc.data()?.logoBase64 || null,
        }));
        logger.log("[BatchChecks] (admin) fetched companies:", filteredCompanies);
      } else {
        // Non-admin: fetch only assigned companies using where('__name__', 'in', companyIds) in chunks of 10
        logger.log("[BatchChecks] user companyIds:", companyIds);
        let companyDocs: any[] = [];
        if (companyIds.length > 0) {
          const chunks = chunkArray(companyIds, 10);
          for (const chunk of chunks) {
            const q = query(collection(db, "companies"), where("__name__", "in", chunk));
            const snap = await getDocs(q);
            companyDocs.push(...snap.docs);
          }
        }
        filteredCompanies = companyDocs.map((doc) => ({
              id: doc.id,
          name: doc.data()?.name || "Unnamed",
          logoBase64: doc.data()?.logoBase64 || null,
        }));
        logger.log("[BatchChecks] (user) fetched companies:", filteredCompanies);
      }
      setCompanies(filteredCompanies);

      // Fetch employees
      let empDocs = [];
      if (role === 'admin') {
      const empSnap = await getDocs(collection(db, "employees"));
        empDocs = empSnap.docs;
        logger.log("[BatchChecks] (admin) fetched employees:", empDocs.filter(d => d != null).map(d => ({ id: d.id, ...d.data() })));
      } else {
        const queries = companyIds.map((id) =>
          getDocs(query(collection(db, "employees"), where("companyId", "==", id)))
        );
        const results = await Promise.allSettled(queries);
        empDocs = results
          .filter((r) => r.status === "fulfilled")
          .flatMap((r) => (r as PromiseFulfilledResult<any>).value.docs)
          .filter((d) => d != null);
        results
          .filter((r) => r.status === "rejected")
          .forEach((r) => logger.warn("🔥 Failed employee query:", (r as PromiseRejectedResult).reason));
        logger.log("[BatchChecks] (user) fetched employees:", empDocs.filter(d => d != null).map(d => ({ id: d.id, ...d.data() })));
      }
      setEmployees(empDocs.filter(d => d != null).map((d) => ({ id: d.id, ...d.data() } as Employee)));

      // Fetch clients
      const clientSnap = await getDocs(collection(db, "clients"));
      const clientList: Client[] = clientSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        payPeriodStartDay: d.data().payPeriodStartDay || 'monday',
        payPeriodFrequency: d.data().payPeriodFrequency || 'weekly',
        companyIds: d.data().companyId || [], // Note: field is 'companyId' in Firestore but contains array
        active: d.data().active ?? true,
        division: d.data().division || '', // Add division field
      }));
      setClients(clientList);
      logger.log("[BatchChecks] fetched clients:", clientList);
    };
  
    fetchData();
  }, []);
  
  // Get clients for the selected company
  const companyClients = selectedCompanyId 
    ? clients.filter(client => {
        // Safety check: skip undefined/null clients
        if (!client) return false;
        
        // Basic filters
        const isActive = client.active;
        const belongsToCompany = client.companyIds && client.companyIds.includes(selectedCompanyId);
        
        // Visibility filter - only apply for non-admin users
        const isVisibleToUser = currentUserRole === 'admin' || 
                               currentUserVisibleClientIds.length === 0 || 
                               currentUserVisibleClientIds.includes(client.id);
        
        logger.log(`[BatchChecks] Client ${client.name} filters:`, {
          isActive,
          belongsToCompany,
          isVisibleToUser,
          visibleClientIds: currentUserVisibleClientIds,
          clientId: client.id,
          userRole: currentUserRole
        });
        
        return isActive && belongsToCompany && isVisibleToUser;
      })
    : [];

  // Log visible clients for debugging
  useEffect(() => {
    if (companyClients.length > 0) {
      logger.log('[BatchChecks] Visible clients after filtering:', companyClients.filter(c => c != null).map(c => ({
        id: c.id,
        name: c.name,
        visible: true
      })));
    }
  }, [companyClients, currentUserVisibleClientIds, currentUserRole]);

  // Filter clients based on search and status
  const filteredCompanyClients = companyClients.filter(client => {
    const matchesSearch = clientSearchTerm === "" || 
      client.name.toLowerCase().includes(clientSearchTerm.toLowerCase());
    const matchesStatus = clientStatusFilter === 'all' || 
      (clientStatusFilter === 'active' && client.active) ||
      (clientStatusFilter === 'inactive' && !client.active);
    
    return matchesSearch && matchesStatus;
  });

  // Filter clients to only show those that have at least ONE active employee
  // NEW: Show ALL clients and ALL employees who work for each client (even if they work for multiple clients)
  const clientsWithActiveEmployees = filteredCompanyClients.filter(client => {
    // Check if this client has any active employees (regardless of how many relationships they have)
    const hasActiveEmployees = employees.some(emp => {
      if (!emp.active) return false; // Employee must be active
      
      // Check if employee has at least one active relationship with this client
      const hasActiveRelationshipWithThisClient = emp.clientPayTypeRelationships?.some(rel => 
        rel.clientId === client.id && rel.active
      );
      
      // Check legacy fields - only count if employee has NO relationships
      const hasLegacyClient = emp.clientId === client.id;
      const legacyEmployeeWithThisClient = hasLegacyClient && (!emp.clientPayTypeRelationships || emp.clientPayTypeRelationships.length === 0);
      
      return hasActiveRelationshipWithThisClient || legacyEmployeeWithThisClient;
    });
    
    return hasActiveEmployees;
  }).sort((a, b) => {
    const divisionA = (a.division || "").toLowerCase();
    const divisionB = (b.division || "").toLowerCase();

    if (divisionA !== divisionB) {
      return divisionA.localeCompare(divisionB);
    }

    const clientNameA = (a.name || "").toLowerCase();
    const clientNameB = (b.name || "").toLowerCase();
    return clientNameA.localeCompare(clientNameB);
  }); // Sort by division (client) first, then by department name

  // Debug logging for client filtering
  useEffect(() => {
    if (employees.length > 0 && clientsWithActiveEmployees.length > 0) {
      logger.log('🔍 [Client Filtering] Results:');
      logger.log(`  - Total clients: ${filteredCompanyClients.length}`);
      logger.log(`  - Clients with active employees: ${clientsWithActiveEmployees.length}`);
      logger.log(`  - Clients with active employees:`, clientsWithActiveEmployees.map(c => c.name));
      
      // Log employee counts per client
      clientsWithActiveEmployees.forEach(client => {
        const employeeCount = employees.filter(emp => {
          if (!emp.active) return false;
          
          // Check if employee has any active relationship with this client
          const hasActiveRelationshipWithThisClient = emp.clientPayTypeRelationships?.some(rel => 
            rel.clientId === client.id && rel.active
          );
          
          // Check legacy fields - only count if employee has NO relationships
          const hasLegacyClient = emp.clientId === client.id;
          const legacyEmployeeWithSingleClient = hasLegacyClient && (!emp.clientPayTypeRelationships || emp.clientPayTypeRelationships.length === 0);
          
          return hasActiveRelationshipWithThisClient || legacyEmployeeWithSingleClient;
        }).length;
        logger.log(`    - ${client.name}: ${employeeCount} employees`);
      });
    }
  }, [employees, clientsWithActiveEmployees]);

 // Clear all tab data when company changes (but not on initial load with saved data)
  const isInitialMount = useRef(true);
  const previousCompanyIdRef = useRef<string | null>(null);
  useEffect(() => {
    // On initial mount, store the initial companyId and don't clear tabData
    if (isInitialMount.current) {
      previousCompanyIdRef.current = selectedCompanyId;
      isInitialMount.current = false;
      return;
    }
    
    // Only clear tabData if:
    // 1. Company actually changed (not just initialized)
    // 2. Previous company was not null (meaning it was a real change, not initial load)
    // 3. New company is different from previous
    if (previousCompanyIdRef.current !== null && 
        previousCompanyIdRef.current !== selectedCompanyId &&
        selectedCompanyId !== null) {
      logger.log('🔄 [Company Change] Clearing tabData due to company change', {
        previous: previousCompanyIdRef.current,
        current: selectedCompanyId
      });
      setTabData({});
    }
    
    // Update the ref for next comparison
    previousCompanyIdRef.current = selectedCompanyId;
  }, [selectedCompanyId]);

// Auto-select first employee tab when employees are selected
useEffect(() => {
  const selectedEmpIds = Object.keys(selectedEmployees).filter(id => selectedEmployees[id]);
  if (selectedEmpIds.length > 0 && !selectedEmployeeTab) {
    setSelectedEmployeeTab(selectedEmpIds[0]);
  } else if (selectedEmpIds.length === 0) {
    setSelectedEmployeeTab(null);
  } else if (selectedEmployeeTab && !selectedEmployees[selectedEmployeeTab]) {
    // If current tab employee was removed, switch to first available
    setSelectedEmployeeTab(selectedEmpIds[0] || null);
  }
}, [selectedEmployees, selectedEmployeeTab]);

  // Handle ENTER key to focus on employee dropdown (always goes to new row dropdown)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Handle ENTER to always focus the employee dropdown in the new row
      if (event.key === 'Enter') {
        const activeElement = document.activeElement;
        
        // Don't intercept ENTER if we're actively typing in a text input (has value or is textarea)
        const inputElement = activeElement as HTMLInputElement;
        const isTextInputWithValue = (activeElement?.tagName === 'INPUT' && 
                                     inputElement.type !== 'button' &&
                                     inputElement.type !== 'submit' &&
                                     inputElement.type !== 'date' &&
                                     (inputElement.value?.length > 0 || inputElement.type === 'text')) ||
                                     (activeElement?.tagName === 'TEXTAREA' && 
                                      (activeElement as HTMLTextAreaElement).value?.length > 0);
        
        // Don't intercept if we're in a dialog or modal
        const isInDialog = activeElement?.closest('[role="dialog"]') || 
                          activeElement?.closest('[class*="MuiDialog"]');
        
        // Don't intercept if we're in a combobox/dropdown that's open
        const isInOpenDropdown = activeElement?.closest('[role="listbox"]') ||
                                 activeElement?.closest('[class*="MuiAutocomplete-popper"]');
        
        // Always intercept ENTER to create new row (unless actively typing in text input, dialog, or open dropdown)
        if (!isTextInputWithValue && !isInDialog && !isInOpenDropdown) {
          event.preventDefault();
          event.stopPropagation();
          
          // Set focused row to 'new-row' to highlight the new row
          setFocusedRowId('new-row');
          
          // Open dropdown and focus
          setEmployeeDropdownOpen(true);
          setTimeout(() => {
            if (employeeDropdownRef.current) {
              employeeDropdownRef.current.focus();
              // Select all text for easy typing
              if (employeeDropdownRef.current.select) {
                employeeDropdownRef.current.select();
              }
            }
          }, 10);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true); // Use capture phase
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  // Don't clear selections when switching client tabs - let users keep their work

  const filteredEmployees = selectedCompanyId
? employees.filter((e) => {
    if (!e.active) return false; // Exclude inactive employees
    
    // Company filter: Check if employee has relationships with clients from this company
    const matchCompany = e.clientPayTypeRelationships?.some(rel => {
      // Find the client for this relationship
      const client = clients.find(c => c.id === rel.clientId);
      // Check if this client belongs to the selected company
      return client && client.companyIds && client.companyIds.includes(selectedCompanyId);
    }) || false;
    
    // Client filter (if a specific client is selected)
    if (selectedClientId) {
      const matchClient = e.clientPayTypeRelationships?.some(rel => rel.clientId === selectedClientId) ||
                         e.clientId === selectedClientId;
      return matchCompany && matchClient;
    }
    
    return matchCompany;
  })
: [];

  // Helper function to get appropriate payment methods based on selected client tab
  const getDefaultPaymentMethods = (emp: Employee) => {
    logger.log(`🔍 [getDefaultPaymentMethods] ${emp.name}:`);
    logger.log(`  - selectedClientId: ${selectedClientId}`);
    logger.log(`  - emp.payType: ${emp.payType}`);
    logger.log(`  - emp.payTypes:`, emp.payTypes);
    
    if (selectedClientId) {
      // Single client tab: STRICTLY use only the client's pay type
      const selectedClient = companyClients.find(c => c.id === selectedClientId);
      logger.log(`  - Selected client:`, selectedClient?.name);
      
      if (selectedClient) {
        // Check if employee has a relationship with this client
        const relationship = emp.clientPayTypeRelationships?.find(rel => rel.clientId === selectedClientId);
        logger.log(`  - Found relationship:`, relationship);
        
        if (relationship) {
          // Use the relationship's pay type
          logger.log(`  - Using relationship pay type: [${relationship.payType}]`);
          return [relationship.payType];
        }
        
        // If no relationship found, determine pay type from client name
        // This is a fallback for legacy employees without relationships
        if (selectedClient.name.toLowerCase().includes('per diem') || selectedClient.name.toLowerCase().includes('perdiem')) {
          logger.log(`  - Client name indicates per diem, returning: ['perdiem']`);
          return ['perdiem'];
        } else if (selectedClient.name.toLowerCase().includes('hourly')) {
          logger.log(`  - Client name indicates hourly, returning: ['hourly']`);
          return ['hourly'];
        }
        
        // If we can't determine from client name, use employee's default
        logger.log(`  - Using employee default pay type: [${emp.payType}]`);
        return [emp.payType];
      }
    }
    // Default fallback
    logger.log(`  - Default fallback, returning: [${emp.payType}]`);
    return [emp.payType];
  };

  // Helper function to get default relationship IDs based on selected client tab
  const getDefaultRelationshipIds = (emp: Employee) => {
    if (selectedClientId) {
      // Auto-select ALL relationships for the current client (an employee might have multiple pay types with same client)
      const clientRelationships = emp.clientPayTypeRelationships?.filter(rel => 
        rel != null && rel.clientId === selectedClientId && rel.active
      ) || [];
      return clientRelationships.filter(rel => rel != null).map(rel => rel.id);
    }
    // Default fallback
    return [];
  };

  // Function to fetch and populate previous batch data
  const loadPreviousBatch = async () => {
    if (!selectedClientId || !selectedCompanyId) {
      alert("Please select a client first.");
      return;
    }

    try {
      logger.log("🔍 Fetching previous batch for client:", selectedClientId);
      
      // Get all checks for this company
      const checksQuery = query(
        collection(db, 'checks'),
        where('companyId', '==', selectedCompanyId),
        orderBy('date', 'desc')
      );
      
      const checksSnapshot = await getDocs(checksQuery);
      const allChecks = checksSnapshot.docs.filter(doc => doc != null).map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      logger.log("🔍 Found total checks:", allChecks.length);
      
      // Get employees for the current client
      // ... existing code ...

// Line 422: usePreviousBatch function
const clientEmployees = filteredEmployees.filter(emp => {
  if (selectedClientId === 'multiple') {
    return emp.clientPayTypeRelationships && emp.clientPayTypeRelationships.length > 1;
  } else {
    return emp.clientPayTypeRelationships?.some(rel => rel.clientId === selectedClientId) ||
           emp.clientId === selectedClientId;
  }
});

// ... existing code ...
      
      logger.log("🔍 Client employees:", clientEmployees.length);
      
      // Track tab data to distribute relationship-specific data across tabs
      const newTabData: { [key: string]: { selectedEmployees: { [key: string]: boolean }, inputs: { [key: string]: any } } } = {};
      let foundPreviousData = false;
      
      // For each employee, find their most recent check for this client
      clientEmployees.forEach(emp => {
        let latestCheck: any = null;
        
        if (selectedClientId === 'multiple') {
          // For multiple clients, find the most recent check with multiple relationships
          latestCheck = allChecks
            .filter((check: any) => 
              check.employeeId === emp.id && 
              check.clientId === 'multiple' &&
              check.relationshipDetails && 
              check.relationshipDetails.length > 1
            )
            .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        } else {
          // For single client, find the most recent check for this specific client
          latestCheck = allChecks
            .filter((check: any) => 
              check.employeeId === emp.id && 
              (check.clientId === selectedClientId || 
               (check.relationshipDetails && check.relationshipDetails.some((rel: any) => rel.clientId === selectedClientId)))
            )
            .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        }
        
        if (latestCheck) {
          logger.log(`🔍 Found previous check for ${emp.name}:`, latestCheck);
          foundPreviousData = true;
          
          // If the check has relationshipDetails, distribute data across tabs
          if (latestCheck.relationshipDetails && latestCheck.relationshipDetails.length > 0) {
            logger.log(`🔍 Distributing relationship data for ${emp.name} across ${latestCheck.relationshipDetails.length} tabs`);
            
            // Process each relationship and populate the corresponding tab
            latestCheck.relationshipDetails.forEach((relDetail: any) => {
              const tabId = relDetail.clientId;
              
              // Initialize tab data if it doesn't exist
              if (!newTabData[tabId]) {
                newTabData[tabId] = {
                  selectedEmployees: {},
                  inputs: {}
                };
              }
              
              // Select this employee in this tab
              newTabData[tabId].selectedEmployees[emp.id] = true;
              
              // Get the current relationship for this employee and client
              const relationship = emp.clientPayTypeRelationships?.find((rel: any) => rel.clientId === tabId);
              
              if (relationship) {
                const relId = relationship.id;
                
                // Create input data for this tab
                const tabInput: any = {
                  paymentMethods: [relDetail.payType],
                  selectedRelationshipIds: [relId],
                  checkDate: latestCheck.date ? createLocalDate(latestCheck.date) : null,
                  memo: latestCheck.memo || ""
                };
                
                // Populate relationship-specific fields
                if (relDetail.payType === 'hourly') {
                  tabInput[`${relId}_hours`] = relDetail.hours?.toString() || "";
                  tabInput[`${relId}_otHours`] = relDetail.otHours?.toString() || "";
                  tabInput[`${relId}_holidayHours`] = relDetail.holidayHours?.toString() || "";
                } else if (relDetail.payType === 'perdiem') {
                  tabInput[`${relId}_perdiemAmount`] = relDetail.perdiemAmount?.toString() || "";
                  tabInput[`${relId}_perdiemBreakdown`] = relDetail.perdiemBreakdown || false;
                  tabInput[`${relId}_perdiemMonday`] = relDetail.perdiemMonday?.toString() || "";
                  tabInput[`${relId}_perdiemTuesday`] = relDetail.perdiemTuesday?.toString() || "";
                  tabInput[`${relId}_perdiemWednesday`] = relDetail.perdiemWednesday?.toString() || "";
                  tabInput[`${relId}_perdiemThursday`] = relDetail.perdiemThursday?.toString() || "";
                  tabInput[`${relId}_perdiemFriday`] = relDetail.perdiemFriday?.toString() || "";
                  tabInput[`${relId}_perdiemSaturday`] = relDetail.perdiemSaturday?.toString() || "";
                  tabInput[`${relId}_perdiemSunday`] = relDetail.perdiemSunday?.toString() || "";
                  tabInput[`${relId}_ptoAmount`] = (relDetail as any).ptoAmount?.toString() || "";
                }
                
                // Add other pay if exists
                if (relDetail.otherPay && relDetail.otherPay.length > 0) {
                  tabInput[`${relId}_otherPay`] = relDetail.otherPay;
                }
                
                newTabData[tabId].inputs[emp.id] = tabInput;
              }
            });
          } else {
            // Legacy check without relationship details - use simple distribution
            logger.log(`🔍 Legacy check for ${emp.name} - distributing to current tab only`);
            
            if (!newTabData[selectedClientId]) {
              newTabData[selectedClientId] = {
                selectedEmployees: {},
                inputs: {}
              };
            }
            
            newTabData[selectedClientId].selectedEmployees[emp.id] = true;
            
            const defaultPaymentMethods = getDefaultPaymentMethods(emp);
            const defaultRelationshipIds = getDefaultRelationshipIds(emp);
            
            const empInput: any = {
              paymentMethods: defaultPaymentMethods,
              selectedRelationshipIds: defaultRelationshipIds,
              hours: latestCheck.hours?.toString() || "",
              otHours: latestCheck.otHours?.toString() || "",
              holidayHours: latestCheck.holidayHours?.toString() || "",
              memo: latestCheck.memo || "",
              perdiemAmount: latestCheck.perdiemAmount?.toString() || "",
              perdiemBreakdown: latestCheck.perdiemBreakdown || false,
              perdiemMonday: latestCheck.perdiemMonday?.toString() || "",
              perdiemTuesday: latestCheck.perdiemTuesday?.toString() || "",
              perdiemWednesday: latestCheck.perdiemWednesday?.toString() || "",
              perdiemThursday: latestCheck.perdiemThursday?.toString() || "",
              perdiemFriday: latestCheck.perdiemFriday?.toString() || "",
              perdiemSaturday: latestCheck.perdiemSaturday?.toString() || "",
              perdiemSunday: latestCheck.perdiemSunday?.toString() || "",
              checkDate: latestCheck.date ? createLocalDate(latestCheck.date) : null
            };
            
            // If employee has relationships, populate relationship-specific fields
            if (emp.clientPayTypeRelationships) {
              emp.clientPayTypeRelationships.forEach(relationship => {
                if (selectedClientId === 'multiple' || relationship.clientId === selectedClientId) {
                  const relId = relationship.id;
                  if (relationship.payType === 'hourly') {
                    empInput[`${relId}_hours`] = empInput.hours;
                    empInput[`${relId}_otHours`] = empInput.otHours;
                    empInput[`${relId}_holidayHours`] = empInput.holidayHours;
                  } else if (relationship.payType === 'perdiem') {
                    empInput[`${relId}_perdiemAmount`] = empInput.perdiemAmount;
                    empInput[`${relId}_perdiemBreakdown`] = empInput.perdiemBreakdown;
                    empInput[`${relId}_perdiemMonday`] = empInput.perdiemMonday;
                    empInput[`${relId}_perdiemTuesday`] = empInput.perdiemTuesday;
                    empInput[`${relId}_perdiemWednesday`] = empInput.perdiemWednesday;
                    empInput[`${relId}_perdiemThursday`] = empInput.perdiemThursday;
                    empInput[`${relId}_perdiemFriday`] = empInput.perdiemFriday;
                    empInput[`${relId}_perdiemSaturday`] = empInput.perdiemSaturday;
                    empInput[`${relId}_perdiemSunday`] = empInput.perdiemSunday;
                    empInput[`${relId}_ptoAmount`] = (empInput as any).ptoAmount || "";
                  }
                }
              });
            }
            
            newTabData[selectedClientId].inputs[emp.id] = empInput;
          }
        } else {
          logger.log(`🔍 No previous check found for ${emp.name}`);
        }
      });
      
      if (foundPreviousData) {
        // Update tab data with relationship-specific data distributed across tabs
        setTabData(newTabData);
        
        const employeeCount = new Set(
          Object.values(newTabData).flatMap(tab => Object.keys(tab.selectedEmployees).filter(id => tab.selectedEmployees[id]))
        ).size;
        
        logger.log(`✅ Loaded previous batch data for ${employeeCount} employees across ${Object.keys(newTabData).length} tabs`);
      } else {
        alert("❌ No previous batch data found for this client. Please create checks manually.");
      }
      
    } catch (error) {
      console.error("Error fetching previous batch:", error);
      alert("❌ Error fetching previous batch data. Please try again.");
    }
  };

  const toggleEmployee = (id: string) => {
    const emp = employees.find(e => e.id === id);
    if (!emp) return;

  // Check if employee is currently selected before toggling
  const isCurrentlySelected = selectedEmployees[id];
  const tabId = selectedClientId || 'multiple';
  
  setSelectedEmployees((prev) => ({ ...prev, [id]: !prev[id] }));

  // If unchecking an employee, clear their input data to prevent validation conflicts
  if (isCurrentlySelected) {
    setInputs((prev) => {
      const { [id]: removed, ...rest } = prev;
      return rest;
    });
    // Remove from selection order
    setEmployeeSelectionOrder(prev => ({
      ...prev,
      [tabId]: (prev[tabId] || []).filter(empId => empId !== id)
    }));
    return; // Exit early when unchecking
  }
  
  // Add to selection order when selecting
  setEmployeeSelectionOrder(prev => {
    const currentOrder = prev[tabId] || [];
    if (!currentOrder.includes(id)) {
      return {
        ...prev,
        [tabId]: [...currentOrder, id]
      };
    }
    return prev;
  });
    
    // Auto-set payment methods and relationships based on selected client tab
    const defaultPaymentMethods = getDefaultPaymentMethods(emp);
    const defaultRelationshipIds = getDefaultRelationshipIds(emp);
    
    // Debug logging
    logger.log(`🔍 [toggleEmployee] ${emp.name} (${id}):`);
    logger.log(`  - selectedClientId: ${selectedClientId}`);
    logger.log(`  - defaultPaymentMethods:`, defaultPaymentMethods);
    logger.log(`  - defaultRelationshipIds:`, defaultRelationshipIds);
    
    setInputs((prev) => {
      // Start with any existing data, or create fresh defaults
      const existingData = prev[id] || {};
      
      // Always create baseInput with fresh payment methods and relationships
      // This ensures that after clearing and re-selecting, the employee gets proper defaults
      const baseInput: any = {
        ...existingData, // Preserve existing relationship-specific fields and other data
        // But override these core fields with fresh defaults:
        hours: "",
        otHours: "",
        holidayHours: "",
        memo: "",
        paymentMethods: defaultPaymentMethods,
        selectedRelationshipIds: defaultRelationshipIds,
        perdiemAmount: "",
        perdiemBreakdown: false,
        perdiemMonday: "",
        perdiemTuesday: "",
        perdiemWednesday: "",
        perdiemThursday: "",
        perdiemFriday: "",
        perdiemSaturday: "",
        perdiemSunday: "",
        // Auto-apply the default check date when selecting an employee
        checkDate: defaultCheckDate ? createLocalDate(defaultCheckDate) : (existingData.checkDate || null),
      };

      // If single client is selected, initialize relationship-specific fields
      if (selectedClientId !== 'multiple' && emp.clientPayTypeRelationships) {
        const relationship = emp.clientPayTypeRelationships.find(rel => rel.clientId === selectedClientId);
        if (relationship) {
          // Initialize relationship-specific fields
          baseInput[`${relationship.id}_perdiemBreakdown`] = baseInput[`${relationship.id}_perdiemBreakdown`] || false;
          baseInput[`${relationship.id}_perdiemAmount`] = baseInput[`${relationship.id}_perdiemAmount`] || "";
          baseInput[`${relationship.id}_perdiemMonday`] = baseInput[`${relationship.id}_perdiemMonday`] || "";
          baseInput[`${relationship.id}_perdiemTuesday`] = baseInput[`${relationship.id}_perdiemTuesday`] || "";
          baseInput[`${relationship.id}_perdiemWednesday`] = baseInput[`${relationship.id}_perdiemWednesday`] || "";
          baseInput[`${relationship.id}_perdiemThursday`] = baseInput[`${relationship.id}_perdiemThursday`] || "";
          baseInput[`${relationship.id}_perdiemFriday`] = baseInput[`${relationship.id}_perdiemFriday`] || "";
          baseInput[`${relationship.id}_perdiemSaturday`] = baseInput[`${relationship.id}_perdiemSaturday`] || "";
          baseInput[`${relationship.id}_perdiemSunday`] = baseInput[`${relationship.id}_perdiemSunday`] || "";
          
          // Also initialize hourly fields if needed
          if (relationship.payType === 'hourly') {
            baseInput[`${relationship.id}_hours`] = baseInput[`${relationship.id}_hours`] || "";
            baseInput[`${relationship.id}_otHours`] = baseInput[`${relationship.id}_otHours`] || "";
            baseInput[`${relationship.id}_holidayHours`] = baseInput[`${relationship.id}_holidayHours`] || "";
            baseInput[`${relationship.id}_otherPay`] = baseInput[`${relationship.id}_otherPay`] || [];
          } else if (relationship.payType === 'perdiem') {
            // Initialize PTO amount field for per diem employees (simple dollar amount, not hours × rate)
            baseInput[`${relationship.id}_ptoAmount`] = baseInput[`${relationship.id}_ptoAmount`] || "";
          }
          
          // Debug logging
          logger.log(`🔍 DEBUG initialized relationship fields for ${emp.name}:`, {
            relationshipId: relationship.id,
            perdiemBreakdown: baseInput[`${relationship.id}_perdiemBreakdown`],
            perdiemMonday: baseInput[`${relationship.id}_perdiemMonday`],
            perdiemTuesday: baseInput[`${relationship.id}_perdiemTuesday`],
            perdiemWednesday: baseInput[`${relationship.id}_perdiemWednesday`]
          });
        }
      }

      return {
        ...prev,
        [id]: baseInput,
      };
    });
  };

  const handleInputChange = (id: string, field: string, value: string | string[] | boolean | OtherPayItem[] | Date | null) => {
    setInputs((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const calculateHourlyTotal = (emp: Employee, data: PayInput) => {
    const baseRate = getEffectivePayRate(emp, data, 'hourly');
    const hours = parseFloat(data.hours) || 0;
    const otHours = parseFloat(data.otHours) || 0;
    const holidayHours = parseFloat(data.holidayHours) || 0;
    
    // Add Other Pay amounts
    const otherPayTotal = (data.otherPay || []).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

    return (hours * baseRate + otHours * baseRate * 1.5 + holidayHours * baseRate + otherPayTotal).toFixed(2);
  };

  // New function to calculate hourly total for a specific relationship
  const calculateHourlyTotalForRelationship = (emp: Employee, data: PayInput, relationshipId: string) => {
    const baseRate = getRelationshipPayRate(emp, relationshipId);
    const hours = parseFloat((data as any)[`${relationshipId}_hours`]) || 0;
    const otHours = parseFloat((data as any)[`${relationshipId}_otHours`]) || 0;
    const holidayHours = parseFloat((data as any)[`${relationshipId}_holidayHours`]) || 0;
    
    // Add Other Pay amounts for this relationship
    const otherPayTotal = ((data as any)[`${relationshipId}_otherPay`] || []).reduce((sum: number, item: OtherPayItem) => sum + (parseFloat(item.amount) || 0), 0);

    return (hours * baseRate + otHours * baseRate * 1.5 + holidayHours * baseRate + otherPayTotal).toFixed(2);
  };

  const calculatePerDiemTotal = (data: PayInput) => {
    let perDiemTotal = 0;
    
    if (data.perdiemBreakdown) {
      // Calculate from daily breakdown
      const monday = parseFloat(data.perdiemMonday || '0') || 0;
      const tuesday = parseFloat(data.perdiemTuesday || '0') || 0;
      const wednesday = parseFloat(data.perdiemWednesday || '0') || 0;
      const thursday = parseFloat(data.perdiemThursday || '0') || 0;
      const friday = parseFloat(data.perdiemFriday || '0') || 0;
      const saturday = parseFloat(data.perdiemSaturday || '0') || 0;
      const sunday = parseFloat(data.perdiemSunday || '0') || 0;
      
      perDiemTotal = monday + tuesday + wednesday + thursday + friday + saturday + sunday;
    } else {
      // Use full amount
      perDiemTotal = parseFloat(data.perdiemAmount || '0') || 0;
    }
    
    // Add Other Pay amounts for legacy per diem
    const otherPayTotal = (data.otherPay || []).reduce((sum: number, item: OtherPayItem) => sum + (parseFloat(item.amount) || 0), 0);
    
    return (perDiemTotal + otherPayTotal).toFixed(2);
  };

  // New function to calculate per diem total for a specific relationship
  const calculatePerDiemTotalForRelationship = (data: PayInput, relationshipId: string) => {
    const perdiemBreakdown = (data as any)[`${relationshipId}_perdiemBreakdown`];
    
    let perDiemTotal = 0;
    
    if (perdiemBreakdown) {
      // Calculate from daily breakdown
      const monday = parseFloat((data as any)[`${relationshipId}_perdiemMonday`] || '0') || 0;
      const tuesday = parseFloat((data as any)[`${relationshipId}_perdiemTuesday`] || '0') || 0;
      const wednesday = parseFloat((data as any)[`${relationshipId}_perdiemWednesday`] || '0') || 0;
      const thursday = parseFloat((data as any)[`${relationshipId}_perdiemThursday`] || '0') || 0;
      const friday = parseFloat((data as any)[`${relationshipId}_perdiemFriday`] || '0') || 0;
      const saturday = parseFloat((data as any)[`${relationshipId}_perdiemSaturday`] || '0') || 0;
      const sunday = parseFloat((data as any)[`${relationshipId}_perdiemSunday`] || '0') || 0;
      
      perDiemTotal = monday + tuesday + wednesday + thursday + friday + saturday + sunday;
    } else {
      // Use full amount - check if value exists and is not empty
      const perdiemAmountValue = (data as any)[`${relationshipId}_perdiemAmount`];
      if (perdiemAmountValue !== undefined && perdiemAmountValue !== null && perdiemAmountValue !== '') {
        perDiemTotal = parseFloat(perdiemAmountValue) || 0;
      }
    }
    
    // Note: PTO amount should be calculated separately, not included in per diem total
    // Note: Other Pay should be calculated separately, not included in per diem total
    return perDiemTotal.toFixed(2);
  };

  // Helper function to get the correct pay rate for an employee based on selected relationships
  const getEffectivePayRate = (emp: Employee, data: PayInput, payType: 'hourly' | 'perdiem') => {
    if (data.selectedRelationshipIds && data.selectedRelationshipIds.length > 0) {
      const relationship = emp.clientPayTypeRelationships?.find(rel => 
        rel.payType === payType && 
        data.selectedRelationshipIds?.includes(rel.id)
      );
      if (relationship?.payRate) {
        return parseFloat(relationship.payRate);
      }
    }
    return 0; // No fallback - must use relationship-specific pay rates
  };

  // Helper function to get the pay rate for a specific relationship
  const getRelationshipPayRate = (emp: Employee, relationshipId: string) => {
    const relationship = emp.clientPayTypeRelationships?.find(rel => rel.id === relationshipId);
    logger.log('🔍 DEBUG getRelationshipPayRate:', {
      employeeName: emp.name,
      relationshipId,
      relationship,
      relationshipPayRate: relationship?.payRate
    });
    if (relationship?.payRate) {
      return parseFloat(relationship.payRate);
    }
    return 0; // No fallback - must use relationship-specific pay rates
  };

  const calculateAmount = (emp: Employee, data: PayInput) => {
    let total = 0;
    
    // If we have selected relationships, calculate from those
    if (data.selectedRelationshipIds && data.selectedRelationshipIds.length > 0) {
      // Calculate total from all selected relationships
      data.selectedRelationshipIds.forEach(relationshipId => {
        const relationship = emp.clientPayTypeRelationships?.find(rel => rel.id === relationshipId);
        if (relationship) {
          if (relationship.payType === 'hourly') {
            // calculateHourlyTotalForRelationship already includes Other Pay, so don't add it again
            total += parseFloat(calculateHourlyTotalForRelationship(emp, data, relationshipId));
          } else if (relationship.payType === 'perdiem') {
            // calculatePerDiemTotalForRelationship does NOT include Other Pay or PTO, so add them separately
            total += parseFloat(calculatePerDiemTotalForRelationship(data, relationshipId));
            // Add PTO amount for per diem employees (simple dollar amount)
            const ptoAmount = parseFloat((data as any)[`${relationshipId}_ptoAmount`] || '0') || 0;
            total += ptoAmount;
            // Add Other Pay
            const otherPayTotal = ((data as any)[`${relationshipId}_otherPay`] || []).reduce((sum: number, item: OtherPayItem) => sum + (parseFloat(item.amount) || 0), 0);
            total += otherPayTotal;
          }
        }
      });
    } else {
      // Handle single client scenarios - check if employee has relationship data
      if (emp.clientPayTypeRelationships && emp.clientPayTypeRelationships.length > 0) {
        // Try to find relationship by checking which relationship-specific fields exist in data
        // This handles cases where calculateReviewData uses tabId instead of selectedClientId
        let relationship = emp.clientPayTypeRelationships.find(rel => rel.clientId === selectedClientId);
        
        // If not found, try to find relationship by checking for relationship-specific fields in data
        if (!relationship) {
          relationship = emp.clientPayTypeRelationships.find(rel => {
            const relId = rel.id;
            // Check if any relationship-specific fields exist in the data
            return (data as any)[`${relId}_perdiemAmount`] !== undefined ||
                   (data as any)[`${relId}_perdiemBreakdown`] !== undefined ||
                   (data as any)[`${relId}_ptoAmount`] !== undefined ||
                   (data as any)[`${relId}_hours`] !== undefined ||
                   (data as any)[`${relId}_otHours`] !== undefined ||
                   ((data as any)[`${relId}_otherPay`] && Array.isArray((data as any)[`${relId}_otherPay`]));
          });
        }
        
        logger.log(`🔍 [calculateAmount] ${emp.name} - relationship lookup:`, {
          selectedClientId,
          relationships: emp.clientPayTypeRelationships.map(r => ({ id: r.id, clientId: r.clientId, payType: r.payType })),
          foundRelationship: relationship ? { id: relationship.id, payType: relationship.payType } : null,
          dataKeys: Object.keys(data).filter(k => k.includes('_'))
        });
        if (relationship) {
          if (relationship.payType === 'perdiem') {
            // For per diem relationships, look for relationship-specific data
            const relationshipId = relationship.id;
            const perdiemAmount = parseFloat(data[`${relationshipId}_perdiemAmount`] || '0');
            const perdiemBreakdown = data[`${relationshipId}_perdiemBreakdown`];
            const ptoAmount = parseFloat((data as any)[`${relationshipId}_ptoAmount`] || '0') || 0;
            
            logger.log(`🔍 [calculateAmount] ${emp.name} - per diem calculation:`, {
              relationshipId,
              perdiemAmount,
              perdiemBreakdown: !!perdiemBreakdown,
              ptoAmount,
              ptoFieldValue: (data as any)[`${relationshipId}_ptoAmount`],
              totalBefore: total
            });
            
            if (perdiemBreakdown) {
              // Calculate from daily breakdown
              const dailyTotal = ['perdiemMonday', 'perdiemTuesday', 'perdiemWednesday', 
                                 'perdiemThursday', 'perdiemFriday', 'perdiemSaturday', 'perdiemSunday']
                .reduce((sum, day) => sum + parseFloat(data[`${relationshipId}_${day}`] || '0'), 0);
              total += dailyTotal;
            } else if (perdiemAmount > 0) {
              total += perdiemAmount;
            }
            
            // Add PTO amount for per diem employees (simple dollar amount)
            // IMPORTANT: Add PTO even if there's no per diem amount - this allows PTO-only checks
            total += ptoAmount;
            
            // Add Other Pay amounts for this relationship
            const otherPayTotal = ((data as any)[`${relationshipId}_otherPay`] || []).reduce((sum: number, item: OtherPayItem) => sum + (parseFloat(item.amount) || 0), 0);
            total += otherPayTotal;
            
            logger.log(`🔍 [calculateAmount] ${emp.name} - per diem totals:`, {
              perdiemTotal: total - ptoAmount - otherPayTotal,
              ptoAmount,
              otherPayTotal,
              finalTotal: total
            });
          } else if (relationship.payType === 'hourly') {
            // For hourly relationships, look for relationship-specific data
            const relationshipId = relationship.id;
            const baseRate = relationship.payRate ? parseFloat(relationship.payRate) : 0;
            const hours = parseFloat(data[`${relationshipId}_hours`] || '0');
            const otHours = parseFloat(data[`${relationshipId}_otHours`] || '0');
            const holidayHours = parseFloat(data[`${relationshipId}_holidayHours`] || '0');

            total += hours * baseRate + otHours * baseRate * 1.5 + holidayHours * baseRate;
            
            // Add Other Pay amounts for this relationship
            const otherPayTotal = ((data as any)[`${relationshipId}_otherPay`] || []).reduce((sum: number, item: OtherPayItem) => sum + (parseFloat(item.amount) || 0), 0);
            logger.log(`🔍 [calculateAmount] ${emp.name} - relationship ${relationshipId}:`, {
              otherPayItems: (data as any)[`${relationshipId}_otherPay`] || [],
              otherPayTotal,
              totalBeforeOtherPay: total,
              totalAfterOtherPay: total + otherPayTotal
            });
            total += otherPayTotal;
          }
        }
      } else {
        // Fallback to old calculation method for legacy employees
        const paymentMethods = data.paymentMethods || [emp.payType];
      
        if (paymentMethods.includes('perdiem')) {
          const perdiemTotal = parseFloat(calculatePerDiemTotal(data));
          total += perdiemTotal;
        }
        
        if (paymentMethods.includes('hourly')) {
          const baseRate = getEffectivePayRate(emp, data, 'hourly');
          const hours = parseFloat(data.hours) || 0;
          const otHours = parseFloat(data.otHours) || 0;
          const holidayHours = parseFloat(data.holidayHours) || 0;

          total += hours * baseRate + otHours * baseRate * 1.5 + holidayHours * baseRate;
          
          // Add Other Pay amounts for legacy employees
          const otherPayTotal = (data.otherPay || []).reduce((sum: number, item: OtherPayItem) => sum + (parseFloat(item.amount) || 0), 0);
          logger.log(`🔍 [calculateAmount] ${emp.name} - legacy calculation:`, {
            otherPayItems: data.otherPay || [],
            otherPayTotal,
            totalBeforeOtherPay: total,
            totalAfterOtherPay: total + otherPayTotal
          });
          total += otherPayTotal;
        }
      }
    }

    logger.log(`🔍 [calculateAmount] ${emp.name} - FINAL TOTAL:`, total.toFixed(2));
    return total.toFixed(2);
  };

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

  const handleCreateChecks = async () => {
    if (!selectedCompanyId) {
      alert("Please select a company first.");
      return;
    }

    // Handle expense checks separately
    if (selectedClientId === 'expenses') {
      const companyExpenses = expenseEntries[selectedCompanyId] || [];
      const validExpenses = companyExpenses.filter(exp => 
        exp.name.trim() !== '' && exp.amount && parseFloat(exp.amount) > 0
      );
      
      if (validExpenses.length === 0) {
        alert("Please add at least one expense with a name and amount.");
        return;
      }
      
      setIsCreatingChecks(true);
      
      try {
        // Get bank for check number
        const banksQuery = query(collection(db, "banks"), where("companyId", "==", selectedCompanyId));
        const banksSnapshot = await getDocs(banksQuery);
        
        if (banksSnapshot.empty) {
          throw new Error(`No bank found for company ${selectedCompanyId}`);
        }
        
        const bankDoc = banksSnapshot.docs[0];
        const bankId = bankDoc.id;
        const bankData = bankDoc.data();
        let nextCheckNumber = Number(bankData.nextCheckNumber) || Number(bankData.startingCheckNumber) || 1000;
        
        if (nextCheckNumber < 100) {
          nextCheckNumber = 100;
        }
        
        const createdChecks: any[] = [];
        
        // Create a check for each expense
        for (const expense of validExpenses) {
          const checkDate = expense.checkDate instanceof Date 
            ? expense.checkDate.toISOString().split('T')[0]
            : (expense.checkDate || defaultCheckDate || new Date().toISOString().split('T')[0]);
          
          const checkData: any = {
            companyId: selectedCompanyId,
            employeeId: '', // No employee for expense checks
            employeeName: expense.name, // Use expense name as employee name for display
            amount: parseFloat(expense.amount),
            date: checkDate,
            memo: expense.description || '',
            isExpense: true,
            expenseName: expense.name,
            expenseDescription: expense.description || '',
            clientId: null,
            payType: 'expense',
            checkNumber: nextCheckNumber++,
            paid: false,
            reviewed: false,
            createdBy: auth.currentUser?.uid || '',
            weekKey: new Date(checkDate).toISOString().slice(0, 10), // Use check date as week key
            workWeek: '', // Not applicable for expenses
          };
          
          const checkRef = doc(collection(db, "checks"));
          await setDoc(checkRef, checkData);
          createdChecks.push({ id: checkRef.id, ...checkData });
        }
        
        // Update bank check number
        await updateDoc(doc(db, "banks", bankId), {
          nextCheckNumber: nextCheckNumber
        });
        
        setIsCreatingChecks(false);
        
        // Clear expense entries after successful creation
        setExpenseEntries(prev => ({
          ...prev,
          [selectedCompanyId]: []
        }));
        
        if (onChecksCreated) {
          onChecksCreated();
        }
        
        return; // Exit early for expense checks
      } catch (error) {
        console.error("Error creating expense checks:", error);
        alert("Error creating expense checks. Please try again.");
        setIsCreatingChecks(false);
        return;
      }
    }

    // NEW: Aggregate selected employees from ALL tabs
    const aggregatedEmployeeData: { [empId: string]: { 
      selected: boolean; 
      inputsFromTabs: Array<{ clientId: string; data: PayInput }> 
    }} = {};
    
    // Loop through all tabs in tabData
    Object.keys(tabData).forEach(tabClientId => {
      const tabInfo = tabData[tabClientId];
      if (!tabInfo) return;
      
      // For each selected employee in this tab
      Object.keys(tabInfo.selectedEmployees).forEach(empId => {
        if (tabInfo.selectedEmployees[empId] && tabInfo.inputs[empId]) {
          // Initialize employee data if not exists
          if (!aggregatedEmployeeData[empId]) {
            aggregatedEmployeeData[empId] = {
              selected: true,
              inputsFromTabs: []
            };
          }
          
          // Add this tab's data to the employee's aggregated data
          aggregatedEmployeeData[empId].inputsFromTabs.push({
            clientId: tabClientId,
            data: tabInfo.inputs[empId]
          });
        }
      });
    });
    
    const selectedEmployeeIds = Object.keys(aggregatedEmployeeData).filter(
      (id) => aggregatedEmployeeData[id].selected
    );
    
    if (selectedEmployeeIds.length === 0) {
      alert("Please select at least one employee.");
      return;
    }

    // Sort selected employee IDs alphabetically by first name to maintain consistent check number order
    selectedEmployeeIds.sort((idA, idB) => {
      const empA = employees.find(e => e.id === idA);
      const empB = employees.find(e => e.id === idB);
      if (!empA || !empB) return 0;
      const firstNameA = empA.name.split(' ')[0].toLowerCase();
      const firstNameB = empB.name.split(' ')[0].toLowerCase();
      return firstNameA.localeCompare(firstNameB);
    });

    // Validate all selected employees - check each tab where they're selected
    for (const empId of selectedEmployeeIds) {
      const emp = employees.find((e) => e.id === empId);
      if (!emp) continue;

      // Get data from ALL tabs this employee is selected in
      const empData = aggregatedEmployeeData[empId];
      if (!empData || empData.inputsFromTabs.length === 0) {
        alert(`Please fill in data for ${emp.name}`);
        return;
      }

      // Check if employee has payment data in AT LEAST ONE of their selected tabs
      // Use calculateAmount to verify - if total is $0.00 for all tabs, skip validation
      // (they'll be filtered out by reviewChecks anyway)
      let hasDataInAnyTab = false;
      let totalAmountAcrossAllTabs = 0;
      
      for (const tabInfo of empData.inputsFromTabs) {
        const data = tabInfo.data;
        const tabAmount = parseFloat(calculateAmount(emp, data));
        totalAmountAcrossAllTabs += tabAmount;
        
        if (tabAmount > 0) {
          hasDataInAnyTab = true;
          break; // Found data in at least one tab
        }
      }
      
      // Skip validation for employees with $0.00 total - they'll be filtered out by reviewChecks
      if (totalAmountAcrossAllTabs === 0) {
        continue; // Skip this employee - no check will be created for them
      }
      
      // Only fail validation if employee has NO data in ANY of their selected tabs
      // (This should rarely happen now since we check calculateAmount above, but keep as safety check)
      if (!hasDataInAnyTab) {
        const clientNames = empData.inputsFromTabs.map(t => {
          const client = companyClients.find(c => c.id === t.clientId);
          return client?.name || t.clientId; // Show client ID if name not found
        }).filter(name => name).join(', ');
        alert(`Please enter payment data (hours, per diem, or other pay) for ${emp.name} in at least one of their selected clients: ${clientNames || 'selected clients'}`);
        return;
      }
    }

    setIsCreatingChecks(true);

    try {
      // ✅ FIXED: Get nextCheckNumber from BANK, not company
      logger.log("🔍 DEBUG: Getting nextCheckNumber from BANK...");
      logger.log("🔍 DEBUG: Company ID:", selectedCompanyId);
      
      // First, get the bank associated with this company
      const banksQuery = query(collection(db, "banks"), where("companyId", "==", selectedCompanyId));
      logger.log("🔍 DEBUG: Executing bank query:", {
        collection: "banks",
        whereField: "companyId",
        whereValue: selectedCompanyId
      });
      
      const banksSnapshot = await getDocs(banksQuery);
      logger.log("🔍 DEBUG: Bank query result:", {
        empty: banksSnapshot.empty,
        size: banksSnapshot.size,
        docs: banksSnapshot.docs.filter(doc => doc != null).map(doc => ({ id: doc.id, data: doc.data() }))
      });
      
      if (banksSnapshot.empty) {
        console.error("❌ ERROR: No bank found for company:", selectedCompanyId);
        throw new Error(`No bank found for company ${selectedCompanyId}`);
      }
      
      const bankDoc = banksSnapshot.docs[0];
      const bankId = bankDoc.id;
      const bankData = bankDoc.data();
      
      logger.log("🔍 DEBUG: Found bank:", {
        bankId: bankId,
        bankName: bankData.bankName,
        companyId: bankData.companyId,
        currentNextCheckNumber: bankData.nextCheckNumber
      });
      
      // Get the next check number from bank, but ensure it starts from 100
      let nextCheckNumber = Number(bankData.nextCheckNumber) || Number(bankData.startingCheckNumber) || 1000; // Always use startingCheckNumber
      
      // Force reset if the number is too low (less than 100)
      if (nextCheckNumber < 100) {
        logger.log("🔍 DEBUG: Check number too low, resetting to 100");
        nextCheckNumber = 100;
      }
      
      logger.log("🔍 DEBUG: Using nextCheckNumber from bank:", nextCheckNumber);
      
      // Create checks for each selected employee
      const createdChecks: any[] = [];
      
      for (const empId of selectedEmployeeIds) {
        const emp = employees.find(e => e.id === empId);
        if (!emp) continue;
        
        // Get aggregated data from all tabs for this employee
        const empAggregatedData = aggregatedEmployeeData[empId];
        if (!empAggregatedData || empAggregatedData.inputsFromTabs.length === 0) continue;
        
        // Use the first tab's check date as the default (or current date)
        const checkDate = empAggregatedData.inputsFromTabs[0]?.data.checkDate || new Date();
        // Calculate week key as the Sunday of the week (same logic as View Checks)
        const d = new Date(checkDate);
        const weekKey = new Date(d.setDate(d.getDate() - d.getDay())).toISOString().slice(0, 10);

        // NEW: Build relationship details from ALL tabs
        let relationshipDetails: any[] = [];
        let selectedRelationshipIds: string[] = [];
        let tabClientData: { clientId: string; totalAmount: number }[] = []; // Track which tab/client has the most data

        // Process data from each tab this employee was selected in
        empAggregatedData.inputsFromTabs.forEach(tabInfo => {
          const tabData = tabInfo.data;
          const tabClientId = tabInfo.clientId;
          
          // Calculate total amount for this tab to determine primary tab
          let tabTotal = 0;
          
          if (tabData.selectedRelationshipIds && tabData.selectedRelationshipIds.length > 0) {
            // Get relationships for this tab
            const tabRelationships = emp.clientPayTypeRelationships
              ?.filter(rel => tabData.selectedRelationshipIds?.includes(rel.id) && rel.clientId === tabClientId)
              .map(rel => {
                // Get CURRENT client name (not cached one) for new checks
                const currentClient = clients.find(c => c.id === rel.clientId);
                const clientNameForCheck = currentClient?.name || rel.clientName;
                
                const relData: any = {
                  id: rel.id,
                  clientId: rel.clientId,
                  clientName: clientNameForCheck, // Use current client name for new checks
                  payType: rel.payType,
                  payRate: rel.payRate ? parseFloat(rel.payRate) : 0
                };
                
                // Add relationship-specific hours if available
                const relHours = parseFloat((tabData as any)[`${rel.id}_hours`] || '0');
                if (relHours > 0) relData.hours = relHours;
                
                const relOtHours = parseFloat((tabData as any)[`${rel.id}_otHours`] || '0');
                if (relOtHours > 0) relData.otHours = relOtHours;
                
                const relHolidayHours = parseFloat((tabData as any)[`${rel.id}_holidayHours`] || '0');
                if (relHolidayHours > 0) relData.holidayHours = relHolidayHours;
                
                // Add relationship-specific per diem data if available
                const relPerdiemAmount = parseFloat((tabData as any)[`${rel.id}_perdiemAmount`] || '0');
                if (relPerdiemAmount > 0) relData.perdiemAmount = relPerdiemAmount;
                
                const relPerdiemBreakdown = (tabData as any)[`${rel.id}_perdiemBreakdown`];
                if (relPerdiemBreakdown !== undefined) relData.perdiemBreakdown = relPerdiemBreakdown;
                
                // Add daily per diem amounts if available
                ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].forEach(day => {
                  const dayAmount = parseFloat((tabData as any)[`${rel.id}_perdiem${day}`] || '0');
                  if (dayAmount > 0) relData[`perdiem${day}`] = dayAmount;
                });
                
                // Add PTO amount for per diem relationships (simple dollar amount)
                if (rel.payType === 'perdiem') {
                  const relPtoAmount = parseFloat((tabData as any)[`${rel.id}_ptoAmount`] || '0');
                  if (relPtoAmount > 0) (relData as any).ptoAmount = relPtoAmount;
                }
                
                // Add relationship-specific other pay if available
                const relOtherPay = (tabData as any)[`${rel.id}_otherPay`];
                if (relOtherPay && relOtherPay.length > 0) relData.otherPay = relOtherPay;
                
                // Calculate total for this relationship and add to tab total
                const relPayRate = relData.payRate || 0;
                const relHoursTotal = (relData.hours || 0) + (relData.otHours || 0) * 1.5 + (relData.holidayHours || 0);
                const relHourlyAmount = relHoursTotal * relPayRate;
                const relPerDiemTotal = relData.perdiemAmount || 0;
                const relPtoAmount = (rel.payType === 'perdiem' ? parseFloat((tabData as any)[`${rel.id}_ptoAmount`] || '0') : 0) || 0;
                const relOtherPayTotal = (relData.otherPay || []).reduce((sum: number, item: any) => sum + parseFloat(item.amount || '0'), 0);
                const relTotal = relHourlyAmount + relPerDiemTotal + relPtoAmount + relOtherPayTotal;
                tabTotal += relTotal; // Accumulate for this tab
                
                return relData;
              }) || [];
            
            relationshipDetails.push(...tabRelationships);
            selectedRelationshipIds.push(...(tabData.selectedRelationshipIds || []));
            
            // Track this tab's client and total amount (even if 0, we still want to track the client)
            if (tabClientId) {
              const existingTab = tabClientData.find(t => t.clientId === tabClientId);
              if (existingTab) {
                existingTab.totalAmount += tabTotal;
              } else {
                tabClientData.push({ clientId: tabClientId, totalAmount: tabTotal });
              }
            }
          }
        });
        
        // Determine overall client and pay type
        let clientId = relationshipDetails.length > 1 ? 'multiple' : (relationshipDetails[0]?.clientId || null);
        let payType = relationshipDetails.length > 1 ? 'mixed' : (relationshipDetails[0]?.payType || emp.payType);
        
        // Get the primary client's pay period configuration
        // Use the client from the tab with the most data, or first tab if equal
        let primaryClientId = clientId;
        if (tabClientData.length > 0) {
          // Find the tab/client with the most data
          const primaryTab = tabClientData.reduce((max, tab) => tab.totalAmount > max.totalAmount ? tab : max, tabClientData[0]);
          primaryClientId = primaryTab.clientId;
          logger.log(`🔍 DEBUG: Using tab with most data - Client ID: ${primaryClientId}, Amount: ${primaryTab.totalAmount}`);
        } else if (relationshipDetails.length > 0) {
          // Fallback: use first relationship's client (shouldn't happen if tabs are set up correctly)
          primaryClientId = relationshipDetails[0]?.clientId || clientId;
          logger.log(`🔍 DEBUG: Fallback to first relationship - Client ID: ${primaryClientId}`);
        } else {
          logger.log(`🔍 DEBUG: No relationships found, using clientId: ${clientId}`);
        }
        
        const primaryClient = primaryClientId && primaryClientId !== 'multiple' 
          ? clients.find(c => c.id === primaryClientId)
          : null;
        const payPeriodStartDay = primaryClient?.payPeriodStartDay || 'monday';
        const payPeriodFrequency = primaryClient?.payPeriodFrequency || 'weekly';
        
        logger.log(`🔍 DEBUG: Employee ${emp.name} - Primary client: ${primaryClient?.name} (${primaryClientId}), Pay period: ${payPeriodStartDay}/${payPeriodFrequency}`);
        
        // Calculate week ending date for the memo (previous pay period end)
        const checkDateString = checkDate instanceof Date 
          ? checkDate.toISOString().split('T')[0] 
          : typeof checkDate === 'string' 
            ? checkDate 
            : new Date().toISOString().split('T')[0];
        const weekEndingDate = getPreviousPayPeriodEnd(checkDateString, payPeriodStartDay, payPeriodFrequency);
        const weekEndingStr = weekEndingDate 
          ? `W/E ${weekEndingDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`
          : '';
        
        logger.log(`🔍 DEBUG: ===== CHECK CREATION FOR ${emp.name} =====`);
        logger.log(`🔍 DEBUG: Tab client data:`, tabClientData);
        logger.log(`🔍 DEBUG: Relationship details:`, relationshipDetails.map(r => ({ clientId: r.clientId, clientName: r.clientName, hours: r.hours, perdiemAmount: r.perdiemAmount })));
        logger.log(`🔍 DEBUG: Primary client ID: ${primaryClientId}, Primary client name: ${primaryClient?.name}`);
        logger.log(`🔍 DEBUG: Pay period: ${payPeriodStartDay}/${payPeriodFrequency}`);
        logger.log(`🔍 DEBUG: Check date: ${checkDateString}, Week ending date: ${weekEndingDate?.toLocaleDateString()}, Week ending str: ${weekEndingStr}`);
        logger.log(`🔍 DEBUG: ==========================================`);

        // Calculate aggregated totals from all relationships
        let totalHours = 0;
        let totalOtHours = 0;
        let totalHolidayHours = 0;
        let totalPerDiemAmount = 0;
        let aggregatedOtherPay: OtherPayItem[] = [];
        let aggregatedPerDiemData = {
          perdiemMonday: 0,
          perdiemTuesday: 0,
          perdiemWednesday: 0,
          perdiemThursday: 0,
          perdiemFriday: 0,
          perdiemSaturday: 0,
          perdiemSunday: 0
        };
        
        // Calculate hourly amount per relationship (using relationship-specific pay rates)
        let hourlyAmount = 0;
        
        // Aggregate data from all relationships
        for (const rel of relationshipDetails) {
          if (rel.payType === 'hourly') {
            // Use relationship-specific pay rate for this relationship's hours
            const relPayRate = rel.payRate || 0;
            const relHours = rel.hours || 0;
            const relOtHours = rel.otHours || 0;
            const relHolidayHours = rel.holidayHours || 0;
            
            // Calculate hourly amount for this relationship using its specific pay rate
            hourlyAmount += (relHours * relPayRate) + (relOtHours * relPayRate * 1.5) + (relHolidayHours * relPayRate);
            
            // Still track totals for display purposes
            totalHours += relHours;
            totalOtHours += relOtHours;
            totalHolidayHours += relHolidayHours;
            
            if (rel.otherPay && rel.otherPay.length > 0) {
              aggregatedOtherPay.push(...rel.otherPay);
            }
          } else if (rel.payType === 'perdiem') {
            totalPerDiemAmount += rel.perdiemAmount || 0;
            // Add PTO amount for per diem employees (simple dollar amount)
            totalPerDiemAmount += (rel as any).ptoAmount || 0;
            aggregatedPerDiemData.perdiemMonday += rel.perdiemMonday || 0;
            aggregatedPerDiemData.perdiemTuesday += rel.perdiemTuesday || 0;
            aggregatedPerDiemData.perdiemWednesday += rel.perdiemWednesday || 0;
            aggregatedPerDiemData.perdiemThursday += rel.perdiemThursday || 0;
            aggregatedPerDiemData.perdiemFriday += rel.perdiemFriday || 0;
            aggregatedPerDiemData.perdiemSaturday += rel.perdiemSaturday || 0;
            aggregatedPerDiemData.perdiemSunday += rel.perdiemSunday || 0;
            if (rel.otherPay && rel.otherPay.length > 0) {
              aggregatedOtherPay.push(...rel.otherPay);
            }
          }
        }
        
        // Calculate total amount
        // Add daily per diem breakdown to totalPerDiemAmount if it exists
        const dailyPerDiemTotal = Object.values(aggregatedPerDiemData).reduce((sum, val) => sum + val, 0);
        const finalPerDiemAmount = totalPerDiemAmount + dailyPerDiemTotal;
        
        const otherPayTotal = aggregatedOtherPay.reduce((sum, item) => sum + parseFloat(item.amount || '0'), 0);
        const totalAmount = hourlyAmount + finalPerDiemAmount + otherPayTotal;

        // Prepare check data
        const checkData: any = {
          companyId: selectedCompanyId,
          employeeName: emp.name,
          employeeId: emp.id,
          amount: totalAmount,
          hours: totalHours,
          otHours: totalOtHours,
          holidayHours: totalHolidayHours,
          perdiemAmount: finalPerDiemAmount || 0,
          otherPay: aggregatedOtherPay.map((item: OtherPayItem) => ({
            ...item,
            description: item.description && item.description.trim() !== '' ? item.description : 'Other Pay'
          })),
          memo: empAggregatedData.inputsFromTabs[0]?.data.memo || '',
          paymentMethods: relationshipDetails.map(r => r.payType),
          selectedRelationshipIds: selectedRelationshipIds,
          relationshipDetails: relationshipDetails,
          clientId: clientId,
          payType: payType,
          payRate: relationshipDetails.find(r => r.payType === 'hourly')?.payRate?.toString() || '',
          weekKey: weekKey,
          workWeek: weekEndingStr || getISOWeek(checkDate).toString(), // Store week ending date in format "W/E MM/DD/YYYY"
          date: checkDate instanceof Date ? checkDate.toISOString().split('T')[0] : (typeof checkDate === 'string' ? checkDate : new Date().toISOString().split('T')[0]),
          createdBy: auth.currentUser?.uid,
          reviewed: false,
          paid: false,
          checkNumber: nextCheckNumber + createdChecks.length,
        };

        // Always add daily per diem breakdown fields for consistent data format
        Object.assign(checkData, aggregatedPerDiemData);
        
        logger.log(`🔍 DEBUG: Final checkData for ${emp.name}:`, checkData);
        
        logger.log('🔍 DEBUG: Final checkData being saved to Firestore:', {
          checkId: checkData.id || 'NEW_CHECK',
          employeeId: checkData.employeeId,
          employeeName: checkData.employeeName,
          amount: checkData.amount,
          hours: checkData.hours,
          otHours: checkData.otHours,
          holidayHours: checkData.holidayHours,
          perdiemAmount: checkData.perdiemAmount,
          relationshipDetails: checkData.relationshipDetails,
          relationshipDetailsJSON: JSON.stringify(checkData.relationshipDetails, null, 2)
        });
        checkData.selectedRelationshipIds = selectedRelationshipIds;

        logger.log("🔍 DEBUG: Data after cleanup:", checkData);
        logger.log("🔍 DEBUG: Saving check data with relationships:", relationshipDetails.length, checkData);
        logger.log("🔍 DEBUG: relationshipDetails:", relationshipDetails);
        logger.log("🔍 DEBUG: Check data to be saved:", JSON.stringify(checkData, null, 2));

        // Save to Firestore
        const checkRef = doc(collection(db, "checks"));
        logger.log("🔍 DEBUG: Check reference created:", checkRef.path);
        logger.log("🔍 DEBUG: About to save check with data:", {
          companyId: checkData.companyId,
          employeeName: checkData.employeeName,
          amount: checkData.amount,
          hours: checkData.hours,
          payType: checkData.payType,
          employeeId: checkData.employeeId,
          clientId: checkData.clientId,
          weekKey: checkData.weekKey,
          createdBy: checkData.createdBy,
          reviewed: checkData.reviewed,
          paid: checkData.paid,
          checkNumber: checkData.checkNumber
        });

        try {
          await setDoc(checkRef, checkData);
          logger.log("✅ Check saved successfully!");
          createdChecks.push(checkData);
        } catch (saveError: any) {
          logger.log("❌ Error saving individual check:", {
            message: saveError.message,
            code: saveError.code,
            stack: saveError.stack
          });
          throw saveError; // Re-throw to maintain existing error handling
        }
      }

      // ✅ FIXED: Update BANK's nextCheckNumber, not company
      if (createdChecks.length > 0) {
        logger.log("🔍 DEBUG: About to update BANK with new check number");
        logger.log("🔍 DEBUG: Bank ID:", bankId);
        logger.log("🔍 DEBUG: Current nextCheckNumber:", nextCheckNumber);
        logger.log("🔍 DEBUG: Created checks count:", createdChecks.length);
        logger.log("🔍 DEBUG: New nextCheckNumber will be:", Number(nextCheckNumber) + createdChecks.length);
        
        const bankRef = doc(db, "banks", bankId);
        logger.log("🔍 DEBUG: Bank reference created:", bankRef.path);
        
        try {
          await updateDoc(bankRef, {
            nextCheckNumber: Number(nextCheckNumber) + createdChecks.length
          });
          logger.log("✅ Bank updated successfully!");
        } catch (bankUpdateError: any) {
          logger.log("❌ Error updating bank:", {
            message: bankUpdateError.message,
            code: bankUpdateError.code,
            stack: bankUpdateError.stack
          });
          throw bankUpdateError;
        }
      }

      logger.log("🔍 DEBUG: All operations completed successfully, about to show success message");
      logger.log(`✅ Successfully created ${createdChecks.length} checks`);
      
      // Clear all selections and inputs from all tabs to start fresh
      logger.log("🔍 DEBUG: Clearing all tab data (selections and inputs) to start fresh");
      setTabData({});
      
      // Clear saved data from localStorage since checks were successfully created
      clearSavedData();
      
      // Show floating menu with navigation options
      const company = companies.find(c => c.id === selectedCompanyId);
      const client = createdChecks[0]?.clientId && createdChecks[0].clientId !== 'multiple' 
        ? clients.find(c => c.id === createdChecks[0].clientId) 
        : null;
      
      logger.log('🔍 DEBUG: Success message - selectedCompanyId:', selectedCompanyId);
      logger.log('🔍 DEBUG: Success message - found company:', company?.name);
      logger.log('🔍 DEBUG: Success message - found client:', client?.name);
      
      setFloatingMenu({
        open: true,
        companyId: selectedCompanyId,
        clientId: createdChecks[0]?.clientId && createdChecks[0].clientId !== 'multiple' ? createdChecks[0].clientId : null,
        checkId: createdChecks[0]?.id || null,
        companyName: company?.name || 'Unknown Company',
        clientName: client?.name || (createdChecks[0]?.clientId === 'multiple' ? 'Multiple Clients' : 'Unknown Client')
      });
      
      // Clear selections and inputs
    setSelectedEmployees({});
    setInputs({});
      // Don't reset selectedClientId - keep the current client selected
      
      // Trigger refresh of checks data
      if (onChecksCreated) {
        onChecksCreated();
      }

    } catch (error: any) {
      console.error("❌ Error creating checks:", error);
      console.error("❌ Full error details:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
        name: error.name
      });
      
      // Try to provide more specific error information
      if (error.code === 'permission-denied') {
        console.error("❌ Permission denied - check Firestore rules");
      } else if (error.code === 'unavailable') {
        console.error("❌ Service unavailable - check network connection");
      } else if (error.code === 'not-found') {
        console.error("❌ Collection not found");
      } else if (error.code === 'invalid-argument') {
        console.error("❌ Invalid argument - check data format");
      } else if (error.code === 'failed-precondition') {
        console.error("❌ Failed precondition - check data requirements");
      }
      
      alert("Error creating checks. Please try again.");
    } finally {
      setIsCreatingChecks(false);
    }
  };

  // Calculate review data - extracted to a separate function that returns the data
  const calculateReviewData = () => {
    if (!selectedCompanyId) {
      return null;
    }

    logger.log(`🔍 [Review] selectedClientId: ${selectedClientId}`);
    logger.log(`🔍 [Review] companyClients:`, companyClients.filter(c => c != null).map(c => ({ id: c.id, name: c.name })));
    logger.log(`🔍 [Review] tabData:`, tabData);

    // Aggregate employees from ALL tabs
    const allSelectedEmployeeIds = new Set<string>();
    Object.values(tabData).forEach(tab => {
      Object.keys(tab.selectedEmployees).forEach(empId => {
        if (tab.selectedEmployees[empId]) {
          allSelectedEmployeeIds.add(empId);
        }
      });
    });

    // Check if we have expense entries
    const hasExpenses = (expenseEntries[selectedCompanyId] || []).some(exp => 
      exp.name.trim() !== '' && exp.amount && parseFloat(exp.amount) > 0
    );

    if (allSelectedEmployeeIds.size === 0 && !hasExpenses) {
      return null;
    }

    logger.log(`🔍 [Review] Found ${allSelectedEmployeeIds.size} employees across all tabs`);

    // Prepare review data - aggregate amounts from ALL tabs for each employee
    const reviewDataArray = Array.from(allSelectedEmployeeIds).map(empId => {
      const emp = employees.find((e) => e.id === empId);
      if (!emp) return null;

      let totalAmount = 0;
      let hourlyTotal = 0;
      let perDiemTotal = 0;
      const clientsWorked: string[] = [];
      const clientBreakdown: Array<{
        clientId: string;
        clientName: string;
        companyName: string;
        division?: string;
        amount: number;
        hourlyAmount: number;
        perDiemAmount: number;
        payType: string;
        details: Array<{label: string; value: string}>;
      }> = [];

      // Loop through ALL tabs to aggregate this employee's data
      Object.entries(tabData).forEach(([tabId, tabInfo]) => {
        const data = tabInfo.inputs[empId];
        if (data && tabInfo.selectedEmployees[empId]) {
          // Find the relationship for this client to get relationship-specific data
          const relationship = emp.clientPayTypeRelationships?.find((rel: any) => rel.clientId === tabId);
          
          // Calculate per diem total - use the same logic as calculateAmount
          // IMPORTANT: This should NOT include PTO - PTO is tracked separately
          // First try relationship-specific calculation, then fall back to legacy
          let tabPerDiem = 0;
          
          // Check if data uses selectedRelationshipIds - if so, use that (same as calculateAmount)
          if ((data as any).selectedRelationshipIds && (data as any).selectedRelationshipIds.length > 0) {
            // Data uses selectedRelationshipIds - calculate per diem using the same method as calculateAmount
            (data as any).selectedRelationshipIds.forEach((selectedRelId: string) => {
              const selectedRel = emp.clientPayTypeRelationships?.find((rel: any) => rel.id === selectedRelId);
              if (selectedRel && selectedRel.payType === 'perdiem') {
                // calculatePerDiemTotalForRelationship does NOT include PTO
                const calculatedPerDiem = calculatePerDiemTotalForRelationship(data, selectedRelId);
                tabPerDiem += parseFloat(calculatedPerDiem);
                logger.log(`🔍 [Review] ${emp.name} - tabPerDiem from calculatePerDiemTotalForRelationship: ${calculatedPerDiem}, total tabPerDiem: ${tabPerDiem}`);
              }
            });
          }
          
          // If relationship-specific calculation returned 0 or no selectedRelationshipIds,
          // check legacy fields (calculateAmount does this in its else branch)
          if (tabPerDiem === 0) {
            // Check if there's a relationship for this tab and try relationship-specific fields first
            if (relationship && relationship.payType === 'perdiem') {
              const relId = relationship.id;
              const perdiemAmount = parseFloat((data as any)[`${relId}_perdiemAmount`] || '0');
              const perdiemBreakdown = (data as any)[`${relId}_perdiemBreakdown`];
              
              logger.log(`🔍 [Review] ${emp.name} - Fallback: perdiemAmount=${perdiemAmount}, perdiemBreakdown=${perdiemBreakdown}, ptoAmount=${(data as any)[`${relId}_ptoAmount`] || '0'}`);
              
              if (perdiemBreakdown) {
                // Calculate from daily breakdown
                const dailyTotal = ['perdiemMonday', 'perdiemTuesday', 'perdiemWednesday', 
                                   'perdiemThursday', 'perdiemFriday', 'perdiemSaturday', 'perdiemSunday']
                  .reduce((sum, day) => sum + parseFloat((data as any)[`${relId}_${day}`] || '0'), 0);
                tabPerDiem = dailyTotal;
                logger.log(`🔍 [Review] ${emp.name} - tabPerDiem from daily breakdown: ${tabPerDiem}`);
              } else if (perdiemAmount > 0) {
                tabPerDiem = perdiemAmount;
                logger.log(`🔍 [Review] ${emp.name} - tabPerDiem from perdiemAmount: ${tabPerDiem}`);
              }
            }
            
            // If still 0, use legacy calculation (matches calculateAmount fallback)
            if (tabPerDiem === 0) {
              tabPerDiem = parseFloat(calculatePerDiemTotal(data));
              logger.log(`🔍 [Review] ${emp.name} - tabPerDiem from legacy: ${tabPerDiem}`);
            }
          }
          
          logger.log(`🔍 [Review] ${emp.name} - FINAL tabPerDiem: ${tabPerDiem} (should NOT include PTO)`);
          
          const tabAmount = parseFloat(calculateAmount(emp, data));
          const tabHourly = parseFloat(calculateHourlyTotal(emp, data));
          
          if (tabAmount > 0) {
            totalAmount += tabAmount;
            hourlyTotal += tabHourly;
            perDiemTotal += tabPerDiem;
            
            // Track which client this tab represents with full details
            const client = companyClients.find(c => c.id === tabId);
            if (client) {
              clientsWorked.push(client.name);
              
              // Find the company for this client
              const company = companies.find(c => client.companyIds?.includes(c.id));
              
              // Determine pay type from the relationship's actual payType field
              const payType = relationship?.payType === 'hourly' ? 'Hourly' : 'Per Diem';
              
              // Build detailed line items for this client
              const details: Array<{label: string; value: string}> = [];
              
              if (relationship) {
                const relId = relationship.id;
                
                // Check for hourly data
                const hours = parseFloat((data as any)[`${relId}_hours`] || '0');
                const otHours = parseFloat((data as any)[`${relId}_otHours`] || '0');
                const holidayHours = parseFloat((data as any)[`${relId}_holidayHours`] || '0');
                const rate = parseFloat(relationship.payRate || '0');
                
                if (hours > 0) details.push({ label: `${hours} hrs × $${formatCurrency(rate)}`, value: `$${formatCurrency(hours * rate)}` });
                if (otHours > 0) details.push({ label: `${otHours} OT × $${formatCurrency(rate * 1.5)}`, value: `$${formatCurrency(otHours * rate * 1.5)}` });
                if (holidayHours > 0) details.push({ label: `${holidayHours} holiday × $${formatCurrency(rate)}`, value: `$${formatCurrency(holidayHours * rate)}` });
                
                // Check for per diem data
                const perdiemBreakdown = (data as any)[`${relId}_perdiemBreakdown`];
                if (perdiemBreakdown) {
                  // Daily breakdown mode
                  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                  days.forEach(day => {
                    const dayValue = parseFloat((data as any)[`${relId}_perdiem${day}`] || '0');
                    if (dayValue > 0) {
                      details.push({ label: day, value: `$${formatCurrency(dayValue)}` });
                    }
                  });
                } else {
                  // Full amount mode
                  const perdiemAmount = parseFloat((data as any)[`${relId}_perdiemAmount`] || '0');
                  if (perdiemAmount > 0) {
                    details.push({ label: 'Per Diem', value: `$${formatCurrency(perdiemAmount)}` });
                  }
                }
                
                // Add PTO amount for per diem employees (simple dollar amount, not hours × rate)
                if (relationship.payType === 'perdiem') {
                  const ptoAmount = parseFloat((data as any)[`${relId}_ptoAmount`] || '0');
                  if (ptoAmount > 0) {
                    details.push({ label: 'PTO', value: `$${formatCurrency(ptoAmount)}` });
                  }
                }
                
                // Add Other Pay items
                const otherPay = (data as any)[`${relId}_otherPay`] || [];
                otherPay.forEach((item: any) => {
                  if (item.amount && parseFloat(item.amount) > 0) {
                    details.push({ 
                      label: item.description || 'Other Pay', 
                      value: `$${parseFloat(item.amount).toFixed(2)}` 
                    });
                  }
                });
              } else {
                // Legacy mode - no relationship, check legacy fields
                const hours = parseFloat(data.hours || '0');
                const otHours = parseFloat(data.otHours || '0');
                const holidayHours = parseFloat(data.holidayHours || '0');
                const rate = parseFloat(String(emp.payRate || '0'));
                
                if (hours > 0) details.push({ label: `${hours} hrs × $${formatCurrency(rate)}`, value: `$${formatCurrency(hours * rate)}` });
                if (otHours > 0) details.push({ label: `${otHours} OT × $${formatCurrency(rate * 1.5)}`, value: `$${formatCurrency(otHours * rate * 1.5)}` });
                if (holidayHours > 0) details.push({ label: `${holidayHours} holiday × $${formatCurrency(rate)}`, value: `$${formatCurrency(holidayHours * rate)}` });
                
                // Check for legacy per diem data
                const perdiemBreakdown = data.perdiemBreakdown;
                if (perdiemBreakdown) {
                  // Daily breakdown mode
                  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                  days.forEach(day => {
                    const dayValue = parseFloat((data as any)[`perdiem${day}`] || '0');
                    if (dayValue > 0) {
                      details.push({ label: day, value: `$${formatCurrency(dayValue)}` });
                    }
                  });
                } else {
                  // Full amount mode
                  const perdiemAmount = parseFloat(data.perdiemAmount || '0');
                  if (perdiemAmount > 0) {
                    details.push({ label: 'Per Diem', value: `$${formatCurrency(perdiemAmount)}` });
                  }
                }
                
                // Add legacy Other Pay items
                const otherPay = data.otherPay || [];
                otherPay.forEach((item: any) => {
                  if (item.amount && parseFloat(item.amount) > 0) {
                    details.push({ 
                      label: item.description || 'Other Pay', 
                      value: `$${formatCurrency(parseFloat(item.amount))}` 
                    });
                  }
                });
              }
              
              clientBreakdown.push({
                clientId: client.id,
                clientName: client.name,
                companyName: company?.name || 'Unknown',
                division: client.division || undefined,
                amount: tabAmount,
                hourlyAmount: tabHourly,
                perDiemAmount: tabPerDiem,
                payType: payType,
                details: details
              });
            }
          }
          
          logger.log(`🔍 [Review] ${emp.name} - ${tabId}: $${tabAmount.toFixed(2)} (hourly: $${tabHourly.toFixed(2)}, perdiem: $${tabPerDiem.toFixed(2)})`);
        }
      });

      if (totalAmount === 0) return null;

      logger.log(`🔍 [Review] ${emp.name} - TOTAL: $${totalAmount.toFixed(2)} across ${clientsWorked.length} clients: ${clientsWorked.join(', ')}`);
      logger.log(`🔍 [Review] ${emp.name} - Breakdown:`, clientBreakdown);

      return {
        employee: emp,
        input: {} as PayInput, // Not used for multi-tab aggregation
        calculatedAmount: totalAmount,
        hourlyTotal: hourlyTotal,
        perDiemTotal: perDiemTotal,
        clientsWorked: clientsWorked,
        clientBreakdown: clientBreakdown
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    logger.log(`🔍 [Review] Final review data:`, reviewDataArray.map(r => ({ name: r.employee.name, amount: r.calculatedAmount, clients: r.clientsWorked })));

    // Add expense entries to review data
    const companyExpenses = expenseEntries[selectedCompanyId] || [];
    const validExpenses = companyExpenses.filter(exp => 
      exp.name.trim() !== '' && exp.amount && parseFloat(exp.amount) > 0
    );
    
    const expenseReviewData = validExpenses.map(expense => {
      const expenseAmount = parseFloat(expense.amount) || 0;
      const expenseDate = expense.checkDate instanceof Date 
        ? expense.checkDate 
        : (expense.checkDate ? new Date(expense.checkDate) : (defaultCheckDate ? createLocalDate(defaultCheckDate) : new Date()));
      
      return {
        employee: {
          id: `expense-${expense.id}`,
          name: expense.name,
          payRate: 0,
          payType: 'expense',
          companyId: selectedCompanyId,
          active: true
        } as Employee,
        input: {} as PayInput,
        calculatedAmount: expenseAmount,
        hourlyTotal: 0,
        perDiemTotal: 0,
        clientsWorked: ['Expenses'],
        clientBreakdown: [{
          clientId: 'expenses',
          clientName: 'Expenses',
          companyName: companies.find(c => c.id === selectedCompanyId)?.name || '',
          division: undefined,
          amount: expenseAmount,
          hourlyAmount: 0,
          perDiemAmount: 0,
          payType: 'expense',
          details: [
            // For expenses, use "Other Pay" format so it's correctly categorized
            { 
              label: expense.description || expense.name || 'Expense', 
              value: `$${formatCurrency(expenseAmount)}` 
            }
          ]
        }],
        isExpense: true,
        expenseName: expense.name,
        expenseDescription: expense.description,
        expenseDate: expenseDate
      };
    });

    // Combine employee and expense review data
    const combinedReviewData = [...reviewDataArray, ...expenseReviewData];

    // Sort combined data alphabetically by name (expenses at the end)
    const sortedReviewData = combinedReviewData.sort((a, b) => {
      // Put expenses at the end
      if ((a as any).isExpense && !(b as any).isExpense) return 1;
      if (!(a as any).isExpense && (b as any).isExpense) return -1;
      return a.employee.name.localeCompare(b.employee.name);
    });

    return sortedReviewData;
  };

  const reviewChecks = () => {
    const calculatedData = calculateReviewData();
    if (!calculatedData) {
      if (!selectedCompanyId) {
        alert("Please select a company first.");
      } else {
        const hasEmployees = Object.keys(tabData).length > 0 && 
          Object.values(tabData).some(tab => Object.keys(tab.selectedEmployees || {}).some(id => tab.selectedEmployees[id]));
        const hasExpenses = (expenseEntries[selectedCompanyId] || []).some(exp => 
          exp.name.trim() !== '' && exp.amount && parseFloat(exp.amount) > 0
        );
        if (!hasEmployees && !hasExpenses) {
          alert("Please select at least one employee or add at least one expense.");
        }
      }
      return;
    }
    
    setReviewData(calculatedData);
    setShowReviewPanel(true);
  };

  // Recalculate review data when review panel is restored from localStorage
  // This ensures the review panel shows correctly after a page refresh
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Only recalculate if:
    // 1. Review panel should be shown (restored from localStorage)
    // 2. We have tabData with selected employees or input data
    // 3. Employees and clients are loaded
    // 4. We haven't already restored (prevent infinite loops)
    if (showReviewPanel && 
        !hasRestoredReviewRef.current &&
        Object.keys(tabData).length > 0 && 
        employees.length > 0 && 
        companyClients.length > 0 &&
        selectedCompanyId) {
      
      // Check if we have any selected employees OR input data
      const hasData = Object.values(tabData).some(tab => {
        const hasSelectedEmployees = Object.keys(tab.selectedEmployees || {}).some(id => tab.selectedEmployees[id]);
        const hasInputData = Object.keys(tab.inputs || {}).length > 0;
        return hasSelectedEmployees || hasInputData;
      });
      
      if (hasData && reviewData.length === 0) {
        logger.log('🔄 [Review Restore] Recalculating review data after page refresh', {
          tabDataKeys: Object.keys(tabData),
          employeesCount: employees.length,
          clientsCount: companyClients.length,
          selectedCompanyId,
          hasData
        });
        hasRestoredReviewRef.current = true;
        // Use a small delay to ensure all state is ready
        const timer = setTimeout(() => {
          reviewChecks();
        }, 200);
        return () => clearTimeout(timer);
      } else {
        logger.log('🔄 [Review Restore] Conditions not met:', {
          showReviewPanel,
          hasRestored: hasRestoredReviewRef.current,
          hasTabData: Object.keys(tabData).length > 0,
          hasEmployees: employees.length > 0,
          hasClients: companyClients.length > 0,
          hasSelectedCompany: !!selectedCompanyId,
          hasData,
          reviewDataLength: reviewData.length
        });
      }
    }
    
    // Reset the ref when review panel is closed
    if (!showReviewPanel) {
      hasRestoredReviewRef.current = false;
    }
  }, [showReviewPanel, tabData, employees.length, companyClients.length, selectedCompanyId, reviewData.length]);

  // Handle visibility change to refresh review data when returning from print
  useEffect(() => {
    const handleVisibilityChange = () => {
      // When page becomes visible again (user returns from print dialog)
      if (document.visibilityState === 'visible' && showReviewPanel) {
        logger.log('🔄 [Visibility] Page became visible, refreshing review data');
        // Reset the restore ref to allow recalculation
        hasRestoredReviewRef.current = false;
        // Force recalculation of review data
        if (Object.keys(tabData).length > 0 && 
            employees.length > 0 && 
            companyClients.length > 0 &&
            selectedCompanyId) {
          // Small delay to ensure state is stable
          setTimeout(() => {
            reviewChecks();
          }, 100);
        }
      }
    };

    // Also handle window focus event (alternative to visibility API)
    const handleFocus = () => {
      if (showReviewPanel) {
        logger.log('🔄 [Focus] Window focused, refreshing review data');
        hasRestoredReviewRef.current = false;
        if (Object.keys(tabData).length > 0 && 
            employees.length > 0 && 
            companyClients.length > 0 &&
            selectedCompanyId) {
          setTimeout(() => {
            reviewChecks();
          }, 100);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [showReviewPanel, tabData, employees.length, companyClients.length, selectedCompanyId]);

  const generateReviewPDF = async () => {
    // Always recalculate review data before generating PDF to ensure it's up-to-date
    logger.log('🔄 [PDF] Recalculating review data before generating PDF');
    const freshReviewData = calculateReviewData();
    
    if (!freshReviewData || freshReviewData.length === 0) {
      alert("No review data available to print. Please review checks first.");
      return;
    }
    
    // Also update state for UI consistency
    setReviewData(freshReviewData);
    
    // Use the freshly calculated data for PDF generation
    const dataToUse = freshReviewData;

    // Helper function to format numbers with commas
    const formatNumber = (num: number, decimals: number = 2): string => {
      return num.toLocaleString('en-US', { 
        minimumFractionDigits: decimals, 
        maximumFractionDigits: decimals 
      });
    };

    try {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]); // US Letter size
      const { width, height } = page.getSize();
      
      // Font setup
      const font = await pdfDoc.embedFont('Helvetica');
      const boldFont = await pdfDoc.embedFont('Helvetica-Bold');
      
      let yPosition = height - 50;
      const margin = 50;
      const lineHeight = 14;
      const sectionSpacing = 20;
      const footerHeight = 30;
      
      // Track page numbers
      let pageNumber = 0;
      const pages: any[] = [];
      
      // Helper function to add footer with page number
      const addFooter = (targetPage: any, pageNum: number, totalPages: number) => {
        const footerText = `Page ${pageNum} of ${totalPages}`;
        const textWidth = font.widthOfTextAtSize(footerText, 9);
        const footerX = (width - textWidth) / 2; // Center the footer
        targetPage.drawText(footerText, { 
          x: footerX, 
          y: footerHeight, 
          size: 9, 
          font: font 
        });
      };
      
      // Helper function to add text with word wrapping
      const addText = (text: string, x: number, y: number, size: number, isBold: boolean = false, maxWidth?: number, targetPage = page) => {
        const fontToUse = isBold ? boldFont : font;
        if (maxWidth) {
          // Simple word wrapping
          const words = text.split(' ');
          let line = '';
          let currentY = y;
          for (const word of words) {
            const testLine = line + (line ? ' ' : '') + word;
            const textWidth = fontToUse.widthOfTextAtSize(testLine, size);
            if (textWidth > maxWidth && line) {
              targetPage.drawText(line, { x, y: currentY, size, font: fontToUse });
              line = word;
              currentY -= size + 2;
            } else {
              line = testLine;
            }
          }
          if (line) {
            targetPage.drawText(line, { x, y: currentY, size, font: fontToUse });
          }
          return currentY;
        } else {
          targetPage.drawText(text, { x, y, size, font: fontToUse });
          return y;
        }
      };
      
      // Header
      let currentPage = page;
      pageNumber = 1;
      pages.push(currentPage);
      const companyName = companies.find(c => c.id === selectedCompanyId)?.name || 'Unknown Company';
      addText('Payroll Checks Review', margin, yPosition, 18, true, undefined, currentPage);
      yPosition -= 25;
      addText(`Company: ${companyName}`, margin, yPosition, 12, false, undefined, currentPage);
      yPosition -= 15;
      addText(`Generated: ${new Date().toLocaleString()}`, margin, yPosition, 10, false, undefined, currentPage);
      yPosition -= sectionSpacing * 2;
      
      // Get all unique clients
      const allClientsMap = new Map<string, { clientId: string; clientName: string; division?: string }>();
      dataToUse.forEach(item => {
        if (item.clientBreakdown) {
          item.clientBreakdown.forEach(breakdown => {
            const uniqueKey = breakdown.clientId;
            if (!allClientsMap.has(uniqueKey)) {
              allClientsMap.set(uniqueKey, {
                clientId: breakdown.clientId,
                clientName: breakdown.clientName,
                division: (breakdown as any).division
              });
            }
          });
        }
      });
      
      const clientList = Array.from(allClientsMap.keys());
      const clientTotals = clientList.map(uniqueKey => {
        const clientInfo = allClientsMap.get(uniqueKey)!;
        const total = dataToUse.reduce((sum, item) => {
          const breakdown = item.clientBreakdown?.find(b => b.clientId === uniqueKey);
          return sum + (breakdown?.amount || 0);
        }, 0);
        const displayName = clientInfo.division && clientInfo.division.trim()
          ? `${clientInfo.clientName} (${clientInfo.division})`
          : clientInfo.clientName;
        return { 
          uniqueKey,
          clientId: clientInfo.clientId,
          clientName: clientInfo.clientName,
          division: clientInfo.division,
          displayName,
          total 
        };
      }).sort((a, b) => a.displayName.localeCompare(b.displayName));
      
      // Sort clientList to match the sorted clientTotals order
      const sortedClientList = clientTotals.map(item => item.uniqueKey);
      
      // Summary by Client/Department
      addText('Summary by Client/Department', margin, yPosition, 14, true, undefined, currentPage);
      yPosition -= 20;
      
      // Table header
      addText('Client/Department', margin, yPosition, 10, true, undefined, currentPage);
      addText('Total Amount', width - margin - 150, yPosition, 10, true, undefined, currentPage);
      addText('Employees', width - margin - 50, yPosition, 10, true, undefined, currentPage);
      yPosition -= 15;
      
      // Draw line
      currentPage.drawLine({
        start: { x: margin, y: yPosition },
        end: { x: width - margin, y: yPosition },
        thickness: 1,
        color: rgb(0, 0, 0)
      });
      yPosition -= 10;
      
      // Client totals
      clientTotals.forEach(({ uniqueKey, displayName, total }) => {
        if (yPosition < 100 + footerHeight) {
          // New page
          currentPage = pdfDoc.addPage([612, 792]);
          pageNumber++;
          pages.push(currentPage);
          yPosition = height - 50;
        }
        
        const employeeCount = dataToUse.filter(item => 
          item.clientBreakdown?.some(b => b.clientId === uniqueKey)
        ).length;
        
        addText(displayName, margin, yPosition, 10, false, undefined, currentPage);
        addText(`$${formatNumber(total, 2)}`, width - margin - 150, yPosition, 10, false, undefined, currentPage);
        addText(`${formatNumber(employeeCount, 0)}`, width - margin - 50, yPosition, 10, false, undefined, currentPage);
        yPosition -= 15;
      });
      
      // Grand Total
      yPosition -= 5;
      currentPage.drawLine({
        start: { x: margin, y: yPosition },
        end: { x: width - margin, y: yPosition },
        thickness: 1,
        color: rgb(0, 0, 0)
      });
      yPosition -= 10;
      
      const grandTotal = dataToUse.reduce((sum, item) => sum + item.calculatedAmount, 0);
      addText('GRAND TOTAL', margin, yPosition, 12, true, undefined, currentPage);
      addText(`$${formatNumber(grandTotal, 2)}`, width - margin - 150, yPosition, 12, true, undefined, currentPage);
      addText(`${formatNumber(reviewData.length, 0)}`, width - margin - 50, yPosition, 12, true, undefined, currentPage);
      
      // Employee Breakdown for each client - each client gets its own page (starting after summary)
      sortedClientList.forEach((uniqueKey, index) => {
        // Always start each client on a new page
        currentPage = pdfDoc.addPage([612, 792]);
        pageNumber++;
        pages.push(currentPage);
        yPosition = height - 50;
        
        const clientInfo = allClientsMap.get(uniqueKey)!;
        const displayName = clientInfo.division && clientInfo.division.trim()
          ? `${clientInfo.clientName} (${clientInfo.division})`
          : clientInfo.clientName;
        
        // Get work week and week ending from tabData
        const tabInfo = tabData[uniqueKey];
        let workWeekStr = '';
        let weekEndingStr = '';
        let departmentName = clientInfo.division || clientInfo.clientName;
        
        if (tabInfo) {
          // Get check date from first employee's input data
          const firstEmployeeId = Object.keys(tabInfo.inputs || {})[0];
          const inputData = firstEmployeeId ? tabInfo.inputs[firstEmployeeId] : null;
          
          if (inputData?.checkDate) {
            const checkDate = inputData.checkDate instanceof Date 
              ? inputData.checkDate 
              : new Date(inputData.checkDate);
            
            // Get client to determine pay period settings
            const client = companyClients.find(c => c.id === uniqueKey);
            const payPeriodStartDay = client?.payPeriodStartDay || 'monday';
            const payPeriodFrequency = client?.payPeriodFrequency || 'weekly';
            
            // Calculate week ending date
            const checkDateString = checkDate.toISOString().split('T')[0];
            const weekEndingDate = getPreviousPayPeriodEnd(checkDateString, payPeriodStartDay, payPeriodFrequency);
            
            if (weekEndingDate) {
              weekEndingStr = weekEndingDate.toLocaleDateString('en-US', { 
                month: '2-digit', 
                day: '2-digit', 
                year: 'numeric' 
              });
            }
            
            // Calculate work week number
            const periodInfo = getWorkWeekNumber(checkDateString, payPeriodStartDay, payPeriodFrequency);
            if (periodInfo) {
              workWeekStr = `Work Week ${periodInfo.weekNumber}`;
            }
          }
        }
        
        // Header with department name, work week, and week ending - displayed line by line in bold, centered
        const headerFontSize = 16;
        if (departmentName) {
          const deptText = `${departmentName}`;
          const textWidth = boldFont.widthOfTextAtSize(deptText, headerFontSize);
          const centerX = (width - textWidth) / 2;
          addText(deptText, centerX, yPosition, headerFontSize, true, undefined, currentPage);
          yPosition -= 22;
        }
        if (workWeekStr) {
          const textWidth = boldFont.widthOfTextAtSize(workWeekStr, headerFontSize);
          const centerX = (width - textWidth) / 2;
          addText(workWeekStr, centerX, yPosition, headerFontSize, true, undefined, currentPage);
          yPosition -= 22;
        }
        if (weekEndingStr) {
          const weekEndText = `W/E ${weekEndingStr}`;
          const textWidth = boldFont.widthOfTextAtSize(weekEndText, headerFontSize);
          const centerX = (width - textWidth) / 2;
          addText(weekEndText, centerX, yPosition, headerFontSize, true, undefined, currentPage);
          yPosition -= 22;
        }
        
        const employeesForClient = dataToUse.filter(item => {
          return item.clientBreakdown?.some(b => b.clientId === uniqueKey);
        });
        
        // Check if this is an expenses client - if so, skip table entirely
        const isExpensesClient = uniqueKey === 'expenses';
        
        if (isExpensesClient) {
          // For expenses, show simple format without table headers, lines, or grand total
          employeesForClient.forEach(item => {
            const breakdown = item.clientBreakdown?.find(b => b.clientId === uniqueKey);
            if (!breakdown) return;
            
            const isExpense = (item as any).isExpense === true || breakdown.payType === 'expense';
            if (!isExpense) return;
            
            if (yPosition < 150 + footerHeight) {
              currentPage = pdfDoc.addPage([612, 792]);
              pageNumber++;
              pages.push(currentPage);
              yPosition = height - 50;
            }
            
            const expenseName = (item as any).expenseName || item.employee.name;
            const expenseDescription = (item as any).expenseDescription || '';
            const expenseAmount = breakdown.amount || 0;
            
            // Get check date from expenseDate property
            const expenseDate = (item as any).expenseDate;
            let checkDate = '';
            if (expenseDate) {
              const date = expenseDate instanceof Date 
                ? expenseDate 
                : new Date(expenseDate);
              checkDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
            } else {
              // Fallback to defaultCheckDate if available
              if (defaultCheckDate) {
                const date = createLocalDate(defaultCheckDate);
                checkDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
              }
            }
            
            // Show expense info in simple format
            addText(expenseName, margin, yPosition, 10, true, undefined, currentPage);
            yPosition -= 15;
            if (expenseDescription) {
              addText(`Description: ${expenseDescription}`, margin + 20, yPosition, 9, false, undefined, currentPage);
              yPosition -= 12;
            }
            addText(`Date: ${checkDate || 'N/A'}`, margin + 20, yPosition, 9, false, undefined, currentPage);
            yPosition -= 12;
            addText(`Amount: $${formatNumber(expenseAmount, 2)}`, margin + 20, yPosition, 10, true, undefined, currentPage);
            yPosition -= 20;
          });
          
          // Skip table headers, lines, and grand total for expenses
          yPosition -= sectionSpacing * 2;
        } else {
          // Regular employees - show table format
          // Add some spacing before the table
          yPosition -= 10;
          
          // Table header - INDIVIDUAL CHECKS format
          // Column widths optimized to prevent overlap: Employee, Hr, OT, PTO, $Hr, $OT, $PTO, Other, Per Diem, Amount
          const colWidths = [90, 35, 35, 35, 35, 48, 48, 50, 60, 62]; // Total: 502px (PTO matches Hr/OT spacing, $ columns narrower)
          let xPos = margin;
          const headers = ['Employee', 'Hr', 'OT', 'PTO', '$Hr', '$OT', '$PTO', 'Other', 'Per Diem', 'Amount'];
          headers.forEach((header, idx) => {
            if (idx === 0) {
              // Employee - left aligned
              addText(header, xPos, yPosition, 9, true, undefined, currentPage);
            } else if (idx === headers.length - 1) {
              // Amount - right aligned
              addText(header, xPos + colWidths[idx] - 5, yPosition, 9, true, undefined, currentPage);
            } else {
              // Numeric columns - right aligned
              addText(header, xPos + colWidths[idx] - 3, yPosition, 9, true, undefined, currentPage);
            }
            xPos += colWidths[idx];
          });
          yPosition -= 15;
          
          // Draw line
          currentPage.drawLine({
            start: { x: margin, y: yPosition },
            end: { x: margin + colWidths.reduce((a, b) => a + b, 0), y: yPosition },
            thickness: 1,
            color: rgb(0, 0, 0)
          });
          yPosition -= 10;
          
          // Initialize grand totals for this client
          let grandTotalHours = 0;
          let grandTotalOtHours = 0;
          let grandTotalHolidayHours = 0;
          let grandTotalHourlyAmount = 0;
          let grandTotalOtAmount = 0;
          let grandTotalHolidayAmount = 0;
          let grandTotalOtherPay = 0;
          let grandTotalPerDiem = 0;
          let grandTotalAmount = 0;
          
          employeesForClient.forEach(item => {
            const breakdown = item.clientBreakdown?.find(b => b.clientId === uniqueKey);
            if (!breakdown) return;
            
            // Regular employee - continue with table rendering
            if (yPosition < 100 + footerHeight) {
            currentPage = pdfDoc.addPage([612, 792]);
            pageNumber++;
            pages.push(currentPage);
            yPosition = height - 50;
            // Re-add headers
            xPos = margin;
            headers.forEach((header, idx) => {
              if (idx === 0) {
                // Employee - left aligned
                addText(header, xPos, yPosition, 9, true, undefined, currentPage);
              } else if (idx === headers.length - 1) {
                // Amount - right aligned
                addText(header, xPos + colWidths[idx] - 5, yPosition, 9, true, undefined, currentPage);
              } else {
                // Numeric columns - right aligned
                addText(header, xPos + colWidths[idx] - 3, yPosition, 9, true, undefined, currentPage);
              }
              xPos += colWidths[idx];
            });
            yPosition -= 15;
            currentPage.drawLine({
              start: { x: margin, y: yPosition },
              end: { x: margin + colWidths.reduce((a, b) => a + b, 0), y: yPosition },
              thickness: 1,
              color: rgb(0, 0, 0)
            });
            yPosition -= 10;
          }
          
          // Parse details to extract values
          let hours = 0;
          let otHours = 0;
          let holidayHours = 0;
          let hourlyAmount = 0;
          let otAmount = 0;
          let holidayAmount = 0;
          let otherPay = 0;
          let otherPayItems: Array<{description: string; amount: number}> = [];
          // Use perDiemAmount directly from breakdown (more reliable than parsing from details)
          let perDiem = breakdown.perDiemAmount || 0;

          // Get inputData FIRST - PRIMARY SOURCE for hours (same as review table)
          const tabId = uniqueKey;
          const tabInfo = tabData[tabId];
          const inputData = tabInfo?.inputs[item.employee.id];
          
          if (inputData) {
            // PRIMARY SOURCE: Read hours directly from inputData (most reliable)
            const relationship = item.employee.clientPayTypeRelationships?.find((rel: any) => rel.clientId === uniqueKey);
            
            // Check if data uses selectedRelationshipIds (same pattern as review table)
            if ((inputData as any).selectedRelationshipIds && (inputData as any).selectedRelationshipIds.length > 0) {
              // Data uses selectedRelationshipIds - find the relationship that matches this clientId
              (inputData as any).selectedRelationshipIds.forEach((selectedRelId: string) => {
                const selectedRel = item.employee.clientPayTypeRelationships?.find((rel: any) => rel.id === selectedRelId);
                if (selectedRel && selectedRel.clientId === uniqueKey && selectedRel.payType === 'hourly') {
                  hours = parseFloat((inputData as any)[`${selectedRelId}_hours`] || '0') || 0;
                  otHours = parseFloat((inputData as any)[`${selectedRelId}_otHours`] || '0') || 0;
                  holidayHours = parseFloat((inputData as any)[`${selectedRelId}_holidayHours`] || '0') || 0;
                  
                  // Calculate amounts from hours
                  const rate = parseFloat(selectedRel.payRate || '0');
                  if (hours > 0) hourlyAmount = hours * rate;
                  if (otHours > 0) otAmount = otHours * rate * 1.5;
                  if (holidayHours > 0) holidayAmount = holidayHours * rate;
                }
              });
            } else if (relationship) {
              // Direct relationship lookup (no selectedRelationshipIds)
              const relId = relationship.id;
              hours = parseFloat((inputData as any)[`${relId}_hours`] || '0') || 0;
              otHours = parseFloat((inputData as any)[`${relId}_otHours`] || '0') || 0;
              holidayHours = parseFloat((inputData as any)[`${relId}_holidayHours`] || '0') || 0;
              
              // Calculate amounts from hours
              const rate = parseFloat(relationship.payRate || '0');
              if (hours > 0) hourlyAmount = hours * rate;
              if (otHours > 0) otAmount = otHours * rate * 1.5;
              if (holidayHours > 0) holidayAmount = holidayHours * rate;
            } else {
              // Legacy mode - no relationship
              hours = parseFloat((inputData as any).hours || '0') || 0;
              otHours = parseFloat((inputData as any).otHours || '0') || 0;
              holidayHours = parseFloat((inputData as any).holidayHours || '0') || 0;
              
              // Calculate amounts from hours
              const rate = parseFloat(String(item.employee.payRate || '0'));
              if (hours > 0) hourlyAmount = hours * rate;
              if (otHours > 0) otAmount = otHours * rate * 1.5;
              if (holidayHours > 0) holidayAmount = holidayHours * rate;
            }
            
            // Now parse breakdown.details ONLY for Other Pay and PTO (hours already read from inputData above)
            if (breakdown.details && breakdown.details.length > 0) {
              breakdown.details.forEach((detail) => {
                const label = detail.label.toLowerCase();
                const value = detail.value;
                
                // Extract PTO amount for per diem employees (format: "PTO: $100.00")
                if (label.includes('pto') && !label.includes('holiday')) {
                  const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                  if (amountMatch) {
                    holidayAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
                    holidayHours = 0;
                  }
                }
                
                // Extract Other Pay - preserve descriptions (exclude PTO)
                if (!label.includes('hrs') && !label.includes('ot') && !label.includes('holiday') && 
                    !label.includes('per diem') && !label.includes('pto') &&
                    !['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(label.trim()) &&
                    value.includes('$')) {
                  const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                  if (amountMatch) {
                    const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                    otherPay += amount;
                    // Preserve the description (use original label, not lowercased)
                    const description = detail.label.trim() || 'Other Pay';
                    otherPayItems.push({ description, amount });
                  }
                }
              });
            }
          } else if (breakdown.details && breakdown.details.length > 0) {
            // Fallback: If no inputData, try parsing from breakdown.details (less reliable)
            breakdown.details.forEach((detail) => {
              const label = detail.label.toLowerCase();
              const value = detail.value;
              
              // Extract regular hours
              if (label.includes('hrs') && !label.includes('ot') && !label.includes('holiday')) {
                const hrsMatch = detail.label.match(/(\d+(?:\.\d+)?)\s*hrs/i);
                if (hrsMatch) hours = parseFloat(hrsMatch[1]);
                const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                if (amountMatch) hourlyAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
              }
              
              // Extract OT hours
              if (label.includes('ot') && !label.includes('holiday')) {
                let otMatch = detail.label.match(/^(\d+(?:\.\d+)?)\s+OT/i);
                if (!otMatch) {
                  otMatch = detail.label.match(/(\d+(?:\.\d+)?)\s+OT/i);
                }
                if (!otMatch) {
                  otMatch = detail.label.match(/(\d+(?:\.\d+)?)\s*OT/i);
                }
                if (!otMatch) {
                  otMatch = detail.label.match(/(\d+(?:\.\d+)?)OT/i);
                }
                if (otMatch && otMatch[1]) {
                  const parsedHours = parseFloat(otMatch[1]);
                  if (!isNaN(parsedHours)) {
                    otHours = parsedHours;
                  }
                }
                const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                if (amountMatch) otAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
              }
              
              // Extract Holiday hours
              if (label.includes('holiday')) {
                const holidayMatch = detail.label.match(/(\d+(?:\.\d+)?)\s*holiday/i);
                if (holidayMatch) holidayHours = parseFloat(holidayMatch[1]);
                const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                if (amountMatch) holidayAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
              }
              
              // Extract PTO amount
              if (label.includes('pto') && !label.includes('holiday')) {
                const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                if (amountMatch) {
                  holidayAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
                  holidayHours = 0;
                }
              }
              
              // Extract Other Pay
              if (!label.includes('hrs') && !label.includes('ot') && !label.includes('holiday') && 
                  !label.includes('per diem') && !label.includes('pto') &&
                  !['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(label.trim()) &&
                  value.includes('$')) {
                const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                if (amountMatch) {
                  const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                  otherPay += amount;
                  const description = detail.label.trim() || 'Other Pay';
                  otherPayItems.push({ description, amount });
                }
              }
            });
          }

          // Accumulate grand totals
          grandTotalHours += hours;
          grandTotalOtHours += otHours;
          grandTotalHolidayHours += holidayHours;
          grandTotalHourlyAmount += hourlyAmount;
          grandTotalOtAmount += otAmount;
          grandTotalHolidayAmount += holidayAmount;
          grandTotalOtherPay += otherPay;
          grandTotalPerDiem += perDiem;
          grandTotalAmount += breakdown.amount || 0;

          // Get check date from tabData (inputData already retrieved above)
          let checkDate = '';
          if (inputData?.checkDate) {
            const date = new Date(inputData.checkDate);
            checkDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
          }
          
          // Print row data with proper alignment
          xPos = margin;
          
          // Employee - left aligned
          addText(item.employee.name, xPos, yPosition, 9, false, undefined, currentPage);
          xPos += colWidths[0];
          
          // Hr - right aligned (with comma formatting)
          addText(hours > 0 ? formatNumber(hours, 2) : '0.00', xPos + colWidths[1] - 3, yPosition, 9, false, undefined, currentPage);
          xPos += colWidths[1];
          
          // OT - right aligned (with comma formatting)
          addText(otHours > 0 ? formatNumber(otHours, 2) : '0.00', xPos + colWidths[2] - 3, yPosition, 9, false, undefined, currentPage);
          xPos += colWidths[2];
          
          // PTO - right aligned (with comma formatting)
          addText(holidayHours > 0 ? formatNumber(holidayHours, 2) : '0.00', xPos + colWidths[3] - 1, yPosition, 9, false, undefined, currentPage);
          xPos += colWidths[3];
          
          // $Hr - right aligned (with comma formatting)
          addText(hourlyAmount > 0 ? `$${formatNumber(hourlyAmount, 2)}` : '-', xPos + colWidths[4] - 1, yPosition, 9, false, undefined, currentPage);
          xPos += colWidths[4];
          
          // $OT - right aligned (with comma formatting)
          addText(otAmount > 0 ? `$${formatNumber(otAmount, 2)}` : '-', xPos + colWidths[5] - 3, yPosition, 9, false, undefined, currentPage);
          xPos += colWidths[5];
          
          // $PTO - right aligned (with comma formatting)
          addText(holidayAmount > 0 ? `$${formatNumber(holidayAmount, 2)}` : '-', xPos + colWidths[6] - 3, yPosition, 9, false, undefined, currentPage);
          xPos += colWidths[6];
          
          // Other - right aligned, show descriptions if available
          // Store the starting yPosition for this row
          const rowStartY = yPosition;
          let otherPayBottomY = yPosition;
          
          // Calculate the right edge of the Other column
          const otherColRightEdge = xPos + colWidths[7] - 3;
          
          if (otherPay > 0) {
            if (otherPayItems.length > 0) {
              let currentY = yPosition;
              // Show each item on a line, right-aligned
              otherPayItems.forEach((item) => {
                const text = `${item.description}: $${formatNumber(item.amount, 2)}`;
                const textWidth = font.widthOfTextAtSize(text, 8);
                // Right-align: start from right edge minus text width
                addText(text, otherColRightEdge - textWidth, currentY, 8, false, undefined, currentPage);
                currentY -= 8;
              });
              otherPayBottomY = currentY - 10;
            } else {
              // Fallback: just show total amount (with comma formatting)
              const text = `$${formatNumber(otherPay, 2)}`;
              const textWidth = font.widthOfTextAtSize(text, 9);
              addText(text, otherColRightEdge - textWidth, yPosition, 9, false, undefined, currentPage);
              otherPayBottomY = yPosition - 10;
            }
          } else {
            addText('-', otherColRightEdge - font.widthOfTextAtSize('-', 9), yPosition, 9, false, undefined, currentPage);
            otherPayBottomY = yPosition - 10;
          }
          xPos += colWidths[7];
          
          // Per Diem - right aligned (drawn at original yPosition to align with first line of Other Pay)
          addText(perDiem > 0 ? `$${formatNumber(perDiem, 2)}` : '-', xPos + colWidths[8] - 3, rowStartY, 9, false, undefined, currentPage);
          xPos += colWidths[8];
          
          // Amount - right aligned (bold) (drawn at original yPosition to align with first line of Other Pay)
          addText(`$${formatNumber(breakdown.amount, 2)}`, xPos + colWidths[9] - 5, rowStartY, 9, true, undefined, currentPage);
          
          // Adjust yPosition for next row based on how many lines we used for Other Pay
          // Standard row height is 15, but if we used more lines, adjust accordingly
          const linesUsed = Math.max(1, Math.ceil((rowStartY - otherPayBottomY) / 8));
          yPosition = otherPayBottomY - 5;
        });
        
        // Grand Total Row (shows totals for all columns) - only for non-expense clients
        yPosition -= 5;
        const totalWidth = colWidths.reduce((a, b) => a + b, 0); // Total: 500px
        // Calculate the right edge - extend line to cover the full Amount column
        // Amount column is the last column (colWidths[9] = 60px)
        // The Amount text is right-aligned at: margin + sum(colWidths[0..8]) + colWidths[9] - 5
        // The column extends to: margin + totalWidth (margin + 500)
        // Extend the line to ensure it covers the full Amount column including any right-aligned text
        // Use the same calculation as the header line but extend slightly more for visual completeness
        const lineEnd = margin + totalWidth + 20; // Extend 20px beyond column end to ensure full coverage
        // Draw line extending all the way to the end of the Amount column
        currentPage.drawLine({
          start: { x: margin, y: yPosition },
          end: { x: lineEnd, y: yPosition },
          thickness: 1.5, // Slightly thicker line for GRAND TOTAL separator
          color: rgb(0, 0, 0)
        });
        yPosition -= 10;
        
        // Draw grand total row
        xPos = margin;
        addText('GRAND TOTAL', xPos, yPosition, 10, true, undefined, currentPage);
        xPos += colWidths[0];
        
        // Hr - right aligned (with comma formatting)
        addText(grandTotalHours > 0 ? formatNumber(grandTotalHours, 2) : '0.00', xPos + colWidths[1] - 3, yPosition, 10, true, undefined, currentPage);
        xPos += colWidths[1];
        
        // OT - right aligned (with comma formatting)
        addText(grandTotalOtHours > 0 ? formatNumber(grandTotalOtHours, 2) : '0.00', xPos + colWidths[2] - 3, yPosition, 10, true, undefined, currentPage);
        xPos += colWidths[2];
        
        // PTO - right aligned (with comma formatting)
        addText(grandTotalHolidayHours > 0 ? formatNumber(grandTotalHolidayHours, 2) : '0.00', xPos + colWidths[3] - 1, yPosition, 10, true, undefined, currentPage);
        xPos += colWidths[3];
        
        // $Hr - right aligned (with comma formatting)
        addText(grandTotalHourlyAmount > 0 ? `$${formatNumber(grandTotalHourlyAmount, 2)}` : '-', xPos + colWidths[4] - 1, yPosition, 10, true, undefined, currentPage);
        xPos += colWidths[4];
        
        // $OT - right aligned (with comma formatting)
        addText(grandTotalOtAmount > 0 ? `$${formatNumber(grandTotalOtAmount, 2)}` : '-', xPos + colWidths[5] - 3, yPosition, 10, true, undefined, currentPage);
        xPos += colWidths[5];
        
        // $PTO - right aligned (with comma formatting)
        addText(grandTotalHolidayAmount > 0 ? `$${formatNumber(grandTotalHolidayAmount, 2)}` : '-', xPos + colWidths[6] - 3, yPosition, 10, true, undefined, currentPage);
        xPos += colWidths[6];
        
        // Other - right aligned (with comma formatting)
        addText(grandTotalOtherPay > 0 ? `$${formatNumber(grandTotalOtherPay, 2)}` : '-', xPos + colWidths[7] - 3, yPosition, 10, true, undefined, currentPage);
        xPos += colWidths[7];
        
        // Per Diem - right aligned (with comma formatting)
        addText(grandTotalPerDiem > 0 ? `$${formatNumber(grandTotalPerDiem, 2)}` : '-', xPos + colWidths[8] - 3, yPosition, 10, true, undefined, currentPage);
        xPos += colWidths[8];
        
        // Amount - right aligned (bold) (with comma formatting)
        addText(`$${formatNumber(grandTotalAmount, 2)}`, xPos + colWidths[9] - 5, yPosition, 10, true, undefined, currentPage);
        
        yPosition -= sectionSpacing * 2;
        }
      });
      
      // Add footers to all pages
      const totalPages = pages.length;
      pages.forEach((page, index) => {
        addFooter(page, index + 1, totalPages);
      });
      
      // Generate PDF and download
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Payroll_Review_${companyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  };

  return (
    <Box sx={{ 
      p: 3, 
      width: '100%',
      maxWidth: '100%',
      px: 3
    }}>
      <Typography variant="h4" gutterBottom>
        Batch Checks
      </Typography>

      {!selectedCompanyId ? (
        <>

          
          <Typography variant="h5" gutterBottom sx={{ mb: 3, fontWeight: 'bold', color: 'text.primary' }}>
            Select a Company
          </Typography>
          
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
            gap: 3,
            maxWidth: 1200
          }}>
            {companies.map((c) => (
              <Box
                key={c.id}
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
                onClick={() => {
                  setSelectedCompanyId(c.id);
                  // Auto-select the first client of this company
                  const companyClients = clients.filter(client => client.companyIds?.includes(c.id));
                  if (companyClients.length > 0) {
                    setSelectedClientId(companyClients[0].id);
                  }
                }}
              >
                {/* Company Logo */}
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  mb: 2,
                  position: 'relative'
                }}>
                  {c.logoBase64 ? (
                    <Avatar
                      src={c.logoBase64}
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
                      {c.name ? c.name[0].toUpperCase() : '?'}
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
                {c.name}
                </Typography>
                
                {/* Company Info */}
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Click to create checks for this company
                  </Typography>
                </Box>
                
                {/* Employee Count Badge */}
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
                  {employees.filter(emp => 
                    emp.companyId === c.id || 
                    (emp.companyIds && emp.companyIds.includes(c.id))
                  ).length} employees
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
                      Creating batch checks for employees
                    </Typography>
                  </Box>
          <Button
            variant="outlined"
            onClick={() => setSelectedCompanyId(null)}
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
          {/* Use Previous Batch Button - Only show for single clients */}
         
            <Button
              variant="outlined"
              onClick={() => setShowPreviousBatchConfirm(true)}
              sx={{
                borderRadius: 2,
                px: 3,
                py: 1.5,
                borderWidth: 2,
                fontWeight: 'bold',
                ml: 2,
                borderColor: '#1976d2',
                color: '#1976d2',
                '&:hover': {
                  borderWidth: 2,
                  backgroundColor: '#1976d2',
                  color: 'white',
                  transform: 'translateY(-1px)',
                  boxShadow: 2
                },
                transition: 'all 0.2s ease'
              }}
            >
               Use Previous Batch
            </Button>
            
            {/* Confirmation Dialog for Use Previous Batch */}
            <Dialog
              open={showPreviousBatchConfirm}
              onClose={() => setShowPreviousBatchConfirm(false)}
              maxWidth="sm"
              fullWidth
            >
              <DialogTitle sx={{ fontWeight: 'bold', pb: 1 }}>
                Are you sure?
              </DialogTitle>
              <DialogContent>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  This will load the most recent check data for all employees in this client and populate the form fields automatically.
                </Typography>
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    What this button does:
                  </Typography>
                  <Typography variant="body2" component="div">
                    • Finds the most recent checks for each employee<br/>
                    • Pre-fills hours, overtime, per diem, PTO, and other pay amounts<br/>
                    • Selects employees automatically<br/>
                    • <strong>This will replace any current data you've entered</strong>
                  </Typography>
                </Alert>
                <Typography variant="body2" color="text.secondary">
                  Do you want to continue?
                </Typography>
              </DialogContent>
              <DialogActions sx={{ p: 2, pt: 1 }}>
                <Button
                  onClick={() => setShowPreviousBatchConfirm(false)}
                  variant="outlined"
                  color="inherit"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setShowPreviousBatchConfirm(false);
                    loadPreviousBatch();
                  }}
                  variant="contained"
                  color="primary"
                  autoFocus
                >
                  Yes, Load Previous Batch
                </Button>
              </DialogActions>
            </Dialog>
            
            {/* Continue Reviewing Button - Show if there's saved data */}
            {(() => {
              // Check if there's any saved data: either selected employees OR input data
              // First check in-memory state
              let hasSavedData = Object.keys(tabData).length > 0 && 
                Object.values(tabData).some(tab => {
                  // Check for selected employees
                  const hasSelectedEmployees = Object.keys(tab.selectedEmployees || {}).some(id => tab.selectedEmployees[id]);
                  // Check for input data (even if employee isn't "selected", they might have data)
                  const hasInputData = Object.keys(tab.inputs || {}).length > 0;
                  return hasSelectedEmployees || hasInputData;
                });
              
              // If no data in memory, check localStorage directly as fallback
              // This ensures the button shows even if state hasn't been restored yet
              if (!hasSavedData) {
                try {
                  const savedTabData = localStorage.getItem('batchChecks_tabData');
                  if (savedTabData) {
                    const parsed = JSON.parse(savedTabData);
                    hasSavedData = Object.keys(parsed).length > 0 && 
                      Object.values(parsed).some((tab: any) => {
                        const hasSelectedEmployees = Object.keys(tab.selectedEmployees || {}).some((id: string) => tab.selectedEmployees[id]);
                        const hasInputData = Object.keys(tab.inputs || {}).length > 0;
                        return hasSelectedEmployees || hasInputData;
                      });
                  }
                } catch (e) {
                  console.error('Error checking localStorage for saved data:', e);
                }
              }
              
              if (!hasSavedData) return null;
              
              return (
                <Button
                  variant="contained"
                  onClick={reviewChecks}
                  sx={{
                    borderRadius: 2,
                    px: 3,
                    py: 1.5,
                    fontWeight: 'bold',
                    ml: 2,
                    backgroundColor: '#4caf50',
                    color: 'white',
                    '&:hover': {
                      backgroundColor: '#45a049',
                      transform: 'translateY(-1px)',
                      boxShadow: 2
                    },
                    transition: 'all 0.2s ease'
                  }}
                >
                  📋 Continue Reviewing
                </Button>
              );
            })()}
        
          
                </>
              );
            })()}
          </Box>

          {/* Enhanced Client Selection with Tabs */}
          {clientsWithActiveEmployees.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                 Select Client for This Work
              </Typography>
              
              {/* Client Tabs */}
              <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                  <Tabs 
                    value={selectedClientId === 'expenses' ? '' : (selectedClientId || clientsWithActiveEmployees[0]?.id || '')} 
                    onChange={(e: React.SyntheticEvent, newValue: string) => {
                      if (newValue !== '') {
                        setSelectedClientId(newValue);
                      }
                    }}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ 
                      flex: 1,
                      '& .MuiTab-root': { 
                        minHeight: '64px',
                        fontSize: '1rem',
                        textTransform: 'none',
                        fontWeight: 'bold',
                        px: 3,
                        py: 2
                      }
                    }}
                  >
                    {/* Individual Client Tabs - Show ALL clients */}
                    {clientsWithActiveEmployees.map((client) => (
                      <Tab
                        key={client.id}
                        label={
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span>{client.name}</span>
                            {client.division && (
                              <Typography variant="caption" color="primary" sx={{ fontSize: '0.7rem', fontWeight: 'bold' }}>
                                {client.division}
                              </Typography>
                            )}
                          </Box>
                        }
                        value={client.id}
                        sx={{ 
                          minWidth: '160px',
                          fontSize: '1rem',
                          '&.Mui-selected': { 
                            backgroundColor: 'primary.light',
                            color: 'primary.contrastText',
                            borderRadius: '8px 8px 0 0'
                          }
                        }}
                      />
                    ))}
                  </Tabs>
                  {/* Expenses Tab - Automatically positioned on the right using flexbox */}
                  {(() => {
                    // Check if user has permission to see expenses for this company
                    const expensesId = selectedCompanyId ? `expenses:${selectedCompanyId}` : '';
                    const canSeeExpenses = currentUserRole === 'admin' || 
                      currentUserVisibleClientIds.length === 0 || 
                      (expensesId && currentUserVisibleClientIds.includes(expensesId));
                    
                    if (!canSeeExpenses) return null;
                    
                    return (
                      <Button
                        onClick={() => setSelectedClientId('expenses')}
                        sx={{ 
                      minWidth: '160px',
                      minHeight: '64px',
                      fontSize: '1rem',
                      textTransform: 'none',
                      fontWeight: 'bold',
                      px: 3,
                      py: 2,
                      ml: 2, // Small spacing from client tabs
                      borderRadius: '8px 8px 0 0',
                      '&:hover': {
                        backgroundColor: selectedClientId === 'expenses' ? '#e65100' : '#fff3e0'
                      },
                      ...(selectedClientId === 'expenses' ? {
                        backgroundColor: '#e65100',
                        color: 'white',
                        borderBottom: 'none'
                      } : {
                        color: '#e65100',
                        border: '2px solid #e65100',
                        backgroundColor: '#fff3e0',
                        borderBottom: '1px solid #e65100'
                      })
                    }}
                  >
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span>Expenses</span>
                      <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'inherit' }}>
                        {companies.find(c => c.id === selectedCompanyId)?.name || 'Select Company'}
                      </Typography>
                    </Box>
                  </Button>
                    );
                  })()}
                </Box>
                      </Box>
              
            </Box>
          )}

          {/* Expenses Tab Content */}
          {selectedClientId === 'expenses' && (() => {
            // Check if user has permission to see expenses for this company
            const expensesId = selectedCompanyId ? `expenses:${selectedCompanyId}` : '';
            const canSeeExpenses = currentUserRole === 'admin' || 
              currentUserVisibleClientIds.length === 0 || 
              (expensesId && currentUserVisibleClientIds.includes(expensesId));
            
            if (!canSeeExpenses) return null;
            
            return (
            <Box sx={{ mb: 3 }}>
              <Paper sx={{ p: 3 }} elevation={2}>
                <Typography variant="h6" gutterBottom sx={{ mb: 2, fontWeight: 'bold' }}>
                  Expense Checks
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Create expense checks with free-form name, amount, and description. These checks will be flagged as expenses and can be viewed separately.
                </Typography>
                
                {/* Expense Entry Form */}
                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <TextField
                      label="Expense Name"
                      placeholder="e.g., Office Supplies"
                      value={newExpense.name}
                      onChange={(e) => {
                        setNewExpense(prev => ({ ...prev, name: e.target.value }));
                      }}
                      size="small"
                      sx={{ flex: 1, minWidth: '200px' }}
                    />
                    <TextField
                      label="Amount ($)"
                      type="number"
                      placeholder="0.00"
                      value={newExpense.amount}
                      onChange={(e) => {
                        setNewExpense(prev => ({ ...prev, amount: e.target.value }));
                      }}
                      size="small"
                      sx={{ width: '150px' }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      }}
                    />
                    <TextField
                      type="date"
                      label="Check Date"
                      value={newExpense.checkDate || defaultCheckDate}
                      onChange={(e) => {
                        if (e.target.value) {
                          setNewExpense(prev => ({ ...prev, checkDate: e.target.value }));
                        }
                      }}
                      size="small"
                      sx={{ width: '180px' }}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Box>
                  <TextField
                    label="Description"
                    placeholder="Additional details about this expense..."
                    value={newExpense.description}
                    onChange={(e) => {
                      setNewExpense(prev => ({ ...prev, description: e.target.value }));
                    }}
                    multiline
                    rows={2}
                    size="small"
                    fullWidth
                    sx={{ mb: 2 }}
                  />
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => {
                      if (!selectedCompanyId) {
                        alert("Please select a company first.");
                        return;
                      }
                      if (!newExpense.name.trim() || !newExpense.amount || parseFloat(newExpense.amount) <= 0) {
                        alert("Please enter an expense name and a valid amount.");
                        return;
                      }
                      const expenseEntry: ExpenseEntry = {
                        id: Date.now().toString(),
                        name: newExpense.name.trim(),
                        amount: newExpense.amount,
                        description: newExpense.description.trim(),
                        checkDate: newExpense.checkDate ? createLocalDate(newExpense.checkDate) : (defaultCheckDate ? createLocalDate(defaultCheckDate) : new Date())
                      };
                      setExpenseEntries(prev => ({
                        ...prev,
                        [selectedCompanyId]: [...(prev[selectedCompanyId] || []), expenseEntry]
                      }));
                      // Clear form
                      setNewExpense({ name: '', amount: '', description: '', checkDate: '' });
                    }}
                    sx={{ mb: 3 }}
                  >
                    Add Expense
                  </Button>
                </Box>
                
                {/* Expense List */}
                {selectedCompanyId && expenseEntries[selectedCompanyId] && expenseEntries[selectedCompanyId].length > 0 && (
                  <Box>
                    <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
                      Expense Entries ({expenseEntries[selectedCompanyId].length})
                    </Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Action</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {expenseEntries[selectedCompanyId].map((expense) => (
                            <TableRow key={expense.id}>
                              <TableCell>
                                <TextField
                                  value={expense.name}
                                  onChange={(e) => {
                                    setExpenseEntries(prev => ({
                                      ...prev,
                                      [selectedCompanyId]: prev[selectedCompanyId].map(exp =>
                                        exp.id === expense.id ? { ...exp, name: e.target.value } : exp
                                      )
                                    }));
                                  }}
                                  placeholder="Expense name"
                                  size="small"
                                  fullWidth
                                />
                              </TableCell>
                              <TableCell>
                                <TextField
                                  value={expense.amount}
                                  onChange={(e) => {
                                    setExpenseEntries(prev => ({
                                      ...prev,
                                      [selectedCompanyId]: prev[selectedCompanyId].map(exp =>
                                        exp.id === expense.id ? { ...exp, amount: e.target.value } : exp
                                      )
                                    }));
                                  }}
                                  type="number"
                                  placeholder="0.00"
                                  size="small"
                                  InputProps={{
                                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <TextField
                                  type="date"
                                  value={expense.checkDate ? (expense.checkDate instanceof Date ? expense.checkDate.toISOString().split('T')[0] : expense.checkDate) : defaultCheckDate}
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      setExpenseEntries(prev => ({
                                        ...prev,
                                        [selectedCompanyId]: prev[selectedCompanyId].map(exp =>
                                          exp.id === expense.id ? { ...exp, checkDate: createLocalDate(e.target.value) } : exp
                                        )
                                      }));
                                    }
                                  }}
                                  size="small"
                                  InputLabelProps={{ shrink: true }}
                                />
                              </TableCell>
                              <TableCell>
                                <TextField
                                  value={expense.description}
                                  onChange={(e) => {
                                    setExpenseEntries(prev => ({
                                      ...prev,
                                      [selectedCompanyId]: prev[selectedCompanyId].map(exp =>
                                        exp.id === expense.id ? { ...exp, description: e.target.value } : exp
                                      )
                                    }));
                                  }}
                                  placeholder="Description"
                                  size="small"
                                  fullWidth
                                />
                              </TableCell>
                              <TableCell>
                                <IconButton
                                  onClick={() => {
                                    setExpenseEntries(prev => ({
                                      ...prev,
                                      [selectedCompanyId]: prev[selectedCompanyId].filter(exp => exp.id !== expense.id)
                                    }));
                                  }}
                                  color="error"
                                  size="small"
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                        Total: ${formatCurrency(expenseEntries[selectedCompanyId].reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0))}
                      </Typography>
                    </Box>
                  </Box>
                )}
                
                {/* Review Checks Button for Expenses */}
                {selectedCompanyId && expenseEntries[selectedCompanyId] && expenseEntries[selectedCompanyId].length > 0 && (
                  <Box sx={{ mt: 3, textAlign: 'center' }}>
                    <Button
                      variant="contained"
                      size="large"
                      onClick={reviewChecks}
                      disabled={isCreatingChecks}
                      sx={{ 
                        px: 4,
                        py: 1.5,
                        fontSize: '1.1rem',
                        fontWeight: 'bold',
                        borderRadius: 2,
                        boxShadow: 3,
                        '&:hover': {
                          boxShadow: 6,
                          transform: 'translateY(-2px)',
                        },
                        transition: 'all 0.2s ease-in-out',
                      }}
                    >
                      {isCreatingChecks ? "Creating Checks..." : " Review Checks Before Creating"}
                    </Button>
                  </Box>
                )}
              </Paper>
            </Box>
            );
          })()}

          {/* Filter employees based on selected client tab */}
          {selectedClientId !== 'expenses' && (() => {
            // Debug: Log current state
            logger.log(`🔍 [Employee Filtering] selectedClientId: ${selectedClientId}, filteredEmployees.length: ${filteredEmployees.length}`);
            
            let employeesToShow = filteredEmployees;
            
            // Debug: Log employee data for key employees
            const domingo = filteredEmployees.find(emp => emp.name === 'Domingo Perez Lopez');
            if (domingo) {
              logger.log('🔍 Domingo Perez Lopez data:', {
                id: domingo.id,
                name: domingo.name,
                clientId: domingo.clientId,
                payType: domingo.payType,
                clientPayTypeRelationships: domingo.clientPayTypeRelationships
              });
            }
            
            if (selectedClientId) {
              // Show ALL employees who work for this client (regardless of other relationships)
              const client = companyClients.find(c => c.id === selectedClientId);
              if (client) {
                logger.log(`🔍 Filtering for client: ${client.name} (${client.id})`);
                logger.log(`🔍 Total employees before filtering: ${filteredEmployees.length}`);
                
                if (client.name.toLowerCase().includes('per diem')) {
                  // Per Diem tab: show ALL employees with per diem relationships for this client
                  employeesToShow = filteredEmployees.filter(emp => {
                    // Check if employee has relationships with this client and per diem pay type
                    const hasPerDiemForThisClient = emp.clientPayTypeRelationships?.some(rel => 
                      rel.clientId === selectedClientId && rel.payType === 'perdiem' && rel.active
                    );
                    
                    // Check legacy fields - only count if employee has NO relationships
                    const hasLegacyPerDiem = emp.clientId === selectedClientId && emp.payType === 'perdiem';
                    const legacyEmployeeWithPerDiem = hasLegacyPerDiem && (!emp.clientPayTypeRelationships || emp.clientPayTypeRelationships.length === 0);
                    
                    const shouldShow = hasPerDiemForThisClient || legacyEmployeeWithPerDiem;
                    if (emp.name === 'Domingo Perez Lopez') {
                      logger.log(`🔍 Domingo: hasPerDiemForThisClient=${hasPerDiemForThisClient}, hasLegacyPerDiem=${hasLegacyPerDiem}, shouldShow=${shouldShow}`);
                    }
                    return shouldShow;
                  });
                } else if (client.name.toLowerCase().includes('hourly')) {
                  // Hourly tab: show ALL employees with hourly relationships for this client
                  employeesToShow = filteredEmployees.filter(emp => {
                    
                    // Check if employee has relationships with this client and hourly pay type
                    const hasHourlyForThisClient = emp.clientPayTypeRelationships?.some(rel => 
                      rel.clientId === selectedClientId && rel.payType === 'hourly' && rel.active
                    );
                    
                    // Check legacy fields - only count if employee has NO relationships
                    const hasLegacyHourly = emp.clientId === selectedClientId && emp.payType === 'hourly';
                    const legacyEmployeeWithHourly = hasLegacyHourly && (!emp.clientPayTypeRelationships || emp.clientPayTypeRelationships.length === 0);
                    
                    const shouldShow = hasHourlyForThisClient || legacyEmployeeWithHourly;
                    if (emp.name === 'Domingo Perez Lopez') {
                      logger.log(`🔍 Domingo: hasHourlyForThisClient=${hasHourlyForThisClient}, hasLegacyHourly=${hasLegacyHourly}, shouldShow=${shouldShow}`);
                    }
                    return shouldShow;
                  });
                } else {
                  // Other client tabs: show ALL employees for this specific client
                  employeesToShow = filteredEmployees.filter(emp => {
                    // Check if employee has any active relationship with this client
                    const hasActiveRelationshipWithThisClient = emp.clientPayTypeRelationships?.some(rel => 
                      rel.clientId === selectedClientId && rel.active
                    );
                    
                    // Check legacy fields - only count if employee has NO relationships
                    const hasLegacyClient = emp.clientId === selectedClientId;
                    const legacyEmployeeWithSingleClient = hasLegacyClient && (!emp.clientPayTypeRelationships || emp.clientPayTypeRelationships.length === 0);
                    
                    const shouldShow = hasActiveRelationshipWithThisClient || legacyEmployeeWithSingleClient;
                    
                    return shouldShow;
                  });
                }
                
                logger.log(`🔍 Employees after filtering: ${employeesToShow.length}`);
                logger.log(`🔍 Employee names:`, employeesToShow.map(emp => emp.name));
              }
            }
            
            // Apply search filter - only search by first name
            if (employeeSearchTerm) {
              employeesToShow = employeesToShow.filter(emp => {
                const firstName = emp.name.split(' ')[0].toLowerCase();
                return firstName.startsWith(employeeSearchTerm.toLowerCase());
              });
            }
            
            // Always sort alphabetically by first name for the dropdown selection
            employeesToShow = employeesToShow.sort((a, b) => {
              const firstNameA = a.name.split(' ')[0].toLowerCase();
              const firstNameB = b.name.split(' ')[0].toLowerCase();
              return firstNameA.localeCompare(firstNameB);
            });
            
            const employeesWithData = employeesToShow.filter((emp: any) => {
              const data = inputs[emp.id];
              if (!data) return false;
              
              // Check legacy fields
              const hasLegacyHours = data.hours && parseFloat(data.hours) > 0;
              const hasLegacyPerDiem = data.perdiemAmount && parseFloat(data.perdiemAmount) > 0;
              const hasLegacyBreakdown = data.perdiemBreakdown && Object.values(data.perdiemBreakdown).some(val => parseFloat(val as string) > 0);
              
              // Check relationship-specific fields
              let hasRelationshipData = false;
              if (emp.clientPayTypeRelationships) {
                emp.clientPayTypeRelationships.forEach((rel: any) => {
                  const relId = rel.id;
                  const hasRelHours = data[`${relId}_hours`] && parseFloat(data[`${relId}_hours`]) > 0;
                  const hasRelOTHours = data[`${relId}_otHours`] && parseFloat(data[`${relId}_otHours`]) > 0;
                  const hasRelHolidayHours = data[`${relId}_holidayHours`] && parseFloat(data[`${relId}_holidayHours`]) > 0;
                  const hasRelPerDiemAmount = data[`${relId}_perdiemAmount`] && parseFloat(data[`${relId}_perdiemAmount`]) > 0;
                  
                  // Check Other Pay fields
                  const hasRelOtherPay = data[`${relId}_otherPay`] && Array.isArray(data[`${relId}_otherPay`]) && 
                    data[`${relId}_otherPay`].some((item: OtherPayItem) => parseFloat(item.amount) > 0);
                  
                  // Check daily breakdown fields
                  const dailyFields = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                  const hasRelDailyBreakdown = dailyFields.some(day => 
                    data[`${relId}_perdiem${day}`] && parseFloat(data[`${relId}_perdiem${day}`]) > 0
                  );
                  
                  if (hasRelHours || hasRelOTHours || hasRelHolidayHours || hasRelPerDiemAmount || hasRelDailyBreakdown || hasRelOtherPay) {
                    hasRelationshipData = true;
                  }
                });
              }
              
              return hasLegacyHours || hasLegacyPerDiem || hasLegacyBreakdown || hasRelationshipData;
            });
            
            logger.log('🔍 DEBUG: employeesToShow.length:', employeesToShow.length);
            logger.log('🔍 DEBUG: employeesWithData.length:', employeesWithData.length);
            logger.log('🔍 DEBUG: employeesToShow names:', employeesToShow.map(emp => emp.name));
            return (
              <>

                {/* Master Date Picker - Populates all employee dates */}
                {Object.keys(selectedEmployees).filter(id => selectedEmployees[id]).length > 0 && (
                  <Paper sx={{ p: 1.5, mb: 2, bgcolor: '#e3f2fd' }} elevation={2}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                      <Typography variant="subtitle2" fontWeight="bold" sx={{ minWidth: 'auto' }}>
                        Default Check Date:
                      </Typography>
                      <TextField
                        type="date"
                        value={defaultCheckDate}
                        onClick={(e) => {
                          // Apply the current date to ALL employees across ALL tabs
                          if (defaultCheckDate) {
                            const dateValue = createLocalDate(defaultCheckDate);
                            
                            setTabData(prev => {
                              const updatedTabData = { ...prev };
                              
                              // Apply date to all tabs
                              Object.keys(updatedTabData).forEach(tabId => {
                                const tabInfo = updatedTabData[tabId];
                                const updatedInputs = { ...tabInfo.inputs };
                                
                                // Apply date to all employees in this tab that have inputs
                                Object.keys(updatedInputs).forEach(empId => {
                                  updatedInputs[empId] = {
                                    ...updatedInputs[empId],
                                    checkDate: dateValue
                                  };
                                });
                                
                                updatedTabData[tabId] = {
                                  ...tabInfo,
                                  inputs: updatedInputs
                                };
                              });
                              
                              return updatedTabData;
                            });
                          }
                        }}
                        onChange={(e) => {
                          if (e.target.value) {
                            // Update the default check date state
                            setDefaultCheckDate(e.target.value);
                            
                            // Apply this date to ALL employees across ALL tabs
                            const dateValue = createLocalDate(e.target.value);
                            
                            setTabData(prev => {
                              const updatedTabData = { ...prev };
                              
                              // Apply date to all tabs
                              Object.keys(updatedTabData).forEach(tabId => {
                                const tabInfo = updatedTabData[tabId];
                                const updatedInputs = { ...tabInfo.inputs };
                                
                                // Apply date to all employees in this tab that have inputs
                                Object.keys(updatedInputs).forEach(empId => {
                                  updatedInputs[empId] = {
                                    ...updatedInputs[empId],
                                    checkDate: dateValue
                                  };
                                });
                                
                                updatedTabData[tabId] = {
                                  ...tabInfo,
                                  inputs: updatedInputs
                                };
                              });
                              
                              return updatedTabData;
                            });
                          }
                        }}
                        InputLabelProps={{ shrink: true }}
                        sx={{ width: '200px' }}
                        size="small"
                      />
                      {defaultCheckDate && (() => {
                        // Get the selected client's pay period configuration
                        const selectedClient = selectedClientId && selectedClientId !== 'multiple' 
                          ? clients.find(c => c.id === selectedClientId)
                          : null;
                        
                        const startDay = selectedClient?.payPeriodStartDay || 'monday';
                        const frequency = selectedClient?.payPeriodFrequency || 'weekly';
                        
                        const periodInfo = getWorkWeekNumber(defaultCheckDate, startDay, frequency);
                        if (periodInfo !== null && periodInfo.weekEndingDate) {
                          const weekEndingStr = periodInfo.weekEndingDate.toLocaleDateString('en-US', {
                            month: '2-digit',
                            day: '2-digit',
                            year: 'numeric'
                          });
                          
                          // Calculate current week number (ISO week)
                          const checkDateObj = createLocalDate(defaultCheckDate);
                          const currentWeekNumber = getISOWeek(checkDateObj);
                          
                          // Pay week is always one week before the current week
                          const payWeekNumber = currentWeekNumber - 1;
                          
                          const payPeriodLabel = selectedClient 
                            ? `${selectedClient.name}: ${startDay === 'sunday' ? 'Sunday-Saturday' : 'Monday-Sunday'}, ${frequency === 'biweekly' ? 'Bi-Weekly' : 'Weekly'}`
                            : `Default: ${startDay === 'sunday' ? 'Sunday-Saturday' : 'Monday-Sunday'}, ${frequency === 'biweekly' ? 'Bi-Weekly' : 'Weekly'}`;
                          
                          return (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                                Work Week {payWeekNumber} - Week Ending: {weekEndingStr}
                              </Typography>
                              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                                Pay week in Week {currentWeekNumber}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                                Using pay period: {payPeriodLabel}
                                {!selectedClient && ' (Configure in Clients section)'}
                              </Typography>
                            </Box>
                          );
                        }
                        return null;
                      })()}
                    </Box>
                  </Paper>
                )}

                {/* Employee Spreadsheet View - Show all selected employees in rows + always one empty row */}
                <Paper sx={{ p: 2, overflow: 'hidden', width: '100%', maxWidth: '100%' }} elevation={2}>
                  <TableContainer 
                    sx={{ 
                      maxHeight: '70vh', 
                      overflowX: 'auto',
                      overflowY: 'auto', 
                      width: '100%',
                      '&::-webkit-scrollbar': {
                        height: '8px',
                        width: '8px',
                      },
                      '&::-webkit-scrollbar-thumb': {
                        backgroundColor: '#ccc',
                        borderRadius: '4px',
                      },
                    }}
                  >
                    <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
                      <style>
                        {`
                          /* Hide number input spinners */
                          input[type="number"]::-webkit-inner-spin-button,
                          input[type="number"]::-webkit-outer-spin-button {
                            -webkit-appearance: none;
                            margin: 0;
                          }
                          input[type="number"] {
                            -moz-appearance: textfield;
                          }
                        `}
                      </style>
                      <colgroup>
                        <col style={{ width: '150px' }} />
                        <col style={{ width: '100px' }} />
                        <col style={{ width: '70px' }} />
                        <col style={{ width: '70px' }} />
                        <col style={{ width: '70px' }} />
                        <col style={{ width: '70px' }} />
                        <col style={{ width: '80px' }} />
                        <col style={{ width: '80px' }} />
                        <col style={{ width: '80px' }} />
                        <col style={{ width: '80px' }} />
                      </colgroup>
                      <TableHead>
                        <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                          <TableCell sx={{ fontWeight: 'bold', position: 'sticky', left: 0, zIndex: 3, backgroundColor: '#f5f5f5', p: 0.5, px: 0.75, minWidth: 200 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              Name
                              <IconButton
                                size="small"
                                onClick={() => {
                                  // Cycle through: null (original) → asc → desc → null
                                  if (nameSortOrder === null) {
                                    setNameSortOrder('asc');
                                  } else if (nameSortOrder === 'asc') {
                                    setNameSortOrder('desc');
                                  } else {
                                    setNameSortOrder(null); // Back to original order
                                  }
                                }}
                                sx={{ 
                                  p: 0.25,
                                  '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' }
                                }}
                              >
                                {nameSortOrder === 'asc' ? (
                                  <ArrowUpward sx={{ fontSize: 16 }} />
                                ) : nameSortOrder === 'desc' ? (
                                  <ArrowDownward sx={{ fontSize: 16 }} />
                                ) : (
                                  <Sort sx={{ fontSize: 16, opacity: 0.5 }} />
                                )}
                              </IconButton>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ fontWeight: 'bold', p: 0.5, px: 0.75 }}>Check Date</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', p: 0.5, px: 0.75 }}>Hours</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', p: 0.5, px: 0.75 }}>OT Hours</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', p: 0.5, px: 0.75 }}>PTO</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', p: 0.5, px: 0.75 }}>
                            <Box component="span" sx={{ fontWeight: 'bold' }}>$</Box> Per Diem
                          </TableCell>
                          <TableCell sx={{ fontWeight: 'bold', p: 0.5, px: 0.75 }}>Other Pay $</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', p: 0.5, px: 0.4 }}>Total $</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', p: 0.5, px: 0.3 }}>Memo</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', p: 0.5, px: 0.75 }}>Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(() => {
                          const tabId = selectedClientId || 'multiple';
                          const selectedEmpIds = Object.keys(selectedEmployees).filter(id => selectedEmployees[id]);
                          const rows: Array<{ empId: string | null; isNew: boolean }> = [];
                          
                          // Get the selection order for this tab
                          const selectionOrder = employeeSelectionOrder[tabId] || [];
                          let orderedEmpIds: string[];
                          
                          // If sort order is set, sort alphabetically
                          if (nameSortOrder !== null) {
                            // Sort alphabetically
                            orderedEmpIds = [...selectedEmpIds].sort((a, b) => {
                              const empA = employees.find(e => e.id === a);
                              const empB = employees.find(e => e.id === b);
                              if (!empA || !empB) return 0;
                              const nameA = empA.name.toLowerCase();
                              const nameB = empB.name.toLowerCase();
                              if (nameSortOrder === 'asc') {
                                return nameA.localeCompare(nameB);
                              } else {
                                return nameB.localeCompare(nameA);
                              }
                            });
                          } else {
                            // Use selection order: those in selection order first (in order), then those not in order
                            orderedEmpIds = selectedEmpIds.sort((a, b) => {
                              const indexA = selectionOrder.indexOf(a);
                              const indexB = selectionOrder.indexOf(b);
                              // If both are in selection order, use that order
                              if (indexA !== -1 && indexB !== -1) {
                                return indexA - indexB;
                              }
                              // If only one is in order, prioritize it (put it first)
                              if (indexA !== -1) return -1;
                              if (indexB !== -1) return 1;
                              // If neither is in order, maintain their current relative order
                              // (they'll appear after all ordered employees)
                              return 0;
                            });
                          }
                          
                          // Add all selected employees in the preserved order
                          orderedEmpIds.forEach(empId => {
                            rows.push({ empId, isNew: false });
                          });
                          
                          // Always add at least one empty row at the end
                          rows.push({ empId: null, isNew: true });
                          
                          return rows.map((row, index) => {
                            const empId = row.empId;
                            const isNewRow = row.isNew;
                            
                            // For new/empty rows
                            if (isNewRow || !empId) {
                              const isFocused = focusedRowId === 'new-row';
                              return (
                                <TableRow 
                                  key={`new-row-${index}`}
                                  tabIndex={0}
                                  sx={{ 
                                    '&:hover': { backgroundColor: '#f5f5f5' },
                                    backgroundColor: isFocused ? '#e3f2fd' : '#fafafa',
                                    cursor: 'pointer',
                                    '&:focus': {
                                      outline: '2px solid #1976d2',
                                      outlineOffset: '-2px'
                                    }
                                  }}
                                  onClick={(e) => {
                                    // Don't focus if clicking on an input or button
                                    const target = e.target as HTMLElement;
                                    if (target.tagName === 'INPUT' || 
                                        target.tagName === 'BUTTON' || 
                                        target.closest('input') || 
                                        target.closest('button') ||
                                        target.closest('[role="combobox"]')) {
                                      return;
                                    }
                                    setFocusedRowId('new-row');
                                    const row = e.currentTarget;
                                    focusFirstInputInRow(row);
                                  }}
                                  onKeyDown={(e) => {
                                    // Handle arrow keys when row is focused
                                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                      const row = e.currentTarget;
                                      const allInputs = Array.from(row.querySelectorAll('input, textarea')) as HTMLElement[];
                                      const focusableInputs = allInputs.filter(input => {
                                        const inputElement = input as HTMLInputElement;
                                        if (inputElement.disabled || 
                                            inputElement.type === 'hidden' || 
                                            inputElement.type === 'button' || 
                                            inputElement.type === 'submit' ||
                                            inputElement.type === 'reset') return false;
                                        const style = window.getComputedStyle(inputElement);
                                        if (style.display === 'none' || style.visibility === 'hidden') return false;
                                        const rect = inputElement.getBoundingClientRect();
                                        if (rect.width === 0 && rect.height === 0) return false;
                                        return true;
                                      });
                                      
                                      if (focusableInputs.length > 0) {
                                        focusableInputs.sort((a, b) => {
                                          const aRect = a.getBoundingClientRect();
                                          const bRect = b.getBoundingClientRect();
                                          return aRect.left - bRect.left;
                                        });
                                        
                                        const targetInput = e.key === 'ArrowRight' 
                                          ? focusableInputs[0] 
                                          : focusableInputs[focusableInputs.length - 1];
                                        
                                        if (targetInput) {
                                          e.preventDefault();
                                          setFocusedRowId('new-row');
                                          targetInput.focus();
                                          if ((targetInput as HTMLInputElement).type !== 'date') {
                                            setTimeout(() => (targetInput as HTMLInputElement).select(), 0);
                                          }
                                        }
                                      }
                                    }
                                  }}
                                >
                                  <TableCell sx={{ position: 'sticky', left: 0, zIndex: 2, backgroundColor: isFocused ? '#e3f2fd' : '#fafafa', minWidth: 200 }}>
                                    <Autocomplete
                                      options={(employeesToShow || []).filter((emp: Employee) => emp && emp.id && !selectedEmployees[emp.id])}
                                      getOptionLabel={(option: Employee) => option.name || ''}
                                      isOptionEqualToValue={(option, value) => option.id === value.id}
                                      filterOptions={(options, state) => {
                                        if (!state.inputValue) return options;
                                        const searchTerm = state.inputValue.toLowerCase();
                                        return options.filter((emp: Employee) => {
                                          const firstName = emp.name.split(' ')[0].toLowerCase();
                                          return firstName.startsWith(searchTerm);
                                        });
                                      }}
                                      value={null}
                                      open={employeeDropdownOpen}
                                      onOpen={() => {
                                        setEmployeeDropdownOpen(true);
                                        setFocusedRowId('new-row');
                                      }}
                                      onClose={() => setEmployeeDropdownOpen(false)}
                                      openOnFocus={true}
                                      onChange={(event, newValue: Employee | null) => {
                                        setEmployeeDropdownOpen(false);
                                        if (newValue && newValue.id) {
                                          const tabId = selectedClientId || 'multiple';
                                          // Add the employee
                                          setSelectedEmployees(prev => ({ ...prev, [newValue.id]: true }));
                                          // Track selection order
                                          setEmployeeSelectionOrder(prev => {
                                            const currentOrder = prev[tabId] || [];
                                            if (!currentOrder.includes(newValue.id)) {
                                              return {
                                                ...prev,
                                                [tabId]: [...currentOrder, newValue.id]
                                              };
                                            }
                                            return prev;
                                          });
                                          // Initialize input data with default date
                                          if (defaultCheckDate) {
                                            const dateValue = createLocalDate(defaultCheckDate);
                                            setInputs(prev => ({
                                              ...prev,
                                              [newValue.id]: {
                                                ...prev[newValue.id],
                                                checkDate: dateValue
                                              }
                                            }));
                                          }
                                          // Auto-select this employee tab and focus it
                                          setSelectedEmployeeTab(newValue.id);
                                          setFocusedRowId(newValue.id);
                                          // Store the newly added employee ID for scrolling
                                          lastAddedEmployeeId.current = newValue.id;
                                          // Scroll to the newly added employee row after a short delay
                                          setTimeout(() => {
                                            const rowElement = employeeRowRefs.current[newValue.id];
                                            if (rowElement) {
                                              rowElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                            }
                                          }, 100);
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(event) => {
                                        // Don't interfere with Autocomplete's arrow key navigation when dropdown is open
                                        if (employeeDropdownOpen) return;
                                        
                                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                                          // Handle arrow keys for horizontal navigation
                                          const input = event.currentTarget.querySelector('input') as HTMLInputElement;
                                          if (input) {
                                            const cursorPos = input.selectionStart || 0;
                                            const valueLength = input.value.length;
                                            const isAtStart = cursorPos === 0;
                                            const isAtEnd = cursorPos === valueLength;
                                            
                                            // Navigate if at edge, or if there's no value
                                            if ((event.key === 'ArrowLeft' && isAtStart) || (event.key === 'ArrowRight' && isAtEnd) || valueLength === 0) {
                                              event.preventDefault();
                                              navigateToAdjacentField(input, event.key === 'ArrowLeft' ? 'left' : 'right');
                                            }
                                          }
                                        }
                                      }}
                                      renderInput={(params) => (
                                        <TextField
                                          {...params}
                                          placeholder="Select employee..."
                                          size="small"
                                          sx={{ backgroundColor: 'white' }}
                                          inputRef={(input) => {
                                            if (index === rows.length - 1) {
                                              employeeDropdownRef.current = input;
                                            }
                                          }}
                                          onFocus={() => setFocusedRowId('new-row')}
                                          onKeyDown={(e) => {
                                            // Handle arrow keys for horizontal navigation
                                            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                              // Get the actual input element
                                              const input = (e.target as HTMLInputElement) || e.currentTarget.querySelector('input') as HTMLInputElement;
                                              if (input && input.tagName === 'INPUT' && input.selectionStart === input.selectionEnd) {
                                                const isAtStart = input.selectionStart === 0;
                                                const isAtEnd = input.selectionStart === input.value.length;
                                                
                                                if ((e.key === 'ArrowLeft' && isAtStart) || (e.key === 'ArrowRight' && isAtEnd)) {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  navigateToAdjacentField(input, e.key === 'ArrowLeft' ? 'left' : 'right');
                                                }
                                              }
                                            }
                                          }}
                                        />
                                      )}
                                      sx={{ minWidth: 200 }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>-</Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>-</Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>-</Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>-</Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>-</Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>-</Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>-</Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>-</Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>-</Typography>
                                  </TableCell>
                                </TableRow>
                              );
                            }
                            
                            // For existing employee rows
                            const emp = employees.find(e => e.id === empId);
                            if (!emp) return null;
                            
                            // Get relationship data for current client
                            // Always get ALL active relationships for this client (not just ones in selectedRelationshipIds)
                            // This ensures we show both hourly and per diem fields if both relationships exist
                            let selectedRelationships = selectedClientId && emp.clientPayTypeRelationships
                                ?.filter((rel: any) => 
                                  rel.clientId === selectedClientId && rel.active
                                ) || [];
                            
                            // Auto-initialize selectedRelationshipIds if not set (to include all relationships)
                            if (selectedRelationships.length > 0 && !inputs[empId]?.selectedRelationshipIds) {
                              const defaultIds = selectedRelationships.map((rel: any) => rel.id);
                              handleInputChange(empId, "selectedRelationshipIds", defaultIds);
                            } else if (selectedRelationships.length > 0 && inputs[empId]?.selectedRelationshipIds) {
                              // Ensure selectedRelationshipIds includes all active relationships for this client
                              const currentIds = inputs[empId].selectedRelationshipIds || [];
                              const allActiveIds = selectedRelationships.map((rel: any) => rel.id);
                              const missingIds = allActiveIds.filter((id: string) => !currentIds.includes(id));
                              if (missingIds.length > 0) {
                                // Add missing relationship IDs
                                handleInputChange(empId, "selectedRelationshipIds", [...currentIds, ...missingIds]);
                              }
                            }
                              
                              // Find hourly and per diem relationships separately
                              const hourlyRelationship = selectedRelationships.find((rel: any) => rel.payType === 'hourly');
                              const perDiemRelationship = selectedRelationships.find((rel: any) => rel.payType === 'perdiem');
                              const hasHourly = !!hourlyRelationship;
                              const hasPerDiem = !!perDiemRelationship;
                              
                              // If no relationship, return a row with disabled fields
                              if (!hourlyRelationship && !perDiemRelationship) {
                                const isFocusedNoRel = focusedRowId === empId;
                              return (
                                <TableRow 
                                  key={empId}
                                  ref={(el) => {
                                    if (el) {
                                      employeeRowRefs.current[empId] = el;
                                    }
                                  }}
                                  tabIndex={0}
                                  sx={{ 
                                    '&:hover': { backgroundColor: '#f5f5f5' },
                                    backgroundColor: isFocusedNoRel ? '#e3f2fd' : (selectedEmployeeTab === empId ? '#e8f4f8' : 'white'),
                                    cursor: 'pointer',
                                    '&:focus': {
                                      outline: '2px solid #1976d2',
                                      outlineOffset: '-2px'
                                    }
                                  }}
                                  onClick={(e) => {
                                    // Don't focus if clicking on an input or button
                                    const target = e.target as HTMLElement;
                                    if (target.tagName === 'INPUT' || 
                                        target.tagName === 'BUTTON' || 
                                        target.closest('input') || 
                                        target.closest('button') ||
                                        target.closest('[role="combobox"]')) {
                                      return;
                                    }
                                    setSelectedEmployeeTab(empId);
                                    setFocusedRowId(empId);
                                    const row = e.currentTarget;
                                    focusFirstInputInRow(row);
                                  }}
                                  onKeyDown={(e) => {
                                    // Handle arrow keys when row is focused
                                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                      const row = e.currentTarget;
                                      const allInputs = Array.from(row.querySelectorAll('input, textarea')) as HTMLElement[];
                                      const focusableInputs = allInputs.filter(input => {
                                        const inputElement = input as HTMLInputElement;
                                        if (inputElement.disabled || 
                                            inputElement.type === 'hidden' || 
                                            inputElement.type === 'button' || 
                                            inputElement.type === 'submit' ||
                                            inputElement.type === 'reset') return false;
                                        const style = window.getComputedStyle(inputElement);
                                        if (style.display === 'none' || style.visibility === 'hidden') return false;
                                        const rect = inputElement.getBoundingClientRect();
                                        if (rect.width === 0 && rect.height === 0) return false;
                                        return true;
                                      });
                                      
                                      if (focusableInputs.length > 0) {
                                        focusableInputs.sort((a, b) => {
                                          const aRect = a.getBoundingClientRect();
                                          const bRect = b.getBoundingClientRect();
                                          return aRect.left - bRect.left;
                                        });
                                        
                                        const targetInput = e.key === 'ArrowRight' 
                                          ? focusableInputs[0] 
                                          : focusableInputs[focusableInputs.length - 1];
                                        
                                        if (targetInput) {
                                          e.preventDefault();
                                          setFocusedRowId(empId);
                                          targetInput.focus();
                                          if ((targetInput as HTMLInputElement).type !== 'date') {
                                            setTimeout(() => (targetInput as HTMLInputElement).select(), 0);
                                          }
                                        }
                                      }
                                    }
                                  }}
                                >
                                    <TableCell sx={{ position: 'sticky', left: 0, zIndex: 2, backgroundColor: isFocusedNoRel ? '#e3f2fd' : (selectedEmployeeTab === empId ? '#e8f4f8' : 'white'), p: 0.5, px: 0.75 }}>
                                      <Checkbox
                                        size="small"
                                        checked={!!selectedEmployees[empId]}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          setSelectedEmployees(prev => ({ ...prev, [empId]: e.target.checked }));
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', position: 'sticky', left: 40, zIndex: 2, backgroundColor: isFocusedNoRel ? '#e3f2fd' : (selectedEmployeeTab === empId ? '#e8f4f8' : 'white'), p: 0.5, px: 0.75, minWidth: 200 }}>
                                      {emp.name}
                                    </TableCell>
                                    <TableCell colSpan={9}>
                                      <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                                        No relationship found for this client
                                      </Typography>
                                    </TableCell>
                                  </TableRow>
                                );
                              }
                              
                              // Calculate totals from all relationships
                              let hours = 0;
                              let otHours = 0;
                              let holidayHours = 0;
                              let perDiemAmount = 0;
                              let otherPayTotal = 0;
                              
                              // Get selected relationship IDs to only count Other Pay from selected relationships
                              const selectedRelIds = (inputs[empId] as any)?.selectedRelationshipIds || [];
                              
                              // Calculate hourly totals if hourly relationship exists
                              if (hourlyRelationship && selectedRelIds.includes(hourlyRelationship.id)) {
                                hours = parseFloat((inputs[empId] as any)?.[`${hourlyRelationship.id}_hours`] || '0');
                                otHours = parseFloat((inputs[empId] as any)?.[`${hourlyRelationship.id}_otHours`] || '0');
                                holidayHours = parseFloat((inputs[empId] as any)?.[`${hourlyRelationship.id}_holidayHours`] || '0');
                                const otherPay = (inputs[empId] as any)?.[`${hourlyRelationship.id}_otherPay`] || [];
                                otherPayTotal += otherPay.reduce((sum: number, item: OtherPayItem) => sum + parseFloat(item.amount || '0'), 0);
                              }
                              
                              // Calculate per diem totals if per diem relationship exists
                              if (perDiemRelationship && selectedRelIds.includes(perDiemRelationship.id)) {
                                const hasBreakdown = (inputs[empId] as any)?.[`${perDiemRelationship.id}_perdiemBreakdown`];
                                if (hasBreakdown) {
                                  perDiemAmount = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].reduce((sum, day) => {
                                    return sum + parseFloat((inputs[empId] as any)?.[`${perDiemRelationship.id}_perdiem${day}`] || '0');
                                  }, 0);
                                } else {
                                  perDiemAmount = parseFloat((inputs[empId] as any)?.[`${perDiemRelationship.id}_perdiemAmount`] || '0');
                                }
                                const otherPay = (inputs[empId] as any)?.[`${perDiemRelationship.id}_otherPay`] || [];
                                otherPayTotal += otherPay.reduce((sum: number, item: OtherPayItem) => sum + parseFloat(item.amount || '0'), 0);
                              }
                              
                              const totalAmount = calculateAmount(emp, inputs[empId] || {});
                              const checkDate = inputs[empId]?.checkDate;
                              const dateValue = checkDate 
                                ? `${checkDate.getMonth() + 1}/${checkDate.getDate()}/${checkDate.getFullYear()}`
                                : (defaultCheckDate ? new Date(defaultCheckDate).toLocaleDateString() : '');
                              
                              const isFocused = focusedRowId === empId;
                              return (
                                <TableRow 
                                  key={empId}
                                  ref={(el) => {
                                    if (el) {
                                      employeeRowRefs.current[empId] = el;
                                    }
                                  }}
                                  tabIndex={0}
                                  sx={{ 
                                    '&:hover': { backgroundColor: '#f5f5f5' },
                                    backgroundColor: isFocused ? '#e3f2fd' : (selectedEmployeeTab === empId ? '#e8f4f8' : 'white'),
                                    cursor: 'pointer',
                                    '&:focus': {
                                      outline: '2px solid #1976d2',
                                      outlineOffset: '-2px'
                                    }
                                  }}
                                  onClick={(e) => {
                                    // Don't focus if clicking on an input or button
                                    const target = e.target as HTMLElement;
                                    if (target.tagName === 'INPUT' || 
                                        target.tagName === 'BUTTON' || 
                                        target.closest('input') || 
                                        target.closest('button') ||
                                        target.closest('[role="combobox"]')) {
                                      return;
                                    }
                                    setSelectedEmployeeTab(empId);
                                    setFocusedRowId(empId);
                                    const row = e.currentTarget;
                                    focusFirstInputInRow(row);
                                  }}
                                  onKeyDown={(e) => {
                                    // Handle arrow keys when row is focused
                                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                      const row = e.currentTarget;
                                      const allInputs = Array.from(row.querySelectorAll('input, textarea')) as HTMLElement[];
                                      const focusableInputs = allInputs.filter(input => {
                                        const inputElement = input as HTMLInputElement;
                                        if (inputElement.disabled || 
                                            inputElement.type === 'hidden' || 
                                            inputElement.type === 'button' || 
                                            inputElement.type === 'submit' ||
                                            inputElement.type === 'reset') return false;
                                        const style = window.getComputedStyle(inputElement);
                                        if (style.display === 'none' || style.visibility === 'hidden') return false;
                                        const rect = inputElement.getBoundingClientRect();
                                        if (rect.width === 0 && rect.height === 0) return false;
                                        return true;
                                      });
                                      
                                      if (focusableInputs.length > 0) {
                                        focusableInputs.sort((a, b) => {
                                          const aRect = a.getBoundingClientRect();
                                          const bRect = b.getBoundingClientRect();
                                          return aRect.left - bRect.left;
                                        });
                                        
                                        const targetInput = e.key === 'ArrowRight' 
                                          ? focusableInputs[0] 
                                          : focusableInputs[focusableInputs.length - 1];
                                        
                                        if (targetInput) {
                                          e.preventDefault();
                                          setFocusedRowId(empId);
                                          targetInput.focus();
                                          if ((targetInput as HTMLInputElement).type !== 'date') {
                                            setTimeout(() => (targetInput as HTMLInputElement).select(), 0);
                                          }
                                        }
                                      }
                                    }
                                  }}
                                >
                                  <TableCell sx={{ fontWeight: 'bold', position: 'sticky', left: 0, zIndex: 2, backgroundColor: isFocused ? '#e3f2fd' : (selectedEmployeeTab === empId ? '#e8f4f8' : 'white'), p: 0.5, px: 0.75, minWidth: 200 }}>
                                    <Autocomplete
                                      options={(employeesToShow || []).filter((e: Employee) => e && e.id && (!selectedEmployees[e.id] || e.id === empId))}
                                      getOptionLabel={(option: Employee) => option.name || ''}
                                      filterOptions={(options, state) => {
                                        if (!state.inputValue) return options;
                                        const searchTerm = state.inputValue.toLowerCase();
                                        return options.filter((emp: Employee) => {
                                          const firstName = emp.name.split(' ')[0].toLowerCase();
                                          return firstName.startsWith(searchTerm);
                                        });
                                      }}
                                      value={emp ? emp : null}
                                      onChange={(event, newValue: Employee | null) => {
                                        if (newValue && newValue.id && newValue.id !== empId) {
                                          const tabId = selectedClientId || 'multiple';
                                          // Remove old employee
                                          setSelectedEmployees(prev => {
                                            const updated = { ...prev };
                                            updated[empId] = false;
                                            return updated;
                                          });
                                          setInputs(prev => {
                                            const { [empId]: removed, ...rest } = prev;
                                            return rest;
                                          });
                                          // Update selection order - replace old with new at same position
                                          setEmployeeSelectionOrder(prev => {
                                            const currentOrder = prev[tabId] || [];
                                            const index = currentOrder.indexOf(empId);
                                            if (index !== -1) {
                                              const newOrder = [...currentOrder];
                                              newOrder[index] = newValue.id;
                                              return { ...prev, [tabId]: newOrder };
                                            } else {
                                              // If old employee wasn't in order, just add new one
                                              return {
                                                ...prev,
                                                [tabId]: [...currentOrder, newValue.id]
                                              };
                                            }
                                          });
                                          
                                          // Add new employee
                                          setSelectedEmployees(prev => ({ ...prev, [newValue.id]: true }));
                                          // Initialize input data with default date
                                          if (defaultCheckDate) {
                                            const dateValue = createLocalDate(defaultCheckDate);
                                            setInputs(prev => ({
                                              ...prev,
                                              [newValue.id]: {
                                                ...prev[newValue.id],
                                                checkDate: dateValue
                                              }
                                            }));
                                          }
                                          // Update selected tab if needed
                                          if (selectedEmployeeTab === empId) {
                                            setSelectedEmployeeTab(newValue.id);
                                          }
                                          // Update focused row
                                          setFocusedRowId(newValue.id);
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(event) => {
                                        // Don't interfere with Autocomplete's arrow key navigation when dropdown is open
                                        if (event.target && (event.target as HTMLElement).closest('[role="listbox"]')) return;
                                        
                                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                                          // Handle arrow keys for horizontal navigation
                                          const input = event.currentTarget.querySelector('input') as HTMLInputElement;
                                          if (input) {
                                            const cursorPos = input.selectionStart || 0;
                                            const valueLength = input.value.length;
                                            const isAtStart = cursorPos === 0;
                                            const isAtEnd = cursorPos === valueLength;
                                            
                                            // Navigate if at edge, or if there's no value
                                            if ((event.key === 'ArrowLeft' && isAtStart) || (event.key === 'ArrowRight' && isAtEnd) || valueLength === 0) {
                                              event.preventDefault();
                                              navigateToAdjacentField(input, event.key === 'ArrowLeft' ? 'left' : 'right');
                                            }
                                          }
                                        }
                                      }}
                                      renderInput={(params) => (
                                        <TextField
                                          {...params}
                                          size="small"
                                          sx={{ backgroundColor: 'white' }}
                                          onFocus={() => setFocusedRowId(empId)}
                                          onKeyDown={(e) => {
                                            // Handle arrow keys for horizontal navigation
                                            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                              // Get the actual input element
                                              const input = (e.target as HTMLInputElement) || e.currentTarget.querySelector('input') as HTMLInputElement;
                                              if (input && input.tagName === 'INPUT' && input.selectionStart === input.selectionEnd) {
                                                const isAtStart = input.selectionStart === 0;
                                                const isAtEnd = input.selectionStart === input.value.length;
                                                
                                                if ((e.key === 'ArrowLeft' && isAtStart) || (e.key === 'ArrowRight' && isAtEnd)) {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  navigateToAdjacentField(input, e.key === 'ArrowLeft' ? 'left' : 'right');
                                                }
                                              }
                                            }
                                          }}
                                        />
                                      )}
                                      sx={{ width: '100%' }}
                                    />
                                  </TableCell>
                                  <TableCell sx={{ p: 0.5, px: 0.75 }}>
                                    <TextField
                                      type="date"
                                      size="small"
                                      value={checkDate 
                                        ? `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`
                                        : defaultCheckDate || ''}
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          const dateValue = createLocalDate(e.target.value);
                                          handleInputChange(empId, "checkDate", dateValue);
                                        } else {
                                          handleInputChange(empId, "checkDate", null);
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      onFocus={() => setFocusedRowId(empId)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                          // Get the actual input element
                                          const input = (e.target as HTMLInputElement) || e.currentTarget.querySelector('input') as HTMLInputElement;
                                          if (input && input.tagName === 'INPUT') {
                                            // For date inputs, use a more lenient approach
                                            // Check cursor position - date format is YYYY-MM-DD
                                            const cursorPos = input.selectionStart ?? 0;
                                            const valueLength = input.value.length;
                                            
                                            // Allow navigation when:
                                            // - Left arrow: cursor at position 0 (start of date)
                                            // - Right arrow: cursor at end of date (position >= 9 for full date, or at end of value)
                                            const isAtStart = cursorPos <= 0;
                                            const isAtEnd = cursorPos >= Math.max(9, valueLength - 1);
                                            
                                            // Also check if the entire value is selected (common when clicking on date field)
                                            const isAllSelected = input.selectionStart === 0 && input.selectionEnd === valueLength;
                                            
                                            if ((e.key === 'ArrowLeft' && (isAtStart || isAllSelected)) || 
                                                (e.key === 'ArrowRight' && (isAtEnd || isAllSelected))) {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              navigateToAdjacentField(input, e.key === 'ArrowLeft' ? 'left' : 'right');
                                            }
                                          }
                                        }
                                      }}
                                      InputLabelProps={{ shrink: true }}
                                      sx={{ width: '100%' }}
                                    />
                                  </TableCell>
                                  <TableCell sx={{ p: 0.5, px: 0.75 }}>
                                    {hasHourly && hourlyRelationship ? (
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <TextField
                                          type="number"
                                          size="small"
                                          value={(inputs[empId] as any)?.[`${hourlyRelationship.id}_hours`] || ""}
                                          onChange={(e) => (handleInputChange as any)(empId, `${hourlyRelationship.id}_hours`, e.target.value)}
                                          onClick={(e) => e.stopPropagation()}
                                          onFocus={() => setFocusedRowId(empId)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                              // Get the actual input element - it might be e.target or nested
                                              const input = (e.target as HTMLInputElement) || e.currentTarget.querySelector('input') as HTMLInputElement;
                                              if (input && input.tagName === 'INPUT') {
                                                const cursorPos = input.selectionStart || 0;
                                                const valueLength = input.value.length;
                                                const isAtStart = cursorPos === 0;
                                                const isAtEnd = cursorPos === valueLength;
                                                
                                                // Navigate if at edge, or if there's no value
                                                if ((e.key === 'ArrowLeft' && isAtStart) || (e.key === 'ArrowRight' && isAtEnd) || valueLength === 0) {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  navigateToAdjacentField(input, e.key === 'ArrowLeft' ? 'left' : 'right');
                                                }
                                              }
                                            }
                                          }}
                                          sx={{ 
                                            flex: 1,
                                            minWidth: '40px',
                                            '& input': {
                                              padding: '4px 8px',
                                            },
                                            '& input[type=number]': {
                                              MozAppearance: 'textfield',
                                              '&::-webkit-outer-spin-button': { display: 'none' },
                                              '&::-webkit-inner-spin-button': { display: 'none' },
                                            }
                                          }}
                                        />
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 'bold' }}>
                                          ×${getRelationshipPayRate(emp, hourlyRelationship.id)}
                                        </Typography>
                                      </Box>
                                    ) : (
                                      <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.75rem' }}>-</Typography>
                                    )}
                                  </TableCell>
                                  <TableCell sx={{ p: 0.5, px: 0.75 }}>
                                    {hasHourly && hourlyRelationship ? (
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <TextField
                                          type="number"
                                          size="small"
                                          value={(inputs[empId] as any)?.[`${hourlyRelationship.id}_otHours`] || ""}
                                          onChange={(e) => (handleInputChange as any)(empId, `${hourlyRelationship.id}_otHours`, e.target.value)}
                                          onClick={(e) => e.stopPropagation()}
                                          onFocus={() => setFocusedRowId(empId)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                              // Get the actual input element - it might be e.target or nested
                                              const input = (e.target as HTMLInputElement) || e.currentTarget.querySelector('input') as HTMLInputElement;
                                              if (input && input.tagName === 'INPUT') {
                                                const cursorPos = input.selectionStart || 0;
                                                const valueLength = input.value.length;
                                                const isAtStart = cursorPos === 0;
                                                const isAtEnd = cursorPos === valueLength;
                                                
                                                // Navigate if at edge, or if there's no value
                                                if ((e.key === 'ArrowLeft' && isAtStart) || (e.key === 'ArrowRight' && isAtEnd) || valueLength === 0) {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  navigateToAdjacentField(input, e.key === 'ArrowLeft' ? 'left' : 'right');
                                                }
                                              }
                                            }
                                          }}
                                          sx={{ 
                                            flex: 1,
                                            minWidth: '40px',
                                            '& input': {
                                              padding: '4px 8px',
                                            },
                                            '& input[type=number]': {
                                              MozAppearance: 'textfield',
                                              '&::-webkit-outer-spin-button': { display: 'none' },
                                              '&::-webkit-inner-spin-button': { display: 'none' },
                                            }
                                          }}
                                        />
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 'bold' }}>
                                          ×${formatCurrency(getRelationshipPayRate(emp, hourlyRelationship.id) * 1.5)}
                                        </Typography>
                                      </Box>
                                    ) : (
                                      <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.75rem' }}>-</Typography>
                                    )}
                                  </TableCell>
                                  <TableCell sx={{ p: 0.5, px: 0.75 }}>
                                    {hasHourly && hourlyRelationship ? (
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <TextField
                                          type="number"
                                          size="small"
                                          value={(inputs[empId] as any)?.[`${hourlyRelationship.id}_holidayHours`] || ""}
                                          onChange={(e) => (handleInputChange as any)(empId, `${hourlyRelationship.id}_holidayHours`, e.target.value)}
                                          onClick={(e) => e.stopPropagation()}
                                          onFocus={() => setFocusedRowId(empId)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                              // Get the actual input element - it might be e.target or nested
                                              const input = (e.target as HTMLInputElement) || e.currentTarget.querySelector('input') as HTMLInputElement;
                                              if (input && input.tagName === 'INPUT') {
                                                const cursorPos = input.selectionStart || 0;
                                                const valueLength = input.value.length;
                                                const isAtStart = cursorPos === 0;
                                                const isAtEnd = cursorPos === valueLength;
                                                
                                                // Navigate if at edge, or if there's no value
                                                if ((e.key === 'ArrowLeft' && isAtStart) || (e.key === 'ArrowRight' && isAtEnd) || valueLength === 0) {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  navigateToAdjacentField(input, e.key === 'ArrowLeft' ? 'left' : 'right');
                                                }
                                              }
                                            }
                                          }}
                                          sx={{ 
                                            flex: 1,
                                            minWidth: '40px',
                                            '& input': {
                                              padding: '4px 8px',
                                            },
                                            '& input[type=number]': {
                                              MozAppearance: 'textfield',
                                              '&::-webkit-outer-spin-button': { display: 'none' },
                                              '&::-webkit-inner-spin-button': { display: 'none' },
                                            }
                                          }}
                                        />
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 'bold' }}>
                                          ×${getRelationshipPayRate(emp, hourlyRelationship.id)}
                                        </Typography>
                                      </Box>
                                    ) : hasPerDiem && perDiemRelationship ? (
                                      // For per diem employees, PTO is a simple dollar amount (like per diem)
                                      <TextField
                                        type="number"
                                        size="small"
                                        value={(inputs[empId] as any)?.[`${perDiemRelationship.id}_ptoAmount`] || ""}
                                        onChange={(e) => (handleInputChange as any)(empId, `${perDiemRelationship.id}_ptoAmount`, e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        onFocus={() => setFocusedRowId(empId)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                            // Get the actual input element
                                            const input = (e.target as HTMLInputElement) || e.currentTarget.querySelector('input') as HTMLInputElement;
                                            if (input && input.tagName === 'INPUT' && input.selectionStart === input.selectionEnd) {
                                              const isAtStart = input.selectionStart === 0;
                                              const isAtEnd = input.selectionStart === input.value.length;
                                              
                                              if ((e.key === 'ArrowLeft' && isAtStart) || (e.key === 'ArrowRight' && isAtEnd)) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                navigateToAdjacentField(input, e.key === 'ArrowLeft' ? 'left' : 'right');
                                              }
                                            }
                                          }
                                        }}
                                        sx={{ 
                                          width: '100%',
                                          '& input[type=number]': {
                                            MozAppearance: 'textfield',
                                            '&::-webkit-outer-spin-button': { display: 'none' },
                                            '&::-webkit-inner-spin-button': { display: 'none' },
                                          }
                                        }}
                                        placeholder="$0.00"
                                      />
                                    ) : (
                                      <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.75rem' }}>-</Typography>
                                    )}
                                  </TableCell>
                                  <TableCell sx={{ p: 0.5, px: 0.75 }}>
                                    {hasPerDiem && perDiemRelationship ? (
                                      <TextField
                                        type="number"
                                        size="small"
                                        value={(inputs[empId] as any)?.[`${perDiemRelationship.id}_perdiemAmount`] || ""}
                                        onChange={(e) => (handleInputChange as any)(empId, `${perDiemRelationship.id}_perdiemAmount`, e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        onFocus={() => setFocusedRowId(empId)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                            // Get the actual input element
                                            const input = (e.target as HTMLInputElement) || e.currentTarget.querySelector('input') as HTMLInputElement;
                                            if (input && input.tagName === 'INPUT' && input.selectionStart === input.selectionEnd) {
                                              const isAtStart = input.selectionStart === 0;
                                              const isAtEnd = input.selectionStart === input.value.length;
                                              
                                              if ((e.key === 'ArrowLeft' && isAtStart) || (e.key === 'ArrowRight' && isAtEnd)) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                navigateToAdjacentField(input, e.key === 'ArrowLeft' ? 'left' : 'right');
                                              }
                                            }
                                          }
                                        }}
                                        sx={{ 
                                          width: '100%',
                                          '& input[type=number]': {
                                            MozAppearance: 'textfield',
                                            '&::-webkit-outer-spin-button': { display: 'none' },
                                            '&::-webkit-inner-spin-button': { display: 'none' },
                                          }
                                        }}
                                      />
                                    ) : (
                                      <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.75rem' }}>-</Typography>
                                    )}
                                  </TableCell>
                                  <TableCell sx={{ p: 0.5, px: 0.75 }}>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      startIcon={<AddIcon />}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOtherPayDialogOpen(empId);
                                      }}
                                      sx={{ 
                                        width: 'auto',
                                        minWidth: 'auto',
                                        justifyContent: 'flex-start',
                                        textTransform: 'none',
                                        fontSize: '0.7rem',
                                        py: 0.25,
                                        px: 1
                                      }}
                                    >
                                      {otherPayTotal > 0 ? `$${formatCurrency(otherPayTotal)}` : 'Add'}
                                    </Button>
                                  </TableCell>
                                  <TableCell sx={{ fontWeight: 'bold', color: 'primary.main', p: 0.5, px: 0.5 }}>
                                    ${totalAmount}
                                  </TableCell>
                                  <TableCell sx={{ p: 0.5, px: 0.5 }}>
                                    <TextField
                                      size="small"
                                      value={inputs[empId]?.memo || ""}
                                      onChange={(e) => handleInputChange(empId, "memo", e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      onFocus={() => setFocusedRowId(empId)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                          const input = e.currentTarget.querySelector('input') as HTMLInputElement;
                                          if (input && input.selectionStart === input.selectionEnd) {
                                            const isAtStart = input.selectionStart === 0;
                                            const isAtEnd = input.selectionStart === input.value.length;
                                            
                                            if ((e.key === 'ArrowLeft' && isAtStart) || (e.key === 'ArrowRight' && isAtEnd)) {
                                              e.preventDefault();
                                              navigateToAdjacentField(input, e.key === 'ArrowLeft' ? 'left' : 'right');
                                            }
                                          }
                                        }
                                      }}
                                      placeholder="Memo"
                                      sx={{ 
                                        width: '100%',
                                        '& .MuiInputBase-input': {
                                          padding: '4px 8px',
                                          fontSize: '0.75rem'
                                        }
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell sx={{ p: 0.5, px: 0.75 }}>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="error"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const tabId = selectedClientId || 'multiple';
                                        setSelectedEmployees(prev => ({ ...prev, [empId]: false }));
                                        setInputs(prev => {
                                          const { [empId]: removed, ...rest } = prev;
                                          return rest;
                                        });
                                        // Remove from selection order
                                        setEmployeeSelectionOrder(prev => ({
                                          ...prev,
                                          [tabId]: (prev[tabId] || []).filter(id => id !== empId)
                                        }));
                                        const remaining = Object.keys(selectedEmployees).filter(id => id !== empId && selectedEmployees[id]);
                                        setSelectedEmployeeTab(remaining.length > 0 ? remaining[0] : null);
                                      }}
                                      sx={{ fontSize: '0.7rem', py: 0.25 }}
                                    >
                                      Remove
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            });
                          })()}
                          
                          {/* Total Row */}
                          {(() => {
                            // Calculate totals for all employees in the current tab
                            const tabId = selectedClientId || 'multiple';
                            const tabInfo = tabData[tabId];
                            const selectedEmpIds = Object.keys(selectedEmployees).filter(id => selectedEmployees[id]);
                            
                            let totalHours = 0;
                            let totalOtHours = 0;
                            let totalPto = 0;
                            let totalPerDiem = 0;
                            let totalOtherPay = 0;
                            let grandTotal = 0;
                            
                            selectedEmpIds.forEach(empId => {
                              const emp = employees.find(e => e.id === empId);
                              if (!emp) return;
                              
                              const data = inputs[empId];
                              if (!data) return;
                              
                              // Calculate totals using the same logic as calculateAmount
                              const amount = parseFloat(calculateAmount(emp, data));
                              grandTotal += amount;
                              
                              // Get relationships for current client
                              const relationships = emp.clientPayTypeRelationships?.filter((rel: any) => 
                                rel.clientId === selectedClientId && rel.active
                              ) || [];
                              
                              if (relationships.length > 0) {
                                relationships.forEach((relationship: any) => {
                                  const relId = relationship.id;
                                  
                                  if (relationship.payType === 'hourly') {
                                    const hours = parseFloat((data as any)[`${relId}_hours`] || '0') || 0;
                                    const otHours = parseFloat((data as any)[`${relId}_otHours`] || '0') || 0;
                                    const holidayHours = parseFloat((data as any)[`${relId}_holidayHours`] || '0') || 0;
                                    
                                    totalHours += hours;
                                    totalOtHours += otHours;
                                    totalPto += holidayHours;
                                  } else if (relationship.payType === 'perdiem') {
                                    const ptoAmount = parseFloat((data as any)[`${relId}_ptoAmount`] || '0') || 0;
                                    totalPto += ptoAmount;
                                    
                                    const perdiemBreakdown = (data as any)[`${relId}_perdiemBreakdown`];
                                    if (perdiemBreakdown) {
                                      const dailyTotal = ['perdiemMonday', 'perdiemTuesday', 'perdiemWednesday', 
                                        'perdiemThursday', 'perdiemFriday', 'perdiemSaturday', 'perdiemSunday']
                                        .reduce((sum, day) => sum + parseFloat((data as any)[`${relId}_perdiem${day}`] || '0'), 0);
                                      totalPerDiem += dailyTotal;
                                    } else {
                                      const perdiemAmount = parseFloat((data as any)[`${relId}_perdiemAmount`] || '0') || 0;
                                      totalPerDiem += perdiemAmount;
                                    }
                                  }
                                  
                                  // Other Pay
                                  const otherPay = (data as any)[`${relId}_otherPay`] || [];
                                  const otherPayTotal = otherPay.reduce((sum: number, item: OtherPayItem) => 
                                    sum + parseFloat(item.amount || '0'), 0);
                                  totalOtherPay += otherPayTotal;
                                });
                              } else {
                                // Legacy fields
                                const hours = parseFloat(data.hours || '0') || 0;
                                const otHours = parseFloat(data.otHours || '0') || 0;
                                const holidayHours = parseFloat(data.holidayHours || '0') || 0;
                                
                                totalHours += hours;
                                totalOtHours += otHours;
                                totalPto += holidayHours;
                                
                                // Legacy per diem
                                if (data.perdiemBreakdown) {
                                  const dailyTotal = ['perdiemMonday', 'perdiemTuesday', 'perdiemWednesday', 
                                    'perdiemThursday', 'perdiemFriday', 'perdiemSaturday', 'perdiemSunday']
                                    .reduce((sum, day) => sum + parseFloat((data as any)[`perdiem${day}`] || '0'), 0);
                                  totalPerDiem += dailyTotal;
                                } else {
                                  const perdiemAmount = parseFloat(data.perdiemAmount || '0') || 0;
                                  totalPerDiem += perdiemAmount;
                                }
                                
                                // Legacy other pay
                                const otherPay = data.otherPay || [];
                                const otherPayTotal = otherPay.reduce((sum: number, item: OtherPayItem) => 
                                  sum + parseFloat(item.amount || '0'), 0);
                                totalOtherPay += otherPayTotal;
                              }
                            });
                            
                            return (
                              <TableRow sx={{ 
                                backgroundColor: '#e3f2fd', 
                                '& td': { 
                                  borderTop: '3px solid #1976d2',
                                  borderBottom: '2px solid #1976d2'
                                } 
                              }}>
                                <TableCell sx={{ 
                                  fontWeight: 'bold', 
                                  p: 0.5, 
                                  px: 0.75,
                                  backgroundColor: '#e3f2fd',
                                  position: 'sticky',
                                  left: 0,
                                  zIndex: 2,
                                  minWidth: 200
                                }}>
                                  TOTAL
                                </TableCell>
                                <TableCell sx={{ p: 0.5, px: 0.75, backgroundColor: '#e3f2fd' }}>
                                  <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.75rem' }}>-</Typography>
                                </TableCell>
                                <TableCell sx={{ 
                                  fontWeight: 'bold', 
                                  p: 0.5, 
                                  px: 0.75, 
                                  textAlign: 'right',
                                  backgroundColor: '#e3f2fd'
                                }}>
                                  {totalHours > 0 ? totalHours.toFixed(2) : <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.75rem', display: 'inline' }}>-</Typography>}
                                </TableCell>
                                <TableCell sx={{ 
                                  fontWeight: 'bold', 
                                  p: 0.5, 
                                  px: 0.75, 
                                  textAlign: 'right',
                                  backgroundColor: '#e3f2fd'
                                }}>
                                  {totalOtHours > 0 ? totalOtHours.toFixed(2) : <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.75rem', display: 'inline' }}>-</Typography>}
                                </TableCell>
                                <TableCell sx={{ 
                                  fontWeight: 'bold', 
                                  p: 0.5, 
                                  px: 0.75, 
                                  textAlign: 'right',
                                  backgroundColor: '#e3f2fd'
                                }}>
                                  {totalPto > 0 ? totalPto.toFixed(2) : <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.75rem', display: 'inline' }}>-</Typography>}
                                </TableCell>
                                <TableCell sx={{ 
                                  fontWeight: 'bold', 
                                  p: 0.5, 
                                  px: 0.75, 
                                  textAlign: 'right',
                                  backgroundColor: '#e3f2fd'
                                }}>
                                  {totalPerDiem > 0 ? `$${formatCurrency(totalPerDiem)}` : <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.75rem', display: 'inline' }}>-</Typography>}
                                </TableCell>
                                <TableCell sx={{ 
                                  fontWeight: 'bold', 
                                  p: 0.5, 
                                  px: 0.75, 
                                  textAlign: 'right',
                                  backgroundColor: '#e3f2fd'
                                }}>
                                  {totalOtherPay > 0 ? `$${formatCurrency(totalOtherPay)}` : <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.75rem', display: 'inline' }}>-</Typography>}
                                </TableCell>
                                <TableCell sx={{ 
                                  fontWeight: 'bold', 
                                  color: 'primary.main', 
                                  p: 0.5, 
                                  px: 0.5, 
                                  textAlign: 'right',
                                  backgroundColor: '#e3f2fd'
                                }}>
                                  ${formatCurrency(grandTotal)}
                                </TableCell>
                                <TableCell sx={{ p: 0.5, px: 0.5, backgroundColor: '#e3f2fd' }}>
                                  <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.75rem' }}>-</Typography>
                                </TableCell>
                                <TableCell sx={{ p: 0.5, px: 0.75, backgroundColor: '#e3f2fd' }}>
                                  <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.75rem' }}>-</Typography>
                                </TableCell>
                              </TableRow>
                            );
                          })()}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Paper>

                {/* Other Pay Dialog */}
                {otherPayDialogOpen && (() => {
                  const empId = otherPayDialogOpen;
                  const emp = employees.find(e => e.id === empId);
                  if (!emp) return null;
                  
                  // Get relationship for current client
                  const selectedRelationships = selectedClientId && emp.clientPayTypeRelationships
                    ?.filter((rel: any) => 
                      inputs[empId]?.selectedRelationshipIds?.includes(rel.id) && 
                      rel.clientId === selectedClientId
                    ) || [];
                  
                  const primaryRelationship = selectedRelationships[0];
                  if (!primaryRelationship) return null;
                  
                  const otherPayKey = `${primaryRelationship.id}_otherPay`;
                  const currentOtherPay = (inputs[empId] as any)?.[otherPayKey] || [];
                  
                  return (
                    <Dialog
                      open={true}
                      onClose={() => setOtherPayDialogOpen(null)}
                      maxWidth="sm"
                      fullWidth
                    >
                      <DialogTitle>
                        Other Pay - {emp.name}
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
                          {(() => {
                            const client = clients.find(c => c.id === primaryRelationship.clientId);
                            return client?.name || primaryRelationship.clientName;
                          })()} - {primaryRelationship.payType === 'hourly' ? 'Hourly' : 'Per Diem'}
                        </Typography>
                      </DialogTitle>
                      <DialogContent>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                          {currentOtherPay.map((item: OtherPayItem, index: number) => (
                            <Box key={item.id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                              <TextField
                                label="Description"
                                size="small"
                                fullWidth
                                value={item.description}
                                onChange={(e) => {
                                  const updatedOtherPay = currentOtherPay.map((payItem: OtherPayItem) =>
                                    payItem.id === item.id ? { ...payItem, description: e.target.value } : payItem
                                  );
                                  handleInputChange(empId, otherPayKey, updatedOtherPay);
                                }}
                              />
                              <TextField
                                label="Amount"
                                type="number"
                                size="small"
                                value={item.amount}
                                onChange={(e) => {
                                  const updatedOtherPay = currentOtherPay.map((payItem: OtherPayItem) =>
                                    payItem.id === item.id ? { ...payItem, amount: e.target.value } : payItem
                                  );
                                  handleInputChange(empId, otherPayKey, updatedOtherPay);
                                }}
                                sx={{ width: 150 }}
                              />
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => {
                                  const updatedOtherPay = currentOtherPay.filter((payItem: OtherPayItem) => payItem.id !== item.id);
                                  handleInputChange(empId, otherPayKey, updatedOtherPay);
                                }}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Box>
                          ))}
                          
                          {currentOtherPay.length === 0 && (
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                              No other pay items added yet
                            </Typography>
                          )}
                          
                          <Button
                            variant="outlined"
                            startIcon={<AddIcon />}
                            onClick={() => {
                              const newOtherPayItem = {
                                id: Date.now().toString(),
                                description: '',
                                amount: ''
                              };
                              handleInputChange(empId, otherPayKey, [...currentOtherPay, newOtherPayItem]);
                            }}
                            sx={{ mt: 1 }}
                          >
                            Add Other Pay Item
                          </Button>
                          
                          {currentOtherPay.length > 0 && (
                            <Box sx={{ mt: 2, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
                              <Typography variant="subtitle2" fontWeight="bold">
                                Total Other Pay: ${formatCurrency(currentOtherPay.reduce((sum: number, item: OtherPayItem) => 
                                  sum + parseFloat(item.amount || '0'), 0))}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      </DialogContent>
                      <DialogActions>
                        <Button onClick={() => setOtherPayDialogOpen(null)}>
                          Close
                        </Button>
                      </DialogActions>
                    </Dialog>
                  );
                })()}
                
{/* Review Checks Button */}
{(() => {
 const employeesWithData = employeesToShow.filter((emp: any) => {
  const data = inputs[emp.id];
  if (!data) return false;
  
  // Check legacy fields
  const hasLegacyHours = data.hours && parseFloat(data.hours) > 0;
  const hasLegacyPerDiem = data.perdiemAmount && parseFloat(data.perdiemAmount) > 0;
  const hasLegacyBreakdown = data.perdiemBreakdown && Object.values(data.perdiemBreakdown || {}).some(val => parseFloat(val as string) > 0);
  
  // Check relationship-specific fields
   // Check relationship-specific fields
   let hasRelationshipData = false;
  
   // Check for single client relationships
   if (emp.clientPayTypeRelationships && selectedClientId !== 'multiple') {
     // Check ALL relationships for this client (not just the first one found)
     const relationships = emp.clientPayTypeRelationships.filter((rel: any) => rel.clientId === selectedClientId && rel.active);
     
     for (const relationship of relationships) {
       const relId = relationship.id;
       const hasRelHours = data[`${relId}_hours`] && parseFloat(data[`${relId}_hours`] || '0') > 0;
       const hasRelOTHours = data[`${relId}_otHours`] && parseFloat(data[`${relId}_otHours`] || '0') > 0;
       const hasRelHolidayHours = data[`${relId}_holidayHours`] && parseFloat(data[`${relId}_holidayHours`] || '0') > 0;
       // More robust check for per diem amount - check if value exists and is > 0
       const perdiemAmountValue = data[`${relId}_perdiemAmount`];
       const hasRelPerDiemAmount = perdiemAmountValue !== undefined && perdiemAmountValue !== null && perdiemAmountValue !== '' && parseFloat(perdiemAmountValue || '0') > 0;
       
       // Check PTO amount for per diem employees (simple dollar amount)
       const ptoAmountValue = data[`${relId}_ptoAmount`];
       const hasRelPTO = ptoAmountValue !== undefined && ptoAmountValue !== null && ptoAmountValue !== '' && parseFloat(ptoAmountValue || '0') > 0;
       
       // Check Other Pay fields
       const hasRelOtherPay = data[`${relId}_otherPay`] && Array.isArray(data[`${relId}_otherPay`]) && 
         data[`${relId}_otherPay`].some((item: OtherPayItem) => parseFloat(item.amount || '0') > 0);
       
       // Check daily breakdown fields
       const dailyFields = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
       const hasRelDailyBreakdown = dailyFields.some(day => {
         const dayValue = data[`${relId}_perdiem${day}`];
         return dayValue !== undefined && dayValue !== null && dayValue !== '' && parseFloat(dayValue || '0') > 0;
       });
       
       if (hasRelHours || hasRelOTHours || hasRelHolidayHours || hasRelPerDiemAmount || hasRelDailyBreakdown || hasRelOtherPay || hasRelPTO) {
         hasRelationshipData = true;
         break; // Found data, no need to check other relationships
       }
     }
   }
   
   // Check for multiple client relationships
   if (emp.clientPayTypeRelationships && selectedClientId === 'multiple') {
     // Check all selected relationships for multiple clients
     const selectedRelationshipIds = data.selectedRelationshipIds || [];
     selectedRelationshipIds.forEach((relId: string) => {
       const hasRelHours = data[`${relId}_hours`] && parseFloat(data[`${relId}_hours`] || '0') > 0;
       const hasRelOTHours = data[`${relId}_otHours`] && parseFloat(data[`${relId}_otHours`] || '0') > 0;
       const hasRelHolidayHours = data[`${relId}_holidayHours`] && parseFloat(data[`${relId}_holidayHours`] || '0') > 0;
       // More robust check for per diem amount
       const perdiemAmountValue = data[`${relId}_perdiemAmount`];
       const hasRelPerDiemAmount = perdiemAmountValue !== undefined && perdiemAmountValue !== null && perdiemAmountValue !== '' && parseFloat(perdiemAmountValue || '0') > 0;
       
       // Check PTO amount for per diem employees (simple dollar amount)
       const ptoAmountValue = data[`${relId}_ptoAmount`];
       const hasRelPTO = ptoAmountValue !== undefined && ptoAmountValue !== null && ptoAmountValue !== '' && parseFloat(ptoAmountValue || '0') > 0;
       
       // Check daily breakdown fields
       const dailyFields = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
       const hasRelDailyBreakdown = dailyFields.some(day => {
         const dayValue = data[`${relId}_perdiem${day}`];
         return dayValue !== undefined && dayValue !== null && dayValue !== '' && parseFloat(dayValue || '0') > 0;
       });
       
       // Check Other Pay fields for multiple clients too
       const hasRelOtherPay = data[`${relId}_otherPay`] && Array.isArray(data[`${relId}_otherPay`]) && 
         data[`${relId}_otherPay`].some((item: OtherPayItem) => parseFloat(item.amount || '0') > 0);
       
       if (hasRelHours || hasRelOTHours || hasRelHolidayHours || hasRelPerDiemAmount || hasRelDailyBreakdown || hasRelOtherPay || hasRelPTO) {
         hasRelationshipData = true;
       }
     });
   }
  
  return hasLegacyHours || hasLegacyPerDiem || hasLegacyBreakdown || hasRelationshipData;
});
  
return employeesWithData.length > 0 && (
  <Box sx={{ mt: 3, textAlign: 'center', display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
    
    
    {/* Review Checks Button */}
    <Button
      variant="contained"
      size="large"
      onClick={reviewChecks}
      disabled={isCreatingChecks}
      sx={{ 
        px: 4,
        py: 1.5,
        fontSize: '1.1rem',
        fontWeight: 'bold',
        borderRadius: 2,
        boxShadow: 3,
        '&:hover': {
          boxShadow: 6,
          transform: 'translateY(-2px)',
        },
        transition: 'all 0.2s ease-in-out',
      }}
    >
      {isCreatingChecks ? "Creating Checks..." : " Review Checks Before Creating"}
    </Button>
  </Box>
);
})()}
</>
);

          
             })()} {/* This is the closing of the main employee filtering IIFE at line 3448 */}
          

          
        </>
      )}

      {/* Floating Review Panel */}
      {showReviewPanel && (
        <Box
          sx={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '95vw',
            maxWidth: '1400px',
            maxHeight: '90vh',
            bgcolor: 'background.paper',
            borderRadius: 2,
            boxShadow: 24,
            p: 3,
            zIndex: 1300,
            overflow: 'auto',
            '@media print': {
              position: 'static',
              transform: 'none',
              width: '100%',
              maxWidth: '100%',
              maxHeight: 'none',
              boxShadow: 'none',
              borderRadius: 0,
              p: 2,
              overflow: 'visible'
            }
          }}
        >
          <Box 
            sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              mb: 3,
              pb: 2,
              borderBottom: '2px solid #e0e0e0'
            }}
          >
            <Typography 
              variant="h4" 
              fontWeight="bold"
              sx={{
                background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' }
              }}
            >
              Review Checks Before Creating
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button
                variant="outlined"
                startIcon={<PrintIcon />}
                onClick={generateReviewPDF}
                sx={{ 
                  minWidth: 'auto'
                }}
              >
                Print PDF
              </Button>
              <Button
                onClick={() => {
                  setShowReviewPanel(false);
                  setSelectedClientTab(null);
                }}
                sx={{ 
                  minWidth: 'auto',
                  '@media print': {
                    display: 'none'
                  }
                }}
              >
                ✕
              </Button>
            </Box>
          </Box>

          <Typography 
            variant="body2" 
            color="text.secondary" 
            sx={{ 
              mb: 3,
              '@media print': {
                display: 'none'
              }
            }}
          >
            Please review the following checks before creating them. You can go back to make changes if needed.
          </Typography>
          
          {/* Print Header - Only visible when printing */}
          <Box
            sx={{
              display: 'none',
              '@media print': {
                display: 'block',
                mb: 2,
                pb: 2,
                borderBottom: '2px solid #000'
              }
            }}
          >
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
              Payroll Checks Review
            </Typography>
            <Typography variant="body2">
              Generated: {new Date().toLocaleString()}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Company: {companies.find(c => c.id === selectedCompanyId)?.name || 'N/A'}
            </Typography>
          </Box>

          {(() => {
            // Separate expense checks from employee checks
            const expenseChecks = reviewData.filter(item => (item as any).isExpense === true);
            const employeeChecks = reviewData.filter(item => !(item as any).isExpense);
            
            // Get all unique clients/departments from employee checks only (using clientId as unique key)
            const allClientsMap = new Map<string, { clientId: string; clientName: string; division?: string }>();
            employeeChecks.forEach(item => {
              if (item.clientBreakdown) {
                item.clientBreakdown.forEach(breakdown => {
                  // Skip expenses client
                  if (breakdown.clientId === 'expenses') return;
                  // Use clientId as unique key
                  const uniqueKey = breakdown.clientId;
                  if (!allClientsMap.has(uniqueKey)) {
                    allClientsMap.set(uniqueKey, {
                      clientId: breakdown.clientId,
                      clientName: breakdown.clientName,
                      division: (breakdown as any).division
                    });
                  }
                });
              }
            });
            const clientList = Array.from(allClientsMap.keys()).sort();
            
            // Calculate expense total
            const expenseTotal = expenseChecks.reduce((sum, item) => sum + item.calculatedAmount, 0);
            const hasExpenses = expenseChecks.length > 0;

            // Use selected client tab or default to 'all' (or 'expenses' if expenses exist and no client selected)
            const currentSelectedTab = selectedClientTab || 
              (hasExpenses && !selectedClientTab ? 'expenses' : 'all');

            // Calculate totals per client (using clientId) - exclude expenses
            const clientTotals = clientList.map(uniqueKey => {
              const clientInfo = allClientsMap.get(uniqueKey)!;
              const total = employeeChecks.reduce((sum, item) => {
                const breakdown = item.clientBreakdown?.find(b => b.clientId === uniqueKey);
                return sum + (breakdown?.amount || 0);
              }, 0);
              // Create display name: "ClientName" or "ClientName (Division)" if division exists
              const displayName = clientInfo.division && clientInfo.division.trim()
                ? `${clientInfo.clientName} (${clientInfo.division})`
                : clientInfo.clientName;
              return { 
                uniqueKey,
                clientId: clientInfo.clientId,
                clientName: clientInfo.clientName,
                division: clientInfo.division,
                displayName,
                total 
              };
            }).sort((a, b) => a.displayName.localeCompare(b.displayName));

            // Get employees for selected client (using clientId) - exclude expenses unless 'all' tab
            const employeesForSelectedClient = currentSelectedTab && currentSelectedTab !== 'expenses' && currentSelectedTab !== 'all'
              ? employeeChecks.filter(item => {
                  return item.clientBreakdown?.some(b => b.clientId === currentSelectedTab);
                })
              : currentSelectedTab === 'all'
              ? [...employeeChecks, ...expenseChecks] // Include expenses in 'all' tab
              : [];

            return (
              <Box>
                {/* Summary Table - Totals per Client */}
                <Paper sx={{ mb: 3, p: 2 }}>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                    Summary by Client/Department
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                          <TableCell sx={{ fontWeight: 'bold' }}>Client/Department</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>Total Amount</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 'bold' }}>Employees</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {clientTotals.map(({ uniqueKey, displayName, total }) => {
                          const employeeCount = employeeChecks.filter(item => 
                            item.clientBreakdown?.some(b => b.clientId === uniqueKey)
                          ).length;
                          return (
                            <TableRow 
                              key={uniqueKey}
                              onClick={() => setSelectedClientTab(uniqueKey)}
                              sx={{ 
                                cursor: 'pointer',
                                '&:hover': { backgroundColor: currentSelectedTab === uniqueKey ? '#e3f2fd' : '#f5f5f5' },
                                backgroundColor: currentSelectedTab === uniqueKey ? '#e3f2fd' : 'white'
                              }}
                            >
                              <TableCell sx={{ fontWeight: 'bold' }}>
                                {displayName}
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                                ${formatCurrency(total)}
                              </TableCell>
                              <TableCell align="center">
                                {employeeCount} {employeeCount === 1 ? 'employee' : 'employees'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {hasExpenses && (
                          <TableRow 
                            onClick={() => setSelectedClientTab('expenses')}
                            sx={{ 
                              cursor: 'pointer',
                              '&:hover': { backgroundColor: currentSelectedTab === 'expenses' ? '#fff3e0' : '#f5f5f5' },
                              backgroundColor: currentSelectedTab === 'expenses' ? '#fff3e0' : 'white'
                            }}
                          >
                            <TableCell sx={{ fontWeight: 'bold', color: '#e65100' }}>
                              Expenses
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#e65100' }}>
                              ${formatCurrency(expenseTotal)}
                            </TableCell>
                            <TableCell align="center">
                              {expenseChecks.length} {expenseChecks.length === 1 ? 'expense' : 'expenses'}
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow sx={{ backgroundColor: '#e3f2fd', fontWeight: 'bold' }}>
                          <TableCell sx={{ fontWeight: 'bold' }}>
                            <strong>GRAND TOTAL</strong>
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
                            <strong>${formatCurrency(reviewData.reduce((sum, item) => sum + item.calculatedAmount, 0))}</strong>
                          </TableCell>
                          <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                            {employeeChecks.length} {employeeChecks.length === 1 ? 'employee' : 'employees'} {hasExpenses && `+ ${expenseChecks.length} ${expenseChecks.length === 1 ? 'expense' : 'expenses'}`}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>

                {/* Expenses Breakdown */}
                {currentSelectedTab === 'expenses' && hasExpenses && (
                  <Paper sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6" fontWeight="bold" sx={{ color: '#e65100' }}>
                        Expense Breakdown
                      </Typography>
                      <Box 
                        sx={{ 
                          display: 'flex', 
                          gap: 1, 
                          flexWrap: 'wrap',
                          '@media print': {
                            display: 'none'
                          }
                        }}
                      >
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => setSelectedClientTab('all')}
                          sx={{
                            minWidth: 100,
                            backgroundColor: 'transparent',
                            color: '#1976d2',
                            borderColor: '#1976d2',
                            fontWeight: 'bold',
                            '&:hover': {
                              backgroundColor: '#e3f2fd',
                              borderColor: '#1976d2'
                            }
                          }}
                        >
                          ALL
                        </Button>
                        {hasExpenses && (
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => setSelectedClientTab('expenses')}
                            sx={{
                              minWidth: 100,
                              backgroundColor: '#e65100',
                              color: 'white',
                              borderColor: '#e65100',
                              '&:hover': {
                                backgroundColor: '#e65100',
                                borderColor: '#e65100'
                              }
                            }}
                          >
                            EXPENSES
                          </Button>
                        )}
                        {clientTotals.map(({ uniqueKey, displayName, clientName }) => {
                          return (
                            <Button
                              key={uniqueKey}
                              variant="outlined"
                              size="small"
                              onClick={() => setSelectedClientTab(uniqueKey)}
                              sx={{
                                minWidth: 100,
                                backgroundColor: 'transparent'
                              }}
                            >
                              {displayName}
                            </Button>
                          );
                        })}
                      </Box>
                    </Box>
                    <TableContainer>
                      <Table size="small" sx={{ tableLayout: 'auto' }}>
                        <TableHead>
                          <TableRow sx={{ backgroundColor: '#fff3e0' }}>
                            <TableCell sx={{ fontWeight: 'bold' }}>Expense Name</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold' }}>Date</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {expenseChecks.map((item, index) => {
                            const expenseName = (item as any).expenseName || item.employee.name;
                            const expenseDescription = (item as any).expenseDescription || '';
                            const expenseDate = (item as any).expenseDate;
                            let checkDate = '';
                            if (expenseDate) {
                              const date = expenseDate instanceof Date 
                                ? expenseDate 
                                : new Date(expenseDate);
                              checkDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
                            }
                            
                            return (
                              <TableRow 
                                key={index}
                                sx={{ 
                                  '&:nth-of-type(odd)': { backgroundColor: '#fff3e0' },
                                  backgroundColor: '#fff3e0'
                                }}
                              >
                                <TableCell sx={{ fontWeight: 'bold', color: '#e65100' }}>
                                  {expenseName}
                                </TableCell>
                                <TableCell>
                                  {expenseDescription || '-'}
                                </TableCell>
                                <TableCell align="center">
                                  {checkDate || '-'}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', color: '#e65100' }}>
                                  ${formatCurrency(item.calculatedAmount)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow sx={{ backgroundColor: '#ffcc80', fontWeight: 'bold' }}>
                            <TableCell colSpan={3} sx={{ fontWeight: 'bold' }}>
                              <strong>Subtotal for Expenses</strong>
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                              <strong>${formatCurrency(expenseTotal)}</strong>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                )}

                {/* Detailed Employee Breakdown for Selected Client */}
                {currentSelectedTab && currentSelectedTab !== 'expenses' && employeesForSelectedClient.length > 0 && (
                  <Paper sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6" fontWeight="bold">
                        Employee Breakdown: {currentSelectedTab === 'all' 
                          ? 'All Employees' 
                          : (() => {
                              const selectedClientInfo = allClientsMap.get(currentSelectedTab);
                              return selectedClientInfo 
                                ? (selectedClientInfo.division && selectedClientInfo.division.trim()
                                    ? `${selectedClientInfo.clientName} (${selectedClientInfo.division})`
                                    : selectedClientInfo.clientName)
                                : currentSelectedTab;
                            })()}
                      </Typography>
                      <Box 
                        sx={{ 
                          display: 'flex', 
                          gap: 1, 
                          flexWrap: 'wrap',
                          '@media print': {
                            display: 'none'
                          }
                        }}
                      >
                        <Button
                          variant={currentSelectedTab === 'all' ? "contained" : "outlined"}
                          size="small"
                          onClick={() => setSelectedClientTab('all')}
                          sx={{
                            minWidth: 100,
                            backgroundColor: currentSelectedTab === 'all' ? '#1976d2' : 'transparent',
                            color: currentSelectedTab === 'all' ? 'white' : '#1976d2',
                            borderColor: '#1976d2',
                            fontWeight: 'bold',
                            '&:hover': {
                              backgroundColor: currentSelectedTab === 'all' ? '#1976d2' : '#e3f2fd',
                              borderColor: '#1976d2'
                            }
                          }}
                        >
                          ALL
                        </Button>
                        {hasExpenses && (
                          <Button
                            variant={currentSelectedTab === 'expenses' ? "contained" : "outlined"}
                            size="small"
                            onClick={() => setSelectedClientTab('expenses')}
                            sx={{
                              minWidth: 100,
                              backgroundColor: currentSelectedTab === 'expenses' ? '#e65100' : 'transparent',
                              color: currentSelectedTab === 'expenses' ? 'white' : '#e65100',
                              borderColor: '#e65100',
                              '&:hover': {
                                backgroundColor: currentSelectedTab === 'expenses' ? '#e65100' : '#fff3e0',
                                borderColor: '#e65100'
                              }
                            }}
                          >
                            EXPENSES
                          </Button>
                        )}
                        {clientTotals.map(({ uniqueKey, displayName, clientName }) => {
                          return (
                            <Button
                              key={uniqueKey}
                              variant={currentSelectedTab === uniqueKey ? "contained" : "outlined"}
                              size="small"
                              onClick={() => setSelectedClientTab(uniqueKey)}
                              sx={{
                                minWidth: 100,
                                backgroundColor: currentSelectedTab === uniqueKey 
                                  ? (clientName.toLowerCase().includes('fusion') ? '#1976d2' : 
                                     clientName.toLowerCase().includes('lto') ? '#4caf50' : '#f57c00')
                                  : 'transparent'
                              }}
                            >
                              {displayName}
                            </Button>
                          );
                        })}
                      </Box>
                    </Box>

                    <TableContainer sx={{ overflowX: 'auto' }}>
                      <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
                        <TableHead>
                          <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                            <TableCell sx={{ fontWeight: 'bold', width: '15%' }}>Employee</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold', width: '6%' }}>Hr</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold', width: '6%' }}>OT</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold', width: '6%' }}>PTO</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold', width: '8%' }}>$Hr</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold', width: '8%' }}>$OT</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold', width: '8%' }}>$PTO</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold', width: '12%' }}>Other</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold', width: '9%' }}>Per Diem</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold', width: '8%' }}>Date</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold', width: '10%', minWidth: '80px' }}>Amount</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {(() => {
                            // Separate expenses from employees for 'all' tab
                            const employeeRows: Array<{item: any; breakdown: any; clientId: string}> = [];
                            const expenseRows: Array<{item: any; breakdown: any; clientId: string}> = [];
                            
                            employeesForSelectedClient.forEach((item) => {
                              const isExpense = (item as any).isExpense === true;
                              
                              if (currentSelectedTab === 'all') {
                                // For 'all' tab, separate expenses from employees
                                if (isExpense) {
                                  // For expenses, use their clientBreakdown (which has clientId: 'expenses')
                                  item.clientBreakdown?.forEach((breakdown: any) => {
                                    expenseRows.push({ item, breakdown, clientId: breakdown.clientId });
                                  });
                                } else {
                                  // For regular employees, show all breakdowns
                                  item.clientBreakdown?.forEach((breakdown: any) => {
                                    employeeRows.push({ item, breakdown, clientId: breakdown.clientId });
                                  });
                                }
                              } else {
                                // For specific client tab, show only matching breakdown (no expenses)
                                const breakdown = item.clientBreakdown?.find((b: any) => b.clientId === currentSelectedTab);
                                if (breakdown && !isExpense) {
                                  employeeRows.push({ item, breakdown, clientId: currentSelectedTab });
                                }
                              }
                            });
                            
                            // Render expenses first (if any) with simplified layout, then employees
                            const allRows: JSX.Element[] = [];
                            
                            // Render expenses with simplified layout
                            expenseRows.forEach(({ item, breakdown, clientId }, index) => {
                              const expenseName = (item as any).expenseName || item.employee.name;
                              const expenseDescription = (item as any).expenseDescription || '';
                              const expenseDate = (item as any).expenseDate;
                              let checkDate = '';
                              if (expenseDate) {
                                const date = expenseDate instanceof Date 
                                  ? expenseDate 
                                  : new Date(expenseDate);
                                checkDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
                              }
                              
                              allRows.push(
                                <TableRow 
                                  key={`expense-${item.employee.id}-${clientId}-${index}`}
                                  sx={{ 
                                    backgroundColor: '#fff3e0'
                                  }}
                                >
                                  <TableCell sx={{ fontWeight: 'bold', color: '#e65100' }}>
                                    {expenseName}
                                  </TableCell>
                                  <TableCell align="right">-</TableCell>
                                  <TableCell align="right">-</TableCell>
                                  <TableCell align="right">-</TableCell>
                                  <TableCell align="right">-</TableCell>
                                  <TableCell align="right">-</TableCell>
                                  <TableCell align="right">-</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 'bold', color: '#e65100' }}>
                                    {expenseDescription || '-'}
                                  </TableCell>
                                  <TableCell align="right">-</TableCell>
                                  <TableCell align="center">
                                    {checkDate || '-'}
                                  </TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 'bold', color: '#e65100', whiteSpace: 'nowrap' }}>
                                    ${formatCurrency(breakdown.amount)}
                                  </TableCell>
                                </TableRow>
                              );
                            });
                            
                            // Render employees with full payroll layout
                            employeeRows.forEach(({ item, breakdown, clientId }, index) => {
                            // Get check date from tabData
                            let checkDate = '';
                            const tabDataForClient = tabData[clientId];
                            const inputData = tabDataForClient?.inputs?.[item.employee.id];
                            if (inputData?.checkDate) {
                              const date = inputData.checkDate instanceof Date 
                                ? inputData.checkDate 
                                : new Date(inputData.checkDate);
                              checkDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
                            }

                            // Parse details to extract values
                            let hours = 0;
                            let otHours = 0;
                            let holidayHours = 0;
                            let hourlyAmount = 0;
                            let otAmount = 0;
                            let holidayAmount = 0;
                            let otherPay = 0;
                            let otherPayItems: Array<{description: string; amount: number}> = [];
                            
                            // Use perDiemAmount directly from breakdown (more reliable than parsing from details)
                            let perDiem = breakdown.perDiemAmount || 0;

                            // Check if this is an expense - expenses should be handled differently
                            const isExpense = (item as any).isExpense === true || breakdown.payType === 'expense';
                            
                            if (isExpense) {
                              // For expenses, put the amount directly in Other Pay
                              otherPay = breakdown.amount || 0;
                              if (otherPay > 0) {
                                const expenseName = (item as any).expenseName || item.employee.name;
                                const expenseDescription = (item as any).expenseDescription || '';
                                const description = expenseDescription || expenseName || 'Expense';
                                otherPayItems.push({ description, amount: otherPay });
                              }
                            } else if (inputData) {
                              // PRIMARY SOURCE: Read hours directly from inputData (most reliable)
                              // Try to find the relationship for this client
                              const relationship = item.employee.clientPayTypeRelationships?.find((rel: any) => rel.clientId === clientId);
                              
                              // Check if data uses selectedRelationshipIds (same pattern as calculateReviewData)
                              if ((inputData as any).selectedRelationshipIds && (inputData as any).selectedRelationshipIds.length > 0) {
                                // Data uses selectedRelationshipIds - find the relationship that matches this clientId
                                (inputData as any).selectedRelationshipIds.forEach((selectedRelId: string) => {
                                  const selectedRel = item.employee.clientPayTypeRelationships?.find((rel: any) => rel.id === selectedRelId);
                                  if (selectedRel && selectedRel.clientId === clientId && selectedRel.payType === 'hourly') {
                                    hours = parseFloat((inputData as any)[`${selectedRelId}_hours`] || '0') || 0;
                                    otHours = parseFloat((inputData as any)[`${selectedRelId}_otHours`] || '0') || 0;
                                    holidayHours = parseFloat((inputData as any)[`${selectedRelId}_holidayHours`] || '0') || 0;
                                    
                                    // Calculate amounts from hours
                                    const rate = parseFloat(selectedRel.payRate || '0');
                                    if (hours > 0) hourlyAmount = hours * rate;
                                    if (otHours > 0) otAmount = otHours * rate * 1.5;
                                    if (holidayHours > 0) holidayAmount = holidayHours * rate;
                                  }
                                });
                              } else if (relationship) {
                                // Direct relationship lookup (no selectedRelationshipIds)
                                const relId = relationship.id;
                                hours = parseFloat((inputData as any)[`${relId}_hours`] || '0') || 0;
                                otHours = parseFloat((inputData as any)[`${relId}_otHours`] || '0') || 0;
                                holidayHours = parseFloat((inputData as any)[`${relId}_holidayHours`] || '0') || 0;
                                
                                // Calculate amounts from hours
                                const rate = parseFloat(relationship.payRate || '0');
                                if (hours > 0) hourlyAmount = hours * rate;
                                if (otHours > 0) otAmount = otHours * rate * 1.5;
                                if (holidayHours > 0) holidayAmount = holidayHours * rate;
                              } else {
                                // Legacy mode - no relationship
                                hours = parseFloat((inputData as any).hours || '0') || 0;
                                otHours = parseFloat((inputData as any).otHours || '0') || 0;
                                holidayHours = parseFloat((inputData as any).holidayHours || '0') || 0;
                                
                                // Calculate amounts from hours
                                const rate = parseFloat(String(item.employee.payRate || '0'));
                                if (hours > 0) hourlyAmount = hours * rate;
                                if (otHours > 0) otAmount = otHours * rate * 1.5;
                                if (holidayHours > 0) holidayAmount = holidayHours * rate;
                              }
                              
                              // Now parse breakdown.details ONLY for Other Pay (hours already read from inputData above)
                              if (breakdown.details && breakdown.details.length > 0) {
                                breakdown.details.forEach((detail: any) => {
                                  const label = detail.label.toLowerCase();
                                  const value = detail.value;
                                  
                                  // Extract PTO amount for per diem employees (format: "PTO: $100.00")
                                  if (label.includes('pto') && !label.includes('holiday')) {
                                    const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                                    if (amountMatch) {
                                      holidayAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
                                      // For per diem PTO, we don't have hours, just the amount
                                      holidayHours = 0;
                                    }
                                  }
                                  
                                  // Extract Other Pay (anything that's not hours, OT, holiday, per diem, or PTO)
                                  // Preserve the description from detail.label
                                  if (!label.includes('hrs') && !label.includes('ot') && !label.includes('holiday') && 
                                      !label.includes('per diem') && !label.includes('pto') &&
                                      !['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(label.trim()) &&
                                      value.includes('$')) {
                                    const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                                    if (amountMatch) {
                                      const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                                      otherPay += amount;
                                      // Preserve the description (use original label, not lowercased)
                                      const description = detail.label.trim() || 'Other Pay';
                                      otherPayItems.push({ description, amount });
                                    }
                                  }
                                });
                              }
                            } else if (breakdown.details && breakdown.details.length > 0) {
                              // Fallback: If no inputData, try parsing from breakdown.details (less reliable)
                              breakdown.details.forEach((detail: any) => {
                                const label = detail.label.toLowerCase();
                                const value = detail.value;
                                
                                // Extract regular hours (format: "30 hrs × $17")
                                if (label.includes('hrs') && !label.includes('ot') && !label.includes('holiday')) {
                                  const hrsMatch = detail.label.match(/(\d+(?:\.\d+)?)\s*hrs/i);
                                  if (hrsMatch) hours = parseFloat(hrsMatch[1]);
                                  const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                                  if (amountMatch) hourlyAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
                                }
                                
                                // Extract OT hours (format: "10 OT × $25.50" or "27 OT × $27.00")
                                if (label.includes('ot') && !label.includes('holiday')) {
                                  // Try multiple patterns to be robust - handle various whitespace and formats
                                  let otMatch = detail.label.match(/^(\d+(?:\.\d+)?)\s+OT/i);
                                  if (!otMatch) {
                                    otMatch = detail.label.match(/(\d+(?:\.\d+)?)\s+OT/i);
                                  }
                                  if (!otMatch) {
                                    otMatch = detail.label.match(/(\d+(?:\.\d+)?)\s*OT/i);
                                  }
                                  if (!otMatch) {
                                    otMatch = detail.label.match(/(\d+(?:\.\d+)?)OT/i);
                                  }
                                  if (otMatch && otMatch[1]) {
                                    const parsedHours = parseFloat(otMatch[1]);
                                    if (!isNaN(parsedHours)) {
                                      otHours = parsedHours;
                                    }
                                  }
                                  const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                                  if (amountMatch) otAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
                                }
                                
                                // Extract Holiday hours (format: "8 holiday × $34") for hourly employees
                                if (label.includes('holiday')) {
                                  const holidayMatch = detail.label.match(/(\d+(?:\.\d+)?)\s*holiday/i);
                                  if (holidayMatch) holidayHours = parseFloat(holidayMatch[1]);
                                  const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                                  if (amountMatch) holidayAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
                                }
                                
                                // Extract PTO amount for per diem employees (format: "PTO: $100.00")
                                if (label.includes('pto') && !label.includes('holiday')) {
                                  const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                                  if (amountMatch) {
                                    holidayAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
                                    holidayHours = 0;
                                  }
                                }
                                
                                // Extract Other Pay
                                if (!label.includes('hrs') && !label.includes('ot') && !label.includes('holiday') && 
                                    !label.includes('per diem') && !label.includes('pto') &&
                                    !['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(label.trim()) &&
                                    value.includes('$')) {
                                  const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                                  if (amountMatch) {
                                    const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                                    otherPay += amount;
                                    const description = detail.label.trim() || 'Other Pay';
                                    otherPayItems.push({ description, amount });
                                  }
                                }
                              });
                            }

                            // Regular employee payroll check (expenses are handled separately above)
                            // For 'all' tab, show client name with employee name
                            const clientInfo = currentSelectedTab === 'all' 
                              ? allClientsMap.get(clientId)
                              : null;
                            const employeeDisplayName = currentSelectedTab === 'all' && clientInfo
                              ? `${item.employee.name} (${clientInfo.division && clientInfo.division.trim() 
                                  ? `${clientInfo.clientName} (${clientInfo.division})` 
                                  : clientInfo.clientName})`
                              : item.employee.name;
                            
                            allRows.push(
                              <TableRow 
                                key={`employee-${item.employee.id}-${clientId}-${index}`}
                                sx={{ '&:nth-of-type(odd)': { backgroundColor: '#fafafa' } }}
                              >
                                <TableCell sx={{ fontWeight: 'bold' }}>
                                  {employeeDisplayName}
                                </TableCell>
                                <TableCell align="right">
                                  {hours > 0 ? hours.toFixed(2) : '0.00'}
                                </TableCell>
                                <TableCell align="right">
                                  {otHours > 0 ? otHours.toFixed(2) : '0.00'}
                                </TableCell>
                                <TableCell align="right">
                                  {holidayHours > 0 ? holidayHours.toFixed(2) : '0.00'}
                                </TableCell>
                                <TableCell align="right">
                                  {hourlyAmount > 0 ? `$${hourlyAmount.toFixed(2)}` : '-'}
                                </TableCell>
                                <TableCell align="right">
                                  {otAmount > 0 ? `$${otAmount.toFixed(2)}` : '-'}
                                </TableCell>
                                <TableCell align="right">
                                  {holidayAmount > 0 ? `$${holidayAmount.toFixed(2)}` : '-'}
                                </TableCell>
                                <TableCell align="right" sx={{ textAlign: 'right' }}>
                                  {otherPay > 0 ? (
                                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.25 }}>
                                      {otherPayItems.map((item, idx) => (
                                        <Typography 
                                          key={idx} 
                                          variant="body2" 
                                          sx={{ 
                                            fontSize: '0.85rem',
                                            textAlign: 'right',
                                            whiteSpace: 'nowrap'
                                          }}
                                        >
                                          {item.description}: ${formatCurrency(item.amount)}
                                        </Typography>
                                      ))}
                                    </Box>
                                  ) : '-'}
                                </TableCell>
                                <TableCell align="right">
                                  {perDiem > 0 ? `$${formatCurrency(perDiem)}` : '-'}
                                </TableCell>
                                <TableCell align="center">
                                  {checkDate || '-'}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  <Typography 
                                    variant="body1"
                                    sx={{ 
                                      color: breakdown.payType === 'Hourly' ? '#1976d2' : '#f57c00',
                                      fontWeight: 'bold',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    ${formatCurrency(breakdown.amount)}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            );
                            });
                            
                            return allRows;
                          })()}
                          {currentSelectedTab !== 'all' && (
                            <TableRow sx={{ backgroundColor: '#e3f2fd', fontWeight: 'bold' }}>
                              <TableCell colSpan={10} sx={{ fontWeight: 'bold' }}>
                                <strong>Subtotal for {(() => {
                                  const selectedClientInfo = allClientsMap.get(currentSelectedTab);
                                  return selectedClientInfo 
                                    ? (selectedClientInfo.division && selectedClientInfo.division.trim()
                                        ? `${selectedClientInfo.clientName} (${selectedClientInfo.division})`
                                        : selectedClientInfo.clientName)
                                    : currentSelectedTab;
                                })()}</strong>
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                                <strong>
                                  ${formatCurrency(employeesForSelectedClient.reduce((sum, item) => {
                                    const breakdown = item.clientBreakdown?.find(b => b.clientId === currentSelectedTab);
                                    return sum + (breakdown?.amount || 0);
                                  }, 0))}
                                </strong>
                              </TableCell>
                            </TableRow>
                          )}
                          
                          {/* Grand Total Row - shows totals for all columns across all employees */}
                          {(() => {
                            // Calculate grand totals across all employees in reviewData
                            let grandTotalHours = 0;
                            let grandTotalOTHours = 0;
                            let grandTotalHolidayHours = 0;
                            let grandTotalHourlyAmount = 0;
                            let grandTotalOTAmount = 0;
                            let grandTotalHolidayAmount = 0;
                            let grandTotalOtherPay = 0;
                            let grandTotalPerDiem = 0;
                            let grandTotalAmount = 0;

                            reviewData.forEach(item => {
                              item.clientBreakdown?.forEach(breakdown => {
                                // Check if this is an expense - expenses should be handled differently
                                const isExpense = (item as any).isExpense === true || breakdown.payType === 'expense';
                                
                                if (isExpense) {
                                  // For expenses, add amount directly to Other Pay grand total
                                  grandTotalOtherPay += breakdown.amount || 0;
                                } else {
                                  // Add per diem amount directly from breakdown (more reliable than parsing from details)
                                  // This already includes the sum of all daily breakdowns if applicable
                                  if (breakdown.perDiemAmount) {
                                    grandTotalPerDiem += breakdown.perDiemAmount;
                                  }
                                  
                                  if (breakdown.details && breakdown.details.length > 0) {
                                    breakdown.details.forEach((detail) => {
                                      const label = detail.label.toLowerCase();
                                      const value = detail.value;
                                      
                                      // Extract regular hours
                                      if (label.includes('hrs') && !label.includes('ot') && !label.includes('holiday')) {
                                        const hrsMatch = detail.label.match(/(\d+(?:\.\d+)?)\s*hrs/i);
                                        if (hrsMatch) grandTotalHours += parseFloat(hrsMatch[1]);
                                        const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                                        if (amountMatch) grandTotalHourlyAmount += parseFloat(amountMatch[1].replace(/,/g, ''));
                                      }
                                      
                                      // Extract OT hours
                                      if (label.includes('ot') && !label.includes('holiday')) {
                                        const otMatch = detail.label.match(/(\d+(?:\.\d+)?)\s*ot/i);
                                        if (otMatch) grandTotalOTHours += parseFloat(otMatch[1]);
                                        const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                                        if (amountMatch) grandTotalOTAmount += parseFloat(amountMatch[1].replace(/,/g, ''));
                                      }
                                      
                                      // Extract Holiday hours (for hourly employees)
                                      if (label.includes('holiday')) {
                                        const holidayMatch = detail.label.match(/(\d+(?:\.\d+)?)\s*holiday/i);
                                        if (holidayMatch) grandTotalHolidayHours += parseFloat(holidayMatch[1]);
                                        const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                                        if (amountMatch) grandTotalHolidayAmount += parseFloat(amountMatch[1].replace(/,/g, ''));
                                      }
                                      
                                      // Extract PTO amount for per diem employees (format: "PTO: $100.00")
                                      if (label.includes('pto') && !label.includes('holiday')) {
                                        const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                                        if (amountMatch) {
                                          grandTotalHolidayAmount += parseFloat(amountMatch[1].replace(/,/g, ''));
                                          // For per diem PTO, we don't have hours, just the amount
                                          // Hours stay at 0 but amount is added
                                        }
                                      }
                                      
                                      // NOTE: We do NOT extract "Per Diem" from details here because we already
                                      // use breakdown.perDiemAmount above, which is more reliable and already includes
                                      // the sum of daily breakdowns when applicable.
                                      
                                      // Extract Other Pay (exclude PTO)
                                      if (!label.includes('hrs') && !label.includes('ot') && !label.includes('holiday') && 
                                          !label.includes('per diem') && !label.includes('pto') && 
                                          !['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(label.trim()) &&
                                          value.includes('$')) {
                                        const amountMatch = value.match(/\$?([\d,]+\.?\d*)/);
                                        if (amountMatch) grandTotalOtherPay += parseFloat(amountMatch[1].replace(/,/g, ''));
                                      }
                                      
                                      // NOTE: We do NOT extract individual day names (Monday-Sunday) here because
                                      // breakdown.perDiemAmount already includes the sum of all daily breakdowns
                                      // when perdiemBreakdown is true. Extracting them again would cause double-counting.
                                    });
                                  }
                                }
                                grandTotalAmount += breakdown.amount || 0;
                              });
                            });

                            return (
                              <TableRow sx={{ backgroundColor: '#1976d2', color: 'white', fontWeight: 'bold' }}>
                                <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>
                                  <strong>GRAND TOTAL</strong>
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', color: 'white' }}>
                                  <strong>{grandTotalHours.toFixed(2)}</strong>
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', color: 'white' }}>
                                  <strong>{grandTotalOTHours.toFixed(2)}</strong>
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', color: 'white' }}>
                                  <strong>{grandTotalHolidayHours.toFixed(2)}</strong>
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', color: 'white' }}>
                                  <strong>{grandTotalHourlyAmount > 0 ? `$${formatCurrency(grandTotalHourlyAmount)}` : '-'}</strong>
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', color: 'white' }}>
                                  <strong>{grandTotalOTAmount > 0 ? `$${formatCurrency(grandTotalOTAmount)}` : '-'}</strong>
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', color: 'white' }}>
                                  <strong>{grandTotalHolidayAmount > 0 ? `$${formatCurrency(grandTotalHolidayAmount)}` : '-'}</strong>
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', color: 'white' }}>
                                  <strong>{grandTotalOtherPay > 0 ? `$${formatCurrency(grandTotalOtherPay)}` : '-'}</strong>
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', color: 'white' }}>
                                  <strong>{grandTotalPerDiem > 0 ? `$${formatCurrency(grandTotalPerDiem)}` : '-'}</strong>
                                </TableCell>
                                <TableCell align="center" sx={{ fontWeight: 'bold', color: 'white' }}>
                                  <strong>-</strong>
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1.2rem', color: 'white' }}>
                                  <strong>${formatCurrency(grandTotalAmount)}</strong>
                                </TableCell>
                              </TableRow>
                            );
                          })()}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                )}
              </Box>
            );
          })()}

          {/* Action Buttons */}
          <Box 
            sx={{ 
              display: 'flex', 
              gap: 2, 
              justifyContent: 'center',
              flexWrap: 'wrap',
              '@media print': {
                display: 'none'
              }
            }}
          >
            <Button
              variant="outlined"
              onClick={() => {
                setShowReviewPanel(false);
                setSelectedClientTab(null);
              }}
              size="large"
            >
              ← Go Back & Edit
            </Button>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => {
                // Close review panel but keep all data intact
                setShowReviewPanel(false);
                setSelectedClientTab(null);
                // Data remains in tabData and inputs, so user can continue editing
              }}
              size="large"
            >
              Continue Reviewing
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                setShowReviewPanel(false);
                setSelectedClientTab(null);
                handleCreateChecks();
              }}
              disabled={isCreatingChecks}
              size="large"
              startIcon={<span></span>}
            >
              {isCreatingChecks ? "Creating Checks..." : "Create Checks"}
            </Button>
          </Box>
        </Box>
      )}
      
      {/* Floating Navigation Menu */}
      <Fade in={floatingMenu.open} timeout={500}>
        <Box
          sx={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 9999,
          }}
        >
          <Paper
            elevation={8}
            sx={{
              p: 2,
              minWidth: 280,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              borderRadius: 2,
            }}
          >
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
              ✅ Check Created Successfully!
            </Typography>
            
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                <strong>Company:</strong> {floatingMenu.companyName}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                <strong>Client:</strong> {floatingMenu.clientName}
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                fullWidth
                onClick={() => {
                  // Navigate to View Checks with company filter
                  onGoToSection('View Checks');
                  // Set a flag to indicate we want to filter by company
                  localStorage.setItem('pendingCompanyFilter', floatingMenu.companyId || '');
                  // Set a flag to indicate we want to filter by week
                  setFloatingMenu(prev => ({ ...prev, open: false }));
                }}
                sx={{
                  background: 'rgba(255,255,255,0.2)',
                  '&:hover': { background: 'rgba(255,255,255,0.3)' }
                }}
              >
                📊 View My Checks
              </Button>
              
              {floatingMenu.clientId && (
                <Button
                  variant="contained"
                  size="small"
                  fullWidth
                  onClick={() => {
                    // Navigate to View Checks with company and client filter
                    onGoToSection('View Checks');
                    // Set flags to indicate we want to filter by company and client
                    localStorage.setItem('pendingCompanyFilter', floatingMenu.companyId || '');
                  // Set a flag to indicate we want to filter by week
                    localStorage.setItem('pendingClientFilter', floatingMenu.clientId || '');
                    setFloatingMenu(prev => ({ ...prev, open: false }));
                  }}
                  sx={{
                    background: 'rgba(255,255,255,0.2)',
                    '&:hover': { background: 'rgba(255,255,255,0.3)' }
                  }}
                >
                  👥 View Client Checks
                </Button>
              )}
              
              <Button
                variant="outlined"
                size="small"
                fullWidth
                onClick={() => setFloatingMenu(prev => ({ ...prev, open: false }))}
                sx={{
                  borderColor: 'rgba(255,255,255,0.5)',
                  color: 'white',
                  '&:hover': { 
                    borderColor: 'white',
                    background: 'rgba(255,255,255,0.1)'
                  }
                }}
              >
                ✕ Close
              </Button>
            </Box>
          </Paper>
        </Box>
      </Fade>

   
    </Box>
  );
};

export default BatchChecks;

