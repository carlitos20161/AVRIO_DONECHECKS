import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  FormControlLabel,
  Checkbox,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip
} from '@mui/material';
import { Download, FilterList, Refresh, ExpandMore, Business, AttachMoney, People, Launch, FileDownload, AssignmentInd, Receipt } from '@mui/icons-material';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import ExcelJS from 'exceljs';
import { logger } from '../utils/logger';

interface Company {
  id: string;
  name: string;
  active: boolean;
}

interface Client {
  id: string;
  name: string;
  active: boolean;
  companyIds: string[];
  division?: string;
}

interface Employee {
  id: string;
  name: string;
  active: boolean;
  companyId: string;
  clientId?: string;
  payType?: string;
  position?: string;
  role?: string;
  address?: string;
  startDate?: string;
  clientPayTypeRelationships?: Array<{
    id: string;
    clientId: string;
    clientName: string;
    payType: string;
    payRate?: string;
  }>;
}

interface Check {
  id: string;
  checkNumber?: number;
  companyId: string;
  employeeId: string;
  clientId: string;
  payType: string;
  amount: number;
  hours?: number;
  payRate?: number;
  otHours?: number;
  overtimeHours?: number;
  overtimeRate?: number;
  holidayHours?: number;
  holidayRate?: number;
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
  workWeek: string;
  weekKey: string;
  date: any;
  memo?: string;
  paid: boolean;
  reviewed: boolean;
  createdBy: string;
  isExpense?: boolean;
  expenseName?: string;
  expenseDescription?: string;
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
    division?: string;
  }>;
}

interface ReportFilters {
  companyId?: string;
  startDate?: string;
  endDate?: string;
  includeInactive: boolean;
  includeUnpaid: boolean;
  includeUnreviewed: boolean;
}

interface DivisionBreakdown {
  divisionName: string;
  totalChecks: number;
  totalAmount: number;
  hourlyAmount: number;
  perdiemAmount: number;
  ptoAmount: number;
  otherPayAmount: number;
  expensesAmount: number;
  checks: Check[];
}

type RelationshipDetail = NonNullable<Check["relationshipDetails"]>[number];

interface DivisionMapEntry {
  divisionName: string;
  checks: Check[];
  clients: Set<string>;
  relationshipsByCheck: Map<string, RelationshipDetail[]>;
}

interface ClientBreakdown {
  clientId: string;
  clientName: string;
  totalChecks: number;
  totalAmount: number;
  hourlyAmount: number;
  perdiemAmount: number;
  ptoAmount: number;
  otherPayAmount: number;
  expensesAmount: number;
  divisionBreakdown: DivisionBreakdown[];
  checks: Check[];
}

interface ClientDepartmentStats {
  clientId: string;
  clientName: string;
  companyName: string;
  totalChecks: number;
  hourlyAmount: number;
  perdiemAmount: number;
  ptoAmount: number;
  otherPayAmount: number;
  expensesAmount: number;
  totalAmount: number;
  isActive: boolean;
}

interface CompanyReport {
  company: Company;
  totalChecks: number;
  totalAmount: number;
  clientBreakdown: ClientBreakdown[];
  checks: Check[];
}

interface ReportProps {
  currentRole: string;
  companyIds: string[];
  visibleClientIds: string[]; // IDs of clients this user can see
}

