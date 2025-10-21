import React, { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Card,
  CardContent,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

interface Employee {
  id?: string;
  name: string;
  address: string;
  position: string;
  payRate: number;
  payType: string;
  companyId: string;
  clientId: string;
  active: boolean;
  startDate: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

const InsertData: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [success, setSuccess] = useState<string>('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load companies and clients on component mount
  React.useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load companies
        const companiesSnap = await getDocs(collection(db, 'companies'));
        const companiesData = companiesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setCompanies(companiesData);

        // Load clients
        const clientsSnap = await getDocs(collection(db, 'clients'));
        const clientsData = clientsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setClients(clientsData);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // Convert to Employee format
        const employeeData: Employee[] = jsonData.map((row: any, index: number) => ({
          name: row.name || '',
          address: row.address || '',
          position: row.position || '',
          payRate: parseFloat(row.payRate) || 0,
          payType: row.payType || 'hourly',
          companyId: row.companyId || '',
          clientId: row.clientId || '',
          active: row.active === 'true' || row.active === true,
          startDate: row.startDate || new Date().toISOString().split('T')[0],
        }));

        setEmployees(employeeData);
        setErrors([]);
        setSuccess('');
      } catch (error) {
        console.error('Error parsing Excel file:', error);
        setErrors([{ row: 0, field: 'file', message: 'Error parsing Excel file' }]);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const validateEmployees = (): ValidationError[] => {
    const validationErrors: ValidationError[] = [];

    employees.forEach((emp, index) => {
      const row = index + 1;

      if (!emp.name.trim()) {
        validationErrors.push({ row, field: 'name', message: 'Name is required' });
      }

      if (!emp.position.trim()) {
        validationErrors.push({ row, field: 'position', message: 'Position is required' });
      }

      if (emp.payRate <= 0) {
        validationErrors.push({ row, field: 'payRate', message: 'Pay rate must be greater than 0' });
      }

      if (!['hourly', 'perdiem'].includes(emp.payType)) {
        validationErrors.push({ row, field: 'payType', message: 'Pay type must be "hourly" or "perdiem"' });
      }

      if (!emp.companyId) {
        validationErrors.push({ row, field: 'companyId', message: 'Company ID is required' });
      } else {
        const companyExists = companies.some(c => c.id === emp.companyId);
        if (!companyExists) {
          validationErrors.push({ row, field: 'companyId', message: 'Company ID does not exist' });
        }
      }

      if (!emp.clientId) {
        validationErrors.push({ row, field: 'clientId', message: 'Client ID is required' });
      } else {
        const clientExists = clients.some(c => c.id === emp.clientId);
        if (!clientExists) {
          validationErrors.push({ row, field: 'clientId', message: 'Client ID does not exist' });
        }
      }

      if (!emp.startDate) {
        validationErrors.push({ row, field: 'startDate', message: 'Start date is required' });
      }
    });

    return validationErrors;
  };

  const handleUpload = async () => {
    const validationErrors = validateEmployees();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setUploading(true);
    setErrors([]);

    try {
      for (const employee of employees) {
        await addDoc(collection(db, 'employees'), {
          ...employee,
          payTypes: [employee.payType],
          clientPayTypeRelationships: [{
            id: Date.now().toString(),
            clientId: employee.clientId,
            clientName: clients.find(c => c.id === employee.clientId)?.name || '',
            payType: employee.payType,
            payRate: employee.payRate.toString(),
            active: employee.active
          }]
        });
      }

      setSuccess(`Successfully imported ${employees.length} employees!`);
      setEmployees([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error uploading employees:', error);
      setErrors([{ row: 0, field: 'upload', message: 'Error uploading employees to database' }]);
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        name: 'John Doe',
        address: '123 Main St',
        position: 'Developer',
        payRate: 25.50,
        payType: 'hourly',
        companyId: 'your-company-id-here',
        clientId: 'your-client-id-here',
        active: true,
        startDate: '2024-01-01'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, 'employee_template.xlsx');
  };

  const getCompanyName = (companyId: string) => {
    const company = companies.find(c => c.id === companyId);
    return company ? company.name : 'Unknown Company';
  };

  const getClientName = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    return client ? client.name : 'Unknown Client';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Bulk Import Employees
      </Typography>
      
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Upload an Excel file to import multiple employees at once. Download the template below to see the required format.
      </Typography>

      {/* Template Download */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Step 1: Download Template
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Download this Excel template to see the required format and column names.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={downloadTemplate}
          >
            Download Template
          </Button>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Step 2: Upload Excel File
          </Typography>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={() => fileInputRef.current?.click()}
            sx={{ mb: 2 }}
          >
            Choose Excel File
          </Button>
          
          {employees.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {employees.length} employees loaded. Click "Preview & Upload" to review before importing.
              </Typography>
              <Button
                variant="outlined"
                onClick={() => setPreviewOpen(true)}
                sx={{ mt: 1 }}
              >
                Preview & Upload
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Error Display */}
      {errors.length > 0 && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="h6">Validation Errors:</Typography>
          {errors.map((error, index) => (
            <Typography key={index} variant="body2">
              Row {error.row}: {error.field} - {error.message}
            </Typography>
          ))}
        </Alert>
      )}

      {/* Success Message */}
      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Preview Employees</DialogTitle>
        <DialogContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Position</TableCell>
                  <TableCell>Pay Rate</TableCell>
                  <TableCell>Pay Type</TableCell>
                  <TableCell>Company</TableCell>
                  <TableCell>Client</TableCell>
                  <TableCell>Active</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {employees.map((emp, index) => (
                  <TableRow key={index}>
                    <TableCell>{emp.name}</TableCell>
                    <TableCell>{emp.position}</TableCell>
                    <TableCell>${emp.payRate}</TableCell>
                    <TableCell>
                      <Chip 
                        label={emp.payType} 
                        color={emp.payType === 'hourly' ? 'primary' : 'secondary'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{getCompanyName(emp.companyId)}</TableCell>
                    <TableCell>{getClientName(emp.clientId)}</TableCell>
                    <TableCell>
                      <Chip 
                        label={emp.active ? 'Active' : 'Inactive'} 
                        color={emp.active ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleUpload} 
            variant="contained" 
            disabled={uploading}
            startIcon={uploading ? <CircularProgress size={20} /> : <CheckIcon />}
          >
            {uploading ? 'Uploading...' : 'Upload Employees'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Required Fields Info */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Required Excel Columns:
          </Typography>
          <Typography variant="body2" component="div">
            <strong>name</strong> - Employee full name (required)<br/>
            <strong>address</strong> - Employee address<br/>
            <strong>position</strong> - Job position (required)<br/>
            <strong>payRate</strong> - Pay rate as number (required)<br/>
            <strong>payType</strong> - "hourly" or "perdiem" (required)<br/>
            <strong>companyId</strong> - Company ID from the system (required)<br/>
            <strong>clientId</strong> - Client ID from the system (required)<br/>
            <strong>active</strong> - true or false (required)<br/>
            <strong>startDate</strong> - Start date in YYYY-MM-DD format (required)
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default InsertData; 