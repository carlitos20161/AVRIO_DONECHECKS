import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Select, MenuItem, InputLabel, FormControl,
  Switch, FormControlLabel, Card, CardContent, Avatar, Chip, Stack,
  Checkbox, ListItemText, IconButton, Divider, Radio, RadioGroup
} from '@mui/material';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, doc, query, where } from 'firebase/firestore';
import PersonIcon from '@mui/icons-material/Person';
import WorkIcon from '@mui/icons-material/Work';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';

// New interface for client-pay type relationships
interface ClientPayTypeRelationship {
  id: string;
  clientId: string;
  clientName: string;
  payType: 'hourly' | 'perdiem';
  payRate?: string; // Pay rate for hourly relationships
  active: boolean;
}

interface Employee {
  id: string;
  name: string;
  address: string;
  position: string;
  payRate: number;
  payType: string;
  payTypes: string[];
  companyId?: string | null;
  companyIds?: string[];
  clientId?: string | null; // Legacy field - keeping for backward compatibility
  clientPayTypeRelationships?: ClientPayTypeRelationship[]; // New field for multiple relationships
  active: boolean;
  startDate?: string | null;
}

interface Company {
  id: string;
  name: string;
  logoBase64?: string;
}

interface Client {
  id: string;
  name: string;
  address?: string;
  companyIds?: string[];
}

interface EmployeesProps {
  currentRole: string;
  companyIds: string[];
}

const Employees: React.FC<EmployeesProps> = ({ currentRole, companyIds }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [payTypeFilter, setPayTypeFilter] = useState<'all' | 'hourly' | 'perdiem'>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'position' | 'startDate' | 'payRate'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [openAdd, setOpenAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const [newEmployee, setNewEmployee] = useState({
    name: '',
    address: '',
    position: '',
    payRate: '',
    payType: 'hourly',
    payTypes: ['hourly'] as string[],
    companyIds: [] as string[],
    clientId: '',
    startDate: '',
    employeeType: 'single-hourly' as 'single-hourly' | 'single-perdiem' | 'multiple',
    hasMultipleClients: false,
    clientPayTypeRelationships: [] as ClientPayTypeRelationship[]
  });

  const [editEmployee, setEditEmployee] = useState({
    name: '',
    address: '',
    position: '',
    payRate: '',
    payType: 'hourly',
    payTypes: ['hourly'] as string[],
    companyId: '',
    startDate: '',
    hasMultipleClients: false,
    clientId: '',
    clientPayTypeRelationships: [] as ClientPayTypeRelationship[]
  });

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEmployee, setProfileEmployee] = useState<Employee | null>(null);
  const [profileEdit, setProfileEdit] = useState<any>(null);
  const [profileChecks, setProfileChecks] = useState<any[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      let empDocs = [];
      try {
        // For now, fetch all employees since the rules allow it
        const empSnap = await getDocs(collection(db, 'employees'));
        empDocs = empSnap.docs;
        console.log('[DEBUG] Fetched employees:', empDocs.length);
        
        // Filter employees by companyIds on the client side for non-admin users
        let filteredEmployees = empDocs.map((d) => ({ id: d.id, ...d.data() } as Employee));
        
                 if (currentRole !== 'admin') {
           // Filter to only show employees for the user's assigned companies
           filteredEmployees = filteredEmployees.filter(emp => {
             const empCompanyId = emp.companyId;
             const empCompanyIds = emp.companyIds || [];
             
             // Check if employee belongs to any of the user's companies
             return (empCompanyId && companyIds.includes(empCompanyId)) || 
                    empCompanyIds.some(companyId => companyIds.includes(companyId));
           });
          console.log('[DEBUG] Filtered employees for user:', filteredEmployees.length);
        }
        
        setEmployees(filteredEmployees);
      } catch (error) {
        console.error('[DEBUG] Error fetching employees:', error);
        setEmployees([]);
      }

      const compSnap = await getDocs(collection(db, 'companies'));
      let allCompanies = compSnap.docs.map((d) => ({ 
        id: d.id, 
        name: d.data().name,
        logoBase64: d.data().logoBase64 || null
      }));
      if (currentRole !== 'admin') {
        allCompanies = allCompanies.filter(c => companyIds.includes(c.id));
      }
      setCompanies(allCompanies);

      // Only fetch clients if user is admin
      if (currentRole === 'admin') {
        try {
          const cliSnap = await getDocs(collection(db, 'clients'));
          const cliList: Client[] = cliSnap.docs.map(d => {
            const data = d.data() as any;
            return {
              id: d.id,
              name: data.name,
              address: data.address,
              companyIds: data.companyId || []
            };
          });
          setClients(cliList);
        } catch (error) {
          console.error('[DEBUG] Error fetching clients:', error);
          setClients([]);
        }
      } else {
        // For non-admin users, set empty clients array
        setClients([]);
      }
    };
    fetchData();
  }, [currentRole, companyIds]);

  const getCompanyName = (id?: string | null): string => {
    if (!id) return 'No Company';
    const c = companies.find((co) => co.id === id);
    return c ? c.name : 'Unknown Company';
  };

  const handleAdd = async () => {
    // Validation
    if (!newEmployee.name.trim()) {
      alert('Please enter employee name');
      return;
    }

    if (newEmployee.employeeType === 'single-hourly' || newEmployee.employeeType === 'single-perdiem') {
      if (!newEmployee.clientId) {
        alert('Please select a client');
        return;
      }
      // Only require pay rate for hourly employees
      if (newEmployee.employeeType === 'single-hourly' && !newEmployee.payRate) {
        alert('Please enter pay rate');
        return;
      }
    }

    if (newEmployee.employeeType === 'multiple') {
      if (!newEmployee.clientPayTypeRelationships || newEmployee.clientPayTypeRelationships.length === 0) {
        alert('Please add at least one client relationship');
        return;
      }
      for (const rel of newEmployee.clientPayTypeRelationships) {
        if (!rel.clientId || !rel.payRate) {
          alert('Please complete all client relationship fields');
          return;
        }
      }
    }

    const parsedRate = parseFloat(newEmployee.payRate);
    const data: any = {
      name: newEmployee.name,
      address: newEmployee.address,
      position: newEmployee.position,
      payRate: isNaN(parsedRate) ? 0 : parsedRate,
      payType: newEmployee.payType,
      payTypes: newEmployee.payTypes,
      active: true,
      clientId: newEmployee.hasMultipleClients ? null : newEmployee.clientId,
      hasMultipleClients: newEmployee.hasMultipleClients,
      clientPayTypeRelationships: newEmployee.clientPayTypeRelationships || [],
      startDate: newEmployee.startDate || null
    };

    // Company assignment logic
    if (selectedCompanyId) {
      // Single company assignment
      data.companyId = selectedCompanyId;
    } else if (newEmployee.companyIds && newEmployee.companyIds.length > 0) {
      if (newEmployee.companyIds.length === 1) {
        // Only one company selected, use companyId (string)
        data.companyId = newEmployee.companyIds[0];
      } else {
        // Multiple companies selected, use companyIds (array)
        data.companyIds = newEmployee.companyIds;
      }
    }

    const docRef = await addDoc(collection(db, 'employees'), data);
    setEmployees((prev) => [...prev, { id: docRef.id, ...data } as Employee]);
    setOpenAdd(false);
    setNewEmployee({
      name: '',
      address: '',
      position: '',
      payRate: '',
      payType: 'hourly',
      payTypes: ['hourly'],
      companyIds: [],
      clientId: '',
      startDate: '',
      employeeType: 'single-hourly',
      hasMultipleClients: false,
      clientPayTypeRelationships: []
    });
  };

  const handleCardClick = (emp: Employee) => {
    setSelectedEmployee(emp);
    setEditEmployee({
      name: emp.name,
      address: emp.address,
      position: emp.position,
      payRate: String(emp.payRate),
      payType: emp.payType,
      payTypes: emp.payTypes || [emp.payType],
      companyId: emp.companyId || '',
      startDate: emp.startDate || '',
      hasMultipleClients: (emp.clientPayTypeRelationships && emp.clientPayTypeRelationships.length > 0) || false,
      clientId: emp.clientId || '',
      clientPayTypeRelationships: emp.clientPayTypeRelationships || []
    });
    setOpenEdit(true);
  };

  const getClientName = (id?: string | null): string => {
    if (!id) return 'No Client';
    const cl = clients.find(c => c.id === id);
    return cl ? cl.name : 'Unknown Client';
  };

  const handleSaveEdit = async () => {
    if (!selectedEmployee) return;
    const parsedRate = parseFloat(editEmployee.payRate);
    const updated = {
      name: editEmployee.name,
      address: editEmployee.address,
      position: editEmployee.position,
      payRate: isNaN(parsedRate) ? 0 : parsedRate,
      payType: editEmployee.payType,
      payTypes: editEmployee.payTypes,
      companyId: editEmployee.companyId || null,
      clientId: editEmployee.hasMultipleClients ? null : editEmployee.clientId,
      hasMultipleClients: editEmployee.hasMultipleClients,
      clientPayTypeRelationships: editEmployee.clientPayTypeRelationships || [],
      startDate: editEmployee.startDate || null
    };
    await updateDoc(doc(db, 'employees', selectedEmployee.id), updated);
    setEmployees(prev => prev.map(e => (e.id === selectedEmployee.id ? { ...e, ...updated } : e)));
    setOpenEdit(false);
    setSelectedEmployee(null);
  };

  const handleDeleteEmployee = async () => {
    if (!selectedEmployee) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete ${selectedEmployee.name}?`);
    if (!confirmDelete) return;
    await updateDoc(doc(db, 'employees', selectedEmployee.id), {});
    await import('firebase/firestore').then(({ deleteDoc }) =>
      deleteDoc(doc(db, 'employees', selectedEmployee.id))
    );
    setEmployees(prev => prev.filter(e => e.id !== selectedEmployee.id));
    setOpenEdit(false);
    setSelectedEmployee(null);
  };

  const handleToggleActive = async (id: string, newActive: boolean) => {
    await updateDoc(doc(db, 'employees', id), { active: newActive });
    setEmployees(prev => prev.map(e => (e.id === id ? { ...e, active: newActive } : e)));
  };

  const filteredEmployees = selectedCompanyId
    ? employees.filter(e => {
        // Text search across name, position, and address
        const searchLower = search.toLowerCase();
        const matchSearch = 
          e.name.toLowerCase().includes(searchLower) ||
          e.position.toLowerCase().includes(searchLower) ||
          (e.address && e.address.toLowerCase().includes(searchLower)) ||
          // Search in client relationships
          (e.clientPayTypeRelationships && e.clientPayTypeRelationships.some(rel => 
            rel.clientName.toLowerCase().includes(searchLower)
          )) ||
          // Search in legacy client
          (e.clientId && getClientName(e.clientId).toLowerCase().includes(searchLower));
        
        // Company filter
        const matchArray =
          Array.isArray((e as any).companyIds) &&
          (e as any).companyIds.includes(selectedCompanyId);
        const matchSingle = e.companyId && e.companyId === selectedCompanyId;
        const matchCompany = matchArray || matchSingle;
        
        // Status filter
        const matchStatus = statusFilter === 'all' || 
          (statusFilter === 'active' && e.active) ||
          (statusFilter === 'inactive' && !e.active);
        
        // Pay type filter
        const matchPayType = payTypeFilter === 'all' ||
          (payTypeFilter === 'hourly' && (e.payTypes?.includes('hourly') || e.payType === 'hourly')) ||
          (payTypeFilter === 'perdiem' && (e.payTypes?.includes('perdiem') || e.payType === 'perdiem'));
        
        // Client filter
        const matchClient = clientFilter === 'all' ||
          (e.clientPayTypeRelationships && e.clientPayTypeRelationships.some(rel => rel.clientId === clientFilter)) ||
          (e.clientId === clientFilter);
        
        return matchSearch && matchCompany && matchStatus && matchPayType && matchClient;
      })
    : [];

  const filteredClients = selectedCompanyId
    ? clients.filter(c => c.companyIds?.includes(selectedCompanyId))
    : clients;

  // Sort filtered employees
  const sortedEmployees = [...filteredEmployees].sort((a, b) => {
    let aValue: any, bValue: any;
    
    switch (sortBy) {
      case 'name':
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case 'position':
        aValue = a.position.toLowerCase();
        bValue = b.position.toLowerCase();
        break;
      case 'startDate':
        aValue = a.startDate || '';
        bValue = b.startDate || '';
        break;
      case 'payRate':
        aValue = a.payRate || 0;
        bValue = b.payRate || 0;
        break;
      default:
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
    }
    
    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  // When opening the profile modal, fetch checks for this employee
  const openProfile = async (emp: Employee) => {
    setProfileEmployee(emp);
    setProfileEdit({ ...emp });
    setProfileOpen(true);
    setProfileLoading(true);
    
    try {
      // Fetch checks for this employee, but only if user has access
      let checksSnap;
      if (currentRole === 'admin') {
        // Admin can fetch all checks for the employee
        checksSnap = await getDocs(query(collection(db, 'checks'), where('employeeId', '==', emp.id)));
      } else {
        // For non-admin users, we need to filter by company access
                 // First get all checks for the employee's companies
         const employeeCompanyIds = [emp.companyId, ...(emp.companyIds || [])].filter((id): id is string => Boolean(id));
        const userAccessibleCompanyIds = employeeCompanyIds.filter(id => companyIds.includes(id));
        
        if (userAccessibleCompanyIds.length === 0) {
          // User doesn't have access to any of the employee's companies
          setProfileChecks([]);
          setProfileLoading(false);
          return;
        }
        
        // Fetch checks for accessible companies only
        const checksPromises = userAccessibleCompanyIds.map(companyId =>
          getDocs(query(collection(db, 'checks'), 
            where('employeeId', '==', emp.id),
            where('companyId', '==', companyId)
          ))
        );
        
        const checksResults = await Promise.allSettled(checksPromises);
        const allDocs = checksResults
          .filter(result => result.status === 'fulfilled')
          .flatMap(result => (result as PromiseFulfilledResult<any>).value.docs);
        
        checksSnap = { docs: allDocs };
      }
      
      setProfileChecks(checksSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error('[DEBUG] Error fetching employee checks:', error);
      setProfileChecks([]);
    } finally {
      setProfileLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold', color: 'text.primary' }}>
        Employees
      </Typography>

      {selectedCompanyId ? (
        <>
          <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
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
            {currentRole === 'admin' && (
              <Button 
                variant="contained" 
                onClick={() => setOpenAdd(true)}
                sx={{
                  borderRadius: 2,
                  px: 3,
                  py: 1.5,
                  fontWeight: 'bold',
                  boxShadow: 2,
                  '&:hover': {
                    transform: 'translateY(-1px)',
                    boxShadow: 4
                  },
                  transition: 'all 0.2s ease'
                }}
              >
                + Add Employee
              </Button>
            )}
          </Box>
          
          {/* Enhanced Search and Filters */}
          <Box sx={{ mb: 3 }}>
            {/* Search Bar */}
            <TextField
              placeholder="Search by name, position, address, or client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ width: '100%', mb: 2 }}
              InputProps={{
                startAdornment: <span style={{ marginRight: '8px' }}>🔍</span>
              }}
            />
            
            {/* Filter Controls */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
              {/* Status Filter */}
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                  label="Status"
                >
                  <MenuItem value="all">All Status</MenuItem>
                                  <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
              
              {/* Pay Type Filter */}
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Pay Type</InputLabel>
                <Select
                  value={payTypeFilter}
                  onChange={(e) => setPayTypeFilter(e.target.value as 'all' | 'hourly' | 'perdiem')}
                  label="Pay Type"
                >
                  <MenuItem value="all">All Types</MenuItem>
                  <MenuItem value="hourly">💰 Hourly</MenuItem>
                  <MenuItem value="perdiem">📅 Per Diem</MenuItem>
                </Select>
              </FormControl>
              
              {/* Client Filter */}
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Client</InputLabel>
                <Select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  label="Client"
                >
                  <MenuItem value="all">All Clients</MenuItem>
                  {filteredClients.map(client => (
                    <MenuItem key={client.id} value={client.id}>
                      {client.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              {/* Sort By */}
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'name' | 'position' | 'startDate' | 'payRate')}
                  label="Sort By"
                >
                                  <MenuItem value="name">Name</MenuItem>
                <MenuItem value="position">Position</MenuItem>
                                  <MenuItem value="startDate">Start Date</MenuItem>
                <MenuItem value="payRate">Pay Rate</MenuItem>
                </Select>
              </FormControl>
              
              {/* Sort Order */}
              <Button
                variant="outlined"
                size="small"
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                sx={{ minWidth: 80 }}
              >
                {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
              </Button>
              
              {/* Clear Filters */}
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setPayTypeFilter('all');
                  setClientFilter('all');
                  setSortBy('name');
                  setSortOrder('asc');
                }}
                sx={{ minWidth: 100 }}
              >
                🗑️ Clear
              </Button>
            </Box>
            
            {/* Results Count */}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Showing {sortedEmployees.length} of {filteredEmployees.length} employees
            </Typography>
          </Box>
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
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
            {getCompanyName(selectedCompanyId)}
          </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Managing employees for this company
                    </Typography>
                  </Box>
                </>
              );
            })()}
          </Box>

          {sortedEmployees.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                {filteredEmployees.length === 0 ? 'No employees in this company.' : 'No employees found matching your criteria.'}
              </Typography>
              {filteredEmployees.length > 0 && (
                <Typography variant="body2" color="text.secondary">
                  Try adjusting your search terms or filters.
                </Typography>
              )}
            </Box>
          ) : (
            sortedEmployees.map((emp) => (
              <Box
  key={emp.id}
  sx={{
    border: '1px solid #ccc',
    borderRadius: 2,
    p: 2,
    mt: 2,
    maxWidth: 600,
    mx: 'auto',
    boxShadow: 1
  }}
>

                <Typography variant="h6">{emp.name}</Typography>
                                  <Typography variant="body2">{emp.address || 'No address'}</Typography>
                <Typography variant="body2">
                  {emp.position} | {
                    emp.clientPayTypeRelationships && emp.clientPayTypeRelationships.length > 0
                      ? (() => {
                          const hourlyRates = emp.clientPayTypeRelationships
                            .filter(rel => rel.payType === 'hourly' && rel.payRate)
                            .map(rel => `$${rel.payRate}/hour`);
                          
                          const perdiemRate = emp.clientPayTypeRelationships
                            .some(rel => rel.payType === 'perdiem') 
                            ? `$${emp.payRate || '0.00'}/day` 
                            : null;
                          
                          const rates = [...hourlyRates];
                          if (perdiemRate) rates.push(perdiemRate);
                          
                          return rates.join(' + ');
                        })()
                      : `$${isNaN(emp.payRate) ? '0.00' : emp.payRate}/${emp.payType === 'hourly' ? 'hour' : 'day'}`
                  }
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {emp.clientPayTypeRelationships && emp.clientPayTypeRelationships.length > 0 
                    ? emp.clientPayTypeRelationships.map(rel => `${rel.clientName} (${rel.payType})`).join(' + ')
                    : getClientName(emp.clientId) || 'No Client'
                  }
                </Typography>
                {emp.clientPayTypeRelationships && emp.clientPayTypeRelationships.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      🔗 Client Relationships:
                    </Typography>
                    {emp.clientPayTypeRelationships.map((rel, idx) => (
                      <Chip
                        key={rel.id}
                        label={`${rel.clientName} (${rel.payType})`}
                        size="small"
                        color={rel.active ? "primary" : "default"}
                        variant={rel.active ? "filled" : "outlined"}
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </Box>
                )}
                <Typography variant="body2" color="text.secondary">
                  📅 Start Date: {emp.startDate ? new Date(emp.startDate).toLocaleDateString() : 'N/A'}
                </Typography>
                <Typography
  variant="body2"
  sx={{
    fontWeight: 'bold',
    color: emp.active ? 'green' : 'red',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  }}
>
                    {emp.active ? 'Active' : 'Inactive'}
</Typography>

                <Button
                  variant="outlined"
                  sx={{ mt: 1 }}
                  onClick={() => handleCardClick(emp)}
                >
                  Edit Employee
                </Button>
              </Box>
            ))
          )}
        </>
      ) : (
        <>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            {currentRole === 'admin' && (
              <Button variant="contained" onClick={() => setOpenAdd(true)}>
                + Add Employee
              </Button>
            )}
          </Box>

          <Typography variant="h6" gutterBottom sx={{ mb: 3, color: 'text.primary', fontWeight: 'bold' }}>
            Select a Company to Manage Employees
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
                  borderColor: selectedCompanyId === c.id ? 'primary.main' : 'grey.200',
                  borderRadius: 3,
                  p: 3,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  backgroundColor: selectedCompanyId === c.id ? 'primary.50' : 'white',
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
                  setNewEmployee(prev => ({ ...prev, companyIds: [c.id] }));
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
                        borderColor: selectedCompanyId === c.id ? 'primary.main' : 'grey.300'
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
                        borderColor: selectedCompanyId === c.id ? 'primary.main' : 'grey.300'
                      }}
                    >
                      {c.name ? c.name[0].toUpperCase() : '?'}
                    </Avatar>
                  )}
                  
                  {/* Selection Indicator */}
                  {selectedCompanyId === c.id && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: -5,
                        right: -5,
                        backgroundColor: 'primary.main',
                        color: 'white',
                        borderRadius: '50%',
                        width: 30,
                        height: 30,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem',
                        fontWeight: 'bold',
                        boxShadow: 2
                      }}
                    >
                      ✓
                    </Box>
                  )}
                </Box>
                
                {/* Company Name */}
                <Typography 
                  variant="h6" 
                  sx={{ 
                    textAlign: 'center', 
                    fontWeight: 'bold',
                    color: selectedCompanyId === c.id ? 'primary.main' : 'text.primary',
                    mb: 1
                  }}
              >
                {c.name}
                </Typography>
                
                {/* Company Info */}
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Click to manage employees for this company
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
      )}

      {/* Add Dialog (admin only) */}
      {currentRole === 'admin' && (
        <Dialog open={openAdd} onClose={() => setOpenAdd(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Employee</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="Name" value={newEmployee.name} onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}/>
          <TextField label="Address" value={newEmployee.address} onChange={(e) => setNewEmployee({ ...newEmployee, address: e.target.value })}/>
          <TextField label="Position" value={newEmployee.position} onChange={(e) => setNewEmployee({ ...newEmployee, position: e.target.value })}/>
          
          {/* Employee Type Selection */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main' }}>
              Employee Work Type
            </Typography>
            <RadioGroup
              value={newEmployee.employeeType}
              onChange={(e: any) => {
                const type = e.target.value as 'single-hourly' | 'single-perdiem' | 'multiple';
                setNewEmployee(prev => ({
                  ...prev,
                  employeeType: type,
                  hasMultipleClients: type === 'multiple',
                  payType: type === 'single-perdiem' ? 'perdiem' : 'hourly',
                  payTypes: type === 'single-perdiem' ? ['perdiem'] : ['hourly'],
                  clientPayTypeRelationships: type === 'multiple' ? [] : [],
                  clientId: type === 'multiple' ? '' : prev.clientId,
                  payRate: type === 'single-perdiem' ? '0' : prev.payRate  // Set to 0 for per diem
                }));
              }}
            >
              <FormControlLabel 
                value="single-hourly" 
                control={<Radio />} 
                label="Works for ONE client - Hourly pay" 
              />
              <FormControlLabel 
                value="single-perdiem" 
                control={<Radio />} 
                label="Works for ONE client - Per Diem pay" 
              />
              <FormControlLabel 
                value="multiple" 
                control={<Radio />} 
                label="Works for MULTIPLE clients (flexible)" 
              />
            </RadioGroup>
          </Box>

          {/* Single Client Mode */}
          {(newEmployee.employeeType === 'single-hourly' || newEmployee.employeeType === 'single-perdiem') && (
            <>
              <Box sx={{ mb: 2, p: 2, backgroundColor: '#f8f9fa', borderRadius: 1 }}>
                <Typography variant="body2" color="primary" sx={{ fontWeight: 'bold' }}>
                  {newEmployee.employeeType === 'single-hourly' ? 'Hourly Employee' : 'Per Diem Employee'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {newEmployee.employeeType === 'single-hourly' 
                    ? 'This employee will be paid hourly for one client' 
                    : 'This employee will be paid per diem for one client (amounts entered when creating checks)'
                  }
                </Typography>
              </Box>

              <FormControl fullWidth>
                <InputLabel>Client</InputLabel>
                <Select
                  value={newEmployee.clientId}
                  onChange={(e) => setNewEmployee({ ...newEmployee, clientId: e.target.value })}
                >
                  {filteredClients.length > 0 ? (
                    filteredClients.map(cl => (
                      <MenuItem key={cl.id} value={cl.id}>
                        {cl.name} {cl.address ? `(${cl.address})` : ''}
                      </MenuItem>
                    ))
                  ) : (
                    <MenuItem disabled>No clients available</MenuItem>
                  )}
                </Select>
              </FormControl>

              {/* Only show pay rate for hourly employees */}
              {newEmployee.employeeType === 'single-hourly' && (
                <TextField
                  fullWidth
                  label="Pay Rate (per hour)"
                  value={newEmployee.payRate}
                  onChange={(e) => setNewEmployee({ ...newEmployee, payRate: e.target.value })}
                  placeholder="e.g., 17"
                />
              )}
            </>
          )}

          {/* Multiple Clients Mode - Relationship Management */}
          {newEmployee.employeeType === 'multiple' && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" sx={{ mb: 2, fontSize: '1rem', color: 'primary.main' }}>
                Multiple Client Relationships
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => {
                    const newRelationship: ClientPayTypeRelationship = {
                      id: Date.now().toString(),
                      clientId: '',
                      clientName: '',
                      payType: 'hourly',
                      payRate: '',
                      active: true
                    };
                    setNewEmployee(prev => ({
                      ...prev,
                      clientPayTypeRelationships: [...(prev.clientPayTypeRelationships || []), newRelationship]
                    }));
                  }}
                  sx={{ ml: 2 }}
                  size="small"
                  variant="outlined"
                >
                  Add Relationship
                </Button>
              </Typography>
              
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Create separate relationships for each client-pay type combination (e.g., "Americold Hourly" for hourly work, "Americold Per Diem" for per diem work)
              </Typography>
              
              {newEmployee.clientPayTypeRelationships?.map((relationship, index) => (
                <Box key={relationship.id} sx={{ mb: 2, p: 2, border: '1px solid #ddd', borderRadius: 1, backgroundColor: '#f8f9fa' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2" color="primary">
                      Relationship {index + 1}: {relationship.clientName || 'Select Client'} - {relationship.payType === 'hourly' ? 'Hourly' : 'Per Diem'}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setNewEmployee(prev => ({
                          ...prev,
                          clientPayTypeRelationships: prev.clientPayTypeRelationships?.filter(r => r.id !== relationship.id) || []
                        }));
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                  
                  <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                    <FormControl sx={{ minWidth: 200 }}>
                      <InputLabel>Client</InputLabel>
                      <Select
                        value={relationship.clientId}
                        onChange={(e) => {
                          const clientId = e.target.value;
                          const client = clients.find(c => c.id === clientId);
                          setNewEmployee(prev => ({
                            ...prev,
                            clientPayTypeRelationships: prev.clientPayTypeRelationships?.map(r => 
                              r.id === relationship.id 
                                ? { ...r, clientId, clientName: client?.name || '' }
                                : r
                            ) || []
                          }));
                        }}
                        label="Client"
                      >
                        {filteredClients.map(client => (
                          <MenuItem key={client.id} value={client.id}>
                            {client.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    
                    <FormControl sx={{ minWidth: 150 }}>
                      <InputLabel>Pay Type</InputLabel>
                      <Select
                        value={relationship.payType}
                        onChange={(e) => {
                          setNewEmployee(prev => ({
                            ...prev,
                            clientPayTypeRelationships: prev.clientPayTypeRelationships?.map(r => 
                              r.id === relationship.id 
                                ? { ...r, payType: e.target.value as 'hourly' | 'perdiem' }
                                : r
                            ) || []
                          }));
                        }}
                        label="Pay Type"
                      >
                        <MenuItem value="hourly">Hourly</MenuItem>
                        <MenuItem value="perdiem">Per Diem</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>
                  
                  {/* Pay Rate - Only show for hourly relationships */}
                  {relationship.payType === 'hourly' && (
                    <TextField
                      label="Pay Rate (per hour)"
                      type="number"
                      value={relationship.payRate || ''}
                      onChange={(e) => {
                        setNewEmployee(prev => ({
                          ...prev,
                          clientPayTypeRelationships: prev.clientPayTypeRelationships?.map(r => 
                            r.id === relationship.id 
                              ? { ...r, payRate: e.target.value }
                              : r
                          ) || []
                        }));
                      }}
                      sx={{ mb: 1 }}
                    />
                  )}
                  
                  <FormControlLabel
                    control={
                      <Switch
                        checked={relationship.active}
                        onChange={(e) => {
                          setNewEmployee(prev => ({
                            ...prev,
                            clientPayTypeRelationships: prev.clientPayTypeRelationships?.map(r => 
                              r.id === relationship.id 
                                ? { ...r, active: e.target.checked }
                                : r
                          ) || []
                        }));
                      }}
                      />
                    }
                    label="Active"
                  />
                </Box>
              ))}
            </Box>
          )}
          
          {/* ✅ Start Date outside Select */}
          <TextField
            label="Start Date"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={newEmployee.startDate}
            onChange={(e) => setNewEmployee({ ...newEmployee, startDate: e.target.value })}
          />
          

          {!selectedCompanyId && (
            <FormControl fullWidth>
              <InputLabel>Companies</InputLabel>
              <Select
                multiple
                value={newEmployee.companyIds}
                onChange={(e) => setNewEmployee({ ...newEmployee, companyIds: e.target.value as string[] })}
                renderValue={(selected) => (selected as string[]).map(id => getCompanyName(id)).join(', ')}
              >
                {companies.map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAdd(false)}>Cancel</Button>
          <Button onClick={handleAdd} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
      )}

      {/* Edit Dialog */}
      <Dialog open={openEdit} onClose={() => setOpenEdit(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Employee</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Name"
            variant="outlined"
            fullWidth
            value={editEmployee.name}
            onChange={(e) => setEditEmployee({ ...editEmployee, name: e.target.value })}
            InputLabelProps={{ shrink: true, sx: { fontWeight: 'bold' } }}
          />
          <TextField
            label="Address"
            variant="outlined"
            fullWidth
            value={editEmployee.address}
            onChange={(e) => setEditEmployee({ ...editEmployee, address: e.target.value })}
            InputLabelProps={{ shrink: true, sx: { fontWeight: 'bold' } }}
          />
          <TextField
            label="Position"
            variant="outlined"
            fullWidth
            value={editEmployee.position}
            onChange={(e) => setEditEmployee({ ...editEmployee, position: e.target.value })}
            InputLabelProps={{ shrink: true, sx: { fontWeight: 'bold' } }}
          />
          {/* Simple vs Multiple Clients Selection */}
          <FormControlLabel
            control={
              <Checkbox
                checked={editEmployee.hasMultipleClients || false}
                onChange={(e) => {
                  const hasMultiple = e.target.checked;
                  setEditEmployee(prev => ({
                    ...prev,
                    hasMultipleClients: hasMultiple,
                    // Clear relationships if switching to simple mode
                    clientPayTypeRelationships: hasMultiple ? prev.clientPayTypeRelationships : [],
                    // Set default pay types if switching to simple mode
                    payTypes: hasMultiple ? prev.payTypes : ['hourly']
                  }));
                }}
              />
            }
            label="This person works for multiple clients with different pay types"
          />

          {/* Simple Mode - Single Client */}
          {!editEmployee.hasMultipleClients && (
            <>
              <FormControl fullWidth variant="outlined">
                <InputLabel sx={{ fontWeight: 'bold' }}>Pay Types</InputLabel>
                <Select
                  multiple
                  value={editEmployee.payTypes || [editEmployee.payType]}
                  onChange={(e) => {
                    const selectedTypes = e.target.value as string[];
                    setEditEmployee({ 
                      ...editEmployee, 
                      payTypes: selectedTypes,
                      payType: selectedTypes[0] || 'hourly'
                    });
                  }}
                  label="Pay Types"
                  renderValue={(selected) => (selected as string[]).map(type => 
                    type === 'hourly' ? 'Hourly' : 'Per Diem'
                  ).join(', ')}
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 200
                      }
                    }
                  }}
                >
                  <MenuItem value="hourly">
                    <Checkbox checked={(editEmployee.payTypes || [editEmployee.payType]).indexOf('hourly') > -1} />
                    <ListItemText primary="Hourly" />
                  </MenuItem>
                  <MenuItem value="perdiem">
                    <Checkbox checked={(editEmployee.payTypes || [editEmployee.payType]).indexOf('perdiem') > -1} />
                    <ListItemText primary="Per Diem" />
                  </MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth variant="outlined">
                <InputLabel sx={{ fontWeight: 'bold' }}>Client</InputLabel>
                <Select
                  value={editEmployee.clientId || ''}
                  onChange={(e) => setEditEmployee({ ...editEmployee, clientId: e.target.value })}
                  label="Client"
                >
                  <MenuItem value="">No Client</MenuItem>
                  {filteredClients.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              {/* Pay Rate for Hourly Pay Type */}
              {editEmployee.payTypes.includes('hourly') && (
                <TextField
                  label="Pay Rate (per hour)"
                  variant="outlined"
                  fullWidth
                  type="number"
                  value={editEmployee.payRate}
                  onChange={(e) => setEditEmployee({ ...editEmployee, payRate: e.target.value })}
                  InputLabelProps={{ shrink: true, sx: { fontWeight: 'bold' } }}
                  InputProps={{ inputProps: { min: 0, step: 0.01 } }}
                />
              )}
            </>
          )}
          
          {/* Client-Pay Type Relationships */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ mb: 2, fontSize: '1rem' }}>
              Client-Pay Type Relationships
              <Button
                startIcon={<AddIcon />}
                onClick={() => {
                  const newRelationship: ClientPayTypeRelationship = {
                    id: Date.now().toString(),
                    clientId: '',
                    clientName: '',
                    payType: 'hourly',
                    payRate: editEmployee.payRate || '17', // Default to current pay rate
                    active: true
                  };
                  setEditEmployee(prev => ({
                    ...prev,
                    clientPayTypeRelationships: [...(prev.clientPayTypeRelationships || []), newRelationship]
                  }));
                }}
                sx={{ ml: 2 }}
                size="small"
                variant="outlined"
              >
                Add Relationship
              </Button>
            </Typography>
            
            {editEmployee.clientPayTypeRelationships?.map((relationship, index) => (
              <Box key={relationship.id} sx={{ mb: 2, p: 2, border: '1px solid #ddd', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2">Relationship {index + 1}</Typography>
                  <IconButton
                    size="small"
                    onClick={() => {
                      setEditEmployee(prev => ({
                        ...prev,
                        clientPayTypeRelationships: prev.clientPayTypeRelationships?.filter(r => r.id !== relationship.id) || []
                      }));
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
                
                <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                  <FormControl sx={{ minWidth: 200 }}>
                    <InputLabel>Client</InputLabel>
                    <Select
                      value={relationship.clientId}
                      onChange={(e) => {
                        const clientId = e.target.value;
                        const client = clients.find(c => c.id === clientId);
                        setEditEmployee(prev => ({
                          ...prev,
                          clientPayTypeRelationships: prev.clientPayTypeRelationships?.map(r => 
                            r.id === relationship.id 
                              ? { ...r, clientId, clientName: client?.name || '' }
                              : r
                          ) || []
                        }));
                      }}
                      label="Client"
                    >
                      {filteredClients.map(client => (
                        <MenuItem key={client.id} value={client.id}>
                          {client.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  
                  <FormControl sx={{ minWidth: 150 }}>
                    <InputLabel>Pay Type</InputLabel>
                    <Select
                      value={relationship.payType}
                      onChange={(e) => {
                        setEditEmployee(prev => ({
                          ...prev,
                          clientPayTypeRelationships: prev.clientPayTypeRelationships?.map(r => 
                            r.id === relationship.id 
                              ? { ...r, payType: e.target.value as 'hourly' | 'perdiem' }
                              : r
                          ) || []
                        }));
                      }}
                      label="Pay Type"
                    >
                      <MenuItem value="hourly">Hourly</MenuItem>
                      <MenuItem value="perdiem">Per Diem</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
                
                {/* Pay Rate for Hourly Relationships */}
                {relationship.payType === 'hourly' && (
                  <TextField
                    label="Pay Rate (per hour)"
                    type="number"
                    value={relationship.payRate || ''}
                    onChange={(e) => {
                      setEditEmployee(prev => ({
                        ...prev,
                        clientPayTypeRelationships: prev.clientPayTypeRelationships?.map(r => 
                          r.id === relationship.id 
                            ? { ...r, payRate: e.target.value }
                            : r
                        ) || []
                      }));
                    }}
                    sx={{ mt: 1 }}
                    InputProps={{ inputProps: { min: 0, step: 0.01 } }}
                  />
                )}
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={relationship.active}
                      onChange={(e) => {
                        setEditEmployee(prev => ({
                          ...prev,
                          clientPayTypeRelationships: prev.clientPayTypeRelationships?.map(r => 
                            r.id === relationship.id 
                              ? { ...r, active: e.target.checked }
                              : r
                          ) || []
                        }));
                      }}
                    />
                  }
                  label="Active"
                />
              </Box>
            ))}
          </Box>
          
          {/* ✅ Edit Start Date */}
          <TextField
            label="Start Date"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={editEmployee.startDate}
            onChange={(e) => setEditEmployee({ ...editEmployee, startDate: e.target.value })}
          />
          {editEmployee.payType === 'hourly' && (
            <TextField
              label="Pay Rate (per hour)"
              variant="outlined"
              fullWidth
              type="number"
              value={editEmployee.payRate}
              onChange={(e) => setEditEmployee({ ...editEmployee, payRate: e.target.value })}
              InputLabelProps={{ shrink: true, sx: { fontWeight: 'bold' } }}
            />
          )}
          <FormControl fullWidth variant="outlined">
            <InputLabel sx={{ fontWeight: 'bold' }}>Company</InputLabel>
            <Select
              value={editEmployee.companyId}
              onChange={(e) => setEditEmployee({ ...editEmployee, companyId: e.target.value })}
              label="Company"
            >
              <MenuItem value="">No Company</MenuItem>
              {companies.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button color="error" onClick={handleDeleteEmployee} sx={{ mr: 'auto' }}>
            Delete
          </Button>
          <Button onClick={() => setOpenEdit(false)}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained">
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Profile Dialog */}
      <Dialog
  open={profileOpen}
  onClose={() => setProfileOpen(false)}
  maxWidth="md"
  fullWidth
  PaperProps={{
    sx: {
      width: '700px',
      maxWidth: '90%',
    },
  }}
>

        <DialogTitle>Employee Profile</DialogTitle>
        <DialogContent>
          {profileEdit && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 2 }}>
            <Avatar sx={{ width: 80, height: 80, mb: 2 }}>
              {profileEdit && profileEdit.name ? String(profileEdit.name[0]).toUpperCase() : '?'}
            </Avatar>
          
            <Box sx={{ width: '100%', maxWidth: 600 }}>
              <TextField
                fullWidth
                label="Name"
                value={profileEdit.name || ''}
                onChange={e => setProfileEdit({ ...profileEdit, name: e.target.value })}
                disabled={currentRole !== 'admin'}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Position"
                value={profileEdit.position || ''}
                onChange={e => setProfileEdit({ ...profileEdit, position: e.target.value })}
                disabled={currentRole !== 'admin'}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Address"
                value={profileEdit.address || ''}
                onChange={e => setProfileEdit({ ...profileEdit, address: e.target.value })}
                disabled={currentRole !== 'admin'}
                sx={{ mb: 2 }}
              />
              {(profileEdit.payTypes && profileEdit.payTypes.includes('hourly')) && (
                <TextField
                  fullWidth
                  label="Pay Rate (per hour)"
                  type="number"
                  value={profileEdit.payRate || ''}
                  onChange={e => setProfileEdit({ ...profileEdit, payRate: e.target.value })}
                  disabled={currentRole !== 'admin'}
                  sx={{ mb: 2 }}
                />
              )}
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Pay Types</InputLabel>
                <Select
                  multiple
                  value={profileEdit.payTypes || [profileEdit.payType]}
                  onChange={(e) => {
                    const selectedTypes = e.target.value as string[];
                    setProfileEdit({ 
                      ...profileEdit, 
                      payTypes: selectedTypes,
                      payType: selectedTypes[0] || 'hourly'
                    });
                  }}
                  disabled={currentRole !== 'admin'}
                  renderValue={(selected) => (selected as string[]).map(type => 
                    type === 'hourly' ? 'Hourly' : 'Per Diem'
                  ).join(', ')}
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 200
                      }
                    }
                  }}
                >
                  <MenuItem value="hourly">
                    <Checkbox checked={(profileEdit.payTypes || [profileEdit.payType]).indexOf('hourly') > -1} />
                    <ListItemText primary="Hourly" />
                  </MenuItem>
                  <MenuItem value="perdiem">
                    <Checkbox checked={(profileEdit.payTypes || [profileEdit.payType]).indexOf('perdiem') > -1} />
                    <ListItemText primary="Per Diem" />
                  </MenuItem>
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="Start Date"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={profileEdit.startDate || ''}
                onChange={e => setProfileEdit({ ...profileEdit, startDate: e.target.value })}
                disabled={currentRole !== 'admin'}
                sx={{ mb: 2 }}
              />
              <Typography variant="body2" sx={{ mb: 1 }}>
                <b>Company:</b> {getCompanyName(profileEdit.companyId)}
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                <b>Client:</b> {(() => {
                  // If employee has a specific clientId, show that client
                  if (profileEdit.clientId) {
                    return getClientName(profileEdit.clientId);
                  }
                  // Otherwise, show all clients associated with the employee's company
                  const employeeCompanyId = profileEdit.companyId;
                  if (employeeCompanyId) {
                    const companyClients = clients.filter(c => 
                      c.companyIds && c.companyIds.includes(employeeCompanyId)
                    );
                    if (companyClients.length > 0) {
                      return companyClients.map(c => c.name).join(', ');
                    }
                  }
                  return 'N/A';
                })()}
              </Typography>
              <FormControlLabel
  control={
    <Switch
      checked={!!profileEdit.active}
      onChange={e => setProfileEdit({ ...profileEdit, active: e.target.checked })}
      disabled={currentRole !== 'admin'}
      color="primary"
    />
  }
  label={
    <Typography sx={{ fontWeight: 'bold', color: profileEdit.active ? 'green' : 'red', display: 'flex', alignItems: 'center', gap: 1 }}>
      {profileEdit.active ? '✅ Active' : '❌ Inactive'}
    </Typography>
  }
  sx={{ mt: 1 }}
/>


            </Box>
            <DialogContent>
  {profileEdit && (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 2 }}>
        ...
      </Box>

      {profileChecks.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>Paycheck History</Typography>
          <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead style={{ backgroundColor: '#f5f5f5', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px', fontWeight: 'bold', borderBottom: '2px solid #ddd' }}>Check #</th>
                  <th style={{ textAlign: 'left', padding: '12px', fontWeight: 'bold', borderBottom: '2px solid #ddd' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '12px', fontWeight: 'bold', borderBottom: '2px solid #ddd' }}>Amount</th>
                  <th style={{ textAlign: 'left', padding: '12px', fontWeight: 'bold', borderBottom: '2px solid #ddd' }}>Reviewed</th>
                  <th style={{ textAlign: 'left', padding: '12px', fontWeight: 'bold', borderBottom: '2px solid #ddd' }}>Paid</th>
                </tr>
              </thead>
              <tbody>
                {profileChecks.map((check) => (
                  <tr key={check.id} style={{ borderBottom: '1px solid #eee', backgroundColor: check.reviewed ? '#f8fff8' : '#fff' }}>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>
                      {check.checkNumber || 'N/A'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {check.date?.toDate ? check.date.toDate().toLocaleDateString() : 'N/A'}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>${check.amount ?? '0.00'}</td>
                    <td style={{ padding: '12px' }}>
                      {check.reviewed ? '✅ Reviewed' : '⏳ Pending'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {check.paid ? '✅ Paid' : '🕒 Unpaid'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </Box>
      )}
    </>
  )}
</DialogContent>

          </Box>
          
          )}
        </DialogContent>
        <DialogActions>
          {currentRole === 'admin' && (
            <Button
              onClick={async () => {
                if (!profileEdit) return;
                await updateDoc(doc(db, 'employees', profileEdit.id), profileEdit);
                setEmployees(prev => prev.map(emp => emp.id === profileEdit.id ? { ...emp, ...profileEdit } : emp));
                setProfileEmployee({ ...profileEdit });
                setProfileOpen(false);
              }}
              variant="contained"
            >
              Save
            </Button>
          )}
          <Button onClick={() => setProfileOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Employees;
