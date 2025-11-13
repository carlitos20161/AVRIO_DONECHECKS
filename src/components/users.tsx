import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc, // ✅ added setDoc
} from "firebase/firestore";
import { db, auth } from "../firebase"; // ✅ import auth
import { createUserWithEmailAndPassword, signOut } from "firebase/auth"; // ✅ import createUserWithEmailAndPassword
import {
  Paper,
  Typography,
  Button,
  ListItem,
  ListItemButton,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Box,
  Chip,
  FormControlLabel,
  Switch,
  Alert,
  Tooltip,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
} from "@mui/material";
import {
  Print,
  PrintDisabled,
  Security,
} from '@mui/icons-material';

interface Company {
  id: string;
  name: string;
}

interface Client {
  id: string;
  name: string;
  companyId: string | string[]; // Can be string or array of strings
  companyIds?: string[]; // Alternative field name
}

interface User {
  id: string;
  username: string;
  email?: string;
  password: string;
  role: string;
  active: boolean;
  companyIds?: string[];
  canPrintChecks?: boolean; // ✅ New field for check printing permission
  visibleClientIds?: string[]; // ✅ New field for client visibility
}

interface UsersPageProps {
  currentRole: string;
}

const UsersPage: React.FC<UsersPageProps> = ({ currentRole }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Create user dialog
  const [openForm, setOpenForm] = useState(false);
  const [email, setEmail] = useState(""); // ✅ added email
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [canPrintChecks, setCanPrintChecks] = useState(false); // ✅ New state for create form

  // Details dialog
  const [openDetails, setOpenDetails] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<string>("user");
  const [editCompanies, setEditCompanies] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [editCanPrintChecks, setEditCanPrintChecks] = useState(false); // ✅ New state for edit form
  const [editVisibleClients, setEditVisibleClients] = useState<string[]>([]);
  const [hasManuallyChangedVisibility, setHasManuallyChangedVisibility] = useState(false);
  
  // Helper function to check if a client belongs to any of the selected companies
  const clientBelongsToCompanies = (client: Client, companyIds: string[]): boolean => {
    // Handle both companyId (string) and companyIds (array) fields
    const clientCompanyIds = Array.isArray(client.companyId) 
      ? client.companyId 
      : client.companyIds || (client.companyId ? [client.companyId] : []);
    
    return companyIds.some(companyId => clientCompanyIds.includes(companyId));
  }; // ✅ New state for client visibility

  // Floating notification state
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error' | 'warning' | 'info'>('success');

  // fetch data
  const fetchAll = async () => {
    const snapUsers = await getDocs(collection(db, "users"));
    const uList: User[] = snapUsers.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        username: data.username,
        email: data.email || "",
        password: data.password,
        role: data.role,
        active: data.active ?? true,
        companyIds: Array.isArray(data.companyIds) ? data.companyIds : [],
        canPrintChecks: data.canPrintChecks ?? false, // ✅ Load printing permission
        visibleClientIds: Array.isArray(data.visibleClientIds) ? data.visibleClientIds : [], // ✅ Load client visibility
      };
    });
    setUsers(uList);

    const snapCompanies = await getDocs(collection(db, "companies"));
    const cList: Company[] = snapCompanies.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        name: data.name,
      };
    });
    setCompanies(cList);

    const snapClients = await getDocs(collection(db, "clients"));
    console.log('🔍 DEBUG Raw Firestore Client Data:', {
      totalDocs: snapClients.docs.length,
      sampleDoc: snapClients.docs[0] ? {
        id: snapClients.docs[0].id,
        data: snapClients.docs[0].data()
      } : null,
      sampleDocFields: snapClients.docs[0] ? Object.keys(snapClients.docs[0].data()) : [],
      sampleDocFieldNames: snapClients.docs[0] ? Object.keys(snapClients.docs[0].data()) : [],
      fieldNamesList: snapClients.docs[0] ? Object.keys(snapClients.docs[0].data()).join(', ') : 'none',
      allClientFields: snapClients.docs.map(d => ({ 
        id: d.id, 
        name: d.data().name,
        fields: Object.keys(d.data()),
        companyIds: d.data().companyIds,
        companyId: d.data().companyId,
        companies: d.data().companies
      }))
    });
    
        const clientList: Client[] = snapClients.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name,
            companyId: data.companyId || '', // Changed from companyIds to companyId
          };
        });
        console.log('🔍 DEBUG Fetched Clients:', {
          totalClients: clientList.length,
          clientsData: clientList.map(c => ({ id: c.id, name: c.name, companyId: c.companyId })),
          allClientCompanyIds: clientList.map(c => c.companyId).filter(id => id),
          uniqueClientCompanyIds: Array.from(new Set(clientList.map(c => c.companyId).filter(id => id))),
          sampleClient: clientList[0] // Show first client structure
        });
    setClients(clientList);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll().catch(console.error);
  }, []);

  // Auto-select all clients when companies are changed (but only if user has no saved visibility settings)
  useEffect(() => {
    if (!hasManuallyChangedVisibility && selectedUser) {
      const hasSavedVisibilitySettings = selectedUser.visibleClientIds && selectedUser.visibleClientIds.length > 0;
      
      // Only auto-select if user has no saved visibility settings
      if (!hasSavedVisibilitySettings) {
        if (editCompanies.length > 0) {
          const availableClients = clients.filter(client => 
            clientBelongsToCompanies(client, editCompanies)
          ).map(client => client.id);
      
      // Only update if the current selection doesn't match available clients
      const currentSelection = editVisibleClients.filter(id => availableClients.includes(id));
      if (currentSelection.length !== availableClients.length) {
            console.log('🔍 DEBUG: Auto-selecting all clients because user has no saved visibility settings');
        setEditVisibleClients(availableClients);
      }
    } else {
      setEditVisibleClients([]);
    }
      } else {
        console.log('🔍 DEBUG: User has saved visibility settings, not auto-selecting');
        // If user has saved visibility settings, ensure we're showing their saved settings
        // and not overriding them with auto-selection
        if (editVisibleClients.length === 0 && selectedUser.visibleClientIds && selectedUser.visibleClientIds.length > 0) {
          console.log('🔍 DEBUG: Restoring saved visibility settings:', selectedUser.visibleClientIds);
          setEditVisibleClients(selectedUser.visibleClientIds);
        }
      }
    }
  }, [editCompanies, clients, hasManuallyChangedVisibility, selectedUser]);

  // Separate effect to restore saved visibility settings when modal opens
  useEffect(() => {
    if (selectedUser && openDetails) {
      const hasSavedVisibilitySettings = selectedUser.visibleClientIds && selectedUser.visibleClientIds.length > 0;
      if (hasSavedVisibilitySettings && selectedUser.visibleClientIds) {
        console.log('🔍 DEBUG: Modal opened with saved visibility settings, restoring:', selectedUser.visibleClientIds);
        setEditVisibleClients(selectedUser.visibleClientIds);
      }
    }
  }, [selectedUser, openDetails]);

  // ✅ Updated to also create Auth user
  const handleSave = async () => {
    if (!email.trim() || !username.trim() || !password.trim()) {
      alert("Please enter email, username and password");
      return;
    }
    try {
      // 1. Create in Firebase Auth
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // 2. Save extra profile data in Firestore with UID as doc ID
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        email,
        username,
        // ✅ REMOVED password - Firebase Auth handles this securely
        role,
        active: true,
        companyIds,
        canPrintChecks, // ✅ Save printing permission
        createdAt: serverTimestamp(),
      });

      // 3. Sign out the newly created user immediately
      await auth.signOut();

      setOpenForm(false);
      setEmail("");
      setUsername("");
      setPassword("");
      setRole("user");
      setCompanyIds([]);
      setCanPrintChecks(false); // Reset new state
      fetchAll();
      showNotification("✅ User created successfully! They can now log in.", 'success');
    } catch (err: any) {
      console.error(err);
      showNotification("❌ Failed to create user: " + err.message, 'error');
    }
  };

  const showNotification = (message: string, severity: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  const handleOpenDetails = (user: User) => {
    setSelectedUser(user);
    setEditPassword(user.password);
    setEditRole(user.role); // ✅ Set role state
    setEditCompanies(user.companyIds || []);
    setEditActive(user.active);
    setEditCanPrintChecks(user.canPrintChecks ?? false); // Set new state for edit
    setEditVisibleClients(user.visibleClientIds || []); // ✅ Set client visibility state
    setHasManuallyChangedVisibility(false); // Reset manual change flag when opening user details
    setOpenDetails(true);
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    
    console.log('🔍 DEBUG handleUpdateUser:', {
      selectedUser: selectedUser,
      editVisibleClients: editVisibleClients,
      selectedUserVisibleClients: selectedUser.visibleClientIds || [],
      comparison: JSON.stringify(editVisibleClients) !== JSON.stringify(selectedUser.visibleClientIds || [])
    });
    
    // 🔒 SECURITY: Prevent managers from editing admin accounts
    if (currentRole === 'manager' && selectedUser.role === 'admin') {
      showNotification("❌ Managers cannot edit admin accounts", 'error');
      return;
    }
    
    try {
    // Only update fields that actually changed
    const updates: any = {};
    
    if (editPassword !== selectedUser.password) {
      // Only update password if it's not empty (user actually wants to change it)
      if (editPassword && editPassword.trim() !== '') {
        updates.password = editPassword;
      }
    }
      
      if (editRole !== selectedUser.role) {
        updates.role = editRole;
      }
    
    if (editActive !== selectedUser.active) {
      updates.active = editActive;
    }
    
    if (JSON.stringify(editCompanies) !== JSON.stringify(selectedUser.companyIds || [])) {
      updates.companyIds = editCompanies;
    }
    
    if (editCanPrintChecks !== selectedUser.canPrintChecks) {
      updates.canPrintChecks = editCanPrintChecks;
    }
    
    if (JSON.stringify(editVisibleClients) !== JSON.stringify(selectedUser.visibleClientIds || [])) {
      updates.visibleClientIds = editVisibleClients;
        console.log('🔍 DEBUG: Updating visibleClientIds to:', editVisibleClients);
      }
      
      console.log('🔍 DEBUG: Updates object:', updates);
      
      // Always save visibleClientIds to ensure it's persisted
      if (!updates.visibleClientIds) {
        updates.visibleClientIds = editVisibleClients;
        console.log('🔍 DEBUG: Force updating visibleClientIds to:', editVisibleClients);
    }
    
    // Only update if there are actual changes
    if (Object.keys(updates).length > 0) {
        console.log('🔍 DEBUG: Saving to Firestore with updates:', updates);
      await updateDoc(doc(db, "users", selectedUser.id), updates);
        showNotification("✅ User updated successfully!", 'success');
      setOpenDetails(false);
      fetchAll();
    } else {
        showNotification("No changes to save", 'warning');
      }
    } catch (err) {
      console.error('❌ Error updating user:', err);
      showNotification("❌ Failed to update user", 'error');
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    // 🔒 SECURITY: Prevent managers from deleting admin accounts
    if (currentRole === 'manager' && selectedUser.role === 'admin') {
      showNotification("❌ Managers cannot delete admin accounts", 'error');
      return;
    }
    
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    
    try {
      await deleteDoc(doc(db, "users", selectedUser.id));
      setOpenDetails(false);
      fetchAll();
      showNotification("✅ User deleted successfully", 'success');
    } catch (err) {
      console.error('❌ Error deleting user:', err);
      showNotification("❌ Failed to delete user", 'error');
    }
  };

  if (loading) return <Typography>Loading users...</Typography>;

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" gutterBottom fontWeight="bold" sx={{ color: '#1976d2' }}>
        Users
      </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage user accounts and printing permissions
        </Typography>
      </Box>
      
      {/* Printing Permission Summary */}
      <Paper elevation={2} sx={{ p: 3, mb: 4, borderRadius: 3, backgroundColor: '#f8f9fa', border: '1px solid', borderColor: 'grey.200' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Security color="primary" sx={{ fontSize: 28 }} />
            <Typography variant="h5" color="primary" fontWeight="bold">
                Check Printing Permissions
              </Typography>
            </Box>
            
          <Box sx={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <Box sx={{ textAlign: 'center', minWidth: 80 }}>
              <Typography variant="h4" color="success.main" fontWeight="bold">
                  {users.filter(u => u.canPrintChecks).length}
                </Typography>
              <Typography variant="body2" color="success.main" fontWeight="medium">
                  Can Print
                </Typography>
              </Box>
              
            <Box sx={{ textAlign: 'center', minWidth: 80 }}>
              <Typography variant="h4" color="error.main" fontWeight="bold">
                  {users.filter(u => !u.canPrintChecks).length}
                </Typography>
              <Typography variant="body2" color="error.main" fontWeight="medium">
                  Cannot Print
                </Typography>
              </Box>
              
            <Box sx={{ textAlign: 'center', minWidth: 80 }}>
              <Typography variant="h4" color="info.main" fontWeight="bold">
                {users.length}
              </Typography>
              <Typography variant="body2" color="info.main" fontWeight="medium">
                  Total Users
                </Typography>
              </Box>
            </Box>
          </Box>
        </Paper>

      {/* Create User Button */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
      <Button
        variant="contained"
        color="primary"
          size="large"
        onClick={() => setOpenForm(true)}
          sx={{
            borderRadius: 2,
            px: 3,
            py: 1.5,
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
          + CREATE USER
      </Button>
      </Box>

      {/* Users List */}
      <Paper elevation={1} sx={{ borderRadius: 3, overflow: 'hidden' }}>
        {users.map((u, index) => {
          const assignedCompanies = u.companyIds
            ?.map((cid) => companies.find((c) => c.id === cid)?.name)
            .filter(Boolean)
            .join(", ");
          
          // Fix undefined username issue
          const displayUsername = u.username || u.email || 'Unknown User';
          
          return (
            <Box key={u.id}>
              <ListItem 
                disablePadding
                sx={{
                  '&:hover': {
                    backgroundColor: 'rgba(25, 118, 210, 0.04)',
                  },
                  transition: 'background-color 0.2s ease',
                }}
              >
                <ListItemButton 
                  onClick={() => handleOpenDetails(u)}
                  sx={{ py: 2, px: 3 }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                        <Typography variant="h6" fontWeight="bold" color="text.primary">
                          {displayUsername}
                        </Typography>
                        <Chip 
                          label={u.role} 
                          size="small" 
                          color={u.role === 'admin' ? 'error' : 'default'}
                          sx={{ fontWeight: 'medium' }}
                        />
                        <Chip 
                          label={u.active ? 'Active' : 'Inactive'} 
                          size="small" 
                          color={u.active ? 'success' : 'error'}
                          variant="outlined"
                        />
                      </Box>
                      
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {u.email || 'No email provided'}
                          </Typography>
                      
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        <strong>Companies:</strong> {assignedCompanies || 'No companies assigned'}
                      </Typography>
                      
                      {/* Show client access summary */}
                      {u.companyIds && u.companyIds.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          <strong>Client Access:</strong> {
                            (() => {
                              const userClients = clients.filter(client => 
                                clientBelongsToCompanies(client, u.companyIds || [])
                              );
                              return userClients.length > 0 
                                ? `${userClients.length} Deparment(s) accessible`
                                : 'No Deparments found';
                            })()
                          }
                        </Typography>
                      )}
                    </Box>
                          
                          {/* Check Printing Permission Indicator */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 120 }}>
                          <Tooltip title={u.canPrintChecks ? "Can print checks" : "Cannot print checks"}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {u.canPrintChecks ? (
                            <Print color="success" fontSize="medium" />
                              ) : (
                            <PrintDisabled color="disabled" fontSize="medium" />
                              )}
                              <Typography 
                            variant="body2" 
                                color={u.canPrintChecks ? "success.main" : "text.disabled"}
                            fontWeight="medium"
                              >
                                {u.canPrintChecks ? "Can Print" : "No Print"}
                              </Typography>
                            </Box>
                          </Tooltip>
                        </Box>
                  </Box>
                </ListItemButton>
              </ListItem>
              {index < users.length - 1 && <Divider />}
            </Box>
          );
        })}
      </Paper>

      {/* Create User Dialog */}
      <Dialog
        open={openForm}
        onClose={() => setOpenForm(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Create User</DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}
        >
          <TextField
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FormControl fullWidth>
            <InputLabel id="role-label">Role</InputLabel>
            <Select
              labelId="role-label"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {/* 🔒 Only admins can create other admin accounts */}
              {currentRole === 'admin' && <MenuItem value="admin">Admin</MenuItem>}
              <MenuItem value="manager">Manager</MenuItem>
              <MenuItem value="user">User</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel id="companies-label">Assign Companies</InputLabel>
            <Select
              labelId="companies-label"
              multiple
              value={companyIds}
              onChange={(e) =>
                setCompanyIds(
                  typeof e.target.value === "string"
                    ? e.target.value.split(",")
                    : (e.target.value as string[])
                )
              }
              renderValue={(selected) => (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {(selected as string[]).map((value) => {
                    const company = companies.find((c) => c.id === value);
                    return <Chip key={value} label={company?.name || value} />;
                  })}
                </Box>
              )}
            >
              {companies.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Switch
                checked={canPrintChecks}
                onChange={(e) => setCanPrintChecks(e.target.checked)}
                name="canPrintChecks"
                color="primary"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Print color="primary" fontSize="small" />
                Can Print Checks
              </Box>
            }
          />
          
          {/* Help text for printing permission */}
          <Alert severity="info" sx={{ mt: 1 }}>
            <Typography variant="body2">
              <strong>Check Printing Permission:</strong> Users with this permission enabled will be able to print checks when viewing the Checks page. 
              This is a security feature to control who can generate physical checks.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenForm(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Details Dialog */}
      <Dialog
        open={openDetails}
        onClose={() => setOpenDetails(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>User Details</DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          {/* 🔒 Show warning when manager views admin account */}
          {currentRole === 'manager' && selectedUser?.role === 'admin' && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              ⚠️ You cannot edit or delete admin accounts. This account is read-only.
            </Alert>
          )}
          <Typography>Username: {selectedUser?.username}</Typography>
          <FormControl fullWidth>
            <InputLabel id="edit-role-label">Role</InputLabel>
            <Select
              labelId="edit-role-label"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              disabled={currentRole === 'manager' && selectedUser?.role === 'admin'}
            >
              {/* 🔒 Only admins can assign admin role */}
              {currentRole === 'admin' && <MenuItem value="admin">Admin</MenuItem>}
              <MenuItem value="manager">Manager</MenuItem>
              <MenuItem value="user">User</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Password"
            value={editPassword}
            onChange={(e) => setEditPassword(e.target.value)}
            disabled={currentRole === 'manager' && selectedUser?.role === 'admin'}
          />
          <FormControlLabel
            control={
              <Switch
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                disabled={currentRole === 'manager' && selectedUser?.role === 'admin'}
              />
            }
            label={editActive ? "Active" : "Inactive"}
          />
          <FormControlLabel
            control={
              <Switch
                checked={editCanPrintChecks}
                onChange={(e) => setEditCanPrintChecks(e.target.checked)}
                name="editCanPrintChecks"
                color="primary"
                disabled={currentRole === 'manager' && selectedUser?.role === 'admin'}
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Print color="primary" fontSize="small" />
                {editCanPrintChecks ? "Can Print Checks" : "Cannot Print Checks"}
              </Box>
            }
          />
          
          {/* Help text for editing printing permission */}
          <Alert severity="info" sx={{ mt: 1 }}>
            <Typography variant="body2">
              <strong>Printing Permission:</strong> {editCanPrintChecks 
                ? "This user can currently print checks from the Checks page." 
                : "This user cannot print checks. Enable this permission to allow check printing."
              }
            </Typography>
          </Alert>
          <FormControl fullWidth>
            <InputLabel id="edit-companies-label">Assign Companies</InputLabel>
            <Select
              labelId="edit-companies-label"
              multiple
              value={editCompanies}
              onChange={(e) =>
                setEditCompanies(
                  typeof e.target.value === "string"
                    ? e.target.value.split(",")
                    : (e.target.value as string[])
                )
              }
              renderValue={(selected) => (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {(selected as string[]).map((value) => {
                    const company = companies.find((c) => c.id === value);
                    return <Chip key={value} label={company?.name || value} />;
                  })}
                </Box>
              )}
            >
              {companies.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Company and Client Summary */}
          {editCompanies.length > 0 && (
            <Box sx={{ mt: 2, mb: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                Assigned Companies & Deparments Summary:
              </Typography>
              {editCompanies.map(companyId => {
                const company = companies.find(c => c.id === companyId);
                const companyClients = clients.filter(client => clientBelongsToCompanies(client, [companyId]));
                return (
                  <Box key={companyId} sx={{ mb: 1 }}>
                    <Typography variant="body2" fontWeight="bold" color="primary">
                      • {company?.name || 'Unknown Company'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                      {companyClients.length} client(s): {companyClients.map(c => c.name).join(', ') || 'No clients'}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Client Visibility Table */}
          {editCompanies.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: '#1976d2' }}>
                Deparment Visibility Control
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Select which deparments this user can see from their assigned companies:
              </Typography>
              
              <TableContainer component={Paper} sx={{ maxHeight: 300, border: '1px solid #e0e0e0' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>Deparment Name</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Company</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>Visible</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(() => {
                  const availableClients = clients.filter(client => 
                    clientBelongsToCompanies(client, editCompanies)
                  );
                      console.log('🔍 DEBUG Client Visibility Table:', {
                        allClients: clients.map(c => ({ 
                          id: c.id, 
                          name: c.name, 
                          companyId: c.companyId,
                          companyIds: c.companyIds,
                          belongsToEditCompanies: clientBelongsToCompanies(c, editCompanies)
                        })),
                        editCompanies: editCompanies,
                        availableClients: availableClients.map(c => ({ id: c.id, name: c.name, companyId: c.companyId })),
                        clientCompanyIdsFlat: clients.map(c => c.companyId).filter(id => id),
                        editCompaniesFlat: editCompanies
                      });
                      return availableClients;
                    })()
                      .map((client) => {
                        const clientCompany = companies.find(c => 
                          editCompanies.includes(c.id) && clientBelongsToCompanies(client, [c.id])
                        );
                        const isVisible = editVisibleClients.includes(client.id);
                        
                        return (
                          <TableRow key={client.id} hover>
                            <TableCell>{client.name}</TableCell>
                            <TableCell>{clientCompany?.name || 'Multiple Companies'}</TableCell>
                            <TableCell sx={{ textAlign: 'center' }}>
                              <Checkbox
                                checked={isVisible}
                                onChange={(e) => {
                                  setHasManuallyChangedVisibility(true); // Mark that user has manually changed visibility
                                  if (e.target.checked) {
                                    setEditVisibleClients(prev => [...prev, client.id]);
                                  } else {
                                    setEditVisibleClients(prev => prev.filter(id => id !== client.id));
                                  }
                                }}
                                color="primary"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </TableContainer>
              
          {(() => {
            const filteredClients = clients.filter(client => 
              clientBelongsToCompanies(client, editCompanies)
            );
            console.log('🔍 DEBUG Empty State Check:', {
              totalClients: clients.length,
              filteredClients: filteredClients.length,
              editCompanies: editCompanies,
              clientsData: clients.map(c => ({ id: c.id, name: c.name, companyId: c.companyId })),
              allClientCompanyIds: clients.map(c => c.companyId).filter(id => id),
              uniqueClientCompanyIds: Array.from(new Set(clients.map(c => c.companyId).filter(id => id)))
            });
            return filteredClients.length === 0;
          })() && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: 'italic' }}>
                  No clients found for the selected companies.
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {/* 🔒 Only show delete button if user has permission */}
          {selectedUser && !(currentRole === 'manager' && selectedUser.role === 'admin') && (
            <Button color="error" onClick={handleDeleteUser}>
              Delete User
            </Button>
          )}
          <Button onClick={() => setOpenDetails(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleUpdateUser}
            disabled={currentRole === 'manager' && selectedUser?.role === 'admin'}
          >
            Save Changes
          </Button>
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

export default UsersPage;
