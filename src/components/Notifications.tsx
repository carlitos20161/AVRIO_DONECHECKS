import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  Tabs,
  Tab
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import NotificationsIcon from '@mui/icons-material/Notifications';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { collection, query, where, onSnapshot, updateDoc, doc, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';

interface Notification {
  id: string;
  message: string;
  checkNumber?: number;
  employeeName?: string;
  rejectedBy?: string;
  rejectedAt?: any;
  read: boolean;
  createdAt: any;
  companyName?: string;
  companyId?: string;
  clientName?: string;
  clientDivision?: string;
  clientDisplay?: string;
  clientId?: string;
}

const Notifications: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [activeTab, setActiveTab] = useState(0); // 0 = New, 1 = Past

  // Fetch notifications for current user
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    console.log('[Notifications] Setting up real-time listener for user:', currentUser.uid);

    // Set up real-time listener for notifications - fetch ALL notifications (both read and unread)
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: Notification[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Notification));

      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read).length);
      setLoading(false);
      console.log('[Notifications] Notifications updated:', notifs.length, 'unread:', notifs.filter(n => !n.read).length);
    }, (err) => {
      console.error('[Notifications] Listener error:', err);
      setLoading(false);
    });

    return () => {
      console.log('[Notifications] Cleaning up listener');
      unsubscribe();
    };
  }, []);

  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, "notifications", notificationId), { read: true });
      console.log('[Notifications] Marked as read:', notificationId);
    } catch (err) {
      console.error('[Notifications] Error marking as read:', err);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(n => !n.read);
      await Promise.all(
        unreadNotifications.map(notif => 
          updateDoc(doc(db, "notifications", notif.id), { read: true })
        )
      );
      console.log('[Notifications] All marked as read');
    } catch (err) {
      console.error('[Notifications] Error marking all as read:', err);
    }
  };

  // Open notification details
  const handleNotificationClick = (notification: Notification) => {
    setSelectedNotification(notification);
    if (!notification.read) {
      markAsRead(notification.id);
    }
  };

  // Close details dialog
  const handleCloseDetails = () => {
    setSelectedNotification(null);
  };

  return (
    <>
      {/* Notification Bell Icon */}
      <IconButton
        color="inherit"
        onClick={() => setOpen(true)}
        sx={{ position: 'relative' }}
      >
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>

      {/* Notifications Dialog */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              Notifications {unreadCount > 0 && `(${unreadCount} unread)`}
            </Typography>
            <Box>
              {unreadCount > 0 && activeTab === 0 && (
                <Button
                  size="small"
                  onClick={markAllAsRead}
                  sx={{ mr: 1 }}
                >
                  Mark All as Read
                </Button>
              )}
              <IconButton onClick={() => setOpen(false)} size="small">
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Tabs for New and Past */}
              <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
                  <Tab label={`New (${notifications.filter(n => !n.read).length})`} />
                  <Tab label={`Past (${notifications.filter(n => n.read).length})`} />
                </Tabs>
              </Box>

              {/* New Notifications (Unread) */}
              {activeTab === 0 && (
                notifications.filter(n => !n.read).length === 0 ? (
                  <Alert severity="info">No new notifications</Alert>
                ) : (
                  <List>
                    {notifications.filter(n => !n.read).map((notification, index) => (
                      <React.Fragment key={notification.id}>
                        <ListItem
                          disablePadding
                          sx={{
                            mb: 1,
                            borderRadius: 1,
                            backgroundColor: 'action.hover',
                          }}
                        >
                          <ListItemButton
                            onClick={() => handleNotificationClick(notification)}
                            sx={{
                              borderRadius: 1,
                              '&:hover': {
                                backgroundColor: 'action.selected'
                              }
                            }}
                          >
                            <Box sx={{ mr: 2 }}>
                              {notification.message.includes('rejected') ? (
                                <CancelIcon color="error" />
                              ) : (
                                <CheckCircleIcon color="success" />
                              )}
                            </Box>
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Typography variant="body1">
                                    {notification.message}
                                  </Typography>
                                  <Chip
                                    label="New"
                                    size="small"
                                    color="error"
                                    sx={{ height: 20, fontSize: '0.7rem' }}
                                  />
                                </Box>
                              }
                              secondary={
                                notification.rejectedAt && (
                                  <Typography variant="caption" color="text.secondary">
                                    Rejected by {notification.rejectedBy} • {notification.rejectedAt?.toDate?.()?.toLocaleString() || 'Recently'}
                                  </Typography>
                                )
                              }
                            />
                          </ListItemButton>
                        </ListItem>
                        {index < notifications.filter(n => !n.read).length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </List>
                )
              )}

              {/* Past Notifications (Read) */}
              {activeTab === 1 && (
                notifications.filter(n => n.read).length === 0 ? (
                  <Alert severity="info">No past notifications</Alert>
                ) : (
                  <List>
                    {notifications.filter(n => n.read).map((notification, index) => (
                      <React.Fragment key={notification.id}>
                        <ListItem
                          disablePadding
                          sx={{
                            mb: 1,
                            borderRadius: 1,
                            backgroundColor: 'inherit',
                          }}
                        >
                          <ListItemButton
                            onClick={() => handleNotificationClick(notification)}
                            sx={{
                              borderRadius: 1,
                              '&:hover': {
                                backgroundColor: 'action.selected'
                              }
                            }}
                          >
                            <Box sx={{ mr: 2 }}>
                              {notification.message.includes('rejected') ? (
                                <CancelIcon color="error" />
                              ) : (
                                <CheckCircleIcon color="success" />
                              )}
                            </Box>
                            <ListItemText
                              primary={
                                <Typography variant="body1">
                                  {notification.message}
                                </Typography>
                              }
                              secondary={
                                notification.rejectedAt && (
                                  <Typography variant="caption" color="text.secondary">
                                    Rejected by {notification.rejectedBy} • {notification.rejectedAt?.toDate?.()?.toLocaleString() || 'Recently'}
                                  </Typography>
                                )
                              }
                            />
                          </ListItemButton>
                        </ListItem>
                        {index < notifications.filter(n => n.read).length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </List>
                )
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Notification Details Dialog */}
      <Dialog
        open={!!selectedNotification}
        onClose={handleCloseDetails}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Check Rejected</Typography>
            <IconButton onClick={handleCloseDetails} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedNotification && (
            <Box>
              <Alert severity="error" sx={{ mb: 2 }}>
                <Typography variant="body1" fontWeight="bold">
                  Check #{selectedNotification.checkNumber} was rejected
                </Typography>
              </Alert>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Employee:
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {selectedNotification.employeeName}
                </Typography>
              </Box>

              {selectedNotification.companyName && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Company:
                  </Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {selectedNotification.companyName}
                  </Typography>
                </Box>
              )}

              {selectedNotification.clientDisplay && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Client:
                  </Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {selectedNotification.clientDisplay}
                  </Typography>
                </Box>
              )}

              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Rejected by:
                </Typography>
                <Typography variant="body1">
                  {selectedNotification.rejectedBy}
                </Typography>
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Rejected at:
                </Typography>
                <Typography variant="body1">
                  {selectedNotification.rejectedAt?.toDate?.()?.toLocaleString() || 'Recently'}
                </Typography>
              </Box>

              <Box sx={{ mt: 3, p: 2, bgcolor: 'warning.light', borderRadius: 1 }}>
                <Typography variant="body2" fontWeight="bold" color="warning.dark">
                  ⚠️ Action Required:
                </Typography>
                <Typography variant="body2" color="warning.dark">
                  Please review the check details and create a new check with the correct information.
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDetails}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Notifications;

