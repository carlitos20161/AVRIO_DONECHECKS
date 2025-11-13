import React, { useState, useEffect } from 'react';
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
import { Download, FilterList, Refresh, ExpandMore, Business, AttachMoney, People, Launch, FileDownload, AssignmentInd } from '@mui/icons-material';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import ExcelJS from 'exceljs';

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
  checks: Check[];
}

interface ClientBreakdown {
  clientId: string;
  clientName: string;
  totalChecks: number;
  totalAmount: number;
  hourlyAmount: number;
  perdiemAmount: number;
  divisionBreakdown: DivisionBreakdown[];
  checks: Check[];
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
    
    const employeesWithChecks = filteredEmployees.filter(employee => 
      filteredChecks.some(check => check.employeeId === employee.id)
    );
    
    if (selectedEmployees.size === employeesWithChecks.length) {
      // All selected, deselect all
      setSelectedEmployees(new Set());
    } else {
      // Select all
      setSelectedEmployees(new Set(employeesWithChecks.map(emp => emp.id)));
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

  // Helper function to apply professional styling to ExcelJS worksheet
  const applyProfessionalStyling = (worksheet: ExcelJS.Worksheet, hasTotal: boolean = false) => {
    // Style header row
    worksheet.getRow(1).height = 29;
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FF000000' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFADD8E6' } // Light blue
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    // Style data rows
    const rowCount = worksheet.rowCount;
    for (let rowNum = 2; rowNum <= rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);
      row.height = 20;
      
      // Check if this is the total row (last row if hasTotal is true)
      const isTotalRow = hasTotal && rowNum === rowCount;
      const isEvenRow = rowNum % 2 === 0;
      
      row.eachCell((cell, colNumber) => {
        // Background color
        if (isTotalRow) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFCC99' } // Light orange for total row
          };
          cell.font = { bold: true, color: { argb: 'FF000000' } };
        } else {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: isEvenRow ? 'FFFFFFFF' : 'FFD3D3D3' }
          };
          cell.font = { color: { argb: 'FF000000' } };
        }
        
        // Alignment: numbers right-aligned, text left-aligned
        const cellValue = cell.value;
        const isNumber = typeof cellValue === 'number';
        cell.alignment = { 
          horizontal: isNumber ? 'right' : 'left',
          vertical: 'middle'
        };
        
        // Borders
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF808080' } },
          left: { style: 'thin', color: { argb: 'FF808080' } },
          bottom: { style: 'thin', color: { argb: 'FF808080' } },
          right: { style: 'thin', color: { argb: 'FF808080' } }
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
        { header: 'Holiday Hours', key: 'holidayHours', width: 13 },
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
          fgColor: { argb: 'FFADD8E6' } // Light blue
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
        
        // Apply alternating row colors and styling
        const isEvenRow = (index + 2) % 2 === 0; // +2 because header is row 1, data starts at row 2
        
        row.eachCell((cell, colNumber) => {
          // Background color: white for even rows, light gray for odd rows
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: isEvenRow ? 'FFFFFFFF' : 'FFD3D3D3' }
          };
          
          // Text color
          cell.font = { color: { argb: 'FF000000' } };
          
          // Alignment: left for text, right for numbers/dates
          // Number columns: Check Number(1), Hours Worked(8), Pay Rate(9), Overtime Hours(10), Overtime Rate(11), 
          // Holiday Hours(12), Holiday Rate(13), Per Diem Amount(14), Hourly Total(16), Total Amount(17)
          const numberColumns = [1, 8, 9, 10, 11, 12, 13, 14, 16, 17];
          const isNumberColumn = numberColumns.includes(colNumber);
          cell.alignment = { 
            horizontal: isNumberColumn ? 'right' : 'left',
            vertical: 'middle'
          };
          
          // Borders
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF808080' } },
            left: { style: 'thin', color: { argb: 'FF808080' } },
            bottom: { style: 'thin', color: { argb: 'FF808080' } },
            right: { style: 'thin', color: { argb: 'FF808080' } }
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
          fgColor: { argb: 'FFADD8E6' }
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
          fgColor: { argb: 'FFFFFFFF' }
        };
        cell.font = { color: { argb: 'FF000000' } };
        const isNumberColumn = colNumber >= 3; // Total Checks, Total Amount, etc.
        cell.alignment = { 
          horizontal: isNumberColumn ? 'right' : 'left',
          vertical: 'middle'
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF808080' } },
          left: { style: 'thin', color: { argb: 'FF808080' } },
          bottom: { style: 'thin', color: { argb: 'FF808080' } },
          right: { style: 'thin', color: { argb: 'FF808080' } }
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
        console.log('🔒 [Report Security] Filtered clients by visibleClientIds:', {
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
      console.log('🔒 [Report Security] Filtered checks by visibleClientIds:', {
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

    console.log('🔍 [Report] ========== STARTING REPORT GENERATION ==========');
    console.log('🔍 [Report] Total filtered checks:', filteredChecks.length);
    console.log('🔍 [Report] Available companies:', companies.map(c => ({ id: c.id, name: c.name })));
    console.log('🔍 [Report] Available clients:', clients.map(c => ({ id: c.id, name: c.name, division: c.division })));
    
    // Log sample check data
    if (filteredChecks.length > 0) {
      console.log('🔍 [Report] Sample check data:', {
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
      
      console.log(`🔍 [Report] ========== PROCESSING COMPANY: ${company.name} ==========`);
      console.log(`🔍 [Report] Company ID: ${company.id}`);
      console.log(`🔍 [Report] Company checks count: ${companyChecks.length}`);
      
      // Log all checks for this company
      companyChecks.forEach((check, index) => {
        console.log(`🔍 [Report] Company ${company.name} - Check ${index + 1}:`, {
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
        console.log(`🔍 [Report] No checks found for company ${company.name}, skipping...`);
        return;
      }

      const totalAmount = companyChecks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
      
      // Group by division across all clients in the company
      const divisionMap = new Map<string, { divisionName: string; checks: Check[]; clients: Set<string> }>();
      
      console.log(`🔍 [Report] ========== STARTING DIVISION GROUPING FOR ${company.name} ==========`);
      
      companyChecks.forEach((check, checkIndex) => {
        console.log(`🔍 [Report] ========== PROCESSING CHECK ${checkIndex + 1}/${companyChecks.length} ==========`);
        console.log(`🔍 [Report] Check ID: ${check.id}`);
        console.log(`🔍 [Report] Check Number: ${check.checkNumber}`);
        console.log(`🔍 [Report] Employee: ${check.employeeId || 'Unknown Employee'}`);
        console.log(`🔍 [Report] Amount: ${check.amount}`);
        console.log(`🔍 [Report] Has relationshipDetails: ${!!check.relationshipDetails}`);
        console.log(`🔍 [Report] RelationshipDetails count: ${check.relationshipDetails?.length || 0}`);
        // For each check, group by division name regardless of client
        if (check.relationshipDetails && check.relationshipDetails.length > 0) {
          console.log(`🔍 [Report] Processing ${check.relationshipDetails?.length || 0} relationships for check ${check.id}`);
          
          // Process each relationship and group by division
          check.relationshipDetails.forEach((rel, relIndex) => {
            console.log(`🔍 [Report] ========== RELATIONSHIP ${relIndex + 1}/${check.relationshipDetails?.length || 0} ==========`);
            console.log(`🔍 [Report] Relationship ID: ${rel.id}`);
            console.log(`🔍 [Report] Client ID: ${rel.clientId}`);
            console.log(`🔍 [Report] Client Name: ${rel.clientName}`);
            console.log(`🔍 [Report] Pay Type: ${rel.payType}`);
            console.log(`🔍 [Report] Division: ${rel.division || 'NO DIVISION'}`);
            console.log(`🔍 [Report] Pay Rate: ${rel.payRate || 'NO PAY RATE'}`);
            console.log(`🔍 [Report] Hours: ${rel.hours || 'NO HOURS'}`);
            console.log(`🔍 [Report] OT Hours: ${rel.otHours || 'NO OT HOURS'}`);
            console.log(`🔍 [Report] Holiday Hours: ${rel.holidayHours || 'NO HOLIDAY HOURS'}`);
            console.log(`🔍 [Report] Other Pay: ${rel.otherPay ? JSON.stringify(rel.otherPay) : 'NO OTHER PAY'}`);
            console.log(`🔍 [Report] Per Diem Amount: ${rel.perdiemAmount || 'NO PER DIEM AMOUNT'}`);
            
            let divisionName = 'No Division';
            
            // Check if this is a mixed check (Container + Projects)
            const hasContainer = check.relationshipDetails?.some(r => r.clientName === 'Container');
            const hasProjects = check.relationshipDetails?.some(r => r.clientName === 'Projects');
            
            console.log(`🔍 [Report] Mixed check analysis:`, {
              hasContainer,
              hasProjects,
              isMixed: hasContainer && hasProjects
            });
            
            if (hasContainer && hasProjects) {
              // Mixed check - prioritize Container (as per user requirement)
              divisionName = 'Container';
              console.log(`🔍 [Report] Mixed check detected - assigning to Container division`);
            } else if (rel.division) {
              // Use relationship division
              divisionName = rel.division;
              console.log(`🔍 [Report] Using relationship division: ${divisionName}`);
            } else {
              // Fallback to client's division
              const client = clients.find(c => c.id === rel.clientId);
              divisionName = client?.division || 'No Division';
              console.log(`🔍 [Report] Fallback to client division:`, {
                clientFound: !!client,
                clientName: client?.name,
                clientDivision: client?.division,
                finalDivision: divisionName
              });
            }
            
            console.log(`🔍 [Report] FINAL DIVISION ASSIGNMENT:`, {
              clientName: rel.clientName,
              divisionName,
              payType: rel.payType,
              checkId: check.id
            });
            
            if (!divisionMap.has(divisionName)) {
              console.log(`🔍 [Report] Creating new division map entry for: ${divisionName}`);
              divisionMap.set(divisionName, { divisionName, checks: [], clients: new Set() });
            } else {
              console.log(`🔍 [Report] Adding to existing division map entry for: ${divisionName}`);
            }
            
            const divisionEntry = divisionMap.get(divisionName)!;
            divisionEntry.checks.push(check);
            divisionEntry.clients.add(rel.clientName);
            
            console.log(`🔍 [Report] Division map updated for ${divisionName}:`, {
              checkCount: divisionEntry.checks.length,
              clients: Array.from(divisionEntry.clients)
            });
          });
        } else {
          // Single client check - group by client's division
          const client = clients.find(c => c.id === check.clientId);
          const clientName = client?.name || 'Unknown Client';
          const divisionName = client?.division || 'No Division';
          
          console.log(`🔍 [Report] Single client check processing:`, {
            checkId: check.id,
            clientId: check.clientId,
            clientName,
            divisionName,
            clientFound: !!client
          });
          
          if (!divisionMap.has(divisionName)) {
            console.log(`🔍 [Report] Creating new division map entry for single client: ${divisionName}`);
            divisionMap.set(divisionName, { divisionName, checks: [], clients: new Set() });
          }
          
          const divisionEntry = divisionMap.get(divisionName)!;
          divisionEntry.checks.push(check);
          divisionEntry.clients.add(clientName);
          
          console.log(`🔍 [Report] Single client division map updated for ${divisionName}:`, {
            checkCount: divisionEntry.checks.length,
            clients: Array.from(divisionEntry.clients)
          });
        }
      });
      
      console.log(`🔍 [Report] ========== FINAL DIVISION MAP FOR ${company.name} ==========`);
      divisionMap.forEach((entry, divisionName) => {
        console.log(`🔍 [Report] Division: ${divisionName}`, {
          checkCount: entry.checks.length,
          clients: Array.from(entry.clients),
          totalAmount: entry.checks.reduce((sum, c) => sum + (c.amount || 0), 0)
        });
      });

      // Create division breakdown directly from the division map
      console.log(`🔍 [Report] ========== STARTING DIVISION BREAKDOWN CALCULATION ==========`);
      
      const divisionBreakdown: DivisionBreakdown[] = Array.from(divisionMap.values()).map(({ divisionName, checks, clients }, divIndex) => {
        console.log(`🔍 [Report] ========== CALCULATING DIVISION ${divIndex + 1}/${divisionMap.size}: ${divisionName} ==========`);
        
        const totalChecks = checks.length;
        const totalAmount = checks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
        
        // Calculate hourly vs per diem amounts for this division (across all employees)
        let hourlyAmount = 0;
        let perdiemAmount = 0;
        
        console.log(`🔍 [Report] Division: ${divisionName}`);
        console.log(`🔍 [Report] Division checks count: ${checks.length}`);
        console.log(`🔍 [Report] Division clients:`, Array.from(clients));
        console.log(`🔍 [Report] Division total amount: ${totalAmount}`);
        
        checks.forEach((check, checkIndex) => {
          console.log(`🔍 [Report] ========== PROCESSING CHECK ${checkIndex + 1}/${checks.length} FOR DIVISION ${divisionName} ==========`);
          console.log(`🔍 [Report] Check ID: ${check.id}`);
          console.log(`🔍 [Report] Check Amount: ${check.amount}`);
          console.log(`🔍 [Report] Employee: ${check.employeeId || 'Unknown Employee'}`);
          
          // Calculate amounts using relationship-specific data first
          if (check.relationshipDetails && check.relationshipDetails.length > 0) {
            console.log(`🔍 [Report] Processing check ${check.id} with ${check.relationshipDetails?.length || 0} relationships`);
            check.relationshipDetails.forEach((rel, relIndex) => {
              console.log(`🔍 [Report] ========== RELATIONSHIP ${relIndex + 1}/${check.relationshipDetails?.length || 0} FOR CHECK ${check.id} ==========`);
              console.log(`🔍 [Report] Relationship details:`, {
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
                console.log(`🔍 [Report] Processing HOURLY relationship for ${rel.clientName}`);
                
                // Calculate relationship-specific hourly amounts
                // Fallback to top-level check fields if relationshipDetails doesn't have hours
                const relHours = rel.hours || check.hours || 0;
                const relOtHours = rel.otHours || check.otHours || 0;
                const relHolidayHours = rel.holidayHours || check.holidayHours || 0;
                const relPayRate = rel.payRate || 0;
                
                console.log(`🔍 [Report] Hourly values:`, {
                  relHours,
                  relOtHours,
                  relHolidayHours,
                  relPayRate
                });
                
                const regularPay = relHours * relPayRate;
                const otPay = relOtHours * relPayRate * 1.5; // 1.5x for OT
                const holidayPay = relHolidayHours * relPayRate * 2.0; // 2x for holiday
                
                const totalHourlyPay = regularPay + otPay + holidayPay;
                
                console.log(`🔍 [Report] Hourly calculation for ${rel.clientName} in division ${divisionName}:`, {
                  regularPay: `${relHours} × ${relPayRate} = ${regularPay}`,
                  otPay: `${relOtHours} × ${relPayRate * 1.5} = ${otPay}`,
                  holidayPay: `${relHolidayHours} × ${relPayRate * 2} = ${holidayPay}`,
                  totalHourlyPay
                });
                
                console.log(`🔍 [Report] BEFORE adding hourly amount: ${hourlyAmount}`);
                hourlyAmount += totalHourlyPay;
                console.log(`🔍 [Report] AFTER adding hourly amount: ${hourlyAmount}`);
                
                // Add relationship-specific other pay to hourly amount
                if (rel.otherPay && rel.otherPay.length > 0) {
                  console.log(`🔍 [Report] Processing OTHER PAY for ${rel.clientName}:`, rel.otherPay);
                  const otherPayTotal = rel.otherPay.reduce((sum, item) => 
                    sum + parseFloat(item.amount || '0'), 0);
                  console.log(`🔍 [Report] Other pay total for ${rel.clientName} in division ${divisionName}:`, {
                    otherPayItems: rel.otherPay,
                    otherPayTotal
                  });
                  console.log(`🔍 [Report] BEFORE adding other pay: ${hourlyAmount}`);
                  hourlyAmount += otherPayTotal;
                  console.log(`🔍 [Report] AFTER adding other pay: ${hourlyAmount}`);
                } else {
                  console.log(`🔍 [Report] No other pay for ${rel.clientName}`);
                }
              } else if (rel.payType === 'perdiem') {
                console.log(`🔍 [Report] Processing PER DIEM relationship for ${rel.clientName}`);
                
                // Calculate relationship-specific per diem amounts
                // Fallback to top-level check fields if relationshipDetails doesn't have per diem data
                let relPerdiemTotal = 0;
                
                const hasBreakdown = rel.perdiemBreakdown !== undefined ? rel.perdiemBreakdown : check.perdiemBreakdown;
                if (hasBreakdown) {
                  console.log(`🔍 [Report] Processing per diem breakdown for ${rel.clientName}`);
                  // Sum daily breakdown - use rel values or fallback to check values
                  relPerdiemTotal = (rel.perdiemMonday || check.perdiemMonday || 0) + 
                                   (rel.perdiemTuesday || check.perdiemTuesday || 0) + 
                                   (rel.perdiemWednesday || check.perdiemWednesday || 0) + 
                                   (rel.perdiemThursday || check.perdiemThursday || 0) + 
                                   (rel.perdiemFriday || check.perdiemFriday || 0) + 
                                   (rel.perdiemSaturday || check.perdiemSaturday || 0) + 
                                   (rel.perdiemSunday || check.perdiemSunday || 0);
                  console.log(`🔍 [Report] Daily breakdown total: ${relPerdiemTotal}`);
                } else {
                  relPerdiemTotal = rel.perdiemAmount || check.perdiemAmount || 0;
                  console.log(`🔍 [Report] Using per diem amount directly: ${relPerdiemTotal}`);
                }
                
                console.log(`🔍 [Report] Per diem calculation for ${rel.clientName} in division ${divisionName}:`, {
                  perdiemAmount: rel.perdiemAmount,
                  perdiemBreakdown: rel.perdiemBreakdown,
                  relPerdiemTotal
                });
                
                console.log(`🔍 [Report] BEFORE adding per diem amount: ${perdiemAmount}`);
                perdiemAmount += relPerdiemTotal;
                console.log(`🔍 [Report] AFTER adding per diem amount: ${perdiemAmount}`);
              } else {
                console.log(`🔍 [Report] Unknown pay type for ${rel.clientName}: ${rel.payType}`);
              }
            });
          } else {
            // Fallback to check-wide data for single client checks
            if (check.payType === 'hourly' || check.payType === 'mixed') {
              const hourlyTotal = (check.hours || 0) * (check.payRate || 0) +
                                 (check.overtimeHours || 0) * (check.overtimeRate || 0) +
                                 (check.holidayHours || 0) * (check.holidayRate || 0);
              hourlyAmount += hourlyTotal;
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
            }
          }
        });
        
        console.log(`🔍 [Report] ========== FINAL TOTALS FOR DIVISION ${divisionName} ==========`);
        console.log(`🔍 [Report] Division: ${divisionName}`);
        console.log(`🔍 [Report] Total Checks: ${totalChecks}`);
        console.log(`🔍 [Report] Total Amount: ${totalAmount}`);
        console.log(`🔍 [Report] Hourly Amount: ${hourlyAmount}`);
        console.log(`🔍 [Report] Per Diem Amount: ${perdiemAmount}`);
        console.log(`🔍 [Report] Clients:`, Array.from(clients));
        console.log(`🔍 [Report] ========== END DIVISION ${divisionName} ==========`);
        
        return {
          divisionName,
          totalChecks,
          totalAmount,
          hourlyAmount,
          perdiemAmount,
          checks
        };
      });
      
      console.log(`🔍 [Report] ========== FINAL DIVISION BREAKDOWN FOR ${company.name} ==========`);
      divisionBreakdown.forEach((div, index) => {
        console.log(`🔍 [Report] Division ${index + 1}:`, {
          name: div.divisionName,
          checks: div.totalChecks,
          amount: div.totalAmount,
          hourly: div.hourlyAmount,
          perdiem: div.perdiemAmount
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
        divisionBreakdown,
        checks: companyChecks
      }];

      companyReports.push({
        company,
        totalChecks: companyChecks.length,
        totalAmount,
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
      // Filter clients based on active/inactive filter
      const filteredClients = clients.filter(client => filters.includeInactive || client.active);
      
      // Prepare client breakdown data
      const clientBreakdownData = filteredClients.map(client => {
        const clientChecks = filteredChecks.filter(check => 
          check.clientId === client.id || 
          check.relationshipDetails?.some(rel => rel.clientId === client.id)
        );
        
        if (clientChecks.length === 0) return null;
        
        const totalAmount = clientChecks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
        const totalChecks = clientChecks.length;
        
        // Calculate hourly vs per diem amounts
        let hourlyAmount = 0;
        let perdiemAmount = 0;
        
        clientChecks.forEach(check => {
          if (check.payType === 'hourly' || check.payType === 'mixed') {
            const hourlyTotal = (check.hours || 0) * (check.payRate || 0) +
                               (check.overtimeHours || 0) * (check.overtimeRate || 0) +
                               (check.holidayHours || 0) * (check.holidayRate || 0);
            hourlyAmount += hourlyTotal;
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
          }
        });

        const company = companies.find(c => c.id === clientChecks[0]?.companyId);
        
        return {
          client: client.name,
          company: company?.name || 'Unknown',
          totalChecks: totalChecks,
          hourlyAmount: hourlyAmount,
          perdiemAmount: perdiemAmount,
          totalAmount: totalAmount,
          status: client.active ? 'Active' : 'Inactive'
        };
      }).filter(Boolean);

      // Calculate totals
      const totals = clientBreakdownData.reduce((acc, item) => ({
        totalChecks: acc.totalChecks + item!.totalChecks,
        hourlyAmount: acc.hourlyAmount + item!.hourlyAmount,
        perdiemAmount: acc.perdiemAmount + item!.perdiemAmount,
        totalAmount: acc.totalAmount + item!.totalAmount
      }), { totalChecks: 0, hourlyAmount: 0, perdiemAmount: 0, totalAmount: 0 });

      // Create workbook with ExcelJS
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Client Breakdown');

      // Define columns
      worksheet.columns = [
        { header: 'Client', key: 'client', width: 25 },
        { header: 'Company', key: 'company', width: 20 },
        { header: 'Total Checks', key: 'totalChecks', width: 15 },
        { header: 'Hourly Amount', key: 'hourlyAmount', width: 15 },
        { header: 'Per Diem Amount', key: 'perdiemAmount', width: 16 },
        { header: 'Total Amount', key: 'totalAmount', width: 15 },
        { header: 'Status', key: 'status', width: 12 }
      ];

      // Add data rows
      clientBreakdownData.forEach(item => {
        worksheet.addRow(item!);
      });

      // Add total row
      worksheet.addRow({
        client: 'TOTAL',
        company: '',
        totalChecks: totals.totalChecks,
        hourlyAmount: totals.hourlyAmount,
        perdiemAmount: totals.perdiemAmount,
        totalAmount: totals.totalAmount,
        status: ''
      });

      // Apply professional styling
      applyProfessionalStyling(worksheet, true);

      // Generate filename with date range
      const startDate = filters.startDate ? new Date(filters.startDate).toLocaleDateString() : 'All';
      const endDate = filters.endDate ? new Date(filters.endDate).toLocaleDateString() : 'All';
      const filename = `Client_Breakdown_${startDate}_to_${endDate}.xlsx`;

      // Write to buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);

      setSuccess(`Departments Breakdown exported successfully as ${filename}`);
    } catch (err) {
      console.error('Export error:', err);
      setError('Failed to export Client Breakdown. Please try again.');
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
      
      // Prepare employee summary data with sorting
      const employeeSummaryData = filteredEmployees
        .map((employee) => {
          const employeeChecks = filteredChecks.filter(check => check.employeeId === employee.id);
          
          if (employeeChecks.length === 0) return null;
          
          const totalAmount = employeeChecks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
          const totalChecks = employeeChecks.length;
          const averagePerCheck = totalChecks > 0 ? totalAmount / totalChecks : 0;
          
          const company = companies.find(c => c.id === employee.companyId);
          
          return {
            employee: employee.name,
            company: company?.name || 'Unknown',
        role: employee.role || employee.position || 'N/A',
            totalChecks,
            totalAmount,
            averagePerCheck
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
        totalAmount: acc.totalAmount + item!.totalAmount
      }), { totalChecks: 0, totalAmount: 0 });

      // Create workbook with ExcelJS
      const workbook = new ExcelJS.Workbook();
      const company = companies.find(c => c.id === companyId);
      const sheetName = companyId === 'all' ? 'Employee Summary' : `${company?.name || 'Company'} Employees`;
      const worksheet = workbook.addWorksheet(sheetName);

      // Define columns
      worksheet.columns = [
        { header: 'Employee', key: 'employee', width: 25 },
        { header: 'Company', key: 'company', width: 20 },
        { header: 'Role', key: 'role', width: 20 },
        { header: 'Total Checks', key: 'totalChecks', width: 15 },
        { header: 'Total Amount', key: 'totalAmount', width: 15 },
        { header: 'Average per Check', key: 'averagePerCheck', width: 18 }
      ];

      // Add data rows
      employeeSummaryData.forEach(item => {
        worksheet.addRow(item!);
      });

      // Add total row
      worksheet.addRow({
        employee: 'TOTAL',
        company: '',
        role: '',
        totalChecks: totals.totalChecks,
        totalAmount: totals.totalAmount,
        averagePerCheck: ''
      });

      // Apply professional styling
      applyProfessionalStyling(worksheet, true);

      // Generate filename
      const startDate = filters.startDate ? new Date(filters.startDate).toLocaleDateString() : 'All';
      const endDate = filters.endDate ? new Date(filters.endDate).toLocaleDateString() : 'All';
      const companyName = companyId === 'all' ? 'All_Companies' : (company?.name || 'Company').replace(/\s+/g, '_');
      const filename = `Employee_Summary_${companyName}_${startDate}_to_${endDate}.xlsx`;

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
        
        if (check.relationshipDetails && check.relationshipDetails.length > 0) {
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

        return {
          'Check Number': check.checkNumber || check.id,
          'Company': company?.name || 'Unknown Company',
          'Employee': employee?.name || 'Unknown Employee',
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
          'Holiday Hours': relationshipHolidayHours,
          'Holiday Rate': relationshipHolidayRate,
          'Per Diem Amount': perdiemTotal,
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
          'Hourly Total': hourlyTotal,
          'Total Amount': amount,
          'Memo': check.memo || ''
        };
      });

      // Create workbook with multiple sheets using ExcelJS
      const workbook = new ExcelJS.Workbook();

      // Main checks sheet with professional formatting
      const checksWorksheet = workbook.addWorksheet('Checks');
      
      // Define columns from reportData keys
      const headers = Object.keys(reportData[0] || {});
      checksWorksheet.columns = headers.map(header => ({
        header: header,
        key: header,
        width: Math.min(Math.max(header.length + 5, 12), 30)
      }));
      
      // Add data rows
        reportData.forEach(row => {
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
        'Holiday Hours': '',
        'Holiday Rate': '',
        'Per Diem Amount': '',
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
        'Hourly Total': '',
        'Total Amount': dataToExport.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0),
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
          totalAmount: report.totalAmount,
          active: report.company.active ? 'Yes' : 'No'
        });
      });
      
      // Apply professional styling to company summary sheet
      applyProfessionalStyling(companySummarySheet, false);

      // Client summary sheet - only for clients in dataToExport with checks
      const clientSummary = clients
        .map(client => {
        const clientChecks = dataToExport.filter(check => 
          check.clientId === client.id || 
          check.relationshipDetails?.some(rel => rel.clientId === client.id)
        );
        const totalAmount = clientChecks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
        const totalChecks = clientChecks.length;
        
        return {
          'Client': client.name,
          'Company': companies.find(c => c.id === clientChecks[0]?.companyId)?.name || 'Unknown',
          'Total Checks': totalChecks,
          'Total Amount': totalAmount,
          'Active': client.active ? 'Yes' : 'No'
        };
        })
        .filter(item => item['Total Checks'] > 0); // Only include clients with checks
      
      const clientSummarySheet = workbook.addWorksheet('Client Summary');
      clientSummarySheet.columns = [
        { header: 'Client', key: 'Client', width: 25 },
        { header: 'Company', key: 'Company', width: 25 },
        { header: 'Total Checks', key: 'Total Checks', width: 15 },
        { header: 'Total Amount', key: 'Total Amount', width: 18 },
        { header: 'Active', key: 'Active', width: 10 }
      ];
      clientSummary.forEach(item => clientSummarySheet.addRow(item));
      applyProfessionalStyling(clientSummarySheet, false);

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
              'Hourly Amount': division.hourlyAmount,
              'Per Diem Amount': division.perdiemAmount,
              'Total Amount': division.totalAmount
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
        { header: 'Total Amount', key: 'Total Amount', width: 18 }
      ];
      breakdownData.forEach(item => breakdownSheet.addRow(item));
      applyProfessionalStyling(breakdownSheet, false);

      // Employee summary sheet - only for employees in dataToExport with checks
      const employeeSummary = employees
        .filter(employee => !companyId || employee.companyId === companyId) // Filter by company if specified
        .map(employee => {
        const employeeChecks = dataToExport.filter(check => check.employeeId === employee.id);
        const totalAmount = employeeChecks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
        const totalChecks = employeeChecks.length;
        
        return {
          'Employee': employee.name,
          'Company': companies.find(c => c.id === employee.companyId)?.name || 'Unknown',
          'Total Checks': totalChecks,
          'Total Amount': totalAmount,
          'Active': employee.active ? 'Yes' : 'No'
        };
        })
        .filter(item => item['Total Checks'] > 0); // Only include employees with checks
      
      const employeeSummarySheet = workbook.addWorksheet('Employee Summary');
      employeeSummarySheet.columns = [
        { header: 'Employee', key: 'Employee', width: 25 },
        { header: 'Company', key: 'Company', width: 25 },
        { header: 'Total Checks', key: 'Total Checks', width: 15 },
        { header: 'Total Amount', key: 'Total Amount', width: 18 },
        { header: 'Active', key: 'Active', width: 10 }
      ];
      employeeSummary.forEach(item => employeeSummarySheet.addRow(item));
      applyProfessionalStyling(employeeSummarySheet, false);

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
            fgColor: { argb: 'FFE8F4FD' }
          };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
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
  const totalAmount = filteredChecks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
  const companyReports = generateCompanyReports();

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
                      Deparment Breakdown
                    </Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                            <TableCell><strong>Client / Division</strong></TableCell>
                            <TableCell align="right"><strong>Checks</strong></TableCell>
                            <TableCell align="right"><strong>Hourly Amount</strong></TableCell>
                            <TableCell align="right"><strong>Per Diem Amount</strong></TableCell>
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
               Department Breakdown
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
                    const activeClients = clients.filter(client => client.active).length;
                    const inactiveClients = clients.filter(client => !client.active).length;
                    return `Showing ${filters.includeInactive ? activeClients + inactiveClients : activeClients} of ${clients.length} deparments`;
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
                    <TableCell align="right">Total Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    console.log('🔍 DEBUG: Rendering client breakdown TableBody, clients:', clients);
                    return null;
                  })()}
                  {clients
                    .filter(client => filters.includeInactive || client.active)
                    .map((client) => {
                    console.log('🔍 DEBUG: Processing client:', client.id, client.name);
                    const clientChecks = filteredChecks.filter(check => 
                      check.clientId === client.id || 
                      check.relationshipDetails?.some(rel => rel.clientId === client.id)
                    );
                    
                    if (clientChecks.length === 0) {
                      console.log('🔍 DEBUG: Client has no checks, returning null:', client.id);
                      return null;
                    }
                    
                    const totalAmount = clientChecks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
                    const totalChecks = clientChecks.length;
                    
                    // Calculate hourly vs per diem amounts
                    let hourlyAmount = 0;
                    let perdiemAmount = 0;
                    
                    clientChecks.forEach(check => {
                      if (check.payType === 'hourly' || check.payType === 'mixed') {
                        const hourlyTotal = (check.hours || 0) * (check.payRate || 0) +
                                           (check.overtimeHours || 0) * (check.overtimeRate || 0) +
                                           (check.holidayHours || 0) * (check.holidayRate || 0);
                        hourlyAmount += hourlyTotal;
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
                      }
                    });

                    const company = companies.find(c => c.id === clientChecks[0]?.companyId);
                    
                    return (
                      <TableRow key={client.id} sx={{ opacity: client.active ? 1 : 0.7 }}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor: client.active ? '#4caf50' : '#f44336',
                                flexShrink: 0
                              }}
                            />
                            {client.name}
                            {!client.active && (
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
                        <TableCell>{company?.name || 'Unknown'}</TableCell>
                        <TableCell align="right">{totalChecks}</TableCell>
                        <TableCell align="right">${hourlyAmount.toLocaleString()}</TableCell>
                        <TableCell align="right">${perdiemAmount.toLocaleString()}</TableCell>
                        <TableCell align="right">${totalAmount.toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })
                    .filter(Boolean)}
                  
                  {/* Total Row */}
                  <TableRow key="client-breakdown-total" sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
                    <TableCell><strong>TOTAL</strong></TableCell>
                    <TableCell></TableCell>
                    <TableCell align="right">
                      <strong>
                        {clients
                          .filter(client => filters.includeInactive || client.active)
                          .reduce((sum, client) => {
                          const clientChecks = filteredChecks.filter(check => 
                            check.clientId === client.id || 
                            check.relationshipDetails?.some(rel => rel.clientId === client.id)
                          );
                          return sum + clientChecks.length;
                        }, 0)}
                      </strong>
                    </TableCell>
                    <TableCell align="right">
                      <strong>
                        ${clients
                          .filter(client => filters.includeInactive || client.active)
                          .reduce((sum, client) => {
                          const clientChecks = filteredChecks.filter(check => 
                            check.clientId === client.id || 
                            check.relationshipDetails?.some(rel => rel.clientId === client.id)
                          );
                          let hourlyTotal = 0;
                          clientChecks.forEach(check => {
                            if (check.payType === 'hourly' || check.payType === 'mixed') {
                              hourlyTotal += (check.hours || 0) * (check.payRate || 0) +
                                            (check.overtimeHours || 0) * (check.overtimeRate || 0) +
                                            (check.holidayHours || 0) * (check.holidayRate || 0);
                            }
                          });
                          return sum + hourlyTotal;
                        }, 0).toLocaleString()}
                      </strong>
                    </TableCell>
                    <TableCell align="right">
                      <strong>
                        ${clients
                          .filter(client => filters.includeInactive || client.active)
                          .reduce((sum, client) => {
                          const clientChecks = filteredChecks.filter(check => 
                            check.clientId === client.id || 
                            check.relationshipDetails?.some(rel => rel.clientId === client.id)
                          );
                          let perdiemTotal = 0;
                          clientChecks.forEach(check => {
                            if (check.payType === 'perdiem' || check.payType === 'mixed') {
                              let checkPerdiem = check.perdiemAmount || 0;
                              if (check.perdiemBreakdown) {
                                checkPerdiem = (check.perdiemMonday || 0) + 
                                              (check.perdiemTuesday || 0) + 
                                              (check.perdiemWednesday || 0) + 
                                              (check.perdiemThursday || 0) + 
                                              (check.perdiemFriday || 0) + 
                                              (check.perdiemSaturday || 0) + 
                                              (check.perdiemSunday || 0);
                              }
                              perdiemTotal += checkPerdiem;
                            }
                          });
                          return sum + perdiemTotal;
                        }, 0).toLocaleString()}
                      </strong>
                    </TableCell>
                    <TableCell align="right">
                      <strong>
                        ${clients
                          .filter(client => filters.includeInactive || client.active)
                          .reduce((sum, client) => {
                          const clientChecks = filteredChecks.filter(check => 
                            check.clientId === client.id || 
                            check.relationshipDetails?.some(rel => rel.clientId === client.id)
                          );
                          return sum + clientChecks.reduce((checkSum, check) => checkSum + parseFloat(check.amount?.toString() || '0'), 0);
                        }, 0).toLocaleString()}
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
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
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
                <Typography variant="body2" color="text.secondary">
                  {(() => {
                    const filteredEmployees = employees.filter(employee => {
                      if (selectedCompanyForEmployees === 'all') return true;
                      return employee.companyId === selectedCompanyForEmployees;
                    });
                    const employeesWithChecks = filteredEmployees.filter(employee => 
                      filteredChecks.some(check => check.employeeId === employee.id)
                    );
                    return `Showing ${employeesWithChecks.length} employees`;
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
                          return filteredEmployees.filter(employee => 
                            filteredChecks.some(check => check.employeeId === employee.id)
                          ).length;
                        })()}
                        checked={selectedEmployees.size > 0 && selectedEmployees.size === (() => {
                          const filteredEmployees = employees.filter(employee => {
                            if (selectedCompanyForEmployees === 'all') return true;
                            return employee.companyId === selectedCompanyForEmployees;
                          });
                          return filteredEmployees.filter(employee => 
                            filteredChecks.some(check => check.employeeId === employee.id)
                          ).length;
                        })()}
                        onChange={toggleSelectAllEmployees}
                      />
                    </TableCell>
                    <TableCell>Employee</TableCell>
                    <TableCell>Company</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell align="right">Total Checks</TableCell>
                    <TableCell align="right">Total Amount</TableCell>
                    <TableCell align="right">Average per Check</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    // Filter employees based on selected company
                    const filteredEmployees = employees.filter(employee => {
                      if (selectedCompanyForEmployees === 'all') return true;
                      return employee.companyId === selectedCompanyForEmployees;
                    });
                    
                    return filteredEmployees
                      .map((employee) => {
                        const employeeChecks = filteredChecks.filter(check => check.employeeId === employee.id);
                        
                        if (employeeChecks.length === 0) return null;
                        
                        const totalAmount = employeeChecks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0);
                        const totalChecks = employeeChecks.length;
                        const averagePerCheck = totalChecks > 0 ? totalAmount / totalChecks : 0;
                        
                        const company = companies.find(c => c.id === employee.companyId);
                        
                        return {
                          employee,
                          company: company?.name || 'Unknown',
                        role: employee.role || employee.position || employee.payType || 'N/A',
                          totalAmount,
                          totalChecks,
                          averagePerCheck
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
                          <TableCell>{item!.company}</TableCell>
                          <TableCell>{item!.role}</TableCell>
                          <TableCell align="right">{item!.totalChecks}</TableCell>
                          <TableCell align="right">${item!.totalAmount.toLocaleString()}</TableCell>
                          <TableCell align="right">${item!.averagePerCheck.toFixed(2)}</TableCell>
                        </TableRow>
                      ));
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
                  <TableCell align="right"><strong>Holiday Hours</strong></TableCell>
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