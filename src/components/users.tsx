import React, { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc, // ✅ added setDoc
} from "firebase/firestore";
import { db, auth } from "../firebase"; // ✅ import auth
import { getApiUrl } from '../config';
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
  IconButton,
  InputAdornment,
} from "@mui/material";
import {
  Print,
  PrintDisabled,
  Security,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { logger } from '../utils/logger';
import { encryptData, decryptData } from '../utils/encryption';

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
  
  // Delete confirmation dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  
  // Password visibility toggle
  const [showPassword, setShowPassword] = useState(false);

  // Real-time listeners for users, companies, and clients
  useEffect(() => {
    setLoading(true);
    
    // Real-time listener for users
    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapUsers) => {
      const uList: User[] = snapUsers.docs.map((d) => {
        const data = d.data() as any;
        // Decrypt password for display (only admins/managers can see it)
        let decryptedPassword = '';
        try {
          if (data.password) {
            // Try to decrypt - if it fails, it might be plain text (old data)
            const decrypted = decryptData(data.password);
            // If decryption returns empty or same value, it might be plain text
            if (decrypted && decrypted !== data.password) {
              decryptedPassword = decrypted;
            } else {
              // Keep as-is if decryption didn't work (might be plain text from old data)
              decryptedPassword = data.password;
            }
          }
        } catch (e) {
          // If decryption fails, assume it's plain text (old data)
          decryptedPassword = data.password || '';
        }
        
        return {
          id: d.id,
          username: data.username,
          email: data.email || "",
          password: decryptedPassword,
          role: data.role,
          active: data.active ?? true,
          companyIds: Array.isArray(data.companyIds) ? data.companyIds : [],
          canPrintChecks: data.canPrintChecks ?? false, // ✅ Load printing permission
          visibleClientIds: Array.isArray(data.visibleClientIds) ? data.visibleClientIds : [], // ✅ Load client visibility
        };
      });
      setUsers(uList);
      logger.log('✅ Users updated in real-time:', uList.length);
    }, (error) => {
      console.error('Error listening to users:', error);
      setLoading(false);
    });

    // Real-time listener for companies
    const unsubscribeCompanies = onSnapshot(collection(db, "companies"), (snapCompanies) => {
      const cList: Company[] = snapCompanies.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name,
        };
      });
      setCompanies(cList);
      logger.log('✅ Companies updated in real-time:', cList.length);
    }, (error) => {
      console.error('Error listening to companies:', error);
    });

    // Real-time listener for clients
    const unsubscribeClients = onSnapshot(collection(db, "clients"), (snapClients) => {
      logger.log('🔍 DEBUG Raw Firestore Client Data:', {
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
      logger.log('🔍 DEBUG Fetched Clients:', {
        totalClients: clientList.length,
        clientsData: clientList.map(c => ({ id: c.id, name: c.name, companyId: c.companyId })),
        allClientCompanyIds: clientList.map(c => c.companyId).filter(id => id),
        uniqueClientCompanyIds: Array.from(new Set(clientList.map(c => c.companyId).filter(id => id))),
        sampleClient: clientList[0] // Show first client structure
      });
      setClients(clientList);
      logger.log('✅ Clients updated in real-time:', clientList.length);
    }, (error) => {
      console.error('Error listening to clients:', error);
    });

    // Set loading to false after initial load
    setTimeout(() => setLoading(false), 500);

    // Cleanup listeners on unmount
    return () => {
      unsubscribeUsers();
      unsubscribeCompanies();
      unsubscribeClients();
    };
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
          
          // Add expenses for each company
          const expensesIds = editCompanies.map(companyId => `expenses:${companyId}`);
          const allAvailableItems = [...availableClients, ...expensesIds];
      
      // Only update if the current selection doesn't match available items
      const currentSelection = editVisibleClients.filter(id => allAvailableItems.includes(id));
      if (currentSelection.length !== allAvailableItems.length) {
            logger.log('🔍 DEBUG: Auto-selecting all clients and expenses because user has no saved visibility settings');
        setEditVisibleClients(allAvailableItems);
      }
    } else {
      setEditVisibleClients([]);
    }
      } else {
        logger.log('🔍 DEBUG: User has saved visibility settings, not auto-selecting');
        // If user has saved visibility settings, ensure we're showing their saved settings
        // and not overriding them with auto-selection
        if (editVisibleClients.length === 0 && selectedUser.visibleClientIds && selectedUser.visibleClientIds.length > 0) {
          logger.log('🔍 DEBUG: Restoring saved visibility settings:', selectedUser.visibleClientIds);
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
        logger.log('🔍 DEBUG: Modal opened with saved visibility settings, restoring:', selectedUser.visibleClientIds);
        setEditVisibleClients(selectedUser.visibleClientIds);
      }
    }
  }, [selectedUser, openDetails]);

  // ✅ Updated to create Auth user via backend (doesn't sign admin out)
  const handleSave = async () => {
    if (!email.trim() || !username.trim() || !password.trim()) {
      alert("Please enter email, username and password");
      return;
    }
    
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showNotification("❌ You must be logged in to create users", 'error');
      return;
    }

    try {
      // 1. Create user in Firebase Auth via backend (doesn't sign anyone in)
      const apiUrl = getApiUrl('/api/create_user_auth');
      console.log('🔍 Creating user via backend:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          requesterId: currentUser.uid,
        }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create user in Firebase Auth');
      }

      const newUserId = result.uid;

      // 2. Save extra profile data in Firestore with UID as doc ID
      await setDoc(doc(db, "users", newUserId), {
        uid: newUserId,
        email,
        username,
        password: encryptData(password), // Store password encrypted for security
        role,
        active: true,
        companyIds,
        canPrintChecks, // ✅ Save printing permission
        createdAt: serverTimestamp(),
      });

      setOpenForm(false);
      setEmail("");
      setUsername("");
      setPassword("");
      setRole("user");
      setCompanyIds([]);
      setCanPrintChecks(false); // Reset new state
      // Real-time listener will automatically update the UI
      showNotification("✅ User created successfully! They can now log in.", 'success');
    } catch (err: any) {
      console.error('❌ Error creating user:', err);
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
    // Load password from user data for reference
    setEditPassword(user.password || "");
    setEditRole(user.role); // ✅ Set role state
    setEditCompanies(user.companyIds || []);
    setEditActive(user.active);
    setEditCanPrintChecks(user.canPrintChecks ?? false); // Set new state for edit
    setEditVisibleClients(user.visibleClientIds || []); // ✅ Set client visibility state
    setHasManuallyChangedVisibility(false); // Reset manual change flag when opening user details
    // Show password by default for admins/managers
    setShowPassword(currentRole === 'admin' || currentRole === 'manager');
    setOpenDetails(true);
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    
    logger.log('🔍 DEBUG handleUpdateUser:', {
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
    
    // Password updates: Encrypt and update password in Firestore if changed
    if (editPassword && editPassword.trim() !== '' && editPassword !== selectedUser.password) {
      updates.password = encryptData(editPassword);
      // Note: This only updates Firestore. To update Firebase Auth password, backend endpoint needed.
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
        logger.log('🔍 DEBUG: Updating visibleClientIds to:', editVisibleClients);
      }
      
      logger.log('🔍 DEBUG: Updates object:', updates);
      
      // Always save visibleClientIds to ensure it's persisted
      if (!updates.visibleClientIds) {
        updates.visibleClientIds = editVisibleClients;
        logger.log('🔍 DEBUG: Force updating visibleClientIds to:', editVisibleClients);
    }
    
    // Only update if there are actual changes
    if (Object.keys(updates).length > 0) {
        logger.log('🔍 DEBUG: Saving to Firestore with updates:', updates);
      await updateDoc(doc(db, "users", selectedUser.id), updates);
        showNotification("✅ User updated successfully!", 'success');
      setOpenDetails(false);
      // Real-time listener will automatically update the UI
    } else {
        showNotification("No changes to save", 'warning');
      }
    } catch (err) {
      console.error('❌ Error updating user:', err);
      showNotification("❌ Failed to update user", 'error');
    }
  };

  const handleDeleteUserClick = () => {
    if (!selectedUser) return;
    
    // 🔒 SECURITY: Prevent managers from deleting admin accounts
    if (currentRole === 'manager' && selectedUser.role === 'admin') {
      showNotification("❌ Managers cannot delete admin accounts", 'error');
      return;
    }
    
    setUserToDelete(selectedUser);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;
    
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        showNotification("❌ You must be logged in to delete users", 'error');
        return;
      }

      // First, delete from Firebase Auth via backend
      let authDeleted = false;
      try {
        const apiUrl = getApiUrl('/api/delete_user_auth');
        console.log('🔍 Calling backend to delete from Auth:', apiUrl);
        console.log('🔍 Backend URL from config:', process.env.REACT_APP_BACKEND_URL || 'http://localhost:5004 (default)');
        console.log('🔍 Request payload:', { userId: userToDelete.id, requesterId: currentUser.uid });
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: userToDelete.id,
            requesterId: currentUser.uid,
          }),
        });

        const result = await response.json();
        console.log('🔍 Backend response:', response.status, result);
        
        if (!response.ok) {
          // If user doesn't exist in Auth (maybe was never created properly), continue with Firestore deletion
          if (response.status === 404) {
            console.warn('⚠️ User not found in Firebase Auth, continuing with Firestore deletion');
            showNotification("⚠️ User not found in Firebase Auth, but deleted from database", 'warning');
          } else {
            // Show error but still try to delete from Firestore
            const errorMsg = result.error || 'Failed to delete user from Firebase Auth';
            console.error('❌ Backend error:', errorMsg);
            showNotification(`⚠️ ${errorMsg}. User will be removed from database only.`, 'warning');
          }
        } else {
          authDeleted = true;
          console.log('✅ Successfully deleted from Firebase Auth');
        }
      } catch (authErr: any) {
        // If backend is unavailable, show error but continue
        console.error('❌ Error calling backend:', authErr);
        showNotification(`⚠️ Backend unavailable: ${authErr.message}. User will be removed from database only. Make sure backend is running.`, 'warning');
      }

      // Then delete from Firestore
      await deleteDoc(doc(db, "users", userToDelete.id));
      
      setOpenDetails(false);
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
      // Real-time listener will automatically update the UI
      
      if (authDeleted) {
        showNotification("✅ User deleted successfully from both database and authentication", 'success');
      } else {
        showNotification("⚠️ User deleted from database, but Firebase Auth deletion failed. Email may still be in use. Check backend logs.", 'warning');
      }
    } catch (err: any) {
      console.error('❌ Error deleting user:', err);
      showNotification(`❌ Failed to delete user: ${err.message || 'Unknown error'}`, 'error');
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setUserToDelete(null);
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
            type={showPassword ? "text" : "password"}
            value={editPassword}
            onChange={(e) => setEditPassword(e.target.value)}
            disabled={currentRole === 'manager' && selectedUser?.role === 'admin'}
            placeholder="Enter password"
            helperText={currentRole === 'admin' || currentRole === 'manager' 
              ? "Password stored encrypted in database. Enter a new password to change it. Note: To update Firebase Auth password, backend support is needed."
              : "Password field"}
            InputProps={{
              readOnly: currentRole !== 'admin' && currentRole !== 'manager',
              endAdornment: (currentRole === 'admin' || currentRole === 'manager') && (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle password visibility"
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                    disabled={currentRole === 'manager' && selectedUser?.role === 'admin'}
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
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
                // Filter to only show clients/departments that are checked (in editVisibleClients)
                const allCompanyClients = clients.filter(client => clientBelongsToCompanies(client, [companyId]));
                const checkedClients = allCompanyClients.filter(client => editVisibleClients.includes(client.id));
                const expensesId = `expenses:${companyId}`;
                const hasExpensesChecked = editVisibleClients.includes(expensesId);
                
                // Combine checked clients with expenses if checked
                const visibleItems: string[] = [];
                checkedClients.forEach(client => visibleItems.push(client.name));
                if (hasExpensesChecked) {
                  visibleItems.push('Expenses');
                }
                
                return (
                  <Box key={companyId} sx={{ mb: 1 }}>
                    <Typography variant="body2" fontWeight="bold" color="primary">
                      • {company?.name || 'Unknown Company'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                      {visibleItems.length > 0 
                        ? `${visibleItems.length} client(s): ${visibleItems.join(', ')}`
                        : 'No clients selected'}
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
                      logger.log('🔍 DEBUG Client Visibility Table:', {
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
                      
                      // Group clients by company and sort
                      // First, get all companies that are in editCompanies, sorted alphabetically
                      const relevantCompanies = companies
                        .filter(c => editCompanies.includes(c.id))
                        .sort((a, b) => a.name.localeCompare(b.name));
                      
                      console.log('🔍 DEBUG Relevant companies (sorted):', 
                        relevantCompanies.map(c => ({ id: c.id, name: c.name })));
                      logger.log('🔍 DEBUG Relevant companies (sorted):', 
                        relevantCompanies.map(c => ({ id: c.id, name: c.name })));
                      
                      const clientsByCompany: { [companyId: string]: typeof availableClients } = {};
                      
                      // Initialize empty arrays for each company
                      relevantCompanies.forEach(company => {
                        clientsByCompany[company.id] = [];
                      });
                      
                      // Assign each client to the first company (alphabetically) it belongs to
                      availableClients.forEach(client => {
                        // Get client's company IDs for debugging
                        const clientCompanyIds = Array.isArray(client.companyId) 
                          ? client.companyId 
                          : client.companyIds || (client.companyId ? [client.companyId] : []);
                        
                        // Find the first company (alphabetically) that this client belongs to
                        const primaryCompany = relevantCompanies.find(c => 
                          clientBelongsToCompanies(client, [c.id])
                        );
                        
                        console.log(`🔍 DEBUG Client "${client.name}":`, {
                          clientCompanyIds,
                          belongsTo: primaryCompany ? primaryCompany.name : 'NONE',
                          allMatches: relevantCompanies.filter(c => 
                            clientBelongsToCompanies(client, [c.id])
                          ).map(c => c.name)
                        });
                        logger.log(`🔍 DEBUG Client "${client.name}":`, {
                          clientCompanyIds,
                          belongsTo: primaryCompany ? primaryCompany.name : 'NONE',
                          allMatches: relevantCompanies.filter(c => 
                            clientBelongsToCompanies(client, [c.id])
                          ).map(c => c.name)
                        });
                        
                        if (primaryCompany) {
                          clientsByCompany[primaryCompany.id].push(client);
                        }
                      });
                      
                      // Flatten and sort clients within each company, storing the assigned company
                      interface ClientWithCompany {
                        client: typeof availableClients[0];
                        company: typeof companies[0];
                        isExpenses?: boolean; // Flag to indicate if this is an expenses row
                      }
                      const sortedClientsWithCompany: ClientWithCompany[] = [];
                      relevantCompanies.forEach(company => {
                        const companyClients = clientsByCompany[company.id];
                        // Sort clients within company alphabetically
                        companyClients.sort((a, b) => a.name.localeCompare(b.name));
                        console.log(`🔍 DEBUG Grouping: ${company.name} has ${companyClients.length} clients:`, 
                          companyClients.map(c => c.name));
                        logger.log(`🔍 DEBUG Grouping: ${company.name} has ${companyClients.length} clients:`, 
                          companyClients.map(c => c.name));
                        companyClients.forEach(client => {
                          sortedClientsWithCompany.push({ client, company, isExpenses: false });
                        });
                        // Add Expenses row for this company (after all clients)
                        sortedClientsWithCompany.push({ 
                          client: { id: `expenses:${company.id}`, name: 'Expenses' } as any, 
                          company, 
                          isExpenses: true 
                        });
                      });
                      
                      console.log('🔍 DEBUG Final sorted clients order:', 
                        sortedClientsWithCompany.map(item => 
                          `${item.isExpenses ? 'Expenses' : item.client.name} (${item.company.name})`
                        ));
                      logger.log('🔍 DEBUG Final sorted clients order:', 
                        sortedClientsWithCompany.map(item => 
                          `${item.isExpenses ? 'Expenses' : item.client.name} (${item.company.name})`
                        ));
                      
                      return sortedClientsWithCompany;
                    })()
                      .map(({ client, company: clientCompany, isExpenses }) => {
                        const expenseId = isExpenses ? `expenses:${clientCompany.id}` : null;
                        const itemId = expenseId || client.id;
                        const isVisible = editVisibleClients.includes(itemId);
                        
                        return (
                          <TableRow key={itemId} hover>
                            <TableCell sx={{ fontWeight: isExpenses ? 'bold' : 'normal', color: isExpenses ? '#e65100' : 'inherit' }}>
                              {isExpenses ? 'Expenses' : client.name}
                            </TableCell>
                            <TableCell>{clientCompany.name}</TableCell>
                            <TableCell sx={{ textAlign: 'center' }}>
                              <Checkbox
                                checked={isVisible}
                                onChange={(e) => {
                                  setHasManuallyChangedVisibility(true); // Mark that user has manually changed visibility
                                  if (e.target.checked) {
                                    setEditVisibleClients(prev => [...prev, itemId]);
                                  } else {
                                    setEditVisibleClients(prev => prev.filter(id => id !== itemId));
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
            logger.log('🔍 DEBUG Empty State Check:', {
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
            <Button color="error" onClick={handleDeleteUserClick}>
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

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">
          Delete User
        </DialogTitle>
        <DialogContent>
          <Typography id="delete-dialog-description">
            Are you sure you want to delete <strong>{userToDelete?.username || userToDelete?.email}</strong>? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained" autoFocus>
            Delete
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
