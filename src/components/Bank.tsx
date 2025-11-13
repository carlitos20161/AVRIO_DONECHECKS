import React, { useEffect, useState } from "react";
import { encryptBankData, decryptBankData, decryptData } from '../utils/encryption';
import {
  Box,
  Paper,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Divider,
  Avatar,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  InputAdornment,
} from "@mui/material";
import {
  AccountBalance,
  AccountBalanceWallet,
  CreditCard,
  Business,
  Add,
  Visibility,
  Delete,
  Edit,
  CheckCircle,
  Warning,
  Info,
  Numbers,
  Route,
  Start,
  CloudUpload,
  AttachFile,
} from '@mui/icons-material';
import { db } from "../firebase";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

interface Bank {
  id: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  startingCheckNumber: string;
  companyId?: string;
  attachmentFile?: string; // Base64 encoded file
  attachmentFileName?: string;
  digitalSignature?: string; // Base64 encoded digital signature
  digitalSignatureFileName?: string;
}

interface Company {
  id: string;
  name: string;
}

interface BankPageProps {
  currentRole: string;
}

const BankPage: React.FC<BankPageProps> = ({ currentRole }) => {
  console.log('🚀 BankPage component is rendering!');
  
  const [banks, setBanks] = useState<Bank[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profileChecks, setProfileChecks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // for details dialog
  const [openDetails, setOpenDetails] = useState(false);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);

  // for add dialog
  const [openForm, setOpenForm] = useState(false);
  const [bankName, setBankName] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [startingCheckNumber, setStartingCheckNumber] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  // Add file state variables
  const [attachmentFile, setAttachmentFile] = useState<string | null>(null);
  const [attachmentFileName, setAttachmentFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Add signature state variables
  const [digitalSignature, setDigitalSignature] = useState<string>("");
  const [digitalSignatureFile, setDigitalSignatureFile] = useState<File | null>(null);

  // fetch banks
  const fetchBanks = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, "banks"));
      const list: Bank[] = snap.docs.map((d) => {
        const data = d.data() as any;
        
        // Decrypt sensitive data when fetching
        const decryptedData = decryptBankData({
          routingNumber: String(data.routingNumber ?? ""),
          accountNumber: String(data.accountNumber ?? ""),
        });
        
        return {
          id: d.id,
          bankName: String(data.bankName ?? ""),
          routingNumber: decryptedData.routingNumber,
          accountNumber: decryptedData.accountNumber,
          startingCheckNumber: String(data.startingCheckNumber ?? ""),
          companyId: String(data.companyId ?? ""),
          attachmentFile: data.attachmentFile || "",
          attachmentFileName: data.attachmentFileName || "",
          digitalSignature: data.digitalSignature || "",
          digitalSignatureFileName: data.digitalSignatureFileName || "",
        };
      });
      setBanks(list);
    } catch (error) {
      console.error("Error fetching banks:", error);
    } finally {
      setLoading(false);
    }
  };

  // fetch companies
  const fetchCompanies = async () => {
    try {
      const snap = await getDocs(collection(db, "companies"));
      const list: Company[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: String(data.name ?? "")
        };
      });
      setCompanies(list);
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

  // File upload handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachmentFile(reader.result as string);
        setAttachmentFileName(file.name);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachmentFile(reader.result as string);
        setAttachmentFileName(file.name);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle digital signature upload
  const handleDigitalSignatureUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setDigitalSignatureFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setDigitalSignature(result);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    fetchBanks().catch(console.error);
    fetchCompanies().catch(console.error);
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this bank?")) return;
    try {
      await deleteDoc(doc(db, "banks", id));
      setOpenDetails(false);
      await fetchBanks();
    } catch (error) {
      console.error("Error deleting bank:", error);
      alert("Failed to delete bank");
    }
  };

  const handleSave = async () => {
    if (!bankName.trim() || !routingNumber.trim() || !accountNumber.trim() || !selectedCompanyId.trim()) {
      alert("Please fill in all required fields");
      return;
    }
    try {
      setLoading(true);
      
      const bankData = {
        bankName: bankName,
        routingNumber: routingNumber,
        accountNumber: accountNumber,
        startingCheckNumber: startingCheckNumber,
        companyId: selectedCompanyId,
        attachmentFile: attachmentFile,
        attachmentFileName: attachmentFileName,
        digitalSignature: digitalSignature,
        digitalSignatureFileName: digitalSignatureFile?.name || "",
        createdAt: serverTimestamp(),
      };
      
      // Encrypt sensitive data before saving
      const encryptedBankData = encryptBankData(bankData);
      
      await addDoc(collection(db, "banks"), encryptedBankData);
      setOpenForm(false);
      setBankName("");
      setRoutingNumber("");
      setAccountNumber("");
      setStartingCheckNumber("");
      setSelectedCompanyId("");
      setAttachmentFile(null);
      setAttachmentFileName(null);
      setDigitalSignature("");
      setDigitalSignatureFile(null);
      await fetchBanks();
    } catch (error) {
      console.error("Error adding bank:", error);
      alert("Failed to add bank");
    } finally {
      setLoading(false);
    }
  };

  // When opening details, fetch checks for this bank
  const handleOpenDetails = async (bank: Bank) => {
    setSelectedBank(bank);
    setOpenDetails(true);
    try {
      // Fetch checks for this bank through company association
      const snap = await getDocs(collection(db, 'checks'));
      const checks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Filter checks that are associated with this bank through company association
      let bankChecks = checks.filter((c: any) => {
        // Check if the check's companyId matches the bank's companyId
        return c.companyId === bank.companyId;
      });
      
      // If no checks found by companyId, try alternative approaches
      if (bankChecks.length === 0) {
        console.log(`[DEBUG] No checks found by companyId, trying alternative methods...`);
        
        // Try to find checks that might reference this bank directly
        const directBankChecks = checks.filter((c: any) => {
          return c.bankId === bank.id || 
                 c.bankName === bank.bankName ||
                 c.routingNumber === bank.routingNumber;
        });
        
        if (directBankChecks.length > 0) {
          console.log(`[DEBUG] Found ${directBankChecks.length} checks by direct bank reference`);
          bankChecks = directBankChecks;
        }
        
        // Log all available check fields to understand the data structure
        if (checks.length > 0) {
          console.log(`[DEBUG] Available check fields:`, Object.keys(checks[0]));
          console.log(`[DEBUG] Sample check companyId:`, (checks[0] as any).companyId);
          console.log(`[DEBUG] Sample check bankId:`, (checks[0] as any).bankId);
        }
      }
      
      // Sort checks by check number in descending order (highest to lowest)
      if (bankChecks.length > 0) {
        bankChecks.sort((a: any, b: any) => {
          const checkA = parseInt(a.checkNumber?.toString() || '0');
          const checkB = parseInt(b.checkNumber?.toString() || '0');
          return checkB - checkA; // Descending order (highest first)
        });
        console.log(`[DEBUG] Sorted checks by check number (highest to lowest)`);
      }
      
      console.log(`[DEBUG] Bank ${bank.bankName} (${bank.id}) has companyId: ${bank.companyId}`);
      console.log(`[DEBUG] Total checks in system: ${checks.length}`);
      console.log(`[DEBUG] Found ${bankChecks.length} checks for company ${bank.companyId}`);
      
      if (bankChecks.length > 0) {
        console.log(`[DEBUG] Sample check data:`, bankChecks[0]);
        console.log(`[DEBUG] First check number:`, (bankChecks[0] as any).checkNumber);
        console.log(`[DEBUG] Last check number:`, (bankChecks[bankChecks.length - 1] as any).checkNumber);
      } else {
        console.log(`[DEBUG] No checks found. Checking all checks for companyId pattern...`);
        const allCompanyIds = Array.from(new Set(checks.map((c: any) => c.companyId).filter(Boolean)));
        console.log(`[DEBUG] All companyIds found in checks:`, allCompanyIds);
        console.log(`[DEBUG] Bank companyId: ${bank.companyId}`);
        console.log(`[DEBUG] Bank companyId type:`, typeof bank.companyId);
        console.log(`[DEBUG] Bank companyId length:`, bank.companyId ? bank.companyId.length : 'undefined');
      }
      
      setProfileChecks(bankChecks);
    } catch (error) {
      console.error("Error fetching checks:", error);
      setProfileChecks([]);
    }
  };

  const getBankIcon = (bankName: string) => {
    const name = bankName.toLowerCase();
    if (name.includes('chase')) return <CreditCard />;
    if (name.includes('bank')) return <AccountBalance />;
    if (name.includes('jpmorgan') || name.includes('jp')) return <Business />;
    return <AccountBalanceWallet />;
  };

  const getBankColor = (bankName: string) => {
    const name = bankName.toLowerCase();
    if (name.includes('chase')) return '#1170D0';
    if (name.includes('jpmorgan') || name.includes('jp')) return '#E31837';
    if (name.includes('tdbank') || name.includes('td')) return '#FF6B35';
    if (name.includes('bcb')) return '#1E4D2B';
    return '#1976D2';
  };

  // Helper function to show only last 4 digits
  const maskBankNumber = (number: string) => {
    if (!number || number.length < 4) return number;
    // Don't decrypt again - the data is already decrypted
    return number.length > 4 ? '****' + number.slice(-4) : number;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
      {/* Header Section */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <AccountBalance sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h3" component="h1" fontWeight="bold" color="primary">
            Banks
          </Typography>
        </Box>
        
        {/* Statistics Cards */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 3 }}>
          <Box sx={{ flex: '1 1 200px', minWidth: '200px' }}>
            <Paper elevation={2} sx={{ p: 2, textAlign: 'center', backgroundColor: '#f8f9fa' }}>
              <Typography variant="h4" color="primary" fontWeight="bold">
                {banks.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Banks
              </Typography>
            </Paper>
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: '200px' }}>
            <Paper elevation={2} sx={{ p: 2, textAlign: 'center', backgroundColor: '#f8f9fa' }}>
              <Typography variant="h4" color="success.main" fontWeight="bold">
                {banks.filter(b => b.companyId).length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Active Banks
              </Typography>
            </Paper>
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: '200px' }}>
            <Paper elevation={2} sx={{ p: 2, textAlign: 'center', backgroundColor: '#f8f9fa' }}>
              <Typography variant="h4" color="info.main" fontWeight="bold">
                {companies.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Companies
              </Typography>
            </Paper>
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: '200px' }}>
            <Paper elevation={2} sx={{ p: 2, textAlign: 'center', backgroundColor: '#f8f9fa' }}>
              <Typography variant="h4" color="warning.main" fontWeight="bold">
                {profileChecks.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Checks
              </Typography>
            </Paper>
          </Box>
        </Box>

        {/* Add Bank Button (Admin Only) */}
        {currentRole === 'admin' && (
        <Button
          variant="contained"
          color="primary"
          size="large"
          startIcon={<Add />}
          onClick={() => setOpenForm(true)}
          sx={{ 
            mb: 3,
            px: 4,
            py: 1.5,
            fontSize: '1.1rem',
            fontWeight: 600,
            borderRadius: 2,
            boxShadow: 3
          }}
        >
          + ADD BANK
        </Button>
        )}
      </Box>

      {/* Banks Grid */}
      {banks.length === 0 ? (
        <Paper elevation={2} sx={{ p: 6, textAlign: 'center', backgroundColor: '#f8f9fa' }}>
          <AccountBalance sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h5" color="text.secondary" gutterBottom>
            No Banks Found
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            {currentRole === 'admin' 
              ? 'Get started by adding your first bank account'
              : 'No bank accounts configured yet'}
          </Typography>
          {currentRole === 'admin' && (
          <Button
            variant="contained"
            color="primary"
            size="large"
            startIcon={<Add />}
            onClick={() => setOpenForm(true)}
          >
            Add Your First Bank
          </Button>
          )}
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {banks.map((bank) => {
            const company = companies.find((c) => c.id === bank.companyId);
            return (
              <Box key={bank.id} sx={{ flex: '1 1 350px', minWidth: '350px', maxWidth: '400px' }}>
                <Card 
                  elevation={3} 
                  sx={{ 
                    height: '100%',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: 6,
                      cursor: 'pointer'
                    }
                  }}
                  onClick={() => handleOpenDetails(bank)}
                >
                  <CardContent sx={{ p: 3 }}>
                    {/* Bank Header */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                      <Avatar 
                        sx={{ 
                          bgcolor: getBankColor(bank.bankName),
                          width: 56,
                          height: 56
                        }}
                      >
                        {getBankIcon(bank.bankName)}
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="h6" fontWeight="bold" gutterBottom>
                          {bank.bankName || "(No name)"}
                        </Typography>
                        {company && (
                          <Chip
                            icon={<Business />}
                            label={company.name}
                            color="primary"
                            variant="outlined"
                            size="small"
                          />
                        )}
                      </Box>
                    </Box>

                    {/* Bank Details */}
                    <Box sx={{ space: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                        <Route color="action" fontSize="small" />
                        <Typography variant="body2" color="text.secondary">
                          <strong>Routing:</strong> {maskBankNumber(bank.routingNumber)}
                        </Typography>
                      </Box>
                      
                                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                          <Numbers color="action" fontSize="small" />
                          <Typography variant="body2" color="text.secondary">
                            <strong>Account:</strong> {maskBankNumber(bank.accountNumber)}
                          </Typography>
                        </Box>
                      
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <Start color="action" fontSize="small" />
                        <Typography variant="body2" color="text.secondary">
                          <strong>Start#:</strong> {bank.startingCheckNumber}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Action Buttons */}
                    <Box sx={{ display: 'flex', gap: 1, mt: 'auto' }}>
                      <Tooltip title="View Details">
                        <IconButton 
                          size="small" 
                          color="primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetails(bank);
                          }}
                        >
                          <Visibility />
                        </IconButton>
                      </Tooltip>
                      
                      {currentRole === 'admin' && (
                      <Tooltip title="Delete Bank">
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(bank.id);
                          }}
                        >
                          <Delete />
                        </IconButton>
                      </Tooltip>
                      )}
                    </Box>

                    {/* Digital Signature Preview */}
                    {bank.digitalSignature && (
                      <Box sx={{ mt: 1, p: 1, border: '1px solid #ccc', borderRadius: 1, backgroundColor: '#f5f5f5' }}>
                        <Typography variant="caption" display="block" gutterBottom>
                          Digital Signature:
                        </Typography>
                        {bank.digitalSignature.startsWith('data:image/') ? (
                          <img 
                            src={bank.digitalSignature} 
                            alt="Digital Signature" 
                            style={{ maxWidth: '150px', maxHeight: '60px', objectFit: 'contain' }}
                          />
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AttachFile sx={{ fontSize: 24, color: 'primary.main' }} />
                            <Typography variant="body2">
                              PDF Signature File
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Add Bank Dialog */}
      <Dialog
        open={openForm}
        onClose={() => setOpenForm(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 2,
          pb: 1
        }}>
          <Add color="primary" />
          Add New Bank
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 1 }}>
            <TextField
              label="Bank Name"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              fullWidth
              required
              placeholder="e.g., Chase Bank, JPMorgan"
            />
            <TextField
              label="Routing Number"
              value={routingNumber}
              onChange={(e) => setRoutingNumber(e.target.value)}
              fullWidth
              required
              placeholder="9-digit routing number"
            />
            <TextField
              label="Account Number"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              fullWidth
              required
              placeholder="Account number"
            />
            <TextField
              label="Starting Check Number"
              value={startingCheckNumber}
              onChange={(e) => setStartingCheckNumber(e.target.value)}
              fullWidth
              required
              placeholder="e.g., 1000"
            />
            <FormControl fullWidth required>
              <InputLabel id="company-select-label">Select Company</InputLabel>
              <Select
                labelId="company-select-label"
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
              >
                {companies.map((company) => (
                  <MenuItem key={company.id} value={company.id}>
                    {company.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
           
            
         

            {/* Digital Signature Upload */}
            <Box
              sx={{
                border: '2px dashed #ccc',
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.02)',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                '&:hover': {
                  borderColor: '#1976d2',
                  backgroundColor: 'rgba(25, 118, 210, 0.04)',
                },
              }}
              onClick={() => document.getElementById('digital-signature-upload')?.click()}
            >
              <input
                id="digital-signature-upload"
                type="file"
                accept="image/*,application/pdf"  // Add PDF support
                hidden
                onChange={handleDigitalSignatureUpload}
              />
              <AttachFile sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant="h6" gutterBottom>
                Drop image here or click to upload
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Supports PNG, JPG, JPEG, PDF files
              </Typography>
              {digitalSignatureFile && (
                <Box sx={{ mt: 2, p: 1, backgroundColor: 'info.light', borderRadius: 1 }}>
                  <Typography variant="body2" color="info.dark">
                    ✅ {digitalSignatureFile.name}
                  </Typography>
                </Box>
              )}
            </Box>

            <Alert severity="info" icon={<Info />}>
              <Typography variant="body2">
                <strong>Note:</strong> All fields are required. The bank will be associated with the selected company.
              </Typography>
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button 
            onClick={() => setOpenForm(false)}
            variant="outlined"
            size="large"
          >
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={handleSave}
            size="large"
            startIcon={<CheckCircle />}
          >
            Save Bank
          </Button>
        </DialogActions>
      </Dialog>

      {/* Details Dialog */}
      <Dialog
        open={openDetails}
        onClose={() => setOpenDetails(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 2,
          pb: 1
        }}>
          <AccountBalance color="primary" />
          Bank Details
        </DialogTitle>
        <DialogContent>
          {selectedBank && (
            <Box>
              {/* Bank Info Section */}
              <Paper elevation={1} sx={{ p: 3, mb: 3, backgroundColor: '#f8f9fa' }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <Avatar 
                        sx={{ 
                          bgcolor: getBankColor(selectedBank.bankName),
                          width: 64,
                          height: 64
                        }}
                      >
                        {getBankIcon(selectedBank.bankName)}
                      </Avatar>
                      <Box>
                        <Typography variant="h5" fontWeight="bold" gutterBottom>
                          {selectedBank.bankName}
                        </Typography>
                        {companies.find((c) => c.id === selectedBank.companyId) && (
                          <Chip
                            icon={<Business />}
                            label={companies.find((c) => c.id === selectedBank.companyId)?.name}
                            color="primary"
                            size="medium"
                          />
                        )}
                      </Box>
                    </Box>
                  </Box>
                  
                  <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Route color="action" />
                        <Typography variant="body1">
                          <strong>Routing Number:</strong> {maskBankNumber(selectedBank.routingNumber)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Numbers color="action" />
                        <Typography variant="body1">
                          <strong>Account Number:</strong> {maskBankNumber(selectedBank.accountNumber)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Start color="action" />
                        <Typography variant="body1">
                          <strong>Starting Check #:</strong> {selectedBank.startingCheckNumber}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </Paper>

              {/* Checks Section */}
              <Box>
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CreditCard color="primary" />
                  Checks Made With This Bank
                </Typography>
                
                                 {profileChecks.length === 0 ? (
                   <Paper elevation={1} sx={{ p: 4, textAlign: 'center', backgroundColor: '#f8f9fa' }}>
                     <CreditCard sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
                     <Typography variant="body1" color="text.secondary" gutterBottom>
                       No checks found for this bank yet.
                     </Typography>
                     
                     {/* Debug Information */}
                     <Box sx={{ mt: 2, p: 2, backgroundColor: '#fff3cd', borderRadius: 1, border: '1px solid #ffeaa7' }}>
                       <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                         <strong>Debug Info:</strong>
                       </Typography>
                       <Typography variant="caption" color="text.secondary" component="div">
                         Bank Company ID: {selectedBank?.companyId || 'Not set'}
                       </Typography>
                       <Typography variant="caption" color="text.secondary" component="div">
                         Company Name: {companies.find(c => c.id === selectedBank?.companyId)?.name || 'Unknown'}
                       </Typography>
                       <Typography variant="caption" color="text.secondary" component="div">
                         Total Checks in System: {profileChecks.length}
                       </Typography>
                     </Box>
                   </Paper>
                 ) : (
                  <TableContainer component={Paper} elevation={1}>
                    <Table>
                      <TableHead>
                        <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                          <TableCell><strong>Check #</strong></TableCell>
                          <TableCell><strong>Employee</strong></TableCell>
                          <TableCell><strong>Amount</strong></TableCell>
                          <TableCell><strong>Date</strong></TableCell>
                          <TableCell><strong>Status</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {profileChecks.map((check) => (
                          <TableRow key={check.id} hover>
                            <TableCell>
                              <Typography variant="body2" fontWeight="500">
                                {check.checkNumber ?? 'N/A'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {check.employeeName ?? 'N/A'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight="600" color="primary">
                                ${(parseFloat(check.amount?.toString() || '0')).toFixed(2)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {check.date ? new Date(check.date).toLocaleDateString() : 'N/A'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={check.paid ? 'Paid' : 'Unpaid'}
                                color={check.paid ? 'success' : 'warning'}
                                size="small"
                                icon={check.paid ? <CheckCircle /> : <Warning />}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          {selectedBank && currentRole === 'admin' && (
            <Button 
              color="error" 
              variant="outlined"
              onClick={() => handleDelete(selectedBank.id)}
              startIcon={<Delete />}
            >
              Delete Bank
            </Button>
          )}
          <Button 
            onClick={() => setOpenDetails(false)}
            variant="contained"
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BankPage;
