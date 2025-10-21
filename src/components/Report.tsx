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
import { Download, FilterList, Refresh, ExpandMore, Business, AttachMoney, People, Launch, FileDownload } from '@mui/icons-material';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import * as XLSX from 'xlsx';

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

const Report: React.FC = () => {
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

  const exportDivisionToExcel = () => {
    try {
      const { divisionName, clientName, checks } = divisionChecksDialog;
      
      // Create division report data
      const reportData = checks.map(check => {
        const company = companies.find(c => c.id === check.companyId);
        const employee = employees.find(e => e.id === check.employeeId);
        
        // Get relationship-specific data for export
        let relationshipHours = check.hours || 0;
        let relationshipOtHours = check.overtimeHours || 0;
        let relationshipHolidayHours = check.holidayHours || 0;
        let relationshipPayRate = check.payRate || 0;
        let relationshipOtRate = check.overtimeRate || 0;
        let relationshipHolidayRate = check.holidayRate || 0;
        let perdiemTotal = check.perdiemAmount || 0;
        
        if (check.relationshipDetails && check.relationshipDetails.length > 0) {
          const relationship = check.relationshipDetails.find(rel => 
            rel.clientName === clientName
          ) || check.relationshipDetails[0];
          
          relationshipHours = relationship.hours || check.hours || 0;
          relationshipOtHours = relationship.otHours || check.overtimeHours || 0;
          relationshipHolidayHours = relationship.holidayHours || check.holidayHours || 0;
          relationshipPayRate = relationship.payRate || check.payRate || 0;
          perdiemTotal = relationship.perdiemAmount || check.perdiemAmount || 0;
          
          // For OT and Holiday rates, use check-wide rates
          relationshipOtRate = check.overtimeRate || 0;
          relationshipHolidayRate = check.holidayRate || 0;
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

        return {
          'Check Number': check.checkNumber || check.id,
          'Company': company?.name || 'Unknown Company',
          'Employee': employee?.name || 'Unknown Employee',
          'Division': divisionName,
          'Client': clientName,
          'Pay Type': check.payType,
          'Date': check.date?.toDate ? check.date.toDate().toLocaleDateString() : new Date(check.date).toLocaleDateString(),
          'Hours Worked': relationshipHours,
          'Pay Rate': relationshipPayRate,
          'Overtime Hours': relationshipOtHours,
          'Overtime Rate': relationshipOtRate,
          'Holiday Hours': relationshipHolidayHours,
          'Holiday Rate': relationshipHolidayRate,
          'Per Diem Amount': perdiemTotal,
          'Per Diem Breakdown': check.perdiemBreakdown ? 'Yes' : 'No',
          'Hourly Total': hourlyTotal,
          'Total Amount': amount,
          'Paid': check.paid ? 'Yes' : 'No',
          'Reviewed': check.reviewed ? 'Yes' : 'No',
          'Memo': check.memo || ''
        };
      });

      // Create workbook
      const wb = XLSX.utils.book_new();
      
      // Add main data sheet
      const ws = XLSX.utils.json_to_sheet(reportData);
      
      // Auto-adjust column widths
      const colWidths: Array<{wch: number}> = [];
      const headers = Object.keys(reportData[0] || {});
      headers.forEach(header => {
        let maxLength = header.length;
        reportData.forEach(row => {
          const cellValue = String((row as any)[header] || '');
          if (cellValue.length > maxLength) {
            maxLength = cellValue.length;
          }
        });
        // Set minimum width of 10 and maximum of 50
        colWidths.push({ wch: Math.min(Math.max(maxLength + 2, 10), 50) });
      });
      ws['!cols'] = colWidths;
      
      // Add center alignment for all cells
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const address = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[address]) continue;
          
          if (R === 0) {
            // Header row styling
            ws[address].s = {
              font: { bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "4472C4" } },
              alignment: { horizontal: "center", vertical: "center" }
            };
          } else {
            // Data rows - center align all content including numbers
            ws[address].s = {
              alignment: { horizontal: "center", vertical: "center" }
            };
          }
        }
      }
      
      XLSX.utils.book_append_sheet(wb, ws, 'Division Details');

      // Add summary sheet
      const summaryData = [{
        'Division': divisionName,
        'Client': clientName,
        'Total Checks': checks.length,
        'Total Amount': checks.reduce((sum, check) => sum + parseFloat(check.amount?.toString() || '0'), 0),
        'Paid Checks': checks.filter(check => check.paid).length,
        'Unpaid Checks': checks.filter(check => !check.paid).length,
        'Reviewed Checks': checks.filter(check => check.reviewed).length,
        'Unreviewed Checks': checks.filter(check => !check.reviewed).length
      }];
      
      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      
      // Auto-adjust summary column widths
      const summaryColWidths: Array<{wch: number}> = [];
      const summaryHeaders = Object.keys(summaryData[0] || {});
      summaryHeaders.forEach(header => {
        let maxLength = header.length;
        summaryData.forEach(row => {
          const cellValue = String((row as any)[header] || '');
          if (cellValue.length > maxLength) {
            maxLength = cellValue.length;
          }
        });
        summaryColWidths.push({ wch: Math.min(Math.max(maxLength + 2, 10), 50) });
      });
      summaryWs['!cols'] = summaryColWidths;
      
      // Add center alignment for summary sheet
      const summaryRange = XLSX.utils.decode_range(summaryWs['!ref'] || 'A1');
      for (let R = summaryRange.s.r; R <= summaryRange.e.r; ++R) {
        for (let C = summaryRange.s.c; C <= summaryRange.e.c; ++C) {
          const address = XLSX.utils.encode_cell({ r: R, c: C });
          if (!summaryWs[address]) continue;
          
          if (R === 0) {
            // Header row styling
            summaryWs[address].s = {
              font: { bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "4472C4" } },
              alignment: { horizontal: "center", vertical: "center" }
            };
          } else {
            // Data rows - center align all content
            summaryWs[address].s = {
              alignment: { horizontal: "center", vertical: "center" }
            };
          }
        }
      }
      
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

      // Generate filename and download
      const filename = `${divisionName.replace(/[^a-zA-Z0-9]/g, '_')}_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_report_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);

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
      const clientsData = clientsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Client[];
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
                const relHours = rel.hours || 0;
                const relOtHours = rel.otHours || 0;
                const relHolidayHours = rel.holidayHours || 0;
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
                let relPerdiemTotal = 0;
                
                if (rel.perdiemBreakdown) {
                  console.log(`🔍 [Report] Processing per diem breakdown for ${rel.clientName}`);
                  // Sum daily breakdown
                  relPerdiemTotal = (rel.perdiemMonday || 0) + 
                                   (rel.perdiemTuesday || 0) + 
                                   (rel.perdiemWednesday || 0) + 
                                   (rel.perdiemThursday || 0) + 
                                   (rel.perdiemFriday || 0) + 
                                   (rel.perdiemSaturday || 0) + 
                                   (rel.perdiemSunday || 0);
                  console.log(`🔍 [Report] Daily breakdown total: ${relPerdiemTotal}`);
                } else {
                  relPerdiemTotal = rel.perdiemAmount || 0;
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

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Client Breakdown sheet
      const clientBreakdownHeaders = ['Client', 'Company', 'Total Checks', 'Hourly Amount', 'Per Diem Amount', 'Total Amount', 'Status'];
      const clientBreakdownRows = clientBreakdownData.map(item => [
        item!.client,
        item!.company,
        item!.totalChecks,
        item!.hourlyAmount,
        item!.perdiemAmount,
        item!.totalAmount,
        item!.status
      ]);

      // Add totals row
      const totals = clientBreakdownData.reduce((acc, item) => ({
        totalChecks: acc.totalChecks + item!.totalChecks,
        hourlyAmount: acc.hourlyAmount + item!.hourlyAmount,
        perdiemAmount: acc.perdiemAmount + item!.perdiemAmount,
        totalAmount: acc.totalAmount + item!.totalAmount
      }), { totalChecks: 0, hourlyAmount: 0, perdiemAmount: 0, totalAmount: 0 });

      const totalRow = ['TOTAL', '', totals.totalChecks, totals.hourlyAmount, totals.perdiemAmount, totals.totalAmount, ''];
      
      const clientBreakdownSheetData = [clientBreakdownHeaders, ...clientBreakdownRows, totalRow];
      const ws = XLSX.utils.aoa_to_sheet(clientBreakdownSheetData);

      // Auto-adjust column widths
      const colWidths: Array<{wch: number}> = clientBreakdownHeaders.map((_, index) => {
        const maxLength = Math.max(
          clientBreakdownHeaders[index]?.length || 0,
          ...clientBreakdownSheetData.map(row => String(row[index] || '').length)
        );
        return { wch: Math.min(Math.max(maxLength + 2, 10), 30) };
      });
      ws['!cols'] = colWidths;

      // Center align all cells
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let row = range.s.r; row <= range.e.r; row++) {
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          if (!ws[cellAddress]) continue;
          ws[cellAddress].s = {
            alignment: { horizontal: 'center', vertical: 'center' }
          };
        }
      }

      XLSX.utils.book_append_sheet(wb, ws, 'Client Breakdown');

      // Generate filename with date range
      const startDate = filters.startDate ? new Date(filters.startDate).toLocaleDateString() : 'All';
      const endDate = filters.endDate ? new Date(filters.endDate).toLocaleDateString() : 'All';
      const filename = `Client_Breakdown_${startDate}_to_${endDate}.xlsx`;

      // Save file
      XLSX.writeFile(wb, filename);

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

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Employee Summary sheet
      const employeeSummaryHeaders = ['Employee', 'Company', 'Total Checks', 'Total Amount', 'Average per Check'];
      const employeeSummaryRows = employeeSummaryData.map(item => [
        item!.employee,
        item!.company,
        item!.totalChecks,
        item!.totalAmount,
        item!.averagePerCheck
      ]);

      // Add totals row
      const totals = employeeSummaryData.reduce((acc, item) => ({
        totalChecks: acc.totalChecks + item!.totalChecks,
        totalAmount: acc.totalAmount + item!.totalAmount
      }), { totalChecks: 0, totalAmount: 0 });

      const totalRow = ['TOTAL', '', totals.totalChecks, totals.totalAmount, ''];
      
      const employeeSummarySheetData = [employeeSummaryHeaders, ...employeeSummaryRows, totalRow];
      const ws = XLSX.utils.aoa_to_sheet(employeeSummarySheetData);

      // Auto-adjust column widths
      const colWidths: Array<{wch: number}> = employeeSummaryHeaders.map((_, index) => {
        const maxLength = Math.max(
          employeeSummaryHeaders[index]?.length || 0,
          ...employeeSummarySheetData.map(row => String(row[index] || '').length)
        );
        return { wch: Math.min(Math.max(maxLength + 2, 10), 30) };
      });
      ws['!cols'] = colWidths;

      // Center align all cells
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let row = range.s.r; row <= range.e.r; row++) {
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          if (!ws[cellAddress]) continue;
          ws[cellAddress].s = {
            alignment: { horizontal: 'center', vertical: 'center' }
          };
        }
      }

      // Generate sheet name and filename based on company
      const company = companies.find(c => c.id === companyId);
      const sheetName = companyId === 'all' ? 'Employee Summary' : `${company?.name || 'Company'} Employees`;
      const startDate = filters.startDate ? new Date(filters.startDate).toLocaleDateString() : 'All';
      const endDate = filters.endDate ? new Date(filters.endDate).toLocaleDateString() : 'All';
      const companyName = companyId === 'all' ? 'All_Companies' : (company?.name || 'Company').replace(/\s+/g, '_');
      const filename = `Employee_Summary_${companyName}_${startDate}_to_${endDate}.xlsx`;

      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      // Save file
      XLSX.writeFile(wb, filename);

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

      // Create workbook with multiple sheets
      const wb = XLSX.utils.book_new();

      // Main checks sheet with improved formatting
      const wsChecks = XLSX.utils.json_to_sheet(reportData);
      
      // Auto-adjust column widths for better readability
      const columnWidths: Array<{wch: number}> = [];
      const headers = Object.keys(reportData[0] || {});
      headers.forEach(header => {
        let maxLength = header.length;
        reportData.forEach(row => {
          const cellValue = String((row as any)[header] || '');
          if (cellValue.length > maxLength) {
            maxLength = cellValue.length;
          }
        });
        // Set minimum width of 10 and maximum of 50
        columnWidths.push({ wch: Math.min(Math.max(maxLength + 2, 10), 50) });
      });
      wsChecks['!cols'] = columnWidths;
      
      // Add header styling and center-align all data
      const range = XLSX.utils.decode_range(wsChecks['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const address = XLSX.utils.encode_cell({ r: R, c: C });
          if (!wsChecks[address]) continue;
          
          if (R === 0) {
            // Header row styling
            wsChecks[address].s = {
              font: { bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "4472C4" } },
              alignment: { horizontal: "center", vertical: "center" }
            };
          } else {
            // Data rows - center align all content including numbers
            wsChecks[address].s = {
              alignment: { horizontal: "center", vertical: "center" }
            };
          }
        }
      }
      
      // Add total sum row at the bottom
      const totalRow = {
        'Check Number': 'TOTAL',
        'Company': '',
        'Employee': '',
        'Client(s)': '',
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
      };
      
      // Add total row to the worksheet by appending to the data
      const totalRowData = Object.values(totalRow);
      const totalRowIndex = reportData.length;
      
      // Create a new row in the worksheet for totals
      for (let C = 0; C < totalRowData.length; ++C) {
        const address = XLSX.utils.encode_cell({ r: totalRowIndex, c: C });
        const value = totalRowData[C];
        
        if (typeof value === 'number') {
          wsChecks[address] = { v: value, t: 'n' };
        } else {
          wsChecks[address] = { v: value, t: 's' };
        }
        
        // Style the total row with bold text and different background
        wsChecks[address].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: "E6E6E6" } },
          alignment: { horizontal: "center", vertical: "center" }
        };
      }
      
      XLSX.utils.book_append_sheet(wb, wsChecks, 'Checks');

      // Company summary sheet with improved formatting
      const companyReports = generateCompanyReports();
      const companySummary = companyReports.map(report => ({
        'Company': report.company.name,
        'Total Checks': report.totalChecks,
        'Total Amount': report.totalAmount,
        'Active': report.company.active ? 'Yes' : 'No'
      }));
      const wsCompanySummary = XLSX.utils.json_to_sheet(companySummary);
      
      // Set column widths for company summary
      wsCompanySummary['!cols'] = [
        { wch: 25 }, // Company
        { wch: 15 }, // Total Checks
        { wch: 18 }, // Total Amount
        { wch: 10 }  // Active
      ];
      
      // Add header styling and center-align all data
      const companyRange = XLSX.utils.decode_range(wsCompanySummary['!ref'] || 'A1');
      for (let R = companyRange.s.r; R <= companyRange.e.r; ++R) {
        for (let C = companyRange.s.c; C <= companyRange.e.c; ++C) {
          const address = XLSX.utils.encode_cell({ r: R, c: C });
          if (!wsCompanySummary[address]) continue;
          
          if (R === 0) {
            // Header row styling
            wsCompanySummary[address].s = {
              font: { bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "70AD47" } },
              alignment: { horizontal: "center", vertical: "center" }
            };
          } else {
            // Data rows - center align all content
            wsCompanySummary[address].s = {
              alignment: { horizontal: "center", vertical: "center" }
            };
          }
        }
      }
      
      XLSX.utils.book_append_sheet(wb, wsCompanySummary, 'Company Summary');

      // Client summary sheet with improved formatting
      const clientSummary = clients.map(client => {
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
      });
      const wsClientSummary = XLSX.utils.json_to_sheet(clientSummary);
      
      // Set column widths for client summary
      wsClientSummary['!cols'] = [
        { wch: 25 }, // Client
        { wch: 25 }, // Company
        { wch: 15 }, // Total Checks
        { wch: 18 }, // Total Amount
        { wch: 10 }  // Active
      ];
      
      // Add header styling and center-align all data
      const clientRange = XLSX.utils.decode_range(wsClientSummary['!ref'] || 'A1');
      for (let R = clientRange.s.r; R <= clientRange.e.r; ++R) {
        for (let C = clientRange.s.c; C <= clientRange.e.c; ++C) {
          const address = XLSX.utils.encode_cell({ r: R, c: C });
          if (!wsClientSummary[address]) continue;
          
          if (R === 0) {
            // Header row styling
            wsClientSummary[address].s = {
              font: { bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "ED7D31" } },
              alignment: { horizontal: "center", vertical: "center" }
            };
          } else {
            // Data rows - center align all content
            wsClientSummary[address].s = {
              alignment: { horizontal: "center", vertical: "center" }
            };
          }
        }
      }
      
      XLSX.utils.book_append_sheet(wb, wsClientSummary, 'Client Summary');

      // Company → Client → Division breakdown sheet
      const breakdownReports = generateCompanyReports();
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
      
      const wsBreakdown = XLSX.utils.json_to_sheet(breakdownData);
      
      // Set column widths for breakdown
      wsBreakdown['!cols'] = [
        { wch: 25 }, // Company
        { wch: 25 }, // Client
        { wch: 20 }, // Division
        { wch: 15 }, // Total Checks
        { wch: 18 }, // Hourly Amount
        { wch: 18 }, // Per Diem Amount
        { wch: 18 }  // Total Amount
      ];
      
      // Add header styling and center-align all data
      const breakdownRange = XLSX.utils.decode_range(wsBreakdown['!ref'] || 'A1');
      for (let R = breakdownRange.s.r; R <= breakdownRange.e.r; ++R) {
        for (let C = breakdownRange.s.c; C <= breakdownRange.e.c; ++C) {
          const address = XLSX.utils.encode_cell({ r: R, c: C });
          if (!wsBreakdown[address]) continue;
          
          if (R === 0) {
            // Header row styling
            wsBreakdown[address].s = {
              font: { bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "7030A0" } },
              alignment: { horizontal: "center", vertical: "center" }
            };
          } else {
            // Data rows - center align all content
            wsBreakdown[address].s = {
              alignment: { horizontal: "center", vertical: "center" }
            };
          }
        }
      }
      
      XLSX.utils.book_append_sheet(wb, wsBreakdown, 'Company→Client→Division');

      // Employee summary sheet with improved formatting
      const employeeSummary = employees.map(employee => {
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
      });
      const wsEmployeeSummary = XLSX.utils.json_to_sheet(employeeSummary);
      
      // Set column widths for employee summary
      wsEmployeeSummary['!cols'] = [
        { wch: 25 }, // Employee
        { wch: 25 }, // Company
        { wch: 15 }, // Total Checks
        { wch: 18 }, // Total Amount
        { wch: 10 }  // Active
      ];
      
      // Add header styling and center-align all data
      const employeeRange = XLSX.utils.decode_range(wsEmployeeSummary['!ref'] || 'A1');
      for (let R = employeeRange.s.r; R <= employeeRange.e.r; ++R) {
        for (let C = employeeRange.s.c; C <= employeeRange.e.c; ++C) {
          const address = XLSX.utils.encode_cell({ r: R, c: C });
          if (!wsEmployeeSummary[address]) continue;
          
          if (R === 0) {
            // Header row styling
            wsEmployeeSummary[address].s = {
              font: { bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "A5A5A5" } },
              alignment: { horizontal: "center", vertical: "center" }
            };
          } else {
            // Data rows - center align all content
            wsEmployeeSummary[address].s = {
              alignment: { horizontal: "center", vertical: "center" }
            };
          }
        }
      }
      
      XLSX.utils.book_append_sheet(wb, wsEmployeeSummary, 'Employee Summary');

      // Export the file
      XLSX.writeFile(wb, filename);
      
      const companyName = companyId ? companies.find(c => c.id === companyId)?.name : 'All Companies';
      setSuccess(`${companyName} report exported successfully! ${dataToExport.length} checks included.`);
      
    } catch (err) {
      console.error('Error exporting report:', err);
      setError('Failed to export report. Please try again.');
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
                  let relationshipOtHours = check.overtimeHours || 0;
                  let relationshipHolidayHours = check.holidayHours || 0;
                  let relationshipPayRate = check.payRate || 0;
                  let relationshipPerdiem = check.perdiemAmount || 0;
                  
                  if (check.relationshipDetails && check.relationshipDetails.length > 0) {
                    const relationship = check.relationshipDetails.find(rel => 
                      rel.clientName === divisionChecksDialog.clientName
                    ) || check.relationshipDetails[0];
                    
                    relationshipHours = relationship.hours || check.hours || 0;
                    relationshipOtHours = relationship.otHours || check.overtimeHours || 0;
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