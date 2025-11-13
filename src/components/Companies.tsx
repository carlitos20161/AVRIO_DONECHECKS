import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
  query,
  where,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { decryptData } from '../utils/encryption';
import { auth } from '../firebase';
import { getDoc } from 'firebase/firestore';
import {
  Paper,
  Typography,
  TextField,
  Button,
  ListItemAvatar,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Box,
  Snackbar,
  Alert,
} from "@mui/material";
import { getDocs as getDocsFB, collection as collectionFB } from 'firebase/firestore';

interface Company {
  id: string;
  name: string;
  address: string;
  divisions?: string[];
  logoBase64?: string;
}

interface Client {
  id: string;
  name: string;
  address?: string;
  companyIds?: string[]; 
}




interface Bank {
  id: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  startingCheckNumber: string;
  companyId?: string;
}

interface CompaniesManagerProps {
  currentRole: string;
}

const CompaniesManager: React.FC<CompaniesManagerProps> = ({ currentRole }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);

  const [openForm, setOpenForm] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [logoFile, setLogoFile] = useState<string | null>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileCompany, setProfileCompany] = useState<Company | null>(null);
  const [profileEmployees, setProfileEmployees] = useState<any[]>([]);
  const [profileCreators, setProfileCreators] = useState<any[]>([]);
  const [profileClients, setProfileClients] = useState<any[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileBanks, setProfileBanks] = useState<any[]>([]);

  // Edit company states
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editDivisions, setEditDivisions] = useState<string[]>([]);
  const [editLogoFile, setEditLogoFile] = useState<string | null>(null);
  
  // Snackbar states
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error" | "warning" | "info">("success");
  
  // Helper function to show snackbar
  const showSnackbar = (message: string, severity: "success" | "error" | "warning" | "info" = "success") => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };
  
  // Division management states
  const [newDivision, setNewDivision] = useState("");
  const [showDivisionForm, setShowDivisionForm] = useState(false);


  
  // Selection states
  const [showBankSelection, setShowBankSelection] = useState(false);
  const [showClientSelection, setShowClientSelection] = useState(false);
  
  // Employee creation states
  const [isCreatingEmployee, setIsCreatingEmployee] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeeAddress, setNewEmployeeAddress] = useState("");
  const [newEmployeePosition, setNewEmployeePosition] = useState("");
  const [newEmployeePayRate, setNewEmployeePayRate] = useState("");
  const [newEmployeePayType, setNewEmployeePayType] = useState("hourly");
  const [newEmployeeStartDate, setNewEmployeeStartDate] = useState("");
  
  // Available items for selection
  const [availableBanks, setAvailableBanks] = useState<Bank[]>([]);
  const [availableClients, setAvailableClients] = useState<Client[]>([]);
  const [newClientName, setNewClientName] = useState("");
  const [newClientAddress, setNewClientAddress] = useState("");
  const [isCreatingClient, setIsCreatingClient] = useState(false);


  useEffect(() => {
    const fetchAll = async () => {
      // fetch user info
      const user = auth.currentUser;
      let allowedCompanyIds: string[] = [];
      let isAdmin = false;
      if (user) {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        const userData = userSnap.data();
        isAdmin = userData?.role === 'admin';
        allowedCompanyIds = userData?.companyIds || [];
      }
      // fetch companies
      const snap = await getDocs(collection(db, "companies"));
      let cList: Company[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name ?? "",
          address: data.address ?? "",
          divisions: data.divisions ?? [],
          logoBase64: data.logoBase64 ?? "",
        };
      });
      if (!isAdmin) {
        cList = cList.filter(c => allowedCompanyIds.includes(c.id));
      }
      setCompanies(cList);


      // fetch clients
const clientSnap = await getDocs(collection(db, "clients"));
const clList: Client[] = clientSnap.docs.map((d) => {
  const data = d.data() as any;
  return {
    id: d.id,
    name: data.name ?? "",
    address: data.address ?? "",
    companyIds: data.companyId || [], 
  };
});
setClients(clList);


      // fetch banks
      const bankSnap = await getDocs(collection(db, "banks"));
      const bList: Bank[] = bankSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          bankName: data.bankName ?? "",
          routingNumber: data.routingNumber ?? "",
          accountNumber: data.accountNumber ?? "",
          startingCheckNumber: data.startingCheckNumber ?? "",
          companyId: data.companyId ?? "",
        };
      });
      setBanks(bList);

      setLoading(false);
    };
    fetchAll().catch(console.error);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoFile(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOpenForm = () => {
    setName("");
    setAddress("");
    setLogoFile(null);
    setOpenForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showSnackbar("Please enter a company name", "error");
      return;
    }
    try {
      await addDoc(collection(db, "companies"), {
        name,
        address,
        divisions: [],
        logoBase64: logoFile || "",
        createdAt: serverTimestamp(),
      });
      window.location.reload(); // quick refresh
    } catch (err) {
      console.error(err);
      alert("❌ Failed to save company");
    }
  };

  const handleDeleteCompany = async (company: Company) => {
    setCompanyToDelete(company);
    setOpenDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!companyToDelete) return;

    try {
      // Check for related data
      const relatedBanks = banks.filter(b => b.companyId === companyToDelete.id);
      const relatedClients = clients.filter(c => c.companyIds?.includes(companyToDelete.id));
      
      // Check for checks
      const checksSnap = await getDocs(query(collection(db, "checks"), where("companyId", "==", companyToDelete.id)));
      const relatedChecks = checksSnap.docs.length;
      
      // Check for employees
      const employeesSnap = await getDocs(query(collection(db, "employees"), where("companyId", "==", companyToDelete.id)));
      const relatedEmployees = employeesSnap.docs.length;

      let warningMessage = `Are you sure you want to delete "${companyToDelete.name}"?\n\n`;
      let hasRelatedData = false;

      if (relatedBanks.length > 0) {
        warningMessage += `⚠️ This company has ${relatedBanks.length} associated bank(s)\n`;
        hasRelatedData = true;
      }
      if (relatedClients.length > 0) {
        warningMessage += `⚠️ This company has ${relatedClients.length} associated client(s)\n`;
        hasRelatedData = true;
      }
      if (relatedChecks > 0) {
        warningMessage += `⚠️ This company has ${relatedChecks} associated check(s)\n`;
        hasRelatedData = true;
      }
      if (relatedEmployees > 0) {
        warningMessage += `⚠️ This company has ${relatedEmployees} associated employee(s)\n`;
        hasRelatedData = true;
      }

      if (hasRelatedData) {
        warningMessage += "\n⚠️ Deleting this company will also delete all associated data!";
      }

      if (!window.confirm(warningMessage)) {
        setOpenDeleteDialog(false);
        setCompanyToDelete(null);
        return;
      }

      // Delete related data first
      for (const bank of relatedBanks) {
        await deleteDoc(doc(db, "banks", bank.id));
      }

      // Remove company from clients' companyIds arrays
      for (const client of relatedClients) {
        const updatedCompanyIds = client.companyIds?.filter(id => id !== companyToDelete.id) || [];
        await updateDoc(doc(db, "clients", client.id), { companyId: updatedCompanyIds });
      }

      // Delete checks
      for (const checkDoc of checksSnap.docs) {
        await deleteDoc(doc(db, "checks", checkDoc.id));
      }

      // Delete employees
      for (const employeeDoc of employeesSnap.docs) {
        await deleteDoc(doc(db, "employees", employeeDoc.id));
      }

      // Finally delete the company
      await deleteDoc(doc(db, "companies", companyToDelete.id));

      // Update local state
      setCompanies(prev => prev.filter(c => c.id !== companyToDelete.id));
      setBanks(prev => prev.filter(b => b.companyId !== companyToDelete.id));
      setClients(prev => prev.map(c => ({
        ...c,
        companyIds: c.companyIds?.filter(id => id !== companyToDelete.id) || []
      })));

      setOpenDeleteDialog(false);
      setCompanyToDelete(null);
      showSnackbar("✅ Company deleted successfully!", "success");
    } catch (err) {
      console.error(err);
      showSnackbar("❌ Failed to delete company", "error");
    }
  };

  const handleViewProfile = async (company: Company) => {
    console.log('🔍 DEBUG: Opening profile for company:', company);
    console.log('🔍 DEBUG: Company divisions:', company.divisions);
    setProfileCompany(company);
    setProfileOpen(true);
    setProfileLoading(true);
    // Fetch employees
    const empSnap = await getDocsFB(query(collectionFB(db, 'employees'), where('companyId', '==', company.id)));
    setProfileEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    // Fetch checks and creators
    const checksSnap = await getDocsFB(query(collectionFB(db, 'checks'), where('companyId', '==', company.id)));
    const creatorIds = Array.from(new Set(checksSnap.docs.map(d => d.data().createdBy).filter(Boolean)));
    let creators: any[] = [];
    if (creatorIds.length > 0) {
      const usersSnap = await Promise.all(creatorIds.map(uid => getDocsFB(query(collectionFB(db, 'users'), where('__name__', '==', uid)))));
      creators = usersSnap.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
    setProfileCreators(creators);
    // Fetch banks for this company
    const banksSnap = await getDocsFB(query(collectionFB(db, 'banks'), where('companyId', '==', company.id)));
    setProfileBanks(banksSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    // Fetch clients using correct field (companyId as array)
    const clientSnap = await getDocsFB(query(collectionFB(db, 'clients'), where('companyId', 'array-contains', company.id)));
    setProfileClients(clientSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setProfileLoading(false);
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditLogoFile(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStartEdit = () => {
    console.log('🔍 DEBUG: Edit Company button clicked!');
    console.log('🔍 DEBUG: profileCompany:', profileCompany);
    if (profileCompany) {
      setEditName(profileCompany.name);
      setEditAddress(profileCompany.address);
      
      // Initialize editDivisions with ALL company divisions (not just client divisions)
      // This allows editing/deleting unused divisions like "Containers Per-Diem"
      const allCompanyDivisions = profileCompany.divisions || [];
      
      console.log('🔍 DEBUG: All company divisions:', allCompanyDivisions);
      console.log('🔍 DEBUG: Setting editDivisions to all company divisions:', allCompanyDivisions);
      
      setEditDivisions(allCompanyDivisions);
      setEditLogoFile(profileCompany.logoBase64 || null);
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditName("");
    setEditAddress("");
    setEditDivisions([]);
    setEditLogoFile(null);
    setShowDivisionForm(false);
    setNewDivision("");
  };

  // Division management functions
  const handleAddDivision = () => {
    console.log('🔍 DEBUG: Adding division:', newDivision.trim());
    console.log('🔍 DEBUG: Current editDivisions:', editDivisions);
    if (newDivision.trim() && !editDivisions.includes(newDivision.trim())) {
      const newEditDivisions = [...editDivisions, newDivision.trim()];
      console.log('🔍 DEBUG: New editDivisions after add:', newEditDivisions);
      setEditDivisions(newEditDivisions);
      setNewDivision("");
      setShowDivisionForm(false);
    } else {
      console.log('🔍 DEBUG: Division not added - empty or duplicate');
    }
  };

  const handleRemoveDivision = (divisionToRemove: string) => {
    console.log('🔍 DEBUG: Removing division:', divisionToRemove);
    console.log('🔍 DEBUG: Current editDivisions before remove:', editDivisions);
    const newEditDivisions = editDivisions.filter(div => div !== divisionToRemove);
    console.log('🔍 DEBUG: New editDivisions after remove:', newEditDivisions);
    setEditDivisions(newEditDivisions);
  };

  const handleSaveEdit = async () => {
    console.log('🔍 DEBUG: Save Changes button clicked!');
    console.log('🔍 DEBUG: profileCompany:', profileCompany);
    console.log('🔍 DEBUG: editName:', editName);
    console.log('🔍 DEBUG: editDivisions:', editDivisions);
    
    if (!profileCompany || !editName.trim()) {
      showSnackbar("Please enter a company name", "error");
      return;
    }
    try {
      console.log('🔍 DEBUG: Saving divisions to Firestore:', editDivisions);
      await updateDoc(doc(db, "companies", profileCompany.id), {
        name: editName.trim(),
        address: editAddress.trim(),
        divisions: editDivisions,
        logoBase64: editLogoFile || "",
        updatedAt: serverTimestamp(),
      });
      console.log('🔍 DEBUG: Successfully saved divisions to Firestore');
      
      // Update local state
      setCompanies(prev => {
        const updatedCompanies = prev.map(c => 
          c.id === profileCompany.id 
            ? { ...c, name: editName.trim(), address: editAddress.trim(), divisions: editDivisions, logoBase64: editLogoFile || "" }
            : c
        );
        console.log('🔍 DEBUG: Updated companies array:', updatedCompanies.find(c => c.id === profileCompany.id));
        return updatedCompanies;
      });
      
      // Update profile company state
      console.log('🔍 DEBUG: Updating profileCompany state with divisions:', editDivisions);
      setProfileCompany(prev => prev ? {
        ...prev,
        name: editName.trim(),
        address: editAddress.trim(),
        divisions: editDivisions,
        logoBase64: editLogoFile || ""
      } : null);
      console.log('🔍 DEBUG: ProfileCompany state updated');
      
      setIsEditing(false);
      showSnackbar("✅ Company updated successfully!", "success");
    } catch (err) {
      console.error(err);
      showSnackbar("❌ Failed to update company", "error");
    }
  };

  // Bank management functions
  const handleShowBankSelection = async () => {
    try {
      // Get all banks that are not assigned to this company
      const allBanksSnap = await getDocs(collection(db, "banks"));
      const allBanks = allBanksSnap.docs.map(d => ({ id: d.id, ...d.data() } as Bank));
      const unassignedBanks = allBanks.filter(bank => !bank.companyId || bank.companyId === "");
      
      setAvailableBanks(unassignedBanks);
      setShowBankSelection(true);
    } catch (err) {
      console.error(err);
      alert("❌ Failed to load available banks");
    }
  };

  const handleAssignBank = async (bank: Bank) => {
    if (!profileCompany) return;
    try {
      await updateDoc(doc(db, "banks", bank.id), {
        companyId: profileCompany.id,
        updatedAt: serverTimestamp(),
      });
      
      // Refresh profile data
      const banksSnap = await getDocsFB(query(collectionFB(db, 'banks'), where('companyId', '==', profileCompany.id)));
      setProfileBanks(banksSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      setShowBankSelection(false);
      showSnackbar("✅ Bank assigned successfully!", "success");
    } catch (err) {
      console.error(err);
      showSnackbar("❌ Failed to assign bank", "error");
    }
  };

  const handleUnlinkBank = async (bankId: string) => {
    if (!window.confirm("Are you sure you want to unlink this bank from the company?")) return;
    try {
      // Unlink the bank by removing the companyId field instead of deleting the bank
      await updateDoc(doc(db, "banks", bankId), {
        companyId: null,
        updatedAt: serverTimestamp(),
      });
      
      // Update local state
      setProfileBanks(prev => prev.filter(b => b.id !== bankId));
      showSnackbar("✅ Bank unlinked successfully!", "success");
    } catch (err) {
      console.error(err);
      showSnackbar("❌ Failed to unlink bank", "error");
    }
  };

  // Employee management functions
  const handleShowEmployeeForm = () => {
    setIsCreatingEmployee(true);
  };

  const handleCreateEmployee = async () => {
    if (!profileCompany || !newEmployeeName.trim() || !newEmployeeAddress.trim() || !newEmployeePosition.trim() || !newEmployeePayRate.trim()) {
      alert("Please fill in all required employee fields");
      return;
    }
    try {
      await addDoc(collection(db, "employees"), {
        name: newEmployeeName.trim(),
        address: newEmployeeAddress.trim(),
        position: newEmployeePosition.trim(),
        payRate: parseFloat(newEmployeePayRate),
        payType: newEmployeePayType,
        startDate: newEmployeeStartDate || new Date().toISOString(),
        companyId: profileCompany.id,
        active: true,
        createdAt: serverTimestamp(),
      });
      
      // Refresh profile data
      const empSnap = await getDocsFB(query(collectionFB(db, 'employees'), where('companyId', '==', profileCompany.id)));
      setProfileEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      // Clear form
      setNewEmployeeName("");
      setNewEmployeeAddress("");
      setNewEmployeePosition("");
      setNewEmployeePayRate("");
      setNewEmployeeStartDate("");
      setIsCreatingEmployee(false);
      showSnackbar("✅ Employee created successfully!", "success");
    } catch (err) {
      console.error(err);
      showSnackbar("❌ Failed to create employee", "error");
    }
  };

  const handleCancelEmployeeCreation = () => {
    setIsCreatingEmployee(false);
    setNewEmployeeName("");
    setNewEmployeeAddress("");
    setNewEmployeePosition("");
    setNewEmployeePayRate("");
    setNewEmployeeStartDate("");
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!window.confirm("Are you sure you want to delete this employee?")) return;
    try {
      await deleteDoc(doc(db, "employees", employeeId));
      
      // Update local state
      setProfileEmployees(prev => prev.filter(e => e.id !== employeeId));
      showSnackbar("✅ Employee deleted successfully!", "success");
    } catch (err) {
      console.error(err);
      showSnackbar("❌ Failed to delete employee", "error");
    }
  };

  // Client management functions
  const handleShowClientSelection = async () => {
    try {
      // Get all clients that are not assigned to this company
      const allClientsSnap = await getDocs(collection(db, "clients"));
      const allClients = allClientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const unassignedClients = allClients.filter((client: any) => 
        !client.companyIds || 
        client.companyIds.length === 0 || 
        !client.companyIds.includes(profileCompany?.id)
      );
      
      setAvailableClients(unassignedClients);
      setShowClientSelection(true);
      setNewClientName("");
      setNewClientAddress("");
    } catch (err) {
      console.error(err);
      alert("❌ Failed to load available clients");
    }
  };

  const handleAssignClient = async (client: Client) => {
    if (!profileCompany) return;
    try {
      const currentCompanyIds = client.companyIds || [];
      const updatedCompanyIds = [...currentCompanyIds, profileCompany.id];
      
      await updateDoc(doc(db, "clients", client.id), {
        companyIds: updatedCompanyIds,
        updatedAt: serverTimestamp(),
      });
      
      // Refresh profile data
      const clientSnap = await getDocsFB(query(collectionFB(db, 'clients'), where('companyId', 'array-contains', profileCompany.id)));
      setProfileClients(clientSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      setShowClientSelection(false);
      showSnackbar("✅ Department assigned successfully!", "success");
    } catch (err) {
      console.error(err);
      showSnackbar("❌ Failed to assign client", "error");
    }
  };

  const handleCreateClient = async () => {
    if (!profileCompany) return;
    if (!newClientName.trim()) {
      showSnackbar("Please enter a client name", "error");
      return;
    }
    try {
      setIsCreatingClient(true);
      const newClientData = {
        name: newClientName.trim(),
        address: newClientAddress.trim(),
        companyIds: [profileCompany.id],
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, "clients"), newClientData);

      const createdClient: Client = {
        id: docRef.id,
        name: newClientData.name,
        address: newClientData.address,
        companyIds: newClientData.companyIds,
      };

      setClients(prev => [...prev, createdClient]);
      setProfileClients(prev => [...prev, { ...createdClient }]);

      setNewClientName("");
      setNewClientAddress("");
      setShowClientSelection(false);
      showSnackbar("✅ Department created and assigned successfully!", "success");
    } catch (err) {
      console.error(err);
      showSnackbar("❌ Failed to create client", "error");
    } finally {
      setIsCreatingClient(false);
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    if (!window.confirm("Are you sure you want to delete this client?")) return;
    try {
      await deleteDoc(doc(db, "clients", clientId));
      
      // Update local state
      setProfileClients(prev => prev.filter(c => c.id !== clientId));
      showSnackbar("✅ Department deleted successfully!", "success");
    } catch (err) {
      console.error(err);
      showSnackbar("❌ Failed to delete client", "error");
    }
  };

  // Helper function to show only last 4 digits
  const maskBankNumber = (number: string) => {
    if (!number || number.length < 4) return number;
    const decrypted = decryptData(number);
    return decrypted.length > 4 ? '****' + decrypted.slice(-4) : decrypted;
  };

  if (loading) return <Typography>Loading companies...</Typography>;

  return (
    <Paper sx={{ p: 3, maxWidth: 1000, margin: "0 auto" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h4">Companies</Typography>
        {currentRole === 'admin' && (
        <Button variant="contained" color="primary" onClick={handleOpenForm}>
          + Create New Company
        </Button>
        )}
      </Box>
  
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {companies.map((c) => {
  const relatedBanks = banks.filter((b) => b.companyId === c.id);
  const relatedClients = clients.filter((cl) => cl.companyIds?.includes(c.id));


  return (
    <Paper key={c.id} sx={{ p: 2 }} elevation={3}>
      {/* Company header */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <ListItemAvatar>
          {c.logoBase64 ? (
            <Avatar src={c.logoBase64} alt={c.name} sx={{ width: 56, height: 56, mr: 2 }} />
          ) : (
            <Avatar sx={{ width: 56, height: 56, mr: 2 }}>{c.name.charAt(0)}</Avatar>
          )}
        </ListItemAvatar>
        <Box>
          <Typography variant="h6">{c.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            Address: {c.address || "N/A"}
          </Typography>
        </Box>
        </Box>
        <Button
          variant="outlined"
          color="primary"
          size="small"
          onClick={() => handleViewProfile(c)}
          sx={{ ml: 2 }}
        >
          View Profile
        </Button>

        {currentRole === 'admin' && (
        <Button
          variant="outlined"
          color="error"
          size="small"
          onClick={() => handleDeleteCompany(c)}
          sx={{ ml: 2 }}
        >
          Delete
        </Button>
        )}
      </Box>

      {/* Banks */}
      <Box sx={{ mt: 2, ml: 1 }}>
        {relatedBanks.length > 0 ? (
          <>
            <Typography variant="subtitle2">Banks:</Typography>
            {relatedBanks.map((bank) => (
              <Typography key={bank.id} sx={{ fontSize: 14, color: "text.secondary", ml: 1 }}>
                • {bank.bankName} (Acct: {maskBankNumber(bank.accountNumber)}, Routing: {maskBankNumber(bank.routingNumber)})
              </Typography>
            ))}
          </>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            No banks associated.
          </Typography>
        )}
      </Box>

      {/* Clients */}
      <Box sx={{ mt: 2, ml: 1 }}>
        {relatedClients.length > 0 ? (
          <>
            <Typography variant="subtitle2">Departments:</Typography>
            {relatedClients.map((client) => (
              <Typography key={client.id} sx={{ fontSize: 14, color: "text.secondary", ml: 1 }}>
                • {client.name}
                {client.address && ` (${client.address})`}
              </Typography>
            ))}
          </>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            No clients associated.
          </Typography>
        )}
      </Box>
    </Paper>
  );
})}

      </Box>
  
      {/* Dialog for creating new company remains the same */}
      <Dialog
        open={openForm}
        onClose={() => setOpenForm(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ pb: 1, pt: 2, fontSize: '1.5rem', lineHeight: '3' }}>Create Company</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 6 }}>
          <TextField
            fullWidth
            label="Company Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
          <TextField
            fullWidth
            label="Company Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            autoComplete="off"
          />
          <Button variant="contained" component="label">
            Upload Company Logo
            <input type="file" accept="image/*" hidden onChange={handleFileChange} />
          </Button>
          {logoFile && <Typography sx={{ mt: 1, mb: 1 }}>✅ Logo ready</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenForm(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={openDeleteDialog}
        onClose={() => {
          setOpenDeleteDialog(false);
          setCompanyToDelete(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Company</DialogTitle>
        <DialogContent>
          {companyToDelete && (
            <Typography>
              Are you sure you want to delete "{companyToDelete.name}"?
              <br /><br />
              This action will also delete all associated:
              <br />• Banks
              <br />• Employees  
              <br />• Checks
              <br />• Client associations
              <br /><br />
              This action cannot be undone.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setOpenDeleteDialog(false);
              setCompanyToDelete(null);
            }}
          >
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color="error" 
            onClick={confirmDelete}
          >
            Delete Company
          </Button>
        </DialogActions>
      </Dialog>

      {/* Company Profile Modal */}
      <Dialog open={profileOpen} onClose={() => setProfileOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Company Profile
            {!isEditing && currentRole === 'admin' && (
              <Button
                variant="outlined"
                color="primary"
                size="small"
                onClick={handleStartEdit}
              >
                Edit Company
              </Button>
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          {profileLoading ? (
            <Typography>Loading...</Typography>
          ) : profileCompany && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 2 }}>
              {isEditing ? (
                // Edit Mode
                <Box sx={{ width: '100%', maxWidth: 600 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
                    <TextField
                      fullWidth
                      label="Company Name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <TextField
                      fullWidth
                      label="Company Address"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                    />
                    <Button variant="contained" component="label">
                      {profileCompany.logoBase64 ? "Change Company Logo" : "Upload Company Logo"}
                      <input type="file" accept="image/*" hidden onChange={handleEditFileChange} />
                    </Button>
                    {editLogoFile && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography sx={{ mt: 1, mb: 1 }}>✅ Logo ready</Typography>
                        {profileCompany.logoBase64 && (
                          <Avatar 
                            src={profileCompany.logoBase64} 
                            sx={{ width: 40, height: 40 }}
                          />
                        )}
                      </Box>
                    )}
                  </Box>
                </Box>
              ) : (
                // View Mode
                <>
              <Avatar src={profileCompany.logoBase64} sx={{ width: 80, height: 80, mb: 2 }}>
                {profileCompany.name ? profileCompany.name[0].toUpperCase() : '?'}
              </Avatar>
              <Typography variant="h5" fontWeight="bold">{profileCompany.name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Address: {profileCompany.address || 'N/A'}</Typography>
                </>
              )}
              {/* Banks section */}
              <Divider sx={{ my: 2, width: '100%' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 700 }}>
              <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Banks</Typography>
                {isEditing && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleShowBankSelection}
                  >
                    + Add Bank
                  </Button>
                )}
              </Box>
              

              
              {profileBanks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No banks associated with this company.</Typography>
              ) : (
                <Box sx={{ width: '100%', maxWidth: 700 }}>
                  {profileBanks.map(bank => (
                    <Box key={bank.id} sx={{ border: '1px solid #eee', borderRadius: 1, p: 1, mt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                      <Typography variant="subtitle1">{bank.bankName}</Typography>
                      <Typography variant="body2" color="text.secondary">Acct: {maskBankNumber(bank.accountNumber)}, Routing: {maskBankNumber(bank.routingNumber)}</Typography>
                      </Box>
                      {isEditing && (
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => handleUnlinkBank(bank.id)}
                        >
                          Unlink
                        </Button>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
              <Divider sx={{ my: 2, width: '100%' }} />
              <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Check Creators</Typography>
              {profileCreators.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No checks created for this company yet.</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                  {profileCreators.map(user => (
                    <Box key={user.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, border: '1px solid #eee', borderRadius: 1, p: 1, minWidth: 120 }}>
                      <Avatar>{user.username ? user.username[0].toUpperCase() : (user.email ? user.email[0].toUpperCase() : '?')}</Avatar>
                      <Typography>{user.username || user.email || 'Unknown'}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
              <Divider sx={{ my: 2, width: '100%' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 700 }}>
              <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Employees</Typography>
                
              </Box>
              
              {isCreatingEmployee && (
                <Box sx={{ width: '100%', maxWidth: 700, mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 2 }}>Create New Employee</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Employee Name"
                      value={newEmployeeName}
                      onChange={(e) => setNewEmployeeName(e.target.value)}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Address"
                      value={newEmployeeAddress}
                      onChange={(e) => setNewEmployeeAddress(e.target.value)}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Position"
                      value={newEmployeePosition}
                      onChange={(e) => setNewEmployeePosition(e.target.value)}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Pay Rate"
                      value={newEmployeePayRate}
                      onChange={(e) => setNewEmployeePayRate(e.target.value)}
                    />
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <Typography variant="body2">Pay Type:</Typography>
                      <Button
                        variant={newEmployeePayType === 'hourly' ? 'contained' : 'outlined'}
                        size="small"
                        onClick={() => setNewEmployeePayType('hourly')}
                      >
                        Hourly
                      </Button>
                      <Button
                        variant={newEmployeePayType === 'daily' ? 'contained' : 'outlined'}
                        size="small"
                        onClick={() => setNewEmployeePayType('daily')}
                      >
                        Daily
                      </Button>
                    </Box>
                    <TextField
                      fullWidth
                      size="small"
                      label="Start Date (optional)"
                      type="date"
                      value={newEmployeeStartDate}
                      onChange={(e) => setNewEmployeeStartDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button variant="outlined" size="small" onClick={handleCancelEmployeeCreation}>
                        Cancel
                      </Button>
                      <Button variant="contained" size="small" onClick={handleCreateEmployee}>
                        Create Employee
                      </Button>
                    </Box>
                  </Box>
                </Box>
              )}
              
              {profileEmployees.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No employees assigned to this company.</Typography>
              ) : (
                <Box sx={{ width: '100%', maxWidth: 700 }}>
                  {profileEmployees.map(emp => (
                    <Box key={emp.id} sx={{ border: '1px solid #ccc', borderRadius: 2, p: 2, mt: 2, boxShadow: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Box sx={{ flex: 1 }}>
                      <Typography variant="h6">{emp.name}</Typography>
                        <Typography variant="body2">{emp.address}</Typography>
                        <Typography variant="body2">{emp.position} | ${isNaN(emp.payRate) ? '0.00' : emp.payRate}/{emp.payType === 'hourly' ? 'hour' : 'day'}</Typography>
                        <Typography variant="body2" color="text.secondary">Start Date: {emp.startDate ? new Date(emp.startDate).toLocaleDateString() : 'N/A'}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 'bold', color: emp.active ? 'green' : 'red', display: 'flex', alignItems: 'center', gap: '6px' }}>{emp.active ? 'Active' : 'Inactive'}</Typography>
                      </Box>
                      {isEditing && (
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => handleDeleteEmployee(emp.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
              <Divider sx={{ my: 2, width: '100%' }} />
              {/* Clients section */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 700 }}>
                <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Clients</Typography>
                {isEditing && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setShowDivisionForm(true)}
                  >
                    + Add Client
                  </Button>
                )}
              </Box>

              {isEditing && showDivisionForm && (
                <Box sx={{ width: '100%', maxWidth: 700, mb: 2 }}>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField
                      fullWidth
                      label="Client Name"
                      value={newDivision}
                      onChange={(e) => setNewDivision(e.target.value)}
                      placeholder="Enter Client Name"
                      size="small"
                    />
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleAddDivision}
                      disabled={!newDivision.trim() || editDivisions.includes(newDivision.trim())}
                    >
                      Add
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => {
                        setShowDivisionForm(false);
                        setNewDivision("");
                      }}
                    >
                      Cancel
                    </Button>
                  </Box>
                </Box>
              )}

              {(() => {
  // Get divisions from clients that belong to this company
  // Check different possible field names for division
  const clientDivisions = profileClients.map(client => {
    console.log('🔍 DEBUG: Client data:', client);
    // Try different possible field names for division
    return client.division || client.divisionName || client.clientDivision || client.name;
  }).filter(name => name);
  
  // Get divisions directly from the company profile
  const companyDivisions = profileCompany?.divisions || [];

  // Combine client divisions and company divisions
  const combinedDivisions = [...clientDivisions, ...companyDivisions];

  // Remove duplicates using Set to get unique divisions
  const uniqueCombinedDivisions = Array.from(new Set(combinedDivisions));
  
  const divisionsToShow = isEditing ? editDivisions : uniqueCombinedDivisions;
  
  console.log('🔍 DEBUG: Divisions to show:', divisionsToShow);
  console.log('🔍 DEBUG: profileCompany divisions:', profileCompany?.divisions);
  console.log('🔍 DEBUG: profileClients:', profileClients);
  console.log('🔍 DEBUG: clientDivisions:', clientDivisions);
  console.log('🔍 DEBUG: isEditing:', isEditing);
  console.log('🔍 DEBUG: editDivisions:', editDivisions);
  
  return divisionsToShow.length === 0 ? (
    <Typography variant="body2" color="text.secondary">No clients added yet.</Typography>
  ) : (
    <Box sx={{ width: '100%', maxWidth: 700 }}>
      {divisionsToShow.map((division, index) => (
        <Box key={index} sx={{ border: '1px solid #eee', borderRadius: 1, p: 1, mt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1">{division}</Typography>
          {isEditing && (
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={() => handleRemoveDivision(division)}
            >
              Delete
            </Button>
          )}
        </Box>
      ))}
    </Box>
  );
})()}
              {/* Departments section */}
              <Divider sx={{ my: 2, width: '100%' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 700 }}>
                <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Departments</Typography>
                
              </Box>

              {profileClients.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No departments assigned to this company.</Typography>
              ) : (
                <Box sx={{ width: '100%', maxWidth: 700 }}>
                  {profileClients.map(cl => (
                    <Box key={cl.id} sx={{ border: '1px solid #eee', borderRadius: 1, p: 1, mt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="subtitle1">{cl.name}</Typography>
                        <Typography variant="body2" color="text.secondary">{cl.address || ''}</Typography>
                      </Box>
                      {isEditing && (
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => handleDeleteClient(cl.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
            
          )}
          
        </DialogContent>
        
        <DialogActions>
          {isEditing ? (
            <>
              <Button variant="outlined" onClick={handleCancelEdit}>
                Cancel
              </Button>
              <Button variant="contained" onClick={handleSaveEdit}>
                Save Changes
              </Button>
            </>
          ) : (
            <Button onClick={() => setProfileOpen(false)}>Close</Button>
          )}
        </DialogActions>

          
        
      </Dialog>

      

      {/* Bank Selection Dialog */}
      <Dialog open={showBankSelection} onClose={() => setShowBankSelection(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Select Bank to Assign</DialogTitle>
        <DialogContent>
          {availableBanks.length === 0 ? (
            <Typography>No unassigned banks available.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {availableBanks.map(bank => (
                <Box key={bank.id} sx={{ border: '1px solid #e0e0e0', borderRadius: 1, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="subtitle1">{bank.bankName}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Acct: {maskBankNumber(bank.accountNumber)}, Routing: {maskBankNumber(bank.routingNumber)}
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => handleAssignBank(bank)}
                  >
                    Assign
                  </Button>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBankSelection(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>



      {/* Client Selection Dialog */}
      <Dialog open={showClientSelection} onClose={() => setShowClientSelection(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Select Department to Assign</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
            <Typography variant="subtitle1">Create New Department</Typography>
            <TextField
              fullWidth
              size="small"
              label="Department Name"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              autoComplete="off"
            />
            <TextField
              fullWidth
              size="small"
              label="Department Address"
              value={newClientAddress}
              onChange={(e) => setNewClientAddress(e.target.value)}
              autoComplete="off"
            />
            <Button
              variant="contained"
              size="small"
              onClick={handleCreateClient}
              disabled={isCreatingClient || !newClientName.trim()}
            >
              {isCreatingClient ? "Creating..." : "Create & Assign Department"}
            </Button>
          </Box>
          {availableClients.length === 0 ? (
            <Typography>No unassigned departments available.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {availableClients.map(client => (
                <Box key={client.id} sx={{ border: '1px solid #e0e0e0', borderRadius: 1, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="subtitle1">{client.name}</Typography>
                    {client.address && (
                      <Typography variant="body2" color="text.secondary">
                        {client.address}
                      </Typography>
                    )}
                  </Box>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => handleAssignClient(client)}
                  >
                    Assign
                  </Button>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowClientSelection(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbarOpen(false)} 
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>

    </Paper>
  );
  
};

export default CompaniesManager;