const Report: React.FC<ReportProps> = ({ currentRole, companyIds, visibleClientIds }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedCompanyForEmployees, setSelectedCompanyForEmployees] = useState<string>('all');
  const [selectedCompanyForEmployeeInfo, setSelectedCompanyForEmployeeInfo] = useState<string>('all');
  const [includeInactiveEmployees, setIncludeInactiveEmployees] = useState<boolean>(false);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState<string>('');
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [divisionChecksDialog, setDivisionChecksDialog] = useState<{
    open: boolean;
    divisionName: string;
    clientName: string;
    checks: Check[];
  }>({
    open: false,
    divisionName: '',
    clientName: '',
    checks: []
  });
  
  const [filters, setFilters] = useState<ReportFilters>({
    includeInactive: false,
    includeUnpaid: false,
    includeUnreviewed: false
  });

  // Employee selection handlers
  const toggleEmployeeSelection = (employeeId: string) => {
    setSelectedEmployees(prev => {
      const newSet = new Set(prev);
      if (newSet.has(employeeId)) {
        newSet.delete(employeeId);
      } else {
        newSet.add(employeeId);
      }
      return newSet;
    });
  };

  const toggleSelectAllEmployees = () => {
    const filteredEmployees = employees.filter(employee => {
      if (selectedCompanyForEmployees === 'all') return true;
      return employee.companyId === selectedCompanyForEmployees;
    });
    
    // Use all filtered employees, not just those with checks
    if (selectedEmployees.size === filteredEmployees.length) {
      // All selected, deselect all
      setSelectedEmployees(new Set());
    } else {
      // Select all
      setSelectedEmployees(new Set(filteredEmployees.map(emp => emp.id)));
    }
  };

  const handleDivisionClick = (divisionName: string, clientName: string, checks: Check[]) => {
    setDivisionChecksDialog({
      open: true,
      divisionName,
      clientName,
      checks
    });
  };

  const handleCloseDivisionDialog = () => {
    setDivisionChecksDialog({
      open: false,
      divisionName: '',
      clientName: '',
      checks: []
    });
  };

  // Helper function to calculate adaptive column width based on content (ultra tight fit)
  const calculateColumnWidth = (worksheet: ExcelJS.Worksheet, colNumber: number): number => {
    let maxLength = 0;
    
    // Check header
    const headerCell = worksheet.getRow(1).getCell(colNumber);
    if (headerCell.value !== null && headerCell.value !== undefined) {
      const headerLength = String(headerCell.value).length;
      maxLength = Math.max(maxLength, headerLength);
    }
    
    // Check all data rows - check all rows for most accurate sizing
    if (worksheet.rowCount > 1) {
      for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
        const cell = worksheet.getRow(rowNum).getCell(colNumber);
        if (cell.value !== null && cell.value !== undefined) {
          const cellValue = String(cell.value);
          // Ultra minimal padding - content fit only
          const isNumber = typeof cell.value === 'number';
          const isDate = cellValue.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
          // For numbers, use actual formatted length (no extra padding)
          // For dates and text, use exact length
          const length = isNumber 
            ? cellValue.length + 0.5  // Tiny padding for numbers only
            : cellValue.length; // Exact length for text
          maxLength = Math.max(maxLength, length);
        }
      }
    }
    
    // Return ultra tight width - exact content fit (min 5, max 40)
    // Excel column width is in character units, add minimal padding (0.5) for readability
    return Math.min(Math.max(maxLength + 0.5, 5), 40);
  };

  // Helper function to calculate adaptive row height based on content (very tight fit)
  const calculateRowHeight = (row: ExcelJS.Row): number => {
    let maxContentLength = 0;
    let cellCount = 0;
    
    row.eachCell((cell) => {
      if (cell.value !== null && cell.value !== undefined) {
        const cellValue = String(cell.value);
        maxContentLength = Math.max(maxContentLength, cellValue.length);
        cellCount++;
      }
    });
    
    // If no content, return minimum height
    if (cellCount === 0) {
      return 12;
    }
    
    // Very tight height calculation - base 12 for single line content
    // Only increase if content is very long (more than 50 chars)
    if (maxContentLength <= 50) {
      return 12; // Single line content - very tight
    } else if (maxContentLength <= 100) {
      return 15; // Slightly longer content
    } else {
      // For very long content, estimate lines (assuming ~50 chars per line)
      const estimatedLines = Math.ceil(maxContentLength / 50);
      return Math.min(12 + (estimatedLines - 1) * 10, 30); // Max 30 to prevent excessive height
    }
  };

  // Helper function to apply professional styling to ExcelJS worksheet
  const applyProfessionalStyling = (worksheet: ExcelJS.Worksheet, hasTotal: boolean = false) => {
    // Auto-size all columns based on content
    const columnCount = worksheet.columnCount;
    for (let colNum = 1; colNum <= columnCount; colNum++) {
      const calculatedWidth = calculateColumnWidth(worksheet, colNum);
      worksheet.getColumn(colNum).width = calculatedWidth;
    }

    // Style header row (very compact)
    const headerRow = worksheet.getRow(1);
    const headerHeight = calculateRowHeight(headerRow);
    headerRow.height = Math.max(headerHeight, 15); // Minimum 15 for header (very tight)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FF000000' }, size: 9 }; // Smaller font for tighter fit
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFFFF' } // White background
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false, shrinkToFit: false };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    // Style data rows with very tight adaptive heights
    const rowCount = worksheet.rowCount;
    for (let rowNum = 2; rowNum <= rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);
      const calculatedHeight = calculateRowHeight(row);
      row.height = calculatedHeight; // Use calculated height directly (very tight)
      
      // Check if this is the total row (last row if hasTotal is true)
      const isTotalRow = hasTotal && rowNum === rowCount;
      
      row.eachCell((cell, colNumber) => {
        // White background for all cells
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFFFF' } // White
        };
        
        // Bold font for total row, regular for others (very small font for maximum compactness)
        if (isTotalRow) {
          cell.font = { bold: true, color: { argb: 'FF000000' }, size: 9 };
        } else {
          cell.font = { color: { argb: 'FF000000' }, size: 9 }; // Very small font
        }
        
        // Center all cell contents, no wrapping for tightest fit
        cell.alignment = { 
          horizontal: 'center',
          vertical: 'middle',
          wrapText: false,
          shrinkToFit: false
        };
        
        // Black borders
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });
    }
  };

  const exportDivisionToExcel = async () => {
    try {
      const { divisionName, clientName, checks } = divisionChecksDialog;
      
      // Create workbook with ExcelJS
      const workbook = new ExcelJS.Workbook();
      
      // Add Division Details sheet
      const worksheet = workbook.addWorksheet('Division Details');
      
      // Define columns with all headers
      worksheet.columns = [
        { header: 'Check Number', key: 'checkNumber', width: 15 },
        { header: 'Company', key: 'company', width: 20 },
        { header: 'Employee', key: 'employee', width: 25 },
        { header: 'Division', key: 'division', width: 20 },
        { header: 'Client', key: 'client', width: 20 },
        { header: 'Pay Type', key: 'payType', width: 12 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Hours Worked', key: 'hoursWorked', width: 12 },
        { header: 'Pay Rate', key: 'payRate', width: 10 },
        { header: 'Overtime Hours', key: 'overtimeHours', width: 14 },
        { header: 'Overtime Rate', key: 'overtimeRate', width: 13 },
        { header: 'PTO Hours', key: 'holidayHours', width: 13 },
        { header: 'Holiday Rate', key: 'holidayRate', width: 12 },
        { header: 'Per Diem Amount', key: 'perDiemAmount', width: 15 },
        { header: 'Per Diem Breakdown', key: 'perDiemBreakdown', width: 18 },
        { header: 'Hourly Total', key: 'hourlyTotal', width: 13 },
        { header: 'Total Amount', key: 'totalAmount', width: 13 },
        { header: 'Paid', key: 'paid', width: 8 },
        { header: 'Reviewed', key: 'reviewed', width: 10 },
        { header: 'Memo', key: 'memo', width: 30 }
      ];
      
      // Style header row
      worksheet.getRow(1).height = 29;
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FF000000' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFFFF' } // White background
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });
      
      // Add data rows
      checks.forEach((check, index) => {
        const company = companies.find(c => c.id === check.companyId);
        const employee = employees.find(e => e.id === check.employeeId);
        
        // Get relationship-specific data for export
        let relationshipHours = check.hours || 0;
        let relationshipOtHours = check.otHours || 0;
        let relationshipHolidayHours = check.holidayHours || 0;
        let relationshipPayRate = check.payRate || 0;
        let relationshipOtRate = 0;
        let relationshipHolidayRate = 0;
        let perdiemTotal = check.perdiemAmount || 0;
        
        if (check.relationshipDetails && check.relationshipDetails.length > 0) {
          const relationship = check.relationshipDetails.find(rel => 
            rel.clientName === clientName
          ) || check.relationshipDetails[0];
          
          relationshipHours = relationship.hours || check.hours || 0;
          relationshipOtHours = relationship.otHours || check.otHours || 0;
          relationshipHolidayHours = relationship.holidayHours || check.holidayHours || 0;
          relationshipPayRate = relationship.payRate || check.payRate || 0;
          perdiemTotal = relationship.perdiemAmount || check.perdiemAmount || 0;
        }
        
        // Calculate OT and Holiday rates from base pay rate
        if (relationshipPayRate > 0) {
          relationshipOtRate = relationshipPayRate * 1.5;
          relationshipHolidayRate = relationshipPayRate * 2.0;
        }

        // Calculate per diem total if breakdown exists
        if (check.perdiemBreakdown) {
          perdiemTotal = (check.perdiemMonday || 0) + 
                        (check.perdiemTuesday || 0) + 
                        (check.perdiemWednesday || 0) + 
                        (check.perdiemThursday || 0) + 
                        (check.perdiemFriday || 0) + 
                        (check.perdiemSaturday || 0) + 
                        (check.perdiemSunday || 0);
        }

        // Calculate hourly total using relationship-specific data
        const hourlyTotal = relationshipHours * relationshipPayRate +
                           relationshipOtHours * relationshipOtRate +
                           relationshipHolidayHours * relationshipHolidayRate;

        // Ensure amount is a number
        const amount = parseFloat(check.amount?.toString() || '0');

        const row = worksheet.addRow({
          checkNumber: check.checkNumber || check.id,
          company: company?.name || 'Unknown Company',
          employee: employee?.name || 'Unknown Employee',
          division: divisionName,
          client: clientName,
          payType: check.payType,
          date: check.date?.toDate ? check.date.toDate().toLocaleDateString() : new Date(check.date).toLocaleDateString(),
          hoursWorked: relationshipHours,
          payRate: relationshipPayRate,
          overtimeHours: relationshipOtHours,
          overtimeRate: relationshipOtRate,
          holidayHours: relationshipHolidayHours,
          holidayRate: relationshipHolidayRate,
          perDiemAmount: perdiemTotal,
          perDiemBreakdown: check.perdiemBreakdown ? 'Yes' : 'No',
          hourlyTotal: hourlyTotal,
          totalAmount: amount,
          paid: check.paid ? 'Yes' : 'No',
          reviewed: check.reviewed ? 'Yes' : 'No',
          memo: check.memo || ''
        });
        
        // Set row height
        row.height = 20;
        
        // Apply styling - white background, black borders, centered content
        row.eachCell((cell, colNumber) => {
          // White background
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFFFF' } // White
          };
          
          // Text color
          cell.font = { color: { argb: 'FF000000' } };
          
          // Center all cell contents
          cell.alignment = { 
            horizontal: 'center',
            vertical: 'middle'
          };
          
          // Black borders
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        });
      });
      
      // Add Summary sheet
      const summarySheet = workbook.addWorksheet('Summary');
      
      summarySheet.columns = [
        { header: 'Division', key: 'division', width: 20 },
        { header: 'Client', key: 'client', width: 20 },
        { header: 'Total Checks', key: 'totalChecks', width: 15 },
        { header: 'Total Amount', key: 'totalAmount', width: 15 },
        { header: 'Paid Checks', key: 'paidChecks', width: 15 },
        { header: 'Unpaid Checks', key: 'unpaidChecks', width: 15 }
      ];
      
      // Style summary header row
      summarySheet.getRow(1).height = 29;
      summarySheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FF000000' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFFFF' } // White background
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });
      
      // Add summary data
      const summaryRow = summarySheet.addRow({
        division: divisionName,
        client: clientName,
        totalChecks: checks.length,
        totalAmount: checks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0),
        paidChecks: checks.filter(check => check.paid).length,
        unpaidChecks: checks.filter(check => !check.paid).length
      });
      
      summaryRow.height = 20;
      summaryRow.eachCell((cell, colNumber) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFFFF' } // White background
        };
        cell.font = { color: { argb: 'FF000000' } };
        // Center all cell contents
        cell.alignment = { 
          horizontal: 'center',
          vertical: 'middle'
        };
        // Black borders
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });

      // Generate filename and download
      const filename = `${divisionName.replace(/[^a-zA-Z0-9]/g, '_')}_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_report_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      // Write to buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);

      setSuccess(`Division report exported successfully as ${filename}`);
    } catch (error) {
      console.error('Error exporting division data:', error);
      setError('Failed to export division data. Please try again.');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Clear selection when company filter changes
  useEffect(() => {
    setSelectedEmployees(new Set());
  }, [selectedCompanyForEmployees]);

  // Use refs to prevent circular updates
  const syncingFromTopFilter = useRef(false);
  const syncingFromEmployeeSummary = useRef(false);
  const syncingFromEmployeeInfo = useRef(false);

  // Sync top Company filter DOWN to Employee Summary dropdown when Employee Summary tab is active
  useEffect(() => {
    if (selectedTab === 2 && !syncingFromEmployeeSummary.current) {
      const newValue = filters.companyId || 'all';
      if (selectedCompanyForEmployees !== newValue) {
        syncingFromTopFilter.current = true;
        setSelectedCompanyForEmployees(newValue);
        // Reset flag after state update
        requestAnimationFrame(() => {
          syncingFromTopFilter.current = false;
        });
      }
    }
  }, [filters.companyId, selectedTab]);

  // Sync top Company filter DOWN to Employee Info Report dropdown when Employee Info Report tab is active
  useEffect(() => {
    if (selectedTab === 3 && !syncingFromEmployeeInfo.current) {
      const newValue = filters.companyId || 'all';
      if (selectedCompanyForEmployeeInfo !== newValue) {
        syncingFromTopFilter.current = true;
        setSelectedCompanyForEmployeeInfo(newValue);
        // Reset flag after state update
        requestAnimationFrame(() => {
          syncingFromTopFilter.current = false;
        });
      }
    }
  }, [filters.companyId, selectedTab]);

  // Sync Employee Summary dropdown UP to top Company filter when Employee Summary tab is active
  useEffect(() => {
    if (selectedTab === 2 && !syncingFromTopFilter.current) {
      const newCompanyId = selectedCompanyForEmployees === 'all' ? undefined : selectedCompanyForEmployees;
      if (filters.companyId !== newCompanyId) {
        syncingFromEmployeeSummary.current = true;
        setFilters(prev => ({ ...prev, companyId: newCompanyId }));
        // Reset flag after state update
        requestAnimationFrame(() => {
          syncingFromEmployeeSummary.current = false;
        });
      }
    }
  }, [selectedCompanyForEmployees, selectedTab]);

  // Sync Employee Info Report dropdown UP to top Company filter when Employee Info Report tab is active
  useEffect(() => {
    if (selectedTab === 3 && !syncingFromTopFilter.current) {
      const newCompanyId = selectedCompanyForEmployeeInfo === 'all' ? undefined : selectedCompanyForEmployeeInfo;
      if (filters.companyId !== newCompanyId) {
        syncingFromEmployeeInfo.current = true;
        setFilters(prev => ({ ...prev, companyId: newCompanyId }));
        // Reset flag after state update
        requestAnimationFrame(() => {
          syncingFromEmployeeInfo.current = false;
        });
      }
    }
  }, [selectedCompanyForEmployeeInfo, selectedTab]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch companies
      const companiesSnap = await getDocs(collection(db, 'companies'));
      const companiesData = companiesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Company[];
      setCompanies(companiesData);

      // Fetch clients
      const clientsSnap = await getDocs(collection(db, 'clients'));
      let clientsData = clientsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Client[];
      
      // 🔒 SECURITY: Filter clients by visibleClientIds (only show clients user has access to)
      if (currentRole !== 'admin' && visibleClientIds.length > 0) {
        clientsData = clientsData.filter(client => visibleClientIds.includes(client.id));
        logger.log('🔒 [Report Security] Filtered clients by visibleClientIds:', {
          originalCount: clientsSnap.docs.length,
          filteredCount: clientsData.length,
          visibleClientIds
        });
      }
      
      setClients(clientsData);

      // Fetch employees
      const employeesSnap = await getDocs(collection(db, 'employees'));
      const employeesData = employeesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Employee[];
      setEmployees(employeesData);

      // Fetch checks
      const checksSnap = await getDocs(query(
        collection(db, 'checks'),
        orderBy('date', 'desc')
      ));
      const checksData = checksSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Check[];
      setChecks(checksData);

    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to fetch data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getDivisionNameForRelationship = (check: Check, relationship?: RelationshipDetail): string => {
    // Check if this is an expense check first
    const isExpenseCheck = check.isExpense || check.payType === 'expense';
    
    if (isExpenseCheck) {
      return 'Expenses';
    }

    let divisionName = 'No Division';

    const hasContainer = check.relationshipDetails?.some(rel => rel.clientName === 'Container');
    const hasProjects = check.relationshipDetails?.some(rel => rel.clientName === 'Projects');

    if (hasContainer && hasProjects) {
      divisionName = 'Container';
    } else if (relationship?.division) {
      divisionName = relationship.division;
    } else {
      const clientId = relationship?.clientId || check.clientId;
      const client = clients.find(c => c.id === clientId);
      divisionName = client?.division || 'No Division';
    }

    return divisionName;
  };

  const getFilteredData = () => {
    let filteredChecks = checks;

    // Apply company filter
    if (filters.companyId) {
      filteredChecks = filteredChecks.filter(check => check.companyId === filters.companyId);
    }

    // 🔒 SECURITY: Filter by visibleClientIds (only show clients user has access to)
    // Admins see everything, managers/users only see their assigned clients
    if (currentRole !== 'admin' && visibleClientIds.length > 0) {
      filteredChecks = filteredChecks.filter(check => {
        // Check if check's client is in visible clients
        if (check.clientId && visibleClientIds.includes(check.clientId)) {
          return true;
        }
        // Also check relationship details for multi-client checks
        if (check.relationshipDetails && check.relationshipDetails.length > 0) {
          return check.relationshipDetails.some(rel => 
            rel.clientId && visibleClientIds.includes(rel.clientId)
          );
        }
        return false;
      });
      logger.log('🔒 [Report Security] Filtered checks by visibleClientIds:', {
        originalCount: checks.length,
        filteredCount: filteredChecks.length,
        visibleClientIds
      });
    }

    // Apply date filters
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      filteredChecks = filteredChecks.filter(check => {
        const checkDate = check.date?.toDate ? check.date.toDate() : new Date(check.date);
        return checkDate >= startDate;
      });
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      filteredChecks = filteredChecks.filter(check => {
        const checkDate = check.date?.toDate ? check.date.toDate() : new Date(check.date);
        return checkDate <= endDate;
      });
    }

    // Apply status filters
    if (!filters.includeUnpaid) {
      filteredChecks = filteredChecks.filter(check => check.paid);
    }

    if (!filters.includeUnreviewed) {
      filteredChecks = filteredChecks.filter(check => check.reviewed);
    }

    return filteredChecks;
  };

  const generateCompanyReports = (): CompanyReport[] => {
    const filteredChecks = getFilteredData();
    const companyReports: CompanyReport[] = [];

    logger.log('🔍 [Report] ========== STARTING REPORT GENERATION ==========');
    logger.log('🔍 [Report] Total filtered checks:', filteredChecks.length);
    logger.log('🔍 [Report] Available companies:', companies.map(c => ({ id: c.id, name: c.name })));
    logger.log('🔍 [Report] Available clients:', clients.map(c => ({ id: c.id, name: c.name, division: c.division })));
    
    // Log sample check data
    if (filteredChecks.length > 0) {
      logger.log('🔍 [Report] Sample check data:', {
        checkId: filteredChecks[0].id,
        amount: filteredChecks[0].amount,
        companyId: filteredChecks[0].companyId,
        clientId: filteredChecks[0].clientId,
        relationshipDetails: filteredChecks[0].relationshipDetails,
        payType: filteredChecks[0].payType,
        hours: filteredChecks[0].hours,
        otHours: filteredChecks[0].overtimeHours,
        holidayHours: filteredChecks[0].holidayHours,
        perdiemAmount: filteredChecks[0].perdiemAmount
      });
    }

    companies.forEach(company => {
      const companyChecks = filteredChecks.filter(check => check.companyId === company.id);
      
      logger.log(`🔍 [Report] ========== PROCESSING COMPANY: ${company.name} ==========`);
      logger.log(`🔍 [Report] Company ID: ${company.id}`);
      logger.log(`🔍 [Report] Company checks count: ${companyChecks.length}`);
      
      // Log all checks for this company
      companyChecks.forEach((check, index) => {
        logger.log(`🔍 [Report] Company ${company.name} - Check ${index + 1}:`, {
          checkId: check.id,
          checkNumber: check.checkNumber,
          amount: check.amount,
          employeeName: check.employeeId || 'Unknown Employee',
          clientId: check.clientId,
          relationshipDetails: check.relationshipDetails,
          payType: check.payType,
          hours: check.hours,
          otHours: check.overtimeHours,
          holidayHours: check.holidayHours,
          perdiemAmount: check.perdiemAmount
        });
      });
      
      if (companyChecks.length === 0) {
        logger.log(`🔍 [Report] No checks found for company ${company.name}, skipping...`);
        return;
      }

      const companyTotalAmount = companyChecks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
      
      // Group by division across all clients in the company
      const divisionMap = new Map<string, DivisionMapEntry>();
      
      logger.log(`🔍 [Report] ========== STARTING DIVISION GROUPING FOR ${company.name} ==========`);
      
      companyChecks.forEach((check, checkIndex) => {
        logger.log(`🔍 [Report] ========== PROCESSING CHECK ${checkIndex + 1}/${companyChecks.length} ==========`);
        logger.log(`🔍 [Report] Check ID: ${check.id}`);
        logger.log(`🔍 [Report] Check Number: ${check.checkNumber}`);
        logger.log(`🔍 [Report] Employee: ${check.employeeId || 'Unknown Employee'}`);
        logger.log(`🔍 [Report] Amount: ${check.amount}`);
        logger.log(`🔍 [Report] Has relationshipDetails: ${!!check.relationshipDetails}`);
        logger.log(`🔍 [Report] RelationshipDetails count: ${check.relationshipDetails?.length || 0}`);
        // For each check, group by division name regardless of client
        if (check.relationshipDetails && check.relationshipDetails.length > 0) {
          logger.log(`🔍 [Report] Processing ${check.relationshipDetails?.length || 0} relationships for check ${check.id}`);
          
          // Process each relationship and group by division
          check.relationshipDetails.forEach((rel, relIndex) => {
            logger.log(`🔍 [Report] ========== RELATIONSHIP ${relIndex + 1}/${check.relationshipDetails?.length || 0} ==========`);
            logger.log(`🔍 [Report] Relationship ID: ${rel.id}`);
            logger.log(`🔍 [Report] Client ID: ${rel.clientId}`);
            logger.log(`🔍 [Report] Client Name: ${rel.clientName}`);
            logger.log(`🔍 [Report] Pay Type: ${rel.payType}`);
            logger.log(`🔍 [Report] Division: ${rel.division || 'NO DIVISION'}`);
            logger.log(`🔍 [Report] Pay Rate: ${rel.payRate || 'NO PAY RATE'}`);
            logger.log(`🔍 [Report] Hours: ${rel.hours || 'NO HOURS'}`);
            logger.log(`🔍 [Report] OT Hours: ${rel.otHours || 'NO OT HOURS'}`);
            logger.log(`🔍 [Report] Holiday Hours: ${rel.holidayHours || 'NO HOLIDAY HOURS'}`);
            logger.log(`🔍 [Report] Other Pay: ${rel.otherPay ? JSON.stringify(rel.otherPay) : 'NO OTHER PAY'}`);
            logger.log(`🔍 [Report] Per Diem Amount: ${rel.perdiemAmount || 'NO PER DIEM AMOUNT'}`);
            
            const divisionName = getDivisionNameForRelationship(check, rel);
            
            logger.log(`🔍 [Report] Division assignment details:`, {
              clientName: rel.clientName,
              divisionName,
              hasContainer: check.relationshipDetails?.some(r => r.clientName === 'Container'),
              hasProjects: check.relationshipDetails?.some(r => r.clientName === 'Projects')
            });
            
            logger.log(`🔍 [Report] FINAL DIVISION ASSIGNMENT:`, {
              clientName: rel.clientName,
              divisionName,
              payType: rel.payType,
              checkId: check.id
            });
            
            if (!divisionMap.has(divisionName)) {
              logger.log(`🔍 [Report] Creating new division map entry for: ${divisionName}`);
              divisionMap.set(divisionName, { divisionName, checks: [], clients: new Set(), relationshipsByCheck: new Map() });
            } else {
              logger.log(`🔍 [Report] Adding to existing division map entry for: ${divisionName}`);
            }
            
            const divisionEntry = divisionMap.get(divisionName)!;
            if (!divisionEntry.relationshipsByCheck.has(check.id)) {
              divisionEntry.relationshipsByCheck.set(check.id, []);
              divisionEntry.checks.push(check);
            }
            divisionEntry.relationshipsByCheck.get(check.id)!.push(rel);
            divisionEntry.clients.add(rel.clientName || 'Unknown Client');
            
            logger.log(`🔍 [Report] Division map updated for ${divisionName}:`, {
              checkCount: divisionEntry.checks.length,
              clients: Array.from(divisionEntry.clients)
            });
          });
        } else {
          // Single client check - group by client's division
          const client = clients.find(c => c.id === check.clientId);
          const clientName = client?.name || 'Unknown Client';
          const divisionName = getDivisionNameForRelationship(check);
          
          logger.log(`🔍 [Report] Single client check processing:`, {
            checkId: check.id,
            clientId: check.clientId,
            clientName,
            divisionName,
            clientFound: !!client
          });
          
          if (!divisionMap.has(divisionName)) {
            logger.log(`🔍 [Report] Creating new division map entry for single client: ${divisionName}`);
            divisionMap.set(divisionName, { divisionName, checks: [], clients: new Set(), relationshipsByCheck: new Map() });
          }
          
          const divisionEntry = divisionMap.get(divisionName)!;
          if (!divisionEntry.relationshipsByCheck.has(check.id)) {
            divisionEntry.relationshipsByCheck.set(check.id, []);
            divisionEntry.checks.push(check);
          }
          divisionEntry.clients.add(clientName);
          
          logger.log(`🔍 [Report] Single client division map updated for ${divisionName}:`, {
            checkCount: divisionEntry.checks.length,
            clients: Array.from(divisionEntry.clients)
          });
        }
      });
      
      logger.log(`🔍 [Report] ========== FINAL DIVISION MAP FOR ${company.name} ==========`);
      divisionMap.forEach((entry, divisionName) => {
        logger.log(`🔍 [Report] Division: ${divisionName}`, {
          checkCount: entry.checks.length,
          clients: Array.from(entry.clients)
        });
      });

      // Create division breakdown directly from the division map
      logger.log(`🔍 [Report] ========== STARTING DIVISION BREAKDOWN CALCULATION ==========`);
      
      const divisionBreakdown: DivisionBreakdown[] = Array.from(divisionMap.values()).map(({ divisionName, checks, clients }, divIndex) => {
        logger.log(`🔍 [Report] ========== CALCULATING DIVISION ${divIndex + 1}/${divisionMap.size}: ${divisionName} ==========`);
        
        const totalChecks = checks.length;
        // Calculate hourly vs per diem amounts for this division (across all employees)
        let hourlyAmount = 0;
        let perdiemAmount = 0;
        let ptoAmount = 0;
        let otherPayAmount = 0;
        let expensesAmount = 0;
        
        logger.log(`🔍 [Report] Division: ${divisionName}`);
        logger.log(`🔍 [Report] Division checks count: ${checks.length}`);
        logger.log(`🔍 [Report] Division clients:`, Array.from(clients));
        logger.log(`🔍 [Report] Division total amount will be derived from hourly + per diem + expenses calculations`);
        
        checks.forEach((check, checkIndex) => {
          logger.log(`🔍 [Report] ========== PROCESSING CHECK ${checkIndex + 1}/${checks.length} FOR DIVISION ${divisionName} ==========`);
          logger.log(`🔍 [Report] Check ID: ${check.id}`);
          logger.log(`🔍 [Report] Check Amount: ${check.amount}`);
          logger.log(`🔍 [Report] Employee: ${check.employeeId || 'Unknown Employee'}`);
          
          const divisionRelationships = (check.relationshipDetails || []).filter(rel => 
            getDivisionNameForRelationship(check, rel) === divisionName
          );
          
          // Calculate amounts using relationship-specific data first
          if (divisionRelationships.length > 0) {
            logger.log(`🔍 [Report] Processing check ${check.id} with ${divisionRelationships.length} relationships for division ${divisionName}`);
            divisionRelationships.forEach((rel, relIndex) => {
              logger.log(`🔍 [Report] ========== RELATIONSHIP ${relIndex + 1}/${check.relationshipDetails?.length || 0} FOR CHECK ${check.id} ==========`);
              logger.log(`🔍 [Report] Relationship details:`, {
                relId: rel.id,
                relClientName: rel.clientName,
                payType: rel.payType,
                hours: rel.hours,
                otHours: rel.otHours,
                holidayHours: rel.holidayHours,
                payRate: rel.payRate,
                otherPay: rel.otherPay,
                perdiemAmount: rel.perdiemAmount,
                perdiemBreakdown: rel.perdiemBreakdown
              });
              
              if (rel.payType === 'hourly') {
                logger.log(`🔍 [Report] Processing HOURLY relationship for ${rel.clientName}`);
                
                // Calculate relationship-specific hourly amounts
                // Fallback to top-level check fields if relationshipDetails doesn't have hours
                const relHours = rel.hours || check.hours || 0;
                const relOtHours = rel.otHours || check.otHours || 0;
                const relHolidayHours = rel.holidayHours || check.holidayHours || 0;
                const relPayRate = rel.payRate || 0;
                
                logger.log(`🔍 [Report] Hourly values:`, {
                  relHours,
                  relOtHours,
                  relHolidayHours,
                  relPayRate
                });
                
                const regularPay = relHours * relPayRate;
                const otPay = relOtHours * relPayRate * 1.5; // 1.5x for OT
                const holidayPay = relHolidayHours * relPayRate * 2.0; // 2x for holiday
                
                const totalHourlyPay = regularPay + otPay + holidayPay;
                
                logger.log(`🔍 [Report] Hourly calculation for ${rel.clientName} in division ${divisionName}:`, {
                  regularPay: `${relHours} × ${relPayRate} = ${regularPay}`,
                  otPay: `${relOtHours} × ${relPayRate * 1.5} = ${otPay}`,
                  holidayPay: `${relHolidayHours} × ${relPayRate * 2} = ${holidayPay}`,
                  totalHourlyPay
                });
                
                logger.log(`🔍 [Report] BEFORE adding hourly amount: ${hourlyAmount}`);
                hourlyAmount += totalHourlyPay;
                logger.log(`🔍 [Report] AFTER adding hourly amount: ${hourlyAmount}`);
                
                // Track other pay separately (don't add to hourlyAmount)
                if (rel.otherPay && rel.otherPay.length > 0) {
                  logger.log(`🔍 [Report] Processing OTHER PAY for ${rel.clientName}:`, rel.otherPay);
                  const otherPayTotal = rel.otherPay.reduce((sum, item) => 
                    sum + parseFloat(item.amount || '0'), 0);
                  logger.log(`🔍 [Report] Other pay total for ${rel.clientName} in division ${divisionName}:`, {
                    otherPayItems: rel.otherPay,
                    otherPayTotal
                  });
                  logger.log(`🔍 [Report] BEFORE adding other pay: ${otherPayAmount}`);
                  otherPayAmount += otherPayTotal;
                  logger.log(`🔍 [Report] AFTER adding other pay: ${otherPayAmount}`);
                } else {
                  logger.log(`🔍 [Report] No other pay for ${rel.clientName}`);
                }
              } else if (rel.payType === 'perdiem') {
                logger.log(`🔍 [Report] Processing PER DIEM relationship for ${rel.clientName}`);
                
                // Calculate relationship-specific per diem amounts
                // Fallback to top-level check fields if relationshipDetails doesn't have per diem data
                let relPerdiemTotal = 0;
                
                const hasBreakdown = rel.perdiemBreakdown !== undefined ? rel.perdiemBreakdown : check.perdiemBreakdown;
                if (hasBreakdown) {
                  logger.log(`🔍 [Report] Processing per diem breakdown for ${rel.clientName}`);
                  // Sum daily breakdown - use rel values or fallback to check values
                  relPerdiemTotal = (rel.perdiemMonday || check.perdiemMonday || 0) + 
                                   (rel.perdiemTuesday || check.perdiemTuesday || 0) + 
                                   (rel.perdiemWednesday || check.perdiemWednesday || 0) + 
                                   (rel.perdiemThursday || check.perdiemThursday || 0) + 
                                   (rel.perdiemFriday || check.perdiemFriday || 0) + 
                                   (rel.perdiemSaturday || check.perdiemSaturday || 0) + 
                                   (rel.perdiemSunday || check.perdiemSunday || 0);
                  logger.log(`🔍 [Report] Daily breakdown total: ${relPerdiemTotal}`);
                } else {
                  relPerdiemTotal = rel.perdiemAmount || check.perdiemAmount || 0;
                  logger.log(`🔍 [Report] Using per diem amount directly: ${relPerdiemTotal}`);
                }
                
                // Add PTO amount for per diem employees (simple dollar amount, not hours × rate)
                const relPtoAmount = (rel as any).ptoAmount || 0;
                logger.log(`🔍 [Report] PTO amount for ${rel.clientName}: ${relPtoAmount}`);
                
                logger.log(`🔍 [Report] Per diem calculation for ${rel.clientName} in division ${divisionName}:`, {
                  perdiemAmount: rel.perdiemAmount,
                  perdiemBreakdown: rel.perdiemBreakdown,
                  relPerdiemTotal,
                  ptoAmount: relPtoAmount
                });
                
                logger.log(`🔍 [Report] BEFORE adding per diem amount: ${perdiemAmount}`);
                perdiemAmount += relPerdiemTotal;
                logger.log(`🔍 [Report] AFTER adding per diem amount: ${perdiemAmount}`);
                
                // Track PTO amount separately (don't add to perdiemAmount)
                logger.log(`🔍 [Report] BEFORE adding PTO amount: ${ptoAmount}`);
                ptoAmount += relPtoAmount;
                logger.log(`🔍 [Report] AFTER adding PTO amount: ${ptoAmount}`);
                
                // Track other pay for per diem relationships separately
                if (rel.otherPay && rel.otherPay.length > 0) {
                  const otherPayTotal = rel.otherPay.reduce((sum, item) => 
                    sum + parseFloat(item.amount || '0'), 0);
                  logger.log(`🔍 [Report] Other pay for per diem ${rel.clientName}: ${otherPayTotal}`);
                  otherPayAmount += otherPayTotal;
                }
              } else {
                logger.log(`🔍 [Report] Unknown pay type for ${rel.clientName}: ${rel.payType}`);
              }
            });
          } else if (!check.relationshipDetails || check.relationshipDetails.length === 0) {
            // Fallback to check-wide data for single client checks
            if (check.payType === 'hourly' || check.payType === 'mixed') {
              const hourlyTotal = (check.hours || 0) * (check.payRate || 0) +
                                 (check.overtimeHours || 0) * (check.overtimeRate || 0) +
                                 (check.holidayHours || 0) * (check.holidayRate || 0);
              hourlyAmount += hourlyTotal;
              
              // Track other pay separately for single client checks
              if (check.otherPay && check.otherPay.length > 0) {
                const otherPayTotal = check.otherPay.reduce((sum: number, item: any) => 
                  sum + parseFloat(item.amount || '0'), 0);
                otherPayAmount += otherPayTotal;
              }
            }
            
            if (check.payType === 'perdiem' || check.payType === 'mixed') {
              let perdiemTotal = check.perdiemAmount || 0;
              if (check.perdiemBreakdown) {
                perdiemTotal = (check.perdiemMonday || 0) + 
                              (check.perdiemTuesday || 0) + 
                              (check.perdiemWednesday || 0) + 
                              (check.perdiemThursday || 0) + 
                              (check.perdiemFriday || 0) + 
                              (check.perdiemSaturday || 0) + 
                              (check.perdiemSunday || 0);
              }
              perdiemAmount += perdiemTotal;
              
              // Track PTO amount for single client per diem checks (if stored at check level)
              // Note: PTO is typically stored in relationshipDetails, but check for legacy data
              const checkPtoAmount = (check as any).ptoAmount || 0;
              if (checkPtoAmount > 0) {
                ptoAmount += checkPtoAmount;
              }
              
              // Track other pay separately for per diem single client checks
              if (check.otherPay && check.otherPay.length > 0) {
                const otherPayTotal = check.otherPay.reduce((sum: number, item: any) => 
                  sum + parseFloat(item.amount || '0'), 0);
                otherPayAmount += otherPayTotal;
              }
            }
          } else {
            logger.warn('⚠️ [Report] Division relationships missing for check with relationship details', {
              divisionName,
              checkId: check.id
            });
          }
          
          // Calculate expenses for this check
          if (check.isExpense || check.payType === 'expense') {
            expensesAmount += parseFloat(check.amount?.toString() || '0');
          }
        });
        
        const divisionTotalAmount = hourlyAmount + perdiemAmount + ptoAmount + otherPayAmount + expensesAmount;
        logger.log(`🔍 [Report] ========== FINAL TOTALS FOR DIVISION ${divisionName} ==========`);
        logger.log(`🔍 [Report] Division: ${divisionName}`);
        logger.log(`🔍 [Report] Total Checks: ${totalChecks}`);
        logger.log(`🔍 [Report] Total Amount: ${divisionTotalAmount}`);
        logger.log(`🔍 [Report] Hourly Amount: ${hourlyAmount}`);
        logger.log(`🔍 [Report] Per Diem Amount: ${perdiemAmount}`);
        logger.log(`🔍 [Report] PTO Amount: ${ptoAmount}`);
        logger.log(`🔍 [Report] Other Pay Amount: ${otherPayAmount}`);
        logger.log(`🔍 [Report] Expenses Amount: ${expensesAmount}`);
        logger.log(`🔍 [Report] Clients:`, Array.from(clients));
        logger.log(`🔍 [Report] ========== END DIVISION ${divisionName} ==========`);
        
        return {
          divisionName,
          totalChecks,
          totalAmount: divisionTotalAmount,
          hourlyAmount,
          perdiemAmount,
          ptoAmount,
          otherPayAmount,
          expensesAmount,
          checks
        };
      });
      
      logger.log(`🔍 [Report] ========== FINAL DIVISION BREAKDOWN FOR ${company.name} ==========`);
      divisionBreakdown.forEach((div, index) => {
        logger.log(`🔍 [Report] Division ${index + 1}:`, {
          name: div.divisionName,
          checks: div.totalChecks,
          amount: div.totalAmount,
          hourly: div.hourlyAmount,
          perdiem: div.perdiemAmount,
          expenses: div.expensesAmount
        });
      });

      // Create a single client breakdown that represents the division grouping
      const clientBreakdown: ClientBreakdown[] = [{
        clientId: 'division-grouped',
        clientName: 'Division Grouped',
        totalChecks: divisionBreakdown.reduce((sum, div) => sum + div.totalChecks, 0),
        totalAmount: divisionBreakdown.reduce((sum, div) => sum + div.totalAmount, 0),
        hourlyAmount: divisionBreakdown.reduce((sum, div) => sum + div.hourlyAmount, 0),
        perdiemAmount: divisionBreakdown.reduce((sum, div) => sum + div.perdiemAmount, 0),
        ptoAmount: divisionBreakdown.reduce((sum, div) => sum + div.ptoAmount, 0),
        otherPayAmount: divisionBreakdown.reduce((sum, div) => sum + div.otherPayAmount, 0),
        expensesAmount: divisionBreakdown.reduce((sum, div) => sum + div.expensesAmount, 0),
        divisionBreakdown,
        checks: companyChecks
      }];

      // Use the breakdown totalAmount instead of companyTotalAmount to ensure consistency
      const correctCompanyTotal = divisionBreakdown.reduce((sum, div) => sum + div.totalAmount, 0);

      companyReports.push({
        company,
        totalChecks: companyChecks.length,
        totalAmount: correctCompanyTotal,
        clientBreakdown,
        checks: companyChecks
      });
    });

    return companyReports.sort((a, b) => b.totalAmount - a.totalAmount);
  };

  const exportClientBreakdownToExcel = async () => {
    setExporting(true);
    setError(null);
    setSuccess(null);

    try {
      // Build data rows directly from the currently visible stats to ensure parity with UI
      const clientBreakdownData = visibleClientStats.map(stat => ({
        client: stat.clientName,
        company: stat.companyName,
        totalChecks: stat.totalChecks,
        hourlyAmount: stat.hourlyAmount,
        perdiemAmount: stat.perdiemAmount,
        ptoAmount: stat.ptoAmount,
        otherPayAmount: stat.otherPayAmount,
        expensesAmount: stat.expensesAmount,
        totalAmount: stat.totalAmount,
        status: stat.isActive ? 'Active' : 'Inactive'
      }));

      // Use the same totals shown in the UI (unique checks/amounts)
      const totals = {
        totalChecks: filteredChecks.length,
        hourlyAmount: departmentTotals.hourlyAmount,
        perdiemAmount: departmentTotals.perdiemAmount,
        ptoAmount: departmentTotals.ptoAmount,
        otherPayAmount: departmentTotals.otherPayAmount,
        expensesAmount: departmentTotals.expensesAmount,
        totalAmount: departmentTotals.totalAmount
      };

      // Create workbook with ExcelJS
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Department Breakdown');

      // Define columns
      worksheet.columns = [
        { header: 'Department', key: 'client', width: 25 },
        { header: 'Company', key: 'company', width: 20 },
        { header: 'Total Checks', key: 'totalChecks', width: 15 },
        { header: 'Hourly Amount', key: 'hourlyAmount', width: 15 },
        { header: 'Per Diem Amount', key: 'perdiemAmount', width: 16 },
        { header: 'PTO Amount', key: 'ptoAmount', width: 15 },
        { header: 'Other Amount', key: 'otherPayAmount', width: 15 },
        { header: 'Expenses', key: 'expensesAmount', width: 15 },
        { header: 'Total Amount', key: 'totalAmount', width: 15 },
        { header: 'Status', key: 'status', width: 12 }
      ];

      // Add data rows
      clientBreakdownData.forEach(item => {
        worksheet.addRow(item);
      });

      // Add total row
      worksheet.addRow({
        client: 'TOTAL',
        company: '',
        totalChecks: totals.totalChecks,
        hourlyAmount: totals.hourlyAmount,
        perdiemAmount: totals.perdiemAmount,
        ptoAmount: totals.ptoAmount,
        otherPayAmount: totals.otherPayAmount,
        expensesAmount: totals.expensesAmount,
        totalAmount: totals.totalAmount,
        status: ''
      });

      // Format currency columns (D, E, F, G, H, I) as dollars
      const currencyColumns = ['D', 'E', 'F', 'G', 'H', 'I']; // hourlyAmount, perdiemAmount, ptoAmount, otherPayAmount, expensesAmount, totalAmount
      currencyColumns.forEach(col => {
        worksheet.getColumn(col).numFmt = '$#,##0.00';
      });

      // Apply professional styling
      applyProfessionalStyling(worksheet, true);

      // Generate filename with date range
      const startDate = filters.startDate ? new Date(filters.startDate).toLocaleDateString() : 'All';
      const endDate = filters.endDate ? new Date(filters.endDate).toLocaleDateString() : 'All';
      const filename = `Department_Breakdown_${startDate}_to_${endDate}.xlsx`;

      // Write to buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);

      setSuccess(`Department Breakdown exported successfully as ${filename}`);
    } catch (err) {
      console.error('Export error:', err);
      setError('Failed to export Department Breakdown. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const exportEmployeeSummaryToExcel = async (companyId: string = 'all', selectedEmployeeIds?: string[]) => {
    setExporting(true);
    setError(null);
    setSuccess(null);

    try {
      // Filter employees based on selected company and selected employee IDs
      const filteredEmployees = employees.filter(employee => {
        // If specific employee IDs are provided, only include those
        if (selectedEmployeeIds && selectedEmployeeIds.length > 0) {
          return selectedEmployeeIds.includes(employee.id);
        }
        // Otherwise filter by company
        if (companyId === 'all') return true;
        return employee.companyId === companyId;
      });
      
      // Prepare employee summary data with sorting - show all employees, even with no checks
      const employeeSummaryData = filteredEmployees
        .map((employee) => {
          const employeeChecks = filteredChecks.filter(check => check.employeeId === employee.id);
          
          // Show all employees, even if they have no checks (they'll show 0 values)
          
          const totalAmount = employeeChecks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
          const totalChecks = employeeChecks.length;
          
          // Calculate hours and pay breakdown
          let totalRegularHours = 0;
          let totalOtHours = 0;
          let totalHolidayHours = 0;
          let totalPerDiem = 0;
          let totalOtherPay = 0;
          
          employeeChecks.forEach(check => {
            // Handle relationship-specific data
            if (check.relationshipDetails && check.relationshipDetails.length > 0) {
              check.relationshipDetails.forEach(rel => {
                totalRegularHours += rel.hours || 0;
                totalOtHours += rel.otHours || 0;
                totalHolidayHours += rel.holidayHours || 0;
                totalPerDiem += rel.perdiemAmount || 0;
                if (rel.otherPay) {
                  rel.otherPay.forEach(op => {
                    totalOtherPay += parseFloat(op.amount || '0');
                  });
                }
              });
            } else {
              // Fallback to check-level data
              totalRegularHours += check.hours || 0;
              totalOtHours += (check.otHours || check.overtimeHours || 0);
              totalHolidayHours += check.holidayHours || 0;
              totalPerDiem += check.perdiemAmount || 0;
              if (check.otherPay) {
                check.otherPay.forEach(op => {
                  totalOtherPay += parseFloat(op.amount || '0');
                });
              }
            }
          });
          
          const company = companies.find(c => c.id === employee.companyId);
          
          return {
            employee: employee.name,
            address: employee.address || 'N/A',
            position: employee.position || 'N/A',
            company: company?.name || 'Unknown',
            role: employee.role || employee.position || 'N/A',
            startDate: employee.startDate ? new Date(employee.startDate + 'T00:00:00').toLocaleDateString() : 'N/A',
            totalChecks,
            totalRegularHours: totalRegularHours.toFixed(2),
            totalOtHours: totalOtHours.toFixed(2),
            totalHolidayHours: totalHolidayHours.toFixed(2),
            totalPerDiem: `$${totalPerDiem.toFixed(2)}`,
            totalOtherPay: `$${totalOtherPay.toFixed(2)}`,
            totalAmount,
            // Store formatted versions for display
            totalAmountFormatted: `$${totalAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          // Sort by employee name when showing single company, by company then name when showing all
          if (companyId === 'all') {
            if (a!.company !== b!.company) {
              return a!.company.localeCompare(b!.company);
            }
          }
          return a!.employee.localeCompare(b!.employee);
        });

      // Calculate totals
      const totals = employeeSummaryData.reduce((acc, item) => ({
        totalChecks: acc.totalChecks + item!.totalChecks,
        totalAmount: acc.totalAmount + item!.totalAmount,
        totalRegularHours: acc.totalRegularHours + parseFloat(item!.totalRegularHours || '0'),
        totalOtHours: acc.totalOtHours + parseFloat(item!.totalOtHours || '0'),
        totalHolidayHours: acc.totalHolidayHours + parseFloat(item!.totalHolidayHours || '0'),
        totalPerDiem: acc.totalPerDiem + parseFloat(item!.totalPerDiem.replace('$', '').replace(/,/g, '') || '0'),
        totalOtherPay: acc.totalOtherPay + parseFloat(item!.totalOtherPay.replace('$', '').replace(/,/g, '') || '0')
      }), { 
        totalChecks: 0, 
        totalAmount: 0,
        totalRegularHours: 0,
        totalOtHours: 0,
        totalHolidayHours: 0,
        totalPerDiem: 0,
        totalOtherPay: 0
      });

      // Create workbook with ExcelJS
      const workbook = new ExcelJS.Workbook();
      const company = companies.find(c => c.id === companyId);

      // Create a separate worksheet for each employee
      employeeSummaryData.forEach((item) => {
        const employee = employees.find(emp => emp.name === item!.employee);
        if (!employee) return;
        
        // Sanitize employee name for sheet name (Excel sheet names have limitations)
        const sanitizedName = item!.employee.replace(/[\\\/\?\*\[\]]/g, '_').substring(0, 31);
        const worksheet = workbook.addWorksheet(sanitizedName);
        
        // Employee Info Section
        worksheet.addRow(['Employee Info']);
        const infoHeaderRow = worksheet.getRow(worksheet.rowCount);
        infoHeaderRow.font = { bold: true, size: 14 };
        infoHeaderRow.height = 25;
        
        // Employee info in one row with headers
        const employeeInfoHeaderRow = worksheet.addRow([
          'Name',
          'Address',
          'Position',
          'Company',
          'Role',
          'Start Date'
        ]);
        employeeInfoHeaderRow.font = { bold: true };
        employeeInfoHeaderRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE3F2FD' } // Light blue
        };
        employeeInfoHeaderRow.height = 20;
        
        const employeeInfoRow = worksheet.addRow([
          item!.employee,
          item!.address,
          item!.position,
          item!.company,
          item!.role,
          item!.startDate
        ]);
        
        worksheet.addRow([]); // Empty row for spacing
        
        // CHECKS Section Header
        worksheet.addRow(['CHECKS']);
        const checksHeaderRow = worksheet.getRow(worksheet.rowCount);
        checksHeaderRow.font = { bold: true, size: 14 };
        checksHeaderRow.height = 25;
        worksheet.addRow([]); // Empty row for spacing
        
        // Add header row for checks table
        const headerRow = worksheet.addRow([
          'Check #',
          'Date',
          'Client',
          'Regular Hrs',
          'OT Hrs',
          'PTO Hrs',
          'Per Diem',
          'Other Pay',
          'Amount'
        ]);
        
        // Style header row
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE3F2FD' } // Light blue
        };
        headerRow.height = 20;
        
        // Set column widths manually
        worksheet.getColumn(1).width = 12; // Check #
        worksheet.getColumn(2).width = 15; // Date
        worksheet.getColumn(3).width = 20; // Client
        worksheet.getColumn(4).width = 15; // Regular Hrs
        worksheet.getColumn(5).width = 15; // OT Hrs
        worksheet.getColumn(6).width = 15; // PTO Hrs
        worksheet.getColumn(7).width = 15; // Per Diem
        worksheet.getColumn(8).width = 15; // Other Pay
        worksheet.getColumn(9).width = 15; // Amount
        
        const employeeChecks = filteredChecks
          .filter(check => check.employeeId === employee.id)
          .sort((a, b) => {
            // Sort by date, most recent first
            const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return dateB.getTime() - dateA.getTime();
          });
        
        // Add individual check rows
        let empTotalRegularHours = 0;
        let empTotalOtHours = 0;
        let empTotalHolidayHours = 0;
        let empTotalPerDiem = 0;
        let empTotalOtherPay = 0;
        let empTotalAmount = 0;
        
        employeeChecks.forEach(check => {
          let checkRegularHours = 0;
          let checkOtHours = 0;
          let checkHolidayHours = 0;
          let checkPerDiem = 0;
          let checkOtherPay = 0;
          let checkClientName = 'N/A';
          
          if (check.relationshipDetails && check.relationshipDetails.length > 0) {
            check.relationshipDetails.forEach(rel => {
              checkRegularHours += rel.hours || 0;
              checkOtHours += rel.otHours || 0;
              checkHolidayHours += rel.holidayHours || 0;
              checkPerDiem += rel.perdiemAmount || 0;
              if (rel.otherPay) {
                rel.otherPay.forEach(op => {
                  checkOtherPay += parseFloat(op.amount || '0');
                });
              }
              if (rel.clientName) {
                checkClientName = rel.clientName;
              }
            });
          } else {
            checkRegularHours = check.hours || 0;
            checkOtHours = check.otHours || check.overtimeHours || 0;
            checkHolidayHours = check.holidayHours || 0;
            checkPerDiem = check.perdiemAmount || 0;
            if (check.otherPay) {
              check.otherPay.forEach(op => {
                checkOtherPay += parseFloat(op.amount || '0');
              });
            }
            const client = clients.find(c => c.id === check.clientId);
            checkClientName = client?.name || 'N/A';
          }
          
          empTotalRegularHours += checkRegularHours;
          empTotalOtHours += checkOtHours;
          empTotalHolidayHours += checkHolidayHours;
          empTotalPerDiem += checkPerDiem;
          empTotalOtherPay += checkOtherPay;
          empTotalAmount += parseFloat(check.amount?.toString() || '0');
          
          const checkDate = check.date?.toDate ? check.date.toDate() : new Date(check.date);
          
          // Add row as array to prevent header creation
          worksheet.addRow([
            check.checkNumber || '',
            checkDate.toLocaleDateString(),
            checkClientName,
            checkRegularHours > 0 ? checkRegularHours.toFixed(2) : '',
            checkOtHours > 0 ? checkOtHours.toFixed(2) : '',
            checkHolidayHours > 0 ? checkHolidayHours.toFixed(2) : '',
            checkPerDiem > 0 ? `$${checkPerDiem.toFixed(2)}` : '',
            checkOtherPay > 0 ? `$${checkOtherPay.toFixed(2)}` : '',
            `$${parseFloat(check.amount?.toString() || '0').toFixed(2)}`
          ]);
        });
        
        // Add employee total row as array
        const totalRow = worksheet.addRow([
          '',
          '',
          'TOTAL',
          empTotalRegularHours.toFixed(2),
          empTotalOtHours.toFixed(2),
          empTotalHolidayHours.toFixed(2),
          `$${empTotalPerDiem.toFixed(2)}`,
          `$${empTotalOtherPay.toFixed(2)}`,
          `$${empTotalAmount.toFixed(2)}`
        ]);
        
        // Style total row
        totalRow.font = { bold: true };
        totalRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF5F5F5' } // Light gray
        };
        
        // Apply professional styling
        applyProfessionalStyling(worksheet, true);
      });

      // Generate filename
      let filename: string;
      if (selectedEmployeeIds && selectedEmployeeIds.length === 1) {
        // If only one employee is selected, use their name in the filename
        const selectedEmployee = employees.find(emp => emp.id === selectedEmployeeIds[0]);
        const employeeName = selectedEmployee?.name || 'Employee';
        const sanitizedName = employeeName.replace(/[^a-zA-Z0-9]/g, '_');
        filename = `${sanitizedName}_summary_export.xlsx`;
      } else if (selectedEmployeeIds && selectedEmployeeIds.length > 1) {
        // If multiple employees are selected, use company name
        const companyName = companyId === 'all' 
          ? (() => {
              // Try to get company from first selected employee
              const firstEmployee = employees.find(emp => emp.id === selectedEmployeeIds[0]);
              const firstCompany = firstEmployee ? companies.find(c => c.id === firstEmployee.companyId) : null;
              return firstCompany?.name || 'All_Companies';
            })()
          : (company?.name || 'Company');
        const sanitizedCompanyName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
        filename = `Employee_summary_${sanitizedCompanyName}.xlsx`;
      } else {
        // Default format for all employees
        const startDate = filters.startDate ? new Date(filters.startDate).toLocaleDateString() : 'All';
        const endDate = filters.endDate ? new Date(filters.endDate).toLocaleDateString() : 'All';
        const companyName = companyId === 'all' ? 'All_Companies' : (company?.name || 'Company').replace(/\s+/g, '_');
        filename = `Employee_Summary_${companyName}_${startDate}_to_${endDate}.xlsx`;
      }

      // Write to buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);

      const exportType = companyId === 'all' ? 'All Companies' : company?.name || 'Selected Company';
      setSuccess(`Employee Summary for ${exportType} exported successfully as ${filename}`);
    } catch (err) {
      console.error('Export error:', err);
      setError('Failed to export Employee Summary. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const exportExpensesToExcel = async () => {
    setExporting(true);
    setError(null);
    setSuccess(null);

    try {
      const expenseChecks = filteredChecks.filter(check => check.isExpense || check.payType === 'expense');
      
      if (expenseChecks.length === 0) {
        setError('No expenses found for the selected filters.');
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Expenses');

      worksheet.columns = [
        { header: 'Check Number', key: 'checkNumber', width: 15 },
        { header: 'Company', key: 'company', width: 25 },
        { header: 'Expense Name', key: 'expenseName', width: 30 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Amount', key: 'amount', width: 15 },
        { header: 'Memo', key: 'memo', width: 40 }
      ];

      expenseChecks.forEach(check => {
        const company = companies.find(c => c.id === check.companyId);
        const checkDate = check.date?.toDate ? check.date.toDate() : new Date(check.date);
        const amount = parseFloat(check.amount?.toString() || '0');
        
        worksheet.addRow({
          checkNumber: check.checkNumber || check.id,
          company: company?.name || 'Unknown Company',
          expenseName: check.expenseName || 'N/A',
          description: check.expenseDescription || check.memo || 'N/A',
          date: checkDate.toLocaleDateString(),
          amount: `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          memo: check.memo || ''
        });
      });

      // Add total row
      const totalExpenses = expenseChecks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
      worksheet.addRow({
        checkNumber: 'TOTAL',
        company: '',
        expenseName: '',
        description: '',
        date: '',
        amount: `$${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        memo: ''
      });

      applyProfessionalStyling(worksheet, true);

      const startDate = filters.startDate ? new Date(filters.startDate).toLocaleDateString() : 'All';
      const endDate = filters.endDate ? new Date(filters.endDate).toLocaleDateString() : 'All';
      const filename = `Expenses_Report_${startDate}_to_${endDate}.xlsx`;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);

      setSuccess(`Expenses report exported successfully as ${filename}`);
    } catch (err) {
      console.error('Export error:', err);
      setError('Failed to export expenses report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Helper function to calculate total amount correctly (hourly + per diem + expenses, where hourly includes other pay)
  const calculateCorrectTotal = (checks: Check[]): number => {
    let totalHourly = 0;
    let totalPerdiem = 0;
    let totalExpenses = 0;
    
    checks.forEach(check => {
      // Calculate hourly (including other pay for relationship checks)
      if (check.relationshipDetails && check.relationshipDetails.length > 0) {
        check.relationshipDetails.forEach(rel => {
          if (rel.payType === 'hourly' || rel.payType === 'mixed') {
            const relHours = rel.hours || 0;
            const relOtHours = rel.otHours || 0;
            const relHolidayHours = rel.holidayHours || 0;
            const relPayRate = rel.payRate || 0;
            const otRate = check.overtimeRate || relPayRate * 1.5;
            const holidayRate = check.holidayRate || relPayRate * 2.0;
            
            const regularPay = relHours * relPayRate;
            const otPay = relOtHours * otRate;
            const holidayPay = relHolidayHours * holidayRate;
            totalHourly += regularPay + otPay + holidayPay;
            
            // Add other pay to hourly
            if (rel.otherPay && rel.otherPay.length > 0) {
              const otherPayTotal = rel.otherPay.reduce((sum: number, item: any) => 
                sum + parseFloat(item.amount || '0'), 0);
              totalHourly += otherPayTotal;
            }
          }
          
          if (rel.payType === 'perdiem' || rel.payType === 'mixed') {
            let perdiemTotal = 0;
            const hasBreakdown = rel.perdiemBreakdown !== undefined ? rel.perdiemBreakdown : check.perdiemBreakdown;
            if (hasBreakdown) {
              perdiemTotal = (rel.perdiemMonday || check.perdiemMonday || 0) + 
                           (rel.perdiemTuesday || check.perdiemTuesday || 0) + 
                           (rel.perdiemWednesday || check.perdiemWednesday || 0) + 
                           (rel.perdiemThursday || check.perdiemThursday || 0) + 
                           (rel.perdiemFriday || check.perdiemFriday || 0) + 
                           (rel.perdiemSaturday || check.perdiemSaturday || 0) + 
                           (rel.perdiemSunday || check.perdiemSunday || 0);
            } else {
              perdiemTotal = rel.perdiemAmount || check.perdiemAmount || 0;
            }
            // Add PTO amount for per diem employees (simple dollar amount)
            const relPtoAmount = (rel as any).ptoAmount || 0;
            totalPerdiem += perdiemTotal + relPtoAmount;
          }
        });
      } else {
        // Single client checks
        if (check.payType === 'hourly' || check.payType === 'mixed') {
          const hourlyTotal = (check.hours || 0) * (check.payRate || 0) +
                             (check.overtimeHours || 0) * (check.overtimeRate || 0) +
                             (check.holidayHours || 0) * (check.holidayRate || 0);
          totalHourly += hourlyTotal;
          
          // Add other pay for single client checks
          if (check.otherPay && check.otherPay.length > 0) {
            const otherPayTotal = check.otherPay.reduce((sum: number, item: any) => 
              sum + parseFloat(item.amount || '0'), 0);
            totalHourly += otherPayTotal;
          }
        }
        
        if (check.payType === 'perdiem' || check.payType === 'mixed') {
          let perdiemTotal = check.perdiemAmount || 0;
          if (check.perdiemBreakdown) {
            perdiemTotal = (check.perdiemMonday || 0) + 
                         (check.perdiemTuesday || 0) + 
                         (check.perdiemWednesday || 0) + 
                         (check.perdiemThursday || 0) + 
                         (check.perdiemFriday || 0) + 
                         (check.perdiemSaturday || 0) + 
                         (check.perdiemSunday || 0);
          }
          totalPerdiem += perdiemTotal;
        }
      }
      
      // Calculate expenses
      if (check.isExpense || check.payType === 'expense') {
        totalExpenses += parseFloat(check.amount?.toString() || '0');
      }
    });
    
    return totalHourly + totalPerdiem + totalExpenses;
  };

  const exportToExcel = async (companyId?: string) => {
    setExporting(true);
    setError(null);
    setSuccess(null);

    try {
      let dataToExport: Check[];
      let filename: string;
      
      if (companyId) {
        // Export individual company report
        const company = companies.find(c => c.id === companyId);
        dataToExport = getFilteredData().filter(check => check.companyId === companyId);
        filename = `${company?.name || 'Company'}_report_${new Date().toISOString().split('T')[0]}.xlsx`;
      } else {
        // Export all data
        dataToExport = getFilteredData();
        filename = `all_companies_report_${new Date().toISOString().split('T')[0]}.xlsx`;
      }

      // Create comprehensive report data
      const reportData = dataToExport.map(check => {
        const company = companies.find(c => c.id === check.companyId);
        const employee = employees.find(e => e.id === check.employeeId);
        const client = clients.find(c => c.id === check.clientId);
        
        // Get client name from relationship details if available
        let clientName = client?.name || 'Unknown Client';
        let divisionName = 'No Division';
        
        // Check if this is an expense check first
        const isExpenseCheck = check.isExpense || check.payType === 'expense';
        
        if (isExpenseCheck) {
          // For expense checks, set division and client to "Expenses"
          divisionName = 'Expenses';
          clientName = 'Expenses';
        } else if (check.relationshipDetails && check.relationshipDetails.length > 0) {
          // Use the first client name instead of combining them
          clientName = check.relationshipDetails[0].clientName;
          
          // Get division from the first relationship
          if (check.relationshipDetails[0].division) {
            divisionName = check.relationshipDetails[0].division;
          } else {
            // Fallback to client's division
            const clientForDivision = clients.find(c => c.id === check.relationshipDetails![0].clientId);
            divisionName = clientForDivision?.division || 'No Division';
          }
        } else {
          // For single client checks, get division from client
          divisionName = client?.division || 'No Division';
        }

        // Calculate per diem total if breakdown exists
        let perdiemTotal = check.perdiemAmount || 0;
        if (check.perdiemBreakdown) {
          perdiemTotal = (check.perdiemMonday || 0) + 
                        (check.perdiemTuesday || 0) + 
                        (check.perdiemWednesday || 0) + 
                        (check.perdiemThursday || 0) + 
                        (check.perdiemFriday || 0) + 
                        (check.perdiemSaturday || 0) + 
                        (check.perdiemSunday || 0);
        }

        // Get relationship-specific data for export
        let relationshipHours = check.hours || 0;
        let relationshipOtHours = check.overtimeHours || 0;
        let relationshipHolidayHours = check.holidayHours || 0;
        let relationshipPayRate = check.payRate || 0;
        let relationshipOtRate = check.overtimeRate || 0;
        let relationshipHolidayRate = check.holidayRate || 0;
        
        if (check.relationshipDetails && check.relationshipDetails.length > 0) {
          const relationship = check.relationshipDetails[0]; // Use first relationship
          
          relationshipHours = relationship.hours || check.hours || 0;
          relationshipOtHours = relationship.otHours || check.overtimeHours || 0;
          relationshipHolidayHours = relationship.holidayHours || check.holidayHours || 0;
          relationshipPayRate = relationship.payRate || check.payRate || 0;
          perdiemTotal = relationship.perdiemAmount || perdiemTotal;
          
          // For OT and Holiday rates, use check-wide rates
          relationshipOtRate = check.overtimeRate || 0;
          relationshipHolidayRate = check.holidayRate || 0;
        }

        // Calculate hourly total using relationship-specific data
        const hourlyTotal = relationshipHours * relationshipPayRate +
                           relationshipOtHours * relationshipOtRate +
                           relationshipHolidayHours * relationshipHolidayRate;

        // Calculate PTO Amount
        let ptoAmount = 0;
        if (check.relationshipDetails && check.relationshipDetails.length > 0) {
          const relationship = check.relationshipDetails[0];
          // For per diem employees, PTO is stored as a dollar amount
          if (relationship.payType === 'perdiem' || relationship.payType === 'mixed') {
            ptoAmount = (relationship as any).ptoAmount || 0;
          } else {
            // For hourly employees, calculate PTO amount from hours * rate
            ptoAmount = relationshipHolidayHours * relationshipHolidayRate;
          }
        } else {
          // For single client checks
          if (check.payType === 'perdiem' || check.payType === 'mixed') {
            ptoAmount = (check as any).ptoAmount || 0;
          } else {
            // For hourly employees, calculate PTO amount from hours * rate
            ptoAmount = relationshipHolidayHours * relationshipHolidayRate;
          }
        }

        // Extract Other Pay data
        let otherPayDescription = '';
        let otherPayAmount = 0;
        
        if (check.relationshipDetails && check.relationshipDetails.length > 0) {
          // Get Other Pay from relationship details (prioritize relationship-specific)
          const relationship = check.relationshipDetails[0];
          if (relationship.otherPay && relationship.otherPay.length > 0) {
            otherPayDescription = relationship.otherPay.map((item: any) => item.description || 'Other Pay').join(', ');
            otherPayAmount = relationship.otherPay.reduce((sum: number, item: any) => sum + parseFloat(item.amount || '0'), 0);
          }
        } else if (check.otherPay && check.otherPay.length > 0) {
          // Fallback to check-wide other pay
          otherPayDescription = check.otherPay.map((item: any) => item.description || 'Other Pay').join(', ');
          otherPayAmount = check.otherPay.reduce((sum: number, item: any) => sum + parseFloat(item.amount || '0'), 0);
        }

        // Ensure amount is a number
        const amount = parseFloat(check.amount?.toString() || '0');
        
        // Calculate expenses amount
        const expensesAmount = (check.isExpense || check.payType === 'expense') ? amount : 0;

        return {
          'Check Number': check.checkNumber || check.id,
          'Company': company?.name || 'Unknown Company',
          'Employee': employee?.name || (check.isExpense ? (check.expenseName || 'Expense') : 'Unknown Employee'),
          'Client(s)': clientName,
          'Division': divisionName,
          'Pay Type': check.payType,
          'Work Week': check.workWeek,
          'Week Key': check.weekKey,
          'Date': check.date?.toDate ? check.date.toDate().toLocaleDateString() : new Date(check.date).toLocaleDateString(),
          'Hours Worked': relationshipHours,
          'Pay Rate': relationshipPayRate,
          'Overtime Hours': relationshipOtHours,
          'Overtime Rate': relationshipOtRate,
          'PTO Hours': relationshipHolidayHours,
          'PTO Amount': ptoAmount > 0 ? `$${ptoAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00',
          'Per Diem Amount': perdiemTotal > 0 ? `$${perdiemTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00',
          'Per Diem Breakdown': check.perdiemBreakdown ? 'Yes' : 'No',
          'Per Diem Monday': check.perdiemMonday || 0,
          'Per Diem Tuesday': check.perdiemTuesday || 0,
          'Per Diem Wednesday': check.perdiemWednesday || 0,
          'Per Diem Thursday': check.perdiemThursday || 0,
          'Per Diem Friday': check.perdiemFriday || 0,
          'Per Diem Saturday': check.perdiemSaturday || 0,
          'Per Diem Sunday': check.perdiemSunday || 0,
          'Other Pay Description': otherPayDescription,
          'Other Pay Amount': otherPayAmount,
          'Expenses': isExpenseCheck ? `$${expensesAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 0,
          'Expense Name': check.expenseName || '',
          'Expense Description': check.expenseDescription || '',
          'Hourly Total': hourlyTotal,
          'Total Amount': `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Memo': check.memo || ''
        };
      });

      // Sort reportData to group expense checks together (at the end)
      const sortedReportData = [...reportData].sort((a, b) => {
        const aIsExpense = a['Pay Type'] === 'expense' || a['Division'] === 'Expenses';
        const bIsExpense = b['Pay Type'] === 'expense' || b['Division'] === 'Expenses';
        
        // If both are expenses or both are not expenses, maintain original order
        if (aIsExpense === bIsExpense) {
          return 0;
        }
        
        // Put expenses at the end
        return aIsExpense ? 1 : -1;
      });

      // Create workbook with multiple sheets using ExcelJS
      const workbook = new ExcelJS.Workbook();

      // Main checks sheet with professional formatting
      const checksWorksheet = workbook.addWorksheet('Checks');
      
      // Define columns from sortedReportData keys
      const headers = Object.keys(sortedReportData[0] || {});
      checksWorksheet.columns = headers.map(header => ({
        header: header,
        key: header,
        width: Math.min(Math.max(header.length + 5, 12), 30)
      }));
      
      // Add data rows
        sortedReportData.forEach(row => {
        checksWorksheet.addRow(row);
      });
      
      // Add total sum row
      checksWorksheet.addRow({
        'Check Number': 'TOTAL',
        'Company': '',
        'Employee': '',
        'Client(s)': '',
        'Division': '',
        'Pay Type': '',
        'Work Week': '',
        'Week Key': '',
        'Date': '',
        'Hours Worked': dataToExport.reduce((sum, check) => sum + (parseFloat(check.hours?.toString() || '0')), 0),
        'Pay Rate': '',
        'Overtime Hours': '',
        'Overtime Rate': '',
        'PTO Hours': '',
        'PTO Amount': (() => {
          let totalPTO = 0;
          dataToExport.forEach(check => {
            if (check.relationshipDetails && check.relationshipDetails.length > 0) {
              const relationship = check.relationshipDetails[0];
              if (relationship.payType === 'perdiem' || relationship.payType === 'mixed') {
                totalPTO += (relationship as any).ptoAmount || 0;
              } else {
                const relHolidayHours = relationship.holidayHours || check.holidayHours || 0;
                const relHolidayRate = check.holidayRate || (relationship.payRate || 0) * 2.0;
                totalPTO += relHolidayHours * relHolidayRate;
              }
            } else {
              if (check.payType === 'perdiem' || check.payType === 'mixed') {
                totalPTO += (check as any).ptoAmount || 0;
              } else {
                const holidayHours = check.holidayHours || 0;
                const holidayRate = check.holidayRate || (check.payRate || 0) * 2.0;
                totalPTO += holidayHours * holidayRate;
              }
            }
          });
          return totalPTO > 0 ? `$${totalPTO.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';
        })(),
        'Per Diem Amount': (() => {
          let totalPerDiem = 0;
          dataToExport.forEach(check => {
            if (check.relationshipDetails && check.relationshipDetails.length > 0) {
              const relationship = check.relationshipDetails[0];
              if (relationship.payType === 'perdiem' || relationship.payType === 'mixed') {
                let perdiemTotal = 0;
                const hasBreakdown = relationship.perdiemBreakdown !== undefined ? relationship.perdiemBreakdown : check.perdiemBreakdown;
                if (hasBreakdown) {
                  perdiemTotal = (relationship.perdiemMonday || check.perdiemMonday || 0) + 
                               (relationship.perdiemTuesday || check.perdiemTuesday || 0) + 
                               (relationship.perdiemWednesday || check.perdiemWednesday || 0) + 
                               (relationship.perdiemThursday || check.perdiemThursday || 0) + 
                               (relationship.perdiemFriday || check.perdiemFriday || 0) + 
                               (relationship.perdiemSaturday || check.perdiemSaturday || 0) + 
                               (relationship.perdiemSunday || check.perdiemSunday || 0);
                } else {
                  perdiemTotal = relationship.perdiemAmount || check.perdiemAmount || 0;
                }
                totalPerDiem += perdiemTotal;
              }
            } else {
              if (check.payType === 'perdiem' || check.payType === 'mixed') {
                let perdiemTotal = check.perdiemAmount || 0;
                if (check.perdiemBreakdown) {
                  perdiemTotal = (check.perdiemMonday || 0) + 
                               (check.perdiemTuesday || 0) + 
                               (check.perdiemWednesday || 0) + 
                               (check.perdiemThursday || 0) + 
                               (check.perdiemFriday || 0) + 
                               (check.perdiemSaturday || 0) + 
                               (check.perdiemSunday || 0);
                }
                totalPerDiem += perdiemTotal;
              }
            }
          });
          return totalPerDiem > 0 ? `$${totalPerDiem.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';
        })(),
        'Per Diem Breakdown': '',
        'Per Diem Monday': '',
        'Per Diem Tuesday': '',
        'Per Diem Wednesday': '',
        'Per Diem Thursday': '',
        'Per Diem Friday': '',
        'Per Diem Saturday': '',
        'Per Diem Sunday': '',
        'Other Pay Description': '',
        'Other Pay Amount': dataToExport.reduce((sum, check) => {
          let otherPayTotal = 0;
          if (check.relationshipDetails && check.relationshipDetails.length > 0) {
            const relationship = check.relationshipDetails[0];
            if (relationship.otherPay && relationship.otherPay.length > 0) {
              otherPayTotal = relationship.otherPay.reduce((relSum: number, item: any) => relSum + parseFloat(item.amount || '0'), 0);
            }
          } else if (check.otherPay && check.otherPay.length > 0) {
            otherPayTotal = check.otherPay.reduce((relSum: number, item: any) => relSum + parseFloat(item.amount || '0'), 0);
          }
          return sum + otherPayTotal;
        }, 0),
        'Expenses': (() => {
          const totalExpenses = dataToExport.reduce((sum, check) => {
            const isExpense = check.isExpense || check.payType === 'expense';
            return sum + (isExpense ? parseFloat(check.amount?.toString() || '0') : 0);
          }, 0);
          return totalExpenses > 0 ? `$${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
        })(),
        'Expense Name': '',
        'Expense Description': '',
        'Hourly Total': '',
        'Total Amount': (() => {
          const total = calculateCorrectTotal(dataToExport);
          return `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        })(),
        'Memo': ''
      });
      
      // Apply professional styling to checks sheet
      applyProfessionalStyling(checksWorksheet, true);

      // Company summary sheet - filter by selected company if provided
      let companyReports = generateCompanyReports();
      if (companyId) {
        companyReports = companyReports.filter(report => report.company.id === companyId);
      }
      
      const companySummarySheet = workbook.addWorksheet('Company Summary');
      companySummarySheet.columns = [
        { header: 'Company', key: 'company', width: 25 },
        { header: 'Total Checks', key: 'totalChecks', width: 15 },
        { header: 'Total Amount', key: 'totalAmount', width: 18 },
        { header: 'Active', key: 'active', width: 10 }
      ];
      
      companyReports.forEach(report => {
        companySummarySheet.addRow({
          company: report.company.name,
          totalChecks: report.totalChecks,
          totalAmount: `$${report.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          active: report.company.active ? 'Yes' : 'No'
        });
      });
      
      // Add total row
      if (companyReports.length > 0) {
        const totalChecks = companyReports.reduce((sum, report) => sum + report.totalChecks, 0);
        const totalAmount = companyReports.reduce((sum, report) => sum + report.totalAmount, 0);
        companySummarySheet.addRow({
          company: 'TOTAL',
          totalChecks: totalChecks,
          totalAmount: `$${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          active: ''
        });
      }
      
      // Apply professional styling to company summary sheet
      applyProfessionalStyling(companySummarySheet, true);

      // Client summary sheet - only for clients in dataToExport with checks
      const clientSummary = clients
        .map(client => {
        const clientChecks = dataToExport.filter(check => 
          check.clientId === client.id || 
          check.relationshipDetails?.some(rel => rel.clientId === client.id)
        );
        const totalAmount = calculateCorrectTotal(clientChecks);
        const totalChecks = clientChecks.length;
        
        return {
          'Client': client.name,
          'Company': companies.find(c => c.id === clientChecks[0]?.companyId)?.name || 'Unknown',
          'Total Checks': totalChecks,
          'Total Amount': `$${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Active': client.active ? 'Yes' : 'No'
        };
        })
        .filter(item => item['Total Checks'] > 0); // Only include clients with checks
      
      // Add Expenses row if there are expense checks
      const expenseChecksForSummary = dataToExport.filter(check => check.isExpense || check.payType === 'expense');
      if (expenseChecksForSummary.length > 0) {
        const expenseTotal = calculateCorrectTotal(expenseChecksForSummary);
        const expenseCompany = expenseChecksForSummary.length > 0 
          ? companies.find(c => c.id === expenseChecksForSummary[0]?.companyId)?.name || 'Unknown'
          : 'Unknown';
        
        clientSummary.push({
          'Client': 'Expenses',
          'Company': expenseCompany,
          'Total Checks': expenseChecksForSummary.length,
          'Total Amount': `$${expenseTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Active': 'N/A'
        });
      }
      
      const clientSummarySheet = workbook.addWorksheet('Client Summary');
      clientSummarySheet.columns = [
        { header: 'Client', key: 'Client', width: 25 },
        { header: 'Company', key: 'Company', width: 25 },
        { header: 'Total Checks', key: 'Total Checks', width: 15 },
        { header: 'Total Amount', key: 'Total Amount', width: 18 },
        { header: 'Active', key: 'Active', width: 10 }
      ];
      clientSummary.forEach(item => clientSummarySheet.addRow(item));
      
      // Add total row
      if (clientSummary.length > 0) {
        const totalChecks = clientSummary.reduce((sum, item) => sum + item['Total Checks'], 0);
        const totalAmount = clientSummary.reduce((sum, item) => {
          const amountStr = item['Total Amount'].toString().replace(/[^0-9.-]/g, '');
          return sum + parseFloat(amountStr || '0');
        }, 0);
        clientSummarySheet.addRow({
          'Client': 'TOTAL',
          'Company': '',
          'Total Checks': totalChecks,
          'Total Amount': `$${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Active': ''
        });
      }
      
      applyProfessionalStyling(clientSummarySheet, true);

      // Company → Client → Division breakdown sheet - filter by selected company if provided
      let breakdownReports = generateCompanyReports();
      if (companyId) {
        breakdownReports = breakdownReports.filter(report => report.company.id === companyId);
      }
      const breakdownData: any[] = [];
      
      breakdownReports.forEach(report => {
        report.clientBreakdown.forEach(client => {
          client.divisionBreakdown.forEach(division => {
            breakdownData.push({
              'Company': report.company.name,
              'Client': client.clientName,
              'Division': division.divisionName,
              'Total Checks': division.totalChecks,
              'Hourly Amount': `$${division.hourlyAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              'Per Diem Amount': `$${division.perdiemAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              'PTO Amount': `$${division.ptoAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              'Other Amount': `$${division.otherPayAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              'Expenses': `$${division.expensesAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              'Total Amount': `$${division.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            });
          });
        });
      });
      
      const breakdownSheet = workbook.addWorksheet('Company→Client→Division');
      breakdownSheet.columns = [
        { header: 'Company', key: 'Company', width: 25 },
        { header: 'Client', key: 'Client', width: 25 },
        { header: 'Division', key: 'Division', width: 20 },
        { header: 'Total Checks', key: 'Total Checks', width: 15 },
        { header: 'Hourly Amount', key: 'Hourly Amount', width: 18 },
        { header: 'Per Diem Amount', key: 'Per Diem Amount', width: 18 },
        { header: 'PTO Amount', key: 'PTO Amount', width: 18 },
        { header: 'Other Amount', key: 'Other Amount', width: 18 },
        { header: 'Expenses', key: 'Expenses', width: 18 },
        { header: 'Total Amount', key: 'Total Amount', width: 18 }
      ];
      breakdownData.forEach(item => breakdownSheet.addRow(item));
      
      // Add total row
      if (breakdownData.length > 0) {
        const totalChecks = breakdownData.reduce((sum, item) => sum + item['Total Checks'], 0);
        const totalHourly = breakdownData.reduce((sum, item) => {
          const amountStr = item['Hourly Amount'].toString().replace(/[^0-9.-]/g, '');
          return sum + parseFloat(amountStr || '0');
        }, 0);
        const totalPerDiem = breakdownData.reduce((sum, item) => {
          const amountStr = item['Per Diem Amount'].toString().replace(/[^0-9.-]/g, '');
          return sum + parseFloat(amountStr || '0');
        }, 0);
        const totalPTO = breakdownData.reduce((sum, item) => {
          const amountStr = item['PTO Amount'].toString().replace(/[^0-9.-]/g, '');
          return sum + parseFloat(amountStr || '0');
        }, 0);
        const totalOther = breakdownData.reduce((sum, item) => {
          const amountStr = item['Other Amount'].toString().replace(/[^0-9.-]/g, '');
          return sum + parseFloat(amountStr || '0');
        }, 0);
        const totalExpenses = breakdownData.reduce((sum, item) => {
          const amountStr = item['Expenses'].toString().replace(/[^0-9.-]/g, '');
          return sum + parseFloat(amountStr || '0');
        }, 0);
        const totalAmount = breakdownData.reduce((sum, item) => {
          const amountStr = item['Total Amount'].toString().replace(/[^0-9.-]/g, '');
          return sum + parseFloat(amountStr || '0');
        }, 0);
        
        breakdownSheet.addRow({
          'Company': 'TOTAL',
          'Client': '',
          'Division': '',
          'Total Checks': totalChecks,
          'Hourly Amount': `$${totalHourly.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Per Diem Amount': `$${totalPerDiem.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'PTO Amount': `$${totalPTO.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Other Amount': `$${totalOther.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Expenses': `$${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Total Amount': `$${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        });
      }
      
      applyProfessionalStyling(breakdownSheet, true);

      // Employee summary sheet - only for employees in dataToExport with checks
      const employeeSummary = employees
        .filter(employee => !companyId || employee.companyId === companyId) // Filter by company if specified
        .map(employee => {
        const employeeChecks = dataToExport.filter(check => check.employeeId === employee.id);
        const totalAmount = calculateCorrectTotal(employeeChecks);
        const totalChecks = employeeChecks.length;
        
        return {
          'Employee': employee.name,
          'Address': employee.address || 'N/A',
          'Position': employee.position || 'N/A',
          'Company': companies.find(c => c.id === employee.companyId)?.name || 'Unknown',
          'Role': employee.role || employee.position || 'N/A',
          'Start Date': employee.startDate ? new Date(employee.startDate + 'T00:00:00').toLocaleDateString() : 'N/A',
          'Total Checks': totalChecks,
          'Total Amount': `$${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Active': employee.active ? 'Yes' : 'No'
        };
        })
        .filter(item => item['Total Checks'] > 0); // Only include employees with checks
      
      const employeeSummarySheet = workbook.addWorksheet('Employee Summary');
      employeeSummarySheet.columns = [
        { header: 'Employee', key: 'Employee', width: 25 },
        { header: 'Address', key: 'Address', width: 30 },
        { header: 'Position', key: 'Position', width: 20 },
        { header: 'Company', key: 'Company', width: 25 },
        { header: 'Role', key: 'Role', width: 20 },
        { header: 'Start Date', key: 'Start Date', width: 15 },
        { header: 'Total Checks', key: 'Total Checks', width: 15 },
        { header: 'Total Amount', key: 'Total Amount', width: 18 },
        { header: 'Active', key: 'Active', width: 10 }
      ];
      employeeSummary.forEach(item => employeeSummarySheet.addRow(item));
      
      // Add total row
      if (employeeSummary.length > 0) {
        const totalChecks = employeeSummary.reduce((sum, item) => sum + item['Total Checks'], 0);
        const totalAmount = employeeSummary.reduce((sum, item) => {
          const amountStr = item['Total Amount'].toString().replace(/[^0-9.-]/g, '');
          return sum + parseFloat(amountStr || '0');
        }, 0);
        employeeSummarySheet.addRow({
          'Employee': 'TOTAL',
          'Address': '',
          'Position': '',
          'Company': '',
          'Role': '',
          'Start Date': '',
          'Total Checks': totalChecks,
          'Total Amount': `$${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Active': ''
        });
      }
      
      applyProfessionalStyling(employeeSummarySheet, true);

      // Expenses breakdown sheet - show expense checks grouped by company and division
      const expenseChecks = dataToExport.filter(check => check.isExpense || check.payType === 'expense');
      
      if (expenseChecks.length > 0) {
        // Group expenses by company and division
        const expensesByCompany = new Map<string, {
          company: string;
          expenses: Array<{
            checkNumber: string;
            date: string;
            expenseName: string;
            description: string;
            amount: number;
            division: string;
          }>;
        }>();

        expenseChecks.forEach(check => {
          const company = companies.find(c => c.id === check.companyId);
          const companyName = company?.name || 'Unknown Company';
          const checkDate = check.date?.toDate ? check.date.toDate() : new Date(check.date);
          
          // Get division name (should be "Expenses" for expense checks)
          const divisionName = getDivisionNameForRelationship(check);
          
          if (!expensesByCompany.has(companyName)) {
            expensesByCompany.set(companyName, {
              company: companyName,
              expenses: []
            });
          }
          
          const companyData = expensesByCompany.get(companyName)!;
          companyData.expenses.push({
            checkNumber: String(check.checkNumber || check.id),
            date: checkDate.toLocaleDateString(),
            expenseName: check.expenseName || 'N/A',
            description: check.expenseDescription || check.memo || 'N/A',
            amount: parseFloat(check.amount?.toString() || '0'),
            division: divisionName
          });
        });

        const expensesSheet = workbook.addWorksheet('Expenses');
        expensesSheet.columns = [
          { header: 'Check Number', key: 'Check Number', width: 15 },
          { header: 'Company', key: 'Company', width: 25 },
          { header: 'Division', key: 'Division', width: 20 },
          { header: 'Expense Name', key: 'Expense Name', width: 30 },
          { header: 'Description', key: 'Description', width: 40 },
          { header: 'Date', key: 'Date', width: 15 },
          { header: 'Amount', key: 'Amount', width: 18 },
          { header: 'Total Checks', key: 'Total Checks', width: 15 }
        ];

        // Add data grouped by company
        expensesByCompany.forEach((companyData, companyName) => {
          companyData.expenses.forEach(expense => {
            expensesSheet.addRow({
              'Check Number': expense.checkNumber,
              'Company': companyName,
              'Division': expense.division,
              'Expense Name': expense.expenseName,
              'Description': expense.description,
              'Date': expense.date,
              'Amount': `$${expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              'Total Checks': 1
            });
          });
        });

        // Add total row
        const totalExpenses = expenseChecks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
        const totalExpenseChecks = expenseChecks.length;
        expensesSheet.addRow({
          'Check Number': 'TOTAL',
          'Company': '',
          'Division': '',
          'Expense Name': '',
          'Description': '',
          'Date': '',
          'Amount': `$${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Total Checks': totalExpenseChecks
        });

        applyProfessionalStyling(expensesSheet, true);
      }

      // Export the file using ExcelJS
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);
      
      const companyName = companyId ? companies.find(c => c.id === companyId)?.name : 'All Companies';
      setSuccess(`${companyName} report exported successfully! ${dataToExport.length} checks included.`);
      
    } catch (err) {
      console.error('Error exporting report:', err);
      setError('Failed to export report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const exportEmployeeInfoReport = async () => {
    setExporting(true);
    setError(null);
    setSuccess(null);

    try {
      const filteredEmployees = employees
        .filter(employee => selectedCompanyForEmployeeInfo === 'all' || employee.companyId === selectedCompanyForEmployeeInfo)
        .filter(employee => includeInactiveEmployees || employee.active);

      const sortedEmployees = [...filteredEmployees].sort((a, b) => {
        const companyA = companies.find(c => c.id === a.companyId)?.name || '';
        const companyB = companies.find(c => c.id === b.companyId)?.name || '';
        if (companyA !== companyB) {
          return companyA.localeCompare(companyB);
        }
        return a.name.localeCompare(b.name);
      });

      if (sortedEmployees.length === 0) {
        setError('No employee information available for the selected filters.');
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Employee Information');

      worksheet.columns = [
        { header: 'Employee', key: 'employeeName', width: 25 },
        { header: 'Company', key: 'companyName', width: 20 },
        { header: 'Role', key: 'role', width: 18 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Total Relationships', key: 'totalRelationships', width: 18 },
        { header: 'Clients', key: 'clients', width: 30 },
        { header: 'Pay Types / Details', key: 'payTypes', width: 45 }
      ];

      const companyHeaderRows: number[] = [];
      let currentCompanyName = '';

      sortedEmployees.forEach(employee => {
        const company = companies.find(c => c.id === employee.companyId);
        const companyName = company?.name || 'Unknown Company';

        if (companyName !== currentCompanyName) {
          currentCompanyName = companyName;
          const companyRow = worksheet.addRow({
            employeeName: companyName,
            companyName: '',
            role: '',
            status: '',
            totalRelationships: '',
            clients: '',
            payTypes: ''
          });
          companyHeaderRows.push(companyRow.number);
        }

        const relationships = (employee.clientPayTypeRelationships || []).map(rel => {
          const clientName = clients.find(c => c.id === rel.clientId)?.name || rel.clientName || 'Unknown Client';
          const payRate = rel.payRate ? `$${rel.payRate}` : '';
          return `${clientName} – ${rel.payType}${payRate ? ` (${payRate})` : ''}`;
        });
        const uniqueClients = new Set(
          (employee.clientPayTypeRelationships || []).map(
            rel => clients.find(c => c.id === rel.clientId)?.name || rel.clientName || 'Unknown Client'
          )
        );

        worksheet.addRow({
          employeeName: employee.name,
          companyName,
          role: employee.role || employee.position || employee.payType || 'N/A',
          status: employee.active ? 'Active' : 'Inactive',
          totalRelationships: employee.clientPayTypeRelationships?.length || 0,
          clients: Array.from(uniqueClients).join(', ') || 'N/A',
          payTypes: relationships.join('; ') || (employee.payType || 'N/A')
        });
      });

      applyProfessionalStyling(worksheet, false);

      companyHeaderRows.forEach(rowNumber => {
        const row = worksheet.getRow(rowNumber);
        row.eachCell(cell => {
          cell.font = { bold: true, color: { argb: 'FF000000' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFFFF' } // White background
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          // Black borders
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        });
      });

      const companyName =
        selectedCompanyForEmployeeInfo === 'all'
          ? 'All_Companies'
          : (companies.find(c => c.id === selectedCompanyForEmployeeInfo)?.name || 'Company').replace(/\s+/g, '_');

      const filename = `Employee_Information_Report_${companyName}_${new Date().toISOString().split('T')[0]}.xlsx`;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);

      setSuccess(`Employee information report exported successfully as ${filename}`);
    } catch (err) {
      console.error('Export error:', err);
      setError('Failed to export Employee Information Report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const filteredChecks = getFilteredData();
  // Calculate total amount using the same logic as department breakdown for consistency
  const totalAmount = (() => {
    let totalHourly = 0;
    let totalPerdiem = 0;
    let totalPto = 0;
    let totalOtherPay = 0;
    let totalExpenses = 0;
    
    filteredChecks.forEach(check => {
      if (check.relationshipDetails && check.relationshipDetails.length > 0) {
        check.relationshipDetails.forEach(rel => {
          if (rel.payType === 'hourly' || rel.payType === 'mixed') {
            const relHours = rel.hours || 0;
            const relOtHours = rel.otHours || 0;
            const relHolidayHours = rel.holidayHours || 0;
            const relPayRate = rel.payRate || 0;
            const otRate = check.overtimeRate || relPayRate * 1.5;
            const holidayRate = check.holidayRate || relPayRate * 2.0;
            
            totalHourly += relHours * relPayRate + relOtHours * otRate + relHolidayHours * holidayRate;
            
            if (rel.otherPay && rel.otherPay.length > 0) {
              const otherPayTotal = rel.otherPay.reduce((sum: number, item: any) => 
                sum + parseFloat(item.amount || '0'), 0);
              totalOtherPay += otherPayTotal;
            }
          }
          
          if (rel.payType === 'perdiem' || rel.payType === 'mixed') {
            let perdiemTotal = 0;
            const hasBreakdown = rel.perdiemBreakdown !== undefined ? rel.perdiemBreakdown : check.perdiemBreakdown;
            if (hasBreakdown) {
              perdiemTotal = (rel.perdiemMonday || check.perdiemMonday || 0) + 
                           (rel.perdiemTuesday || check.perdiemTuesday || 0) + 
                           (rel.perdiemWednesday || check.perdiemWednesday || 0) + 
                           (rel.perdiemThursday || check.perdiemThursday || 0) + 
                           (rel.perdiemFriday || check.perdiemFriday || 0) + 
                           (rel.perdiemSaturday || check.perdiemSaturday || 0) + 
                           (rel.perdiemSunday || check.perdiemSunday || 0);
            } else {
              perdiemTotal = rel.perdiemAmount || check.perdiemAmount || 0;
            }
            totalPerdiem += perdiemTotal;
            
            // Track PTO amount separately for per diem relationships
            const relPtoAmount = (rel as any).ptoAmount || 0;
            totalPto += relPtoAmount;
            
            // Track other pay separately for per diem relationships
            if (rel.otherPay && rel.otherPay.length > 0) {
              const otherPayTotal = rel.otherPay.reduce((sum: number, item: any) => 
                sum + parseFloat(item.amount || '0'), 0);
              totalOtherPay += otherPayTotal;
            }
          }
        });
      } else {
        if (check.payType === 'hourly' || check.payType === 'mixed') {
          const hourlyTotal = (check.hours || 0) * (check.payRate || 0) +
                             (check.overtimeHours || 0) * (check.overtimeRate || 0) +
                             (check.holidayHours || 0) * (check.holidayRate || 0);
          totalHourly += hourlyTotal;
          
          if (check.otherPay && check.otherPay.length > 0) {
            const otherPayTotal = check.otherPay.reduce((sum: number, item: any) => 
              sum + parseFloat(item.amount || '0'), 0);
            totalOtherPay += otherPayTotal;
          }
        }
        
        if (check.payType === 'perdiem' || check.payType === 'mixed') {
          let perdiemTotal = check.perdiemAmount || 0;
          if (check.perdiemBreakdown) {
            perdiemTotal = (check.perdiemMonday || 0) + 
                         (check.perdiemTuesday || 0) + 
                         (check.perdiemWednesday || 0) + 
                         (check.perdiemThursday || 0) + 
                         (check.perdiemFriday || 0) + 
                         (check.perdiemSaturday || 0) + 
                         (check.perdiemSunday || 0);
          }
          totalPerdiem += perdiemTotal;
          
          // Track PTO amount separately (if stored at check level)
          const checkPtoAmount = (check as any).ptoAmount || 0;
          if (checkPtoAmount > 0) {
            totalPto += checkPtoAmount;
          }
          
          if (check.otherPay && check.otherPay.length > 0) {
            const otherPayTotal = check.otherPay.reduce((sum: number, item: any) => 
              sum + parseFloat(item.amount || '0'), 0);
            totalOtherPay += otherPayTotal;
          }
        }
      }
      
      if (check.isExpense || check.payType === 'expense') {
        totalExpenses += parseFloat(check.amount?.toString() || '0');
      }
    });
    
    return totalHourly + totalPerdiem + totalPto + totalOtherPay + totalExpenses;
  })();
  const companyReports = generateCompanyReports();

  const getClientDepartmentStats = (client: Client): ClientDepartmentStats | null => {
    const clientCheckIds = new Set<string>();
    let hourlyAmount = 0;
    let perdiemAmount = 0;
    let ptoAmount = 0;
    let otherPayAmount = 0;
    let representativeCompanyId: string | undefined;
    const companyIdsForClient = new Set<string>();
    
    // First, include company IDs from client.companyIds if available (this is the primary source)
    if (client.companyIds && client.companyIds.length > 0) {
      client.companyIds.forEach(cid => companyIdsForClient.add(cid));
    }
    
    // Also find company IDs from checks that match this client (as fallback)
    filteredChecks.forEach(check => {
      const isDirectMatch = check.clientId === client.id;
      const matchingRelationships = check.relationshipDetails?.filter(rel => rel.clientId === client.id) || [];
      
      if (isDirectMatch || matchingRelationships.length > 0) {
        companyIdsForClient.add(check.companyId);
        representativeCompanyId = representativeCompanyId || check.companyId;
      }
    });

    filteredChecks.forEach(check => {
      const isDirectMatch = check.clientId === client.id;
      const matchingRelationships = check.relationshipDetails?.filter(rel => rel.clientId === client.id) || [];
      
      // Check if this is an expense check - exclude expenses from individual departments
      const isExpenseCheck = check.isExpense || check.payType === 'expense';
      
      // Skip expense checks - they will be shown as a separate row
      if (isExpenseCheck) {
        return;
      }

      // For non-expense checks, require direct match or relationships
      if (!isDirectMatch && matchingRelationships.length === 0) {
        return;
      }

      representativeCompanyId = representativeCompanyId || check.companyId;
      clientCheckIds.add(check.id);
      
      if (matchingRelationships.length > 0) {
        matchingRelationships.forEach(rel => {
          if (rel.payType === 'hourly') {
            const relHours = rel.hours || check.hours || 0;
            const relOtHours = rel.otHours || check.otHours || 0;
            const relHolidayHours = rel.holidayHours || check.holidayHours || 0;
            const relPayRate = rel.payRate || 0;

            const regularPay = relHours * relPayRate;
            const otPay = relOtHours * relPayRate * 1.5;
            const holidayPay = relHolidayHours * relPayRate * 2.0;

            hourlyAmount += regularPay + otPay + holidayPay;

            // Track other pay separately
            if (rel.otherPay && rel.otherPay.length > 0) {
              otherPayAmount += rel.otherPay.reduce((sum, item) => sum + parseFloat(item.amount || '0'), 0);
            }
          } else if (rel.payType === 'perdiem') {
            let relPerdiemTotal = 0;
            const hasBreakdown = rel.perdiemBreakdown !== undefined ? rel.perdiemBreakdown : check.perdiemBreakdown;
            if (hasBreakdown) {
              relPerdiemTotal = (rel.perdiemMonday || check.perdiemMonday || 0) +
                               (rel.perdiemTuesday || check.perdiemTuesday || 0) +
                               (rel.perdiemWednesday || check.perdiemWednesday || 0) +
                               (rel.perdiemThursday || check.perdiemThursday || 0) +
                               (rel.perdiemFriday || check.perdiemFriday || 0) +
                               (rel.perdiemSaturday || check.perdiemSaturday || 0) +
                               (rel.perdiemSunday || check.perdiemSunday || 0);
            } else {
              relPerdiemTotal = rel.perdiemAmount || check.perdiemAmount || 0;
            }
            perdiemAmount += relPerdiemTotal;
            
            // Track PTO amount separately for per diem employees
            const relPtoAmount = (rel as any).ptoAmount || 0;
            ptoAmount += relPtoAmount;
            
            // Track other pay separately for per diem relationships
            if (rel.otherPay && rel.otherPay.length > 0) {
              otherPayAmount += rel.otherPay.reduce((sum, item) => sum + parseFloat(item.amount || '0'), 0);
            }
          }
        });
      } else if (isDirectMatch) {
        if (check.payType === 'hourly' || check.payType === 'mixed') {
          const hourlyTotal = (check.hours || 0) * (check.payRate || 0) +
                             (check.overtimeHours || 0) * (check.overtimeRate || 0) +
                             (check.holidayHours || 0) * (check.holidayRate || 0);
          hourlyAmount += hourlyTotal;

          // Track other pay separately
          if (check.otherPay && check.otherPay.length > 0) {
            otherPayAmount += check.otherPay.reduce((sum, item) => sum + parseFloat(item.amount || '0'), 0);
          }
        }

        if (check.payType === 'perdiem' || check.payType === 'mixed') {
          let perdiemTotal = check.perdiemAmount || 0;
          if (check.perdiemBreakdown) {
            perdiemTotal = (check.perdiemMonday || 0) +
                          (check.perdiemTuesday || 0) +
                          (check.perdiemWednesday || 0) +
                          (check.perdiemThursday || 0) +
                          (check.perdiemFriday || 0) +
                          (check.perdiemSaturday || 0) +
                          (check.perdiemSunday || 0);
          }
          perdiemAmount += perdiemTotal;
          
          // Track PTO amount separately (if stored at check level)
          const checkPtoAmount = (check as any).ptoAmount || 0;
          if (checkPtoAmount > 0) {
            ptoAmount += checkPtoAmount;
          }
          
          // Track other pay separately
          if (check.otherPay && check.otherPay.length > 0) {
            otherPayAmount += check.otherPay.reduce((sum, item) => sum + parseFloat(item.amount || '0'), 0);
          }
        }
      }
    });

    // Only return if there are checks for this client (expenses are handled separately)
    if (clientCheckIds.size === 0) {
      return null;
    }

    // Find company name - use first companyId from companyIdsForClient if representativeCompanyId is not set
    let companyIdToUse = representativeCompanyId;
    if (!companyIdToUse && companyIdsForClient.size > 0) {
      companyIdToUse = Array.from(companyIdsForClient)[0];
    }
    const company = companies.find(c => c.id === companyIdToUse);

    return {
      clientId: client.id,
      clientName: client.name,
      companyName: company?.name || 'Unknown',
      totalChecks: clientCheckIds.size,
      hourlyAmount,
      perdiemAmount,
      ptoAmount,
      otherPayAmount,
      expensesAmount: 0, // Expenses are shown as a separate row
      totalAmount: hourlyAmount + perdiemAmount + ptoAmount + otherPayAmount,
      isActive: client.active
    };
  };

  const buildClientDepartmentStats = (clientList: Client[]) => {
    const departmentStats = clientList
      .map(client => getClientDepartmentStats(client))
      .filter((stat): stat is ClientDepartmentStats => !!stat);
    
    // Calculate total expenses from all filtered checks
    const totalExpenses = filteredChecks
      .filter(check => check.isExpense || check.payType === 'expense')
      .reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
    
    // Get expense check count
    const expenseCheckCount = filteredChecks.filter(check => check.isExpense || check.payType === 'expense').length;
    
    // Find the most common company for expenses (for display purposes)
    const expenseCompanyIds = filteredChecks
      .filter(check => check.isExpense || check.payType === 'expense')
      .map(check => check.companyId);
    const companyCounts = expenseCompanyIds.reduce((acc, id) => {
      acc[id] = (acc[id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const mostCommonCompanyId = Object.keys(companyCounts).reduce((a, b) => 
      companyCounts[a] > companyCounts[b] ? a : b, expenseCompanyIds[0] || '');
    const expenseCompany = companies.find(c => c.id === mostCommonCompanyId);
    
    // Add expenses as a separate row if there are any expenses
    if (totalExpenses > 0) {
      const expensesRow: ClientDepartmentStats = {
        clientId: 'expenses',
        clientName: 'Expenses',
        companyName: expenseCompany?.name || 'Multiple Companies',
        totalChecks: expenseCheckCount,
        hourlyAmount: 0,
        perdiemAmount: 0,
        ptoAmount: 0,
        otherPayAmount: 0,
        expensesAmount: totalExpenses,
        totalAmount: totalExpenses,
        isActive: true
      };
      departmentStats.push(expensesRow);
    }
    
    return departmentStats;
  };

  const visibleClientStats = buildClientDepartmentStats(
    clients.filter(client => filters.includeInactive || client.active)
  );

  const departmentTotals = visibleClientStats.reduce(
    (acc, stat) => ({
      totalChecks: acc.totalChecks + stat.totalChecks,
      hourlyAmount: acc.hourlyAmount + stat.hourlyAmount,
      perdiemAmount: acc.perdiemAmount + stat.perdiemAmount,
      ptoAmount: acc.ptoAmount + stat.ptoAmount,
      otherPayAmount: acc.otherPayAmount + stat.otherPayAmount,
      expensesAmount: acc.expensesAmount + stat.expensesAmount,
      totalAmount: acc.totalAmount + stat.totalAmount
    }),
    { totalChecks: 0, hourlyAmount: 0, perdiemAmount: 0, ptoAmount: 0, otherPayAmount: 0, expensesAmount: 0, totalAmount: 0 }
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold">
          Check Reports & Analytics
      </Typography>
      
      <Typography variant="body1" color="text.secondary" gutterBottom>
        Export comprehensive check information to Excel with detailed breakdowns by company, client, and employee.
      </Typography>

      {/* Filters */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          <FilterList sx={{ mr: 1, verticalAlign: 'middle' }} />
          Report Filters
        </Typography>
        
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 3 }}>
          <Box>
            <FormControl fullWidth>
              <InputLabel>Company</InputLabel>
              <Select
                value={filters.companyId || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, companyId: e.target.value || undefined }))}
                label="Company"
              >
                <MenuItem value="">All Companies</MenuItem>
                {companies.map(company => (
                  <MenuItem key={company.id} value={company.id}>
                    {company.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          
          <Box>
            <TextField
              fullWidth
              type="date"
              label="Start Date"
              value={filters.startDate || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
          
          <Box>
            <TextField
              fullWidth
              type="date"
              label="End Date"
              value={filters.endDate || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
          
          <Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.includeInactive}
                    onChange={(e) => setFilters(prev => ({ ...prev, includeInactive: e.target.checked }))}
                  />
                }
                label="Include Inactive"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.includeUnpaid}
                    onChange={(e) => setFilters(prev => ({ ...prev, includeUnpaid: e.target.checked }))}
                  />
                }
                label="Include Unpaid"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.includeUnreviewed}
                    onChange={(e) => setFilters(prev => ({ ...prev, includeUnreviewed: e.target.checked }))}
                  />
                }
                label="Include Unreviewed"
              />
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Summary Stats */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
           Summary Statistics
        </Typography>
        
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 3 }}>
          <Box textAlign="center">
            <Typography variant="h4" color="primary" fontWeight="bold">
              {filteredChecks.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Checks
            </Typography>
          </Box>
          
          <Box textAlign="center">
            <Typography variant="h4" color="success.main" fontWeight="bold">
              ${totalAmount.toLocaleString()}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Amount
            </Typography>
          </Box>
          
          <Box textAlign="center">
            <Typography variant="h4" color="info.main" fontWeight="bold">
              {companies.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Companies
            </Typography>
          </Box>
          
          <Box textAlign="center">
            <Typography variant="h4" color="warning.main" fontWeight="bold">
              {employees.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Employees
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Tabs for different views */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Tabs value={selectedTab} onChange={(e, newValue) => setSelectedTab(newValue)} sx={{ mb: 3 }}>
          <Tab 
            icon={<Business />} 
            label="Company Reports" 
            iconPosition="start"
          />
          <Tab 
            icon={<AttachMoney />} 
            label="Deparment Breakdown" 
            iconPosition="start"
          />
          <Tab 
            icon={<People />} 
            label="Employee Summary" 
            iconPosition="start"
          />
          <Tab 
            icon={<AssignmentInd />} 
            label="Employee Info Report" 
            iconPosition="start"
          />
          <Tab 
            icon={<Receipt />} 
            label="Expenses" 
            iconPosition="start"
          />
        </Tabs>

        {/* Company Reports Tab */}
        {selectedTab === 0 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Company Reports
            </Typography>
            
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                size="large"
                startIcon={exporting ? <CircularProgress size={20} /> : <Download />}
                onClick={() => exportToExcel()}
                disabled={exporting || filteredChecks.length === 0}
              >
                {exporting ? 'Exporting...' : 'Export All Clients'}
              </Button>
              
              <Button
                variant="outlined"
                startIcon={<Refresh />}
                onClick={fetchData}
                disabled={loading}
              >
                Refresh Data
              </Button>
            </Box>

            {companyReports.map((report) => (
              <Accordion 
                key={report.company.id}
                expanded={expandedCompany === report.company.id}
                onChange={() => setExpandedCompany(expandedCompany === report.company.id ? null : report.company.id)}
                sx={{ mb: 2 }}
              >
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', pr: 2 }}>
                    <Box>
                      <Typography variant="h6" fontWeight="bold">
                        {report.company.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {report.totalChecks} checks • ${report.totalAmount.toLocaleString()}
                      </Typography>
                    </Box>
                  </Box>
                </AccordionSummary>
                
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, py: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => exportToExcel(report.company.id)}
                    disabled={exporting}
                  >
                    Export Company
                  </Button>
                </Box>
                
                <AccordionDetails>
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                      Deparment Breakdown {filters.companyId ? ` For ${companies.find(c => c.id === filters.companyId)?.name || 'Company'}` : ''}
                    </Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                            <TableCell><strong>Client / Division</strong></TableCell>
                            <TableCell align="right"><strong>Checks</strong></TableCell>
                            <TableCell align="right"><strong>Hourly Amount</strong></TableCell>
                            <TableCell align="right"><strong>Per Diem Amount</strong></TableCell>
                            <TableCell align="right"><strong>PTO Amount</strong></TableCell>
                            <TableCell align="right"><strong>Other Amount</strong></TableCell>
                            <TableCell align="right"><strong>Expenses</strong></TableCell>
                            <TableCell align="right"><strong>Total Amount</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {report.clientBreakdown
                            .filter(client => client.clientId && client.clientId !== 'null' && client.clientId !== 'undefined')
                            .map((client) => (
                              <React.Fragment key={client.clientId}>
                                {/* Client Row */}
                                <TableRow sx={{ backgroundColor: '#e8f4fd', borderLeft: '4px solid #1976d2' }}>
                                  <TableCell sx={{ fontWeight: 'bold', pl: 2, fontSize: '1rem' }}>
                                    {client.clientName} <span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: '#666' }}>(Client Total)</span>
                                  </TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{client.totalChecks}</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>${client.hourlyAmount.toLocaleString()}</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>${client.perdiemAmount.toLocaleString()}</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>${client.ptoAmount.toLocaleString()}</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>${client.otherPayAmount.toLocaleString()}</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>${client.expensesAmount.toLocaleString()}</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 'bold', color: '#1976d2' }}>${client.totalAmount.toLocaleString()}</TableCell>
                                </TableRow>
                                
                                {/* Division Rows */}
                                {client.divisionBreakdown.map((division, index) => (
                                  <TableRow 
                                    key={`${client.clientId}-${index}`} 
                                    sx={{ 
                                      backgroundColor: '#fafafa',
                                      cursor: 'pointer',
                                      '&:hover': {
                                        backgroundColor: '#f0f0f0'
                                      }
                                    }}
                                    onClick={() => handleDivisionClick(division.divisionName, client.clientName, division.checks)}
                                  >
                                    <TableCell sx={{ pl: 6, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                                      → {division.divisionName}
                                      <Launch sx={{ fontSize: '1rem', color: 'text.secondary', opacity: 0.7 }} />
                                    </TableCell>
                                    <TableCell align="right">{division.totalChecks}</TableCell>
                                    <TableCell align="right">${division.hourlyAmount.toLocaleString()}</TableCell>
                                    <TableCell align="right">${division.perdiemAmount.toLocaleString()}</TableCell>
                                    <TableCell align="right">${division.ptoAmount.toLocaleString()}</TableCell>
                                    <TableCell align="right">${division.otherPayAmount.toLocaleString()}</TableCell>
                                    <TableCell align="right">${division.expensesAmount.toLocaleString()}</TableCell>
                                    <TableCell align="right">${division.totalAmount.toLocaleString()}</TableCell>
                                  </TableRow>
                                ))}
                              </React.Fragment>
                            ))}
                          
                          {/* Total Row for Company Reports */}
                          <TableRow sx={{ backgroundColor: '#e3f2fd', fontWeight: 'bold' }}>
                            <TableCell><strong>COMPANY TOTAL</strong></TableCell>
                            <TableCell align="right">
                              <strong>
                                {report.clientBreakdown.reduce((sum, client) => sum + client.totalChecks, 0)}
                              </strong>
                            </TableCell>
                            <TableCell align="right">
                              <strong>
                                ${report.clientBreakdown.reduce((sum, client) => sum + client.hourlyAmount, 0).toLocaleString()}
                              </strong>
                            </TableCell>
                            <TableCell align="right">
                              <strong>
                                ${report.clientBreakdown.reduce((sum, client) => sum + client.perdiemAmount, 0).toLocaleString()}
                              </strong>
                            </TableCell>
                            <TableCell align="right">
                              <strong>
                                ${report.clientBreakdown.reduce((sum, client) => sum + client.ptoAmount, 0).toLocaleString()}
                              </strong>
                            </TableCell>
                            <TableCell align="right">
                              <strong>
                                ${report.clientBreakdown.reduce((sum, client) => sum + client.otherPayAmount, 0).toLocaleString()}
                              </strong>
                            </TableCell>
                            <TableCell align="right">
                              <strong>
                                ${report.clientBreakdown.reduce((sum, client) => sum + client.expensesAmount, 0).toLocaleString()}
                              </strong>
                            </TableCell>
                            <TableCell align="right">
                              <strong>
                                ${report.clientBreakdown.reduce((sum, client) => sum + client.totalAmount, 0).toLocaleString()}
                              </strong>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        )}

        {/* Client Breakdown Tab - Fixed React warnings */}
        {selectedTab === 1 && (
          <Box>
            <Typography variant="h6" gutterBottom>
               Department Breakdown{filters.companyId ? ` For ${companies.find(c => c.id === filters.companyId)?.name || 'Company'}` : ''}
            </Typography>
            
            {/* Client Filter Controls */}
            <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={filters.includeInactive}
                      onChange={(e) => setFilters(prev => ({ ...prev, includeInactive: e.target.checked }))}
                    />
                  }
                  label="Include Inactive Departments"
                />
                <Typography variant="body2" color="text.secondary">
                  {(() => {
                    // Exclude expenses row from department count
                    const totalDepartments = visibleClientStats.filter(stat => stat.clientId !== 'expenses').length;
                    const allDepartments = clients.length;
                    return `Showing ${totalDepartments} of ${allDepartments} departments`;
                  })()}
                </Typography>
              </Box>
              <Button
                variant="outlined"
                startIcon={<FileDownload />}
                onClick={() => exportClientBreakdownToExcel()}
                sx={{ ml: 'auto' }}
              >
                Export to Excel
              </Button>
            </Box>
            
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow key="client-breakdown-header">
                    <TableCell>Department</TableCell>
                    <TableCell>Company</TableCell>
                    <TableCell align="right">Total Checks</TableCell>
                    <TableCell align="right">Hourly Amount</TableCell>
                    <TableCell align="right">Per Diem Amount</TableCell>
                    <TableCell align="right">PTO Amount</TableCell>
                    <TableCell align="right">Other Amount</TableCell>
                    <TableCell align="right">Expenses</TableCell>
                    <TableCell align="right">Total Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    logger.log('🔍 DEBUG: Rendering client breakdown TableBody, clients:', clients);
                    return null;
                  })()}
                  {visibleClientStats.map((stat) => {
                    const isExpensesRow = stat.clientId === 'expenses';
                    return (
                      <TableRow 
                        key={stat.clientId} 
                        sx={{ 
                          opacity: stat.isActive ? 1 : 0.7,
                          backgroundColor: isExpensesRow ? '#fafafa' : 'transparent',
                          borderLeft: isExpensesRow ? '4px solid #1976d2' : 'none'
                        }}
                      >
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {!isExpensesRow && (
                              <Box
                                sx={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  backgroundColor: stat.isActive ? '#4caf50' : '#f44336',
                                  flexShrink: 0
                                }}
                              />
                            )}
                            {isExpensesRow && <span style={{ marginRight: 4 }}>→</span>}
                            {stat.clientName}
                            {!stat.isActive && !isExpensesRow && (
                              <Chip 
                                label="Inactive" 
                                size="small" 
                                color="error" 
                                variant="outlined"
                                sx={{ ml: 1 }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>{stat.companyName}</TableCell>
                        <TableCell align="right">{stat.totalChecks}</TableCell>
                        <TableCell align="right">${stat.hourlyAmount.toLocaleString()}</TableCell>
                        <TableCell align="right">${stat.perdiemAmount.toLocaleString()}</TableCell>
                        <TableCell align="right">${stat.ptoAmount.toLocaleString()}</TableCell>
                        <TableCell align="right">${stat.otherPayAmount.toLocaleString()}</TableCell>
                        <TableCell align="right">${stat.expensesAmount.toLocaleString()}</TableCell>
                        <TableCell align="right">${stat.totalAmount.toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })}
                  
                  {/* Total Row - Sum unique checks only once */}
                  <TableRow key="client-breakdown-total" sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
                    <TableCell><strong>TOTAL</strong></TableCell>
                    <TableCell></TableCell>
                    <TableCell align="right">
                      <strong>
                        {filteredChecks.length}
                      </strong>
                    </TableCell>
                    <TableCell align="right">
                      <strong>
                        ${departmentTotals.hourlyAmount.toLocaleString()}
                      </strong>
                    </TableCell>
                    <TableCell align="right">
                      <strong>
                        ${departmentTotals.perdiemAmount.toLocaleString()}
                      </strong>
                    </TableCell>
                    <TableCell align="right">
                      <strong>
                        ${departmentTotals.ptoAmount.toLocaleString()}
                      </strong>
                    </TableCell>
                    <TableCell align="right">
                      <strong>
                        ${departmentTotals.otherPayAmount.toLocaleString()}
                      </strong>
                    </TableCell>
                    <TableCell align="right">
                      <strong>
                        ${departmentTotals.expensesAmount.toLocaleString()}
                      </strong>
                    </TableCell>
                    <TableCell align="right">
                      <strong>
                        ${departmentTotals.totalAmount.toLocaleString()}
                      </strong>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Employee Summary Tab - Fixed React warnings */}
        {selectedTab === 2 && (
          <Box>
            <Typography variant="h6" gutterBottom>
               Employee Summary
            </Typography>
            
            {/* Company Selector and Export Controls */}
            <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <FormControl sx={{ minWidth: 200 }}>
                  <InputLabel>Select Company</InputLabel>
                  <Select
                    value={selectedCompanyForEmployees}
                    onChange={(e) => setSelectedCompanyForEmployees(e.target.value)}
                    label="Select Company"
                  >
                    <MenuItem value="all">All Companies</MenuItem>
                    {companies.map((company) => (
                      <MenuItem key={company.id} value={company.id}>
                        {company.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  placeholder="Search employees..."
                  value={employeeSearchTerm}
                  onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                  sx={{ minWidth: 250 }}
                  size="small"
                  InputProps={{
                    startAdornment: <FilterList sx={{ mr: 1, color: 'text.secondary' }} />
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  {(() => {
                    const filteredEmployees = employees.filter(employee => {
                      if (selectedCompanyForEmployees === 'all') return true;
                      return employee.companyId === selectedCompanyForEmployees;
                    });
                    // Show all employees, even if they have no checks
                    const searchLower = employeeSearchTerm.toLowerCase();
                    const filteredBySearch = filteredEmployees.filter(employee => {
                      if (!searchLower) return true;
                      return (
                        employee.name.toLowerCase().includes(searchLower) ||
                        (employee.address && employee.address.toLowerCase().includes(searchLower)) ||
                        (employee.position && employee.position.toLowerCase().includes(searchLower)) ||
                        (employee.role && employee.role.toLowerCase().includes(searchLower)) ||
                        (companies.find(c => c.id === employee.companyId)?.name || '').toLowerCase().includes(searchLower)
                      );
                    });
                    return `Showing ${filteredBySearch.length} employees`;
                  })()}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                {selectedEmployees.size > 0 && (
                  <Typography variant="body2" color="primary" sx={{ mr: 1 }}>
                    {selectedEmployees.size} selected
                  </Typography>
                )}
                {selectedEmployees.size > 0 && (
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<FileDownload />}
                    onClick={() => exportEmployeeSummaryToExcel('all', Array.from(selectedEmployees))}
                    size="small"
                  >
                    Export Selected ({selectedEmployees.size})
                  </Button>
                )}
                {selectedCompanyForEmployees !== 'all' && (
                  <Button
                    variant="outlined"
                    startIcon={<FileDownload />}
                    onClick={() => exportEmployeeSummaryToExcel(selectedCompanyForEmployees)}
                    size="small"
                  >
                    Export Company
                  </Button>
                )}
                <Button
                  variant="contained"
                  startIcon={<FileDownload />}
                  onClick={() => exportEmployeeSummaryToExcel('all')}
                >
                  Export All
                </Button>
              </Box>
            </Box>
            
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow key="employee-summary-header">
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={selectedEmployees.size > 0 && selectedEmployees.size < (() => {
                          const filteredEmployees = employees.filter(employee => {
                            if (selectedCompanyForEmployees === 'all') return true;
                            return employee.companyId === selectedCompanyForEmployees;
                          });
                          // Count all employees, not just those with checks
                          return filteredEmployees.length;
                        })()}
                        checked={selectedEmployees.size > 0 && selectedEmployees.size === (() => {
                          const filteredEmployees = employees.filter(employee => {
                            if (selectedCompanyForEmployees === 'all') return true;
                            return employee.companyId === selectedCompanyForEmployees;
                          });
                          // Count all employees, not just those with checks
                          return filteredEmployees.length;
                        })()}
                        onChange={toggleSelectAllEmployees}
                      />
                    </TableCell>
                    <TableCell>Employee</TableCell>
                    <TableCell>Address</TableCell>
                    <TableCell>Position</TableCell>
                    <TableCell>Company</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Start Date</TableCell>
                    <TableCell align="right">Total Checks</TableCell>
                    <TableCell align="right">Regular Hrs</TableCell>
                    <TableCell align="right">OT Hrs</TableCell>
                    <TableCell align="right">PTO Hrs</TableCell>
                    <TableCell align="right">Per Diem</TableCell>
                    <TableCell align="right">Other Pay</TableCell>
                    <TableCell align="right">Total Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    // Filter employees based on selected company
                    const filteredEmployees = employees.filter(employee => {
                      if (selectedCompanyForEmployees === 'all') return true;
                      return employee.companyId === selectedCompanyForEmployees;
                    });
                    
                    // Filter by search term
                    const searchLower = employeeSearchTerm.toLowerCase();
                    const filteredBySearch = filteredEmployees.filter(employee => {
                      if (!searchLower) return true;
                      return (
                        employee.name.toLowerCase().includes(searchLower) ||
                        (employee.address && employee.address.toLowerCase().includes(searchLower)) ||
                        (employee.position && employee.position.toLowerCase().includes(searchLower)) ||
                        (employee.role && employee.role.toLowerCase().includes(searchLower)) ||
                        (companies.find(c => c.id === employee.companyId)?.name || '').toLowerCase().includes(searchLower)
                      );
                    });
                    
                    return filteredBySearch
                      .map((employee) => {
                        const employeeChecks = filteredChecks.filter(check => check.employeeId === employee.id);
                        
                        // Show all employees, even if they have no checks (they'll show 0 values)
                        
                        const totalAmount = employeeChecks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
                        const totalChecks = employeeChecks.length;
                        
                        // Calculate hours and pay breakdown
                        let totalRegularHours = 0;
                        let totalOtHours = 0;
                        let totalHolidayHours = 0;
                        let totalPerDiem = 0;
                        let totalOtherPay = 0;
                        
                        employeeChecks.forEach(check => {
                          // Handle relationship-specific data
                          if (check.relationshipDetails && check.relationshipDetails.length > 0) {
                            check.relationshipDetails.forEach(rel => {
                              totalRegularHours += rel.hours || 0;
                              totalOtHours += rel.otHours || 0;
                              totalHolidayHours += rel.holidayHours || 0;
                              totalPerDiem += rel.perdiemAmount || 0;
                              if (rel.otherPay) {
                                rel.otherPay.forEach(op => {
                                  totalOtherPay += parseFloat(op.amount || '0');
                                });
                              }
                            });
                          } else {
                            // Fallback to check-level data
                            totalRegularHours += check.hours || 0;
                            totalOtHours += (check.otHours || check.overtimeHours || 0);
                            totalHolidayHours += check.holidayHours || 0;
                            totalPerDiem += check.perdiemAmount || 0;
                            if (check.otherPay) {
                              check.otherPay.forEach(op => {
                                totalOtherPay += parseFloat(op.amount || '0');
                              });
                            }
                          }
                        });
                        
                        const company = companies.find(c => c.id === employee.companyId);
                        
                        return {
                          employee,
                          address: employee.address || 'N/A',
                          position: employee.position || 'N/A',
                          company: company?.name || 'Unknown',
                          role: employee.role || employee.position || employee.payType || 'N/A',
                          startDate: employee.startDate ? new Date(employee.startDate + 'T00:00:00').toLocaleDateString() : 'N/A',
                          totalAmount,
                          totalChecks,
                          totalRegularHours,
                          totalOtHours,
                          totalHolidayHours,
                          totalPerDiem,
                          totalOtherPay
                        };
                      })
                      .filter(Boolean)
                      .sort((a, b) => {
                        // Sort by employee name when showing single company, by company then name when showing all
                        if (selectedCompanyForEmployees === 'all') {
                          if (a!.company !== b!.company) {
                            return a!.company.localeCompare(b!.company);
                          }
                        }
                        return a!.employee.name.localeCompare(b!.employee.name);
                      })
                      .map((item) => (
                        <TableRow 
                          key={item!.employee.id}
                          hover
                          sx={{ 
                            cursor: 'pointer',
                            backgroundColor: selectedEmployees.has(item!.employee.id) ? '#e3f2fd' : 'inherit'
                          }}
                          onClick={() => toggleEmployeeSelection(item!.employee.id)}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={selectedEmployees.has(item!.employee.id)}
                              onChange={() => toggleEmployeeSelection(item!.employee.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </TableCell>
                          <TableCell>{item!.employee.name}</TableCell>
                          <TableCell>{item!.address}</TableCell>
                          <TableCell>{item!.position}</TableCell>
                          <TableCell>{item!.company}</TableCell>
                          <TableCell>{item!.role}</TableCell>
                          <TableCell>{item!.startDate}</TableCell>
                          <TableCell align="right">{item!.totalChecks}</TableCell>
                          <TableCell align="right">{item!.totalRegularHours.toFixed(2)}</TableCell>
                          <TableCell align="right">{item!.totalOtHours.toFixed(2)}</TableCell>
                          <TableCell align="right">{item!.totalHolidayHours.toFixed(2)}</TableCell>
                          <TableCell align="right">${item!.totalPerDiem.toFixed(2)}</TableCell>
                          <TableCell align="right">${item!.totalOtherPay.toFixed(2)}</TableCell>
                          <TableCell align="right">${item!.totalAmount.toLocaleString()}</TableCell>
                        </TableRow>
                      ));
                  })()}
                  {/* Total Row */}
                  {(() => {
                    const filteredEmployees = employees.filter(employee => {
                      if (selectedCompanyForEmployees === 'all') return true;
                      return employee.companyId === selectedCompanyForEmployees;
                    });
                    
                    const searchLower = employeeSearchTerm.toLowerCase();
                    const filteredBySearch = filteredEmployees.filter(employee => {
                      if (!searchLower) return true;
                      return (
                        employee.name.toLowerCase().includes(searchLower) ||
                        (employee.address && employee.address.toLowerCase().includes(searchLower)) ||
                        (employee.position && employee.position.toLowerCase().includes(searchLower)) ||
                        (employee.role && employee.role.toLowerCase().includes(searchLower)) ||
                        (companies.find(c => c.id === employee.companyId)?.name || '').toLowerCase().includes(searchLower)
                      );
                    });
                    
                    const employeesWithData = filteredBySearch
                      .map((employee) => {
                        const employeeChecks = filteredChecks.filter(check => check.employeeId === employee.id);
                        // Show all employees, even if they have no checks (they'll show 0 values)
                        
                        let totalRegularHours = 0;
                        let totalOtHours = 0;
                        let totalHolidayHours = 0;
                        let totalPerDiem = 0;
                        let totalOtherPay = 0;
                        const totalAmount = employeeChecks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
                        const totalChecks = employeeChecks.length;
                        
                        employeeChecks.forEach(check => {
                          if (check.relationshipDetails && check.relationshipDetails.length > 0) {
                            check.relationshipDetails.forEach(rel => {
                              totalRegularHours += rel.hours || 0;
                              totalOtHours += rel.otHours || 0;
                              totalHolidayHours += rel.holidayHours || 0;
                              totalPerDiem += rel.perdiemAmount || 0;
                              if (rel.otherPay) {
                                rel.otherPay.forEach(op => {
                                  totalOtherPay += parseFloat(op.amount || '0');
                                });
                              }
                            });
                          } else {
                            totalRegularHours += check.hours || 0;
                            totalOtHours += (check.otHours || check.overtimeHours || 0);
                            totalHolidayHours += check.holidayHours || 0;
                            totalPerDiem += check.perdiemAmount || 0;
                            if (check.otherPay) {
                              check.otherPay.forEach(op => {
                                totalOtherPay += parseFloat(op.amount || '0');
                              });
                            }
                          }
                        });
                        
                        return {
                          totalChecks,
                          totalAmount,
                          totalRegularHours,
                          totalOtHours,
                          totalHolidayHours,
                          totalPerDiem,
                          totalOtherPay
                        };
                      })
                      .filter(Boolean);
                    
                    const grandTotals = employeesWithData.reduce<{
                      totalChecks: number;
                      totalAmount: number;
                      totalRegularHours: number;
                      totalOtHours: number;
                      totalHolidayHours: number;
                      totalPerDiem: number;
                      totalOtherPay: number;
                    }>((acc, item) => {
                      if (!item) return acc;
                      return {
                        totalChecks: acc.totalChecks + item.totalChecks,
                        totalAmount: acc.totalAmount + item.totalAmount,
                        totalRegularHours: acc.totalRegularHours + item.totalRegularHours,
                        totalOtHours: acc.totalOtHours + item.totalOtHours,
                        totalHolidayHours: acc.totalHolidayHours + item.totalHolidayHours,
                        totalPerDiem: acc.totalPerDiem + item.totalPerDiem,
                        totalOtherPay: acc.totalOtherPay + item.totalOtherPay
                      };
                    }, {
                      totalChecks: 0,
                      totalAmount: 0,
                      totalRegularHours: 0,
                      totalOtHours: 0,
                      totalHolidayHours: 0,
                      totalPerDiem: 0,
                      totalOtherPay: 0
                    });
                    
                    return (
                      <TableRow sx={{ backgroundColor: '#e3f2fd', fontWeight: 'bold' }}>
                        <TableCell padding="checkbox"></TableCell>
                        <TableCell colSpan={6}><strong>TOTAL</strong></TableCell>
                        <TableCell align="right"><strong>{grandTotals.totalChecks}</strong></TableCell>
                        <TableCell align="right"><strong>{grandTotals.totalRegularHours.toFixed(2)}</strong></TableCell>
                        <TableCell align="right"><strong>{grandTotals.totalOtHours.toFixed(2)}</strong></TableCell>
                        <TableCell align="right"><strong>{grandTotals.totalHolidayHours.toFixed(2)}</strong></TableCell>
                        <TableCell align="right"><strong>${grandTotals.totalPerDiem.toFixed(2)}</strong></TableCell>
                        <TableCell align="right"><strong>${grandTotals.totalOtherPay.toFixed(2)}</strong></TableCell>
                        <TableCell align="right"><strong>${grandTotals.totalAmount.toLocaleString()}</strong></TableCell>
                      </TableRow>
                    );
                  })()}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Employee Information Report Tab */}
        {selectedTab === 3 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Employee Information Report
            </Typography>

            <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <FormControl sx={{ minWidth: 200 }}>
                  <InputLabel>Select Company</InputLabel>
                  <Select
                    value={selectedCompanyForEmployeeInfo}
                    onChange={(e) => setSelectedCompanyForEmployeeInfo(e.target.value)}
                    label="Select Company"
                  >
                    <MenuItem value="all">All Companies</MenuItem>
                    {companies.map((company) => (
                      <MenuItem key={company.id} value={company.id}>
                        {company.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={includeInactiveEmployees}
                      onChange={(e) => setIncludeInactiveEmployees(e.target.checked)}
                    />
                  }
                  label="Include Inactive Employees"
                />
                <Typography variant="body2" color="text.secondary">
                  {(() => {
                    const filteredEmployees = employees
                      .filter(employee => selectedCompanyForEmployeeInfo === 'all' || employee.companyId === selectedCompanyForEmployeeInfo)
                      .filter(employee => includeInactiveEmployees || employee.active);

                    return `Showing ${filteredEmployees.length} employees`;
                  })()}
                </Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={<FileDownload />}
                onClick={exportEmployeeInfoReport}
                disabled={exporting}
              >
                {exporting ? 'Exporting...' : 'Export Employee Info'}
              </Button>
            </Box>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Employee</TableCell>
                    <TableCell>Company</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Total Relationships</TableCell>
                    <TableCell>Clients</TableCell>
                    <TableCell>Pay Types / Details</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    const filteredEmployees = employees
                      .filter(employee => selectedCompanyForEmployeeInfo === 'all' || employee.companyId === selectedCompanyForEmployeeInfo)
                      .filter(employee => includeInactiveEmployees || employee.active);

                    if (filteredEmployees.length === 0) {
                      return (
                        <TableRow key="employee-info-empty">
                          <TableCell colSpan={7} align="center">
                            No employees found for the selected filters.
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const sortedEmployees = [...filteredEmployees].sort((a, b) => {
                      const companyA = companies.find(c => c.id === a.companyId)?.name || '';
                      const companyB = companies.find(c => c.id === b.companyId)?.name || '';
                      if (companyA !== companyB) {
                        return companyA.localeCompare(companyB);
                      }
                      return a.name.localeCompare(b.name);
                    });

                    const groupedByCompany = sortedEmployees.reduce<Record<string, typeof sortedEmployees>>((acc, employee) => {
                      const companyName = companies.find(c => c.id === employee.companyId)?.name || 'Unknown Company';
                      if (!acc[companyName]) {
                        acc[companyName] = [];
                      }
                      acc[companyName].push(employee);
                      return acc;
                    }, {});

                    return Object.entries(groupedByCompany).map(([companyName, group]) => (
                      <React.Fragment key={`company-group-${companyName}`}>
                        <TableRow sx={{ backgroundColor: '#e8f4fd' }}>
                          <TableCell colSpan={7} sx={{ fontWeight: 'bold' }}>
                            {companyName}
                          </TableCell>
                        </TableRow>
                        {group.map(employee => {
                          const relationships = (employee.clientPayTypeRelationships || []).map(rel => {
                            const clientName = clients.find(c => c.id === rel.clientId)?.name || rel.clientName || 'Unknown Client';
                            const payRate = rel.payRate ? `$${rel.payRate}` : '';
                            return `${clientName} – ${rel.payType}${payRate ? ` (${payRate})` : ''}`;
                          });
                          const uniqueClients = new Set(
                            (employee.clientPayTypeRelationships || []).map(
                              rel => clients.find(c => c.id === rel.clientId)?.name || rel.clientName || 'Unknown Client'
                            )
                          );

                          return (
                            <TableRow key={employee.id}>
                              <TableCell>{employee.name}</TableCell>
                              <TableCell>{companyName}</TableCell>
                              <TableCell>{employee.role || employee.position || employee.payType || 'N/A'}</TableCell>
                              <TableCell>
                                <Chip
                                  label={employee.active ? 'Active' : 'Inactive'}
                                  size="small"
                                  color={employee.active ? 'success' : 'default'}
                                  variant={employee.active ? 'filled' : 'outlined'}
                                />
                              </TableCell>
                              <TableCell align="right">{employee.clientPayTypeRelationships?.length || 0}</TableCell>
                              <TableCell>{Array.from(uniqueClients).join(', ') || 'N/A'}</TableCell>
                              <TableCell>{relationships.join('; ') || (employee.payType || 'N/A')}</TableCell>
                            </TableRow>
                          );
                        })}
                      </React.Fragment>
                    ));
                  })()}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Expenses Tab */}
        {selectedTab === 4 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Expenses Report{filters.companyId ? ` For ${companies.find(c => c.id === filters.companyId)?.name || 'Company'}` : ''}
            </Typography>
            
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                Showing all expense checks from the selected filters
              </Typography>
              <Button
                variant="contained"
                startIcon={exporting ? <CircularProgress size={20} /> : <FileDownload />}
                onClick={exportExpensesToExcel}
                disabled={exporting}
              >
                {exporting ? 'Exporting...' : 'Export Expenses to Excel'}
              </Button>
            </Box>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                    <TableCell><strong>Check Number</strong></TableCell>
                    <TableCell><strong>Company</strong></TableCell>
                    <TableCell><strong>Expense Name</strong></TableCell>
                    <TableCell><strong>Description</strong></TableCell>
                    <TableCell><strong>Date</strong></TableCell>
                    <TableCell align="right"><strong>Amount</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    const expenseChecks = filteredChecks.filter(check => check.isExpense || check.payType === 'expense');
                    
                    if (expenseChecks.length === 0) {
                      return (
                        <TableRow>
                          <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                            <Typography variant="body2" color="text.secondary">
                              No expenses found for the selected filters.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    return expenseChecks.map((check) => {
                      const company = companies.find(c => c.id === check.companyId);
                      const checkDate = check.date?.toDate ? check.date.toDate() : new Date(check.date);
                      
                      return (
                        <TableRow key={check.id}>
                          <TableCell>{check.checkNumber || check.id}</TableCell>
                          <TableCell>{company?.name || 'Unknown Company'}</TableCell>
                          <TableCell>{check.expenseName || 'N/A'}</TableCell>
                          <TableCell>{check.expenseDescription || check.memo || 'N/A'}</TableCell>
                          <TableCell>{checkDate.toLocaleDateString()}</TableCell>
                          <TableCell align="right">${parseFloat(check.amount?.toString() || '0').toLocaleString()}</TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              {check.paid && <Chip label="Paid" color="success" size="small" />}
                              {check.reviewed && <Chip label="Reviewed" color="primary" size="small" />}
                              {!check.paid && <Chip label="Unpaid" color="warning" size="small" />}
                              {!check.reviewed && <Chip label="Unreviewed" color="error" size="small" />}
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                  
                  {/* Total Row */}
                  {(() => {
                    const expenseChecks = filteredChecks.filter(check => check.isExpense || check.payType === 'expense');
                    const totalExpenses = expenseChecks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
                    
                    if (expenseChecks.length === 0) return null;
                    
                    return (
                      <TableRow sx={{ backgroundColor: '#e3f2fd', fontWeight: 'bold' }}>
                        <TableCell colSpan={5}><strong>TOTAL</strong></TableCell>
                        <TableCell align="right">
                          <strong>${totalExpenses.toLocaleString()}</strong>
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    );
                  })()}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Paper>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Division Checks Dialog */}
      <Dialog 
        open={divisionChecksDialog.open} 
        onClose={handleCloseDivisionDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              {divisionChecksDialog.divisionName} - {divisionChecksDialog.clientName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {divisionChecksDialog.checks.length} checks
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {/* Division Summary */}
          <Box sx={{ mb: 3, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
            <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
              Division Summary
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
              <Box>
                <Typography variant="body2" color="text.secondary">Total Checks</Typography>
                <Typography variant="h6">{divisionChecksDialog.checks.length}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Total Amount</Typography>
                <Typography variant="h6">
                  ${divisionChecksDialog.checks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0).toLocaleString()}
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Paid Checks</Typography>
                <Typography variant="h6" color="success.main">
                  {divisionChecksDialog.checks.filter(check => check.paid).length}
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Unpaid Checks</Typography>
                <Typography variant="h6" color="warning.main">
                  {divisionChecksDialog.checks.filter(check => !check.paid).length}
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Reviewed Checks</Typography>
                <Typography variant="h6" color="primary.main">
                  {divisionChecksDialog.checks.filter(check => check.reviewed).length}
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Unreviewed Checks</Typography>
                <Typography variant="h6" color="error.main">
                  {divisionChecksDialog.checks.filter(check => !check.reviewed).length}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Typography variant="h6" sx={{ mb: 2 }}>
            Individual Checks
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Check #</strong></TableCell>
                  <TableCell><strong>Date</strong></TableCell>
                  <TableCell><strong>Employee</strong></TableCell>
                  <TableCell align="right"><strong>Amount</strong></TableCell>
                  <TableCell align="right"><strong>Hours</strong></TableCell>
                  <TableCell align="right"><strong>OT Hours</strong></TableCell>
                  <TableCell align="right"><strong>PTO Hours</strong></TableCell>
                  <TableCell align="right"><strong>Pay Rate</strong></TableCell>
                  <TableCell align="right"><strong>Per Diem</strong></TableCell>
                  <TableCell><strong>Pay Type</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {divisionChecksDialog.checks.map((check) => {
                  const employee = employees.find(emp => emp.id === check.employeeId);
                  const checkDate = check.date?.toDate ? check.date.toDate() : new Date(check.date);
                  
                  // Get relationship-specific data if available
                  let relationshipHours = check.hours || 0;
                  let relationshipOtHours = check.otHours || 0;
                  let relationshipHolidayHours = check.holidayHours || 0;
                  let relationshipPayRate = check.payRate || 0;
                  let relationshipPerdiem = check.perdiemAmount || 0;
                  
                  if (check.relationshipDetails && check.relationshipDetails.length > 0) {
                    const relationship = check.relationshipDetails.find(rel => 
                      rel.clientName === divisionChecksDialog.clientName
                    ) || check.relationshipDetails[0];
                    
                    relationshipHours = relationship.hours || check.hours || 0;
                    relationshipOtHours = relationship.otHours || check.otHours || 0;
                    relationshipHolidayHours = relationship.holidayHours || check.holidayHours || 0;
                    relationshipPayRate = relationship.payRate || check.payRate || 0;
                    relationshipPerdiem = relationship.perdiemAmount || check.perdiemAmount || 0;
                  }
                  
                  return (
                    <TableRow key={check.id}>
                      <TableCell>{check.checkNumber || 'N/A'}</TableCell>
                      <TableCell>{checkDate.toLocaleDateString()}</TableCell>
                      <TableCell>{employee?.name || 'Unknown'}</TableCell>
                      <TableCell align="right">${parseFloat(check.amount?.toString() || '0').toLocaleString()}</TableCell>
                      <TableCell align="right">{relationshipHours}</TableCell>
                      <TableCell align="right">{relationshipOtHours}</TableCell>
                      <TableCell align="right">{relationshipHolidayHours}</TableCell>
                      <TableCell align="right">${relationshipPayRate}</TableCell>
                      <TableCell align="right">${relationshipPerdiem.toLocaleString()}</TableCell>
                      <TableCell>{check.payType}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          {check.paid && <Chip label="Paid" color="success" size="small" />}
                          {check.reviewed && <Chip label="Reviewed" color="primary" size="small" />}
                          {!check.paid && <Chip label="Unpaid" color="warning" size="small" />}
                          {!check.reviewed && <Chip label="Unreviewed" color="error" size="small" />}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={exportDivisionToExcel}
            variant="contained"
            startIcon={<Download />}
            color="primary"
          >
            Export to Excel
          </Button>
          <Button onClick={handleCloseDivisionDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Report; 