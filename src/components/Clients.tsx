import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Typography,
  MenuItem,
  Select,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Card,
  Autocomplete,
  CardContent,
  Divider,
  Chip,
  IconButton,
  Tooltip,
  Badge,
  Avatar,
  Paper,
  Snackbar,
  Alert,
} from "@mui/material";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { InputLabel, FormControl } from '@mui/material';
import {
  Business,
  Person,
  Email,
  Phone,
  LocationOn,
  Edit,
  Visibility,
  Add,
  FilterList,
  CheckCircle,
  Cancel,
  BusinessCenter,
} from '@mui/icons-material';

import { db } from "../firebase";
import { collection, addDoc, getDocs, updateDoc, doc } from "firebase/firestore";
import { logger } from '../utils/logger';

interface Client {
  id: string;
  name: string;
  address?: string;
  division?: string;  // Add division field
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  companyIds?: string[]; // ✅ store multiple company IDs
  active: boolean;
  payPeriodStartDay?: 'monday' | 'sunday'; // Day the pay period starts
  payPeriodFrequency?: 'weekly' | 'biweekly'; // How often they pay
}

interface Company {
  id: string;
  name: string;
  address?: string;
  divisions?: string[];
}

interface ClientsProps {
  companyIds: string[];
  currentRole: string;
  visibleClientIds: string[]; // IDs of clients this user can see
}

const Clients: React.FC<ClientsProps> = ({ companyIds, currentRole, visibleClientIds }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filter, setFilter] = useState("Active");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");

  // Dialog states
  const [openForm, setOpenForm] = useState(false);
  const [openDetails, setOpenDetails] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isEditingDetails, setIsEditingDetails] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    division: "",  // Add division field
    contactPerson: "",
    contactEmail: "",
    contactPhone: "",
    companyIds: [] as string[],
    payPeriodStartDay: 'monday' as 'monday' | 'sunday',
    payPeriodFrequency: 'weekly' as 'weekly' | 'biweekly',
  });

  // Notification state
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error' | 'warning' | 'info'>('success');

  // Show notification function
  const showNotification = (message: string, severity: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      const clientSnap = await getDocs(collection(db, "clients"));
      const clientList: Client[] = clientSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        address: d.data().address,
        division: d.data().division,  // Add division field
        contactPerson: d.data().contactPerson,
        contactEmail: d.data().contactEmail,
        contactPhone: d.data().contactPhone,
        companyIds: d.data().companyId || d.data().companyIds || [],
        active: d.data().active ?? true,
        payPeriodStartDay: d.data().payPeriodStartDay || 'monday',
        payPeriodFrequency: d.data().payPeriodFrequency || 'weekly',
      }));
      setClients(clientList);

      const companySnap = await getDocs(collection(db, "companies"));
      const companyList: Company[] = companySnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        address: d.data().address,
        divisions: d.data().divisions || [],
      }));
      setCompanies(companyList);
    };
    fetchData();
  }, []);

  const handleSaveChanges = async () => {
    if (!selectedClient) return;
    
    try {
      // Update all client fields in Firestore
      await updateDoc(doc(db, "clients", selectedClient.id), {
        name: selectedClient.name,
        address: selectedClient.address || null,
        contactPerson: selectedClient.contactPerson || null,
        contactEmail: selectedClient.contactEmail || null,
        contactPhone: selectedClient.contactPhone || null,
        companyId: selectedClient.companyIds || [],
        division: selectedClient.division || null,
        payPeriodStartDay: selectedClient.payPeriodStartDay || 'monday',
        payPeriodFrequency: selectedClient.payPeriodFrequency || 'weekly',
      });
      
      // Update local state
      setClients((prev) =>
        prev.map((c) =>
          c.id === selectedClient.id ? selectedClient : c
        )
      );
      
      // Exit edit mode and show success notification
      setIsEditingDetails(false);
      showNotification('Client updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating client:', error);
      showNotification('Error updating client. Please try again.', 'error');
    }
  };

  const handleToggleActive = async (clientId: string, active: boolean) => {
    logger.log('🔍 handleToggleActive called!', {
      clientId,
      active,
      timestamp: new Date().toISOString()
    });
    
    try {
      await updateDoc(doc(db, "clients", clientId), { active });
      logger.log('✅ Database updated successfully');
      
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, active } : c))
      );
      logger.log('✅ State updated successfully');
    } catch (error) {
      console.error('❌ Error updating client status:', error);
    }
  };

  const handleOpenForm = () => {
    setFormData({
      name: "",
      address: "",
      division: "",  // Add division field
      contactPerson: "",
      contactEmail: "",
      contactPhone: "",
      companyIds: [],
      payPeriodStartDay: 'monday',
      payPeriodFrequency: 'weekly',
    });
    setOpenForm(true);
  };

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCompanyFilterChange = (companyId: string) => {
    setSelectedCompanyId(companyId);
    // Reset status filter to Active when changing company filter
    setFilter("Active");
  };

  const handleSaveClient = async () => {
    if (!formData.name.trim()) return;

    const newClient = {
      name: formData.name.trim(),
      address: formData.address.trim() || null,
      division: formData.division.trim() || null,  // Add division field
      contactPerson: formData.contactPerson.trim() || null,
      contactEmail: formData.contactEmail.trim() || null,
      contactPhone: formData.contactPhone.trim() || null,
      companyId: formData.companyIds,
      active: true,
      payPeriodStartDay: formData.payPeriodStartDay,
      payPeriodFrequency: formData.payPeriodFrequency,
    };

    await addDoc(collection(db, "clients"), newClient);
    setOpenForm(false);

    // Refresh the clients list
    const clientSnap = await getDocs(collection(db, "clients"));
    const clientList: Client[] = clientSnap.docs.map((d) => ({
      id: d.id,
      name: d.data().name,
      address: d.data().address,
      division: d.data().division,  // Add division field
      contactPerson: d.data().contactPerson,
      contactEmail: d.data().contactEmail,
      contactPhone: d.data().contactPhone,
      companyIds: d.data().companyId || [],
      active: d.data().active ?? true,
      payPeriodStartDay: d.data().payPeriodStartDay || 'monday',
      payPeriodFrequency: d.data().payPeriodFrequency || 'weekly',
    }));
    setClients(clientList);
  };

  // Open details dialog
  const handleOpenDetails = (client: Client) => {
    setSelectedClient(client);
    setOpenDetails(true);
  };

  // 🔒 SECURITY: Filter clients by visibleClientIds (for stats and display)
  const visibleClients = clients.filter((c) => {
    // Admins see all clients, managers/users only see their assigned clients
    if (currentRole !== 'admin' && visibleClientIds.length > 0) {
      return visibleClientIds.includes(c.id);
    }
    return true; // Admin sees all
  });

  // Clients filtered by company (for statistics - no status filter)
  const companyFilteredClients = visibleClients.filter((c) => {
    // Apply company filter
    if (selectedCompanyId !== "all") {
      return c.companyIds && c.companyIds.includes(selectedCompanyId);
    }
    return true;
  });

  const displayedClients = companyFilteredClients
    .filter((c) => {
      // Apply status filter - only show active or inactive
      return filter === "Inactive" ? !c.active : c.active;
    })
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  const getStatusColor = (active: boolean) => active ? 'success' : 'error';
  const getStatusIcon = (active: boolean) => active ? <CheckCircle /> : <Cancel />;

  return (
    <Box sx={{ p: 3 }}>
      {/* Header Section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" gutterBottom fontWeight="bold" sx={{ color: '#1976d2' }}>
         Departments
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Manage your department relationships and company assignments
        </Typography>
        {selectedCompanyId !== "all" && (
          <Typography variant="body2" color="primary" sx={{ mb: 2, fontStyle: 'italic' }}>
            Showing clients for: {companies.find(c => c.id === selectedCompanyId)?.name || 'Unknown Company'}
          </Typography>
        )}
      </Box>

      {/* Controls Section */}
      <Paper elevation={2} sx={{ p: 3, mb: 4, borderRadius: 3 }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <FilterList color="primary" />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Show Inactive
              </Typography>
              <Switch
                checked={filter === "Inactive"}
                onChange={(e) => setFilter(e.target.checked ? "Inactive" : "Active")}
                color="primary"
                size="small"
              />
            </Box>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <BusinessCenter color="primary" />
            <Select
              value={selectedCompanyId}
              onChange={(e) => handleCompanyFilterChange(e.target.value)}
              sx={{ minWidth: 200 }}
              size="small"
            >
              <MenuItem value="all">All Departments</MenuItem>
              {companies.map(company => (
                <MenuItem key={company.id} value={company.id}>
                  {company.name}
                </MenuItem>
              ))}
            </Select>
            {selectedCompanyId !== "all" && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleCompanyFilterChange("all")}
                sx={{ ml: 1 }}
              >
                Clear Filter
              </Button>
            )}
          </Box>

          <Box sx={{ ml: 'auto' }}>
            {currentRole === 'admin' && (
            <Button
              variant="contained"
              onClick={handleOpenForm}
              startIcon={<Add />}
              sx={{
                borderRadius: 2,
                px: 3,
                py: 1,
                textTransform: 'none',
                fontWeight: 'bold',
                boxShadow: 2,
                '&:hover': {
                  boxShadow: 4,
                  transform: 'translateY(-1px)',
                },
                transition: 'all 0.2s ease-in-out',
              }}
            >
              Create Department
            </Button>
            )}
          </Box>
        </Box>
      </Paper>

      {/* Stats Section */}
      <Box sx={{ mb: 4 }}>
        {/* Filter Summary */}
        {(selectedCompanyId !== "all" || filter !== "Active") && (
          <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 2, border: '1px solid', borderColor: 'grey.300' }}>
            <Typography variant="body2" color="text.secondary">
              🔍 Active Filters: 
              {selectedCompanyId !== "all" && (
                <Chip 
                  label={`Company: ${companies.find(c => c.id === selectedCompanyId)?.name || 'Unknown'}`} 
                  size="small" 
                  color="primary" 
                  sx={{ ml: 1, mr: 1 }}
                />
              )}
              {filter !== "Active" && (
                <Chip 
                  label={`Status: ${filter}`} 
                  size="small" 
                  color="secondary" 
                  sx={{ ml: 1 }}
                />
              )}
            </Typography>
          </Box>
        )}
        
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          
          <Paper elevation={2} sx={{ p: 3, borderRadius: 3, textAlign: 'center', minWidth: 200, flex: 1 }}>
            <Typography variant="h4" fontWeight="bold" color="success.main">
              {companyFilteredClients.filter(c => c.active).length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Active Departments
            </Typography>
          </Paper>
          <Paper elevation={2} sx={{ p: 3, borderRadius: 3, textAlign: 'center', minWidth: 200, flex: 1 }}>
            <Typography variant="h4" fontWeight="bold" color="error.main">
              {companyFilteredClients.filter(c => !c.active).length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Inactive Departments
            </Typography>
          </Paper>
          <Paper elevation={2} sx={{ p: 3, borderRadius: 3, textAlign: 'center', minWidth: 200, flex: 1 }}>
            <Typography variant="h4" fontWeight="bold" color="info.main">
              {companyFilteredClients.filter(c => c.companyIds && c.companyIds.length > 0).length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Linked to Companies
            </Typography>
          </Paper>
        </Box>
      </Box>

      {/* Clients Grid */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {displayedClients.map((client) => (
          <Box key={client.id} sx={{ width: { xs: '100%', sm: 'calc(50% - 12px)', md: 'calc(33.333% - 16px)', lg: 'calc(25% - 18px)' } }}>
            <Card
              elevation={3}
              sx={{
                height: '100%',
                borderRadius: 3,
                cursor: 'pointer',
                transition: 'all 0.3s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: 8,
                },
                border: client.active ? '2px solid #2e7d32' : '2px solid #f44336',
              }}
              onClick={() => handleOpenDetails(client)}
            >
              <CardContent sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Avatar
                    sx={{
                      bgcolor: client.active ? 'success.main' : 'error.main',
                      width: 40,
                      height: 40,
                    }}
                  >
                    <Business />
                  </Avatar>
                  <Chip
                    icon={getStatusIcon(client.active)}
                    label={client.active ? 'Active' : 'Inactive'}
                    color={getStatusColor(client.active)}
                    size="small"
                    sx={{ fontWeight: 'bold' }}
                  />
                </Box>

                {/* Division (Client) - Now on top */}
                {client.division && (
                  <Typography 
                    variant="body1" 
                    sx={{ 
                      mb: 1, 
                      fontWeight: 'bold',
                      color: '#2e7d32'
                    }}
                  >
                    Client: {client.division}
                  </Typography>
                )}

                {/* Department Name - Now below in blue */}
                <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ color: '#1976d2' }}>
                  {client.name}
                </Typography>

                {/* Company Status */}
                <Box sx={{ mb: 2 }}>
                  {client.companyIds && client.companyIds.length > 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Chip
                        icon={<BusinessCenter />}
                        label={`${client.companyIds.length} Company${client.companyIds.length > 1 ? 'ies' : 'y'} Linked`}
                        color="info"
                        variant="outlined"
                        size="small"
                      />
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {client.companyIds
                          .map((companyId) => {
                            const company = companies.find(c => c.id === companyId);
                            return company;
                          })
                          .filter(Boolean)
                          .sort((a, b) => a!.name.toLowerCase().localeCompare(b!.name.toLowerCase()))
                          .map((company) => (
                            <Typography 
                              key={company!.id} 
                              component="div"
                              variant="body2" 
                              color="text.primary"
                              sx={{ 
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                pl: 1,
                                lineHeight: 1.2
                              }}
                            >
                              • {company!.name}
                            </Typography>
                          ))}
                      </Box>
                    </Box>
                  ) : (
                    <Chip
                      label="No Companies Linked"
                      color="default"
                      variant="outlined"
                      size="small"
                    />
                  )}
                </Box>

                {/* Contact Info Preview */}
                <Box sx={{ mb: 2 }}>
                  {client.contactPerson && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Person fontSize="small" color="action" />
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {client.contactPerson}
                      </Typography>
                    </Box>
                  )}
                  {client.contactEmail && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Email fontSize="small" color="action" />
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {client.contactEmail}
                      </Typography>
                    </Box>
                  )}
                  {client.address && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LocationOn fontSize="small" color="action" />
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {client.address}
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Actions - Aligned to bottom */}
                <Box 
                  sx={{ 
                    mt: 'auto', 
                    py: 1.5, 
                    px: 2,
                    mx: -3,
                    borderTop: '1px solid #e0e0e0', 
                    backgroundColor: '#f9f9f9',
                    borderRadius: '0 0 12px 12px',
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    marginBottom: '-24px'
                  }}
                >
                  <Box 
                    onClick={(e) => {
                      logger.log('🔍 Box clicked - preventing propagation');
                      e.preventDefault();
                      e.stopPropagation();
                      (e.nativeEvent as Event).stopImmediatePropagation?.();
                    }}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5 }}
                  >
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontWeight: 'bold',
                        color: client.active ? '#2e7d32' : '#f44336',
                        userSelect: 'none'
                      }}
                    >
                      {client.active ? 'Active' : 'Inactive'}
                    </Typography>
                    <Switch
                      checked={client.active}
                      onClick={(e) => {
                        logger.log('🔍 Switch clicked - allowing default behavior');
                        e.stopPropagation();
                        (e.nativeEvent as Event).stopImmediatePropagation?.();
                      }}
                      onChange={(e) => {
                        logger.log('🔍 Switch onChange triggered!', {
                          checked: e.target.checked,
                          clientId: client.id,
                          clientName: client.name,
                          currentActive: client.active
                        });
                        handleToggleActive(client.id, e.target.checked);
                        // Show floating message
                        const status = e.target.checked ? 'active' : 'inactive';
                        let companyText = 'all companies';
                        if (client.companyIds && client.companyIds.length > 0) {
                          const linkedCompanies = companies.filter(comp => client.companyIds!.includes(comp.id));
                          if (linkedCompanies.length === 1) {
                            companyText = linkedCompanies[0].name;
                          } else if (linkedCompanies.length > 1) {
                            companyText = `${linkedCompanies.length} companies`;
                          }
                        }
                        showNotification(`Client "${client.name}" set as ${status} for ${companyText}`, 'success');
                      }}
                      size="small"
                    />
                  </Box>

                </Box>
              </CardContent>
            </Card>
          </Box>
        ))}
      </Box>

      {/* Empty State */}
      {displayedClients.length === 0 && (
        <Paper elevation={2} sx={{ p: 8, textAlign: 'center', borderRadius: 3 }}>
          <Business sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No clients found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {filter === "All" 
              ? "Get started by creating your first client"
              : `No ${filter.toLowerCase()} clients found`
            }
          </Typography>
          {filter === "All" && currentRole === 'admin' && (
            <Button
              variant="contained"
              onClick={handleOpenForm}
              startIcon={<Add />}
              sx={{ borderRadius: 2, px: 3 }}
            >
              Create Your First Client
            </Button>
          )}
        </Paper>
      )}

      {/* Dialog for creating a client */}
      <Dialog open={openForm} onClose={() => setOpenForm(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Add color="primary" />
            <Typography variant="h6" fontWeight="bold">
              Create New Department
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField
            label="Department Name"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            fullWidth
            required
          />
          <Autocomplete
            multiple
            
            options={companies}
            getOptionLabel={(option) => option.name}
            onChange={(e, newValues) => {
              handleChange(
                "companyIds",
                newValues.map((v) => v.id)
              );
              
            }}
            renderInput={(params) => (
              <TextField {...params} label="Assign Companies" variant="outlined" required />
            )}
            
          />
          <Autocomplete
            options={(() => {
              // Only show divisions if companies are selected
              if (formData.companyIds.length === 0) return [];
              
              // Get divisions from selected companies only
              const selectedCompanies = companies.filter(c => 
                formData.companyIds.includes(c.id)
              );
              const allDivisions: string[] = [];
              selectedCompanies.forEach(company => {
                if (company.divisions) {
                  allDivisions.push(...company.divisions);
                }
              });
              
              // Get divisions from clients that belong to the selected companies
              const clientDivisions = clients
                .filter(client => 
                  client.division && 
                  client.companyIds?.some(cId => formData.companyIds.includes(cId))
                )
                .map(client => client.division!);
              
              // Combine and deduplicate
              return Array.from(new Set([...allDivisions, ...clientDivisions]));
            })()}
            freeSolo
            disabled={formData.companyIds.length === 0}
            value={formData.division || null}
            onChange={(e, newValue) => handleChange("division", newValue || "")}
            renderInput={(params) => (
              <TextField 
                {...params} 
                label="Client" 
                variant="outlined"
                helperText={formData.companyIds.length === 0 ? "Please select a company first" : ""}
              />
            )}
          />
          <TextField
            label="Address"
            value={formData.address}
            onChange={(e) => handleChange("address", e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
          
          <TextField
            label="Contact Person"
            value={formData.contactPerson}
            onChange={(e) => handleChange("contactPerson", e.target.value)}
            fullWidth
          />
          <TextField
            label="Contact Email"
            value={formData.contactEmail}
            onChange={(e) => handleChange("contactEmail", e.target.value)}
            fullWidth
            type="email"
          />
          <TextField
            label="Contact Phone"
            value={formData.contactPhone}
            onChange={(e) => handleChange("contactPhone", e.target.value)}
            fullWidth
            type="tel"
          />

          <Divider sx={{ my: 2 }} />
          
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
            Pay Period Configuration
          </Typography>
          
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Pay Period Start Day</InputLabel>
            <Select
              value={formData.payPeriodStartDay}
              onChange={(e) => handleChange("payPeriodStartDay", e.target.value)}
              label="Pay Period Start Day"
            >
              <MenuItem value="monday">Monday (Monday-Sunday)</MenuItem>
              <MenuItem value="sunday">Sunday (Sunday-Saturday)</MenuItem>
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Pay Frequency</InputLabel>
            <Select
              value={formData.payPeriodFrequency}
              onChange={(e) => handleChange("payPeriodFrequency", e.target.value)}
              label="Pay Frequency"
            >
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="biweekly">Bi-Weekly (Every 2 weeks)</MenuItem>
            </Select>
          </FormControl>
          
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button 
            onClick={() => setOpenForm(false)}
            sx={{ borderRadius: 2, px: 3 }}
          >
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={handleSaveClient}
            disabled={!formData.name.trim()}
            sx={{ borderRadius: 2, px: 3 }}
          >
            Save Client
          </Button>
        </DialogActions>
      </Dialog>

      {/* Floating details dialog */}
      <Dialog
        open={openDetails}
        onClose={() => {
          setOpenDetails(false);
          setIsEditingDetails(false);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle fontWeight="bold">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Business color="primary" />
            Client & Company Details
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedClient && (
            <Card sx={{ mb: 3, p: 2, backgroundColor: "#f9f9f9" }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">
                    Client Info
                  </Typography>
                  {currentRole === 'admin' && !isEditingDetails && (
                    <Button
                      startIcon={<Edit />}
                      size="small"
                      onClick={() => setIsEditingDetails(true)}
                      sx={{ borderRadius: 2 }}
                    >
                      Edit
                    </Button>
                  )}
                  {currentRole === 'admin' && isEditingDetails && (
                    <Button
                      size="small"
                      onClick={() => {
                        setIsEditingDetails(false);
                        // Reset to original values if needed
                      }}
                      sx={{ borderRadius: 2 }}
                    >
                      Cancel
                    </Button>
                  )}
                </Box>
                <Divider sx={{ mb: 2 }} />
                
                {!isEditingDetails ? (
                  // Read-only view
                  <>
                    <Typography sx={{ mb: 1 }}>Name: {selectedClient.name}</Typography>
                    <Typography sx={{ mb: 1 }}>Address: {selectedClient.address || "N/A"}</Typography>
                    <Typography sx={{ mb: 1 }}>
                      Client: {selectedClient.division || "N/A"}
                    </Typography>
                    <Typography sx={{ mb: 1 }}>
                      Contact Person: {selectedClient.contactPerson || "N/A"}
                    </Typography>
                    <Typography sx={{ mb: 1 }}>
                      Email: {selectedClient.contactEmail || "N/A"}
                    </Typography>
                    <Typography sx={{ mb: 1 }}>
                      Phone: {selectedClient.contactPhone || "N/A"}
                    </Typography>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                      Pay Period Configuration
                    </Typography>
                    <Typography sx={{ mb: 1 }}>
                      Start Day: {selectedClient.payPeriodStartDay === 'sunday' ? 'Sunday (Sunday-Saturday)' : 'Monday (Monday-Sunday)'}
                    </Typography>
                    <Typography sx={{ mb: 1 }}>
                      Frequency: {selectedClient.payPeriodFrequency === 'biweekly' ? 'Bi-Weekly (Every 2 weeks)' : 'Weekly'}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography>Status:</Typography>
                      <Chip
                        icon={getStatusIcon(selectedClient.active)}
                        label={selectedClient.active ? "Active" : "Inactive"}
                        color={getStatusColor(selectedClient.active)}
                        size="small"
                      />
                    </Box>
                  </>
                ) : (
                  // Edit mode (admin only)
                  <>
                    <TextField
                      fullWidth
                      label="Name"
                      value={selectedClient.name}
                      onChange={(e) => setSelectedClient({ ...selectedClient, name: e.target.value })}
                      sx={{ mb: 2 }}
                      variant="outlined"
                    />
                    <TextField
                      fullWidth
                      label="Address"
                      value={selectedClient.address || ""}
                      onChange={(e) => setSelectedClient({ ...selectedClient, address: e.target.value })}
                      sx={{ mb: 2 }}
                      variant="outlined"
                    />
                    <TextField
                      fullWidth
                      label="Contact Person"
                      value={selectedClient.contactPerson || ""}
                      onChange={(e) => setSelectedClient({ ...selectedClient, contactPerson: e.target.value })}
                      sx={{ mb: 2 }}
                      variant="outlined"
                    />
                    <TextField
                      fullWidth
                      label="Email"
                      type="email"
                      value={selectedClient.contactEmail || ""}
                      onChange={(e) => setSelectedClient({ ...selectedClient, contactEmail: e.target.value })}
                      sx={{ mb: 2 }}
                      variant="outlined"
                    />
                    <TextField
                      fullWidth
                      label="Phone"
                      value={selectedClient.contactPhone || ""}
                      onChange={(e) => setSelectedClient({ ...selectedClient, contactPhone: e.target.value })}
                      sx={{ mb: 2 }}
                      variant="outlined"
                    />
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                      Pay Period Configuration
                    </Typography>
                    <FormControl fullWidth sx={{ mb: 2 }}>
                      <InputLabel>Pay Period Start Day</InputLabel>
                      <Select
                        value={selectedClient.payPeriodStartDay || 'monday'}
                        onChange={(e) => setSelectedClient({ ...selectedClient, payPeriodStartDay: e.target.value as 'monday' | 'sunday' })}
                        label="Pay Period Start Day"
                      >
                        <MenuItem value="monday">Monday (Monday-Sunday)</MenuItem>
                        <MenuItem value="sunday">Sunday (Sunday-Saturday)</MenuItem>
                      </Select>
                    </FormControl>
                    <FormControl fullWidth sx={{ mb: 2 }}>
                      <InputLabel>Pay Frequency</InputLabel>
                      <Select
                        value={selectedClient.payPeriodFrequency || 'weekly'}
                        onChange={(e) => setSelectedClient({ ...selectedClient, payPeriodFrequency: e.target.value as 'weekly' | 'biweekly' })}
                        label="Pay Frequency"
                      >
                        <MenuItem value="weekly">Weekly</MenuItem>
                        <MenuItem value="biweekly">Bi-Weekly (Every 2 weeks)</MenuItem>
                      </Select>
                    </FormControl>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Typography>Status:</Typography>
                      <Chip
                        icon={getStatusIcon(selectedClient.active)}
                        label={selectedClient.active ? "Active" : "Inactive"}
                        color={getStatusColor(selectedClient.active)}
                        size="small"
                      />
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {selectedClient && (
            <Card sx={{ mb: 3, p: 2, backgroundColor: "#f9f9f9" }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Company Assignments
                </Typography>
                <Divider sx={{ mb: 1 }} />
                <Autocomplete
                  multiple
                  options={companies}
                  getOptionLabel={(option) => option.name}
                  value={companies.filter((c) =>
                    selectedClient.companyIds?.includes(c.id)
                  )}
                  onChange={(e, newValues) => {
                    setSelectedClient({
                      ...selectedClient,
                      companyIds: newValues.map((v) => v.id),
                    });
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="Assign Companies" variant="outlined" />
                  )}
                />
              </CardContent>
            </Card>
          )}

          {selectedClient && (
            <Card sx={{ mb: 3, p: 2, backgroundColor: "#f9f9f9" }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                 Client Assignment
                </Typography>
                <Divider sx={{ mb: 1 }} />
                <Autocomplete
                  options={(() => {
                    // Get divisions from associated companies
                    const companyDivisions: string[] = [];
                    if (selectedClient.companyIds) {
                      selectedClient.companyIds.forEach(companyId => {
                        const company = companies.find(c => c.id === companyId);
                        if (company && company.divisions) {
                          companyDivisions.push(...company.divisions);
                        }
                      });
                    }
                    
                    // Get divisions from ALL clients that belong to the same companies
                    const allClientDivisions: string[] = [];
                    if (selectedClient.companyIds) {
                      clients.forEach(client => {
                        // Check if this client belongs to any of the same companies
                        const hasSharedCompany = client.companyIds?.some(companyId => 
                          selectedClient.companyIds?.includes(companyId)
                        );
                        if (hasSharedCompany && client.division) {
                          allClientDivisions.push(client.division);
                        }
                      });
                    }
                    
                    // Combine all sources and deduplicate
                    const allDivisions = Array.from(new Set([
                      ...companyDivisions, 
                      ...allClientDivisions
                    ]));
                    return allDivisions;
                  })()}
                  getOptionLabel={(option) => option}
                  value={selectedClient.division || null}
                  onChange={(e, newValue) => {
                    setSelectedClient({
                      ...selectedClient,
                      division: newValue || undefined,
                    });
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="Select Client" variant="outlined" />
                  )}
                  renderOption={(props, option) => (
                    <Box component="li" {...props}>
                      <Typography>{option}</Typography>
                    </Box>
                  )}
                />
              </CardContent>
            </Card>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button 
            onClick={() => {
              setOpenDetails(false);
              setIsEditingDetails(false);
            }}
            sx={{ borderRadius: 2, px: 3 }}
          >
            Close
          </Button>
          {(isEditingDetails || currentRole === 'admin') && (
            <Button 
              variant="contained" 
              color="primary" 
              onClick={handleSaveChanges}
              sx={{ borderRadius: 2, px: 3 }}
            >
              Save Changes
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Floating Notification */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbarOpen(false)} 
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Clients;
