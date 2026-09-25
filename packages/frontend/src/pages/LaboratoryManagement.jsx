import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Box,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Card,
  CardContent,
  Tooltip,
} from '@mui/material';
import { 
  Edit as EditIcon, 
  Delete as DeleteIcon, 
  Add as AddIcon, 
  DeleteForever as DeleteForeverIcon,
  Block as BlockIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { api } from '../context/AuthContext';

const LaboratoryManagement = () => {
  const [laboratories, setLaboratories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentLab, setCurrentLab] = useState(null);

  // Delete Confirmation Dialog State
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [labToDelete, setLabToDelete] = useState(null);

  // Permanent Delete Confirmation Dialog State with Safety Verification
  const [openPermanentDeleteDialog, setOpenPermanentDeleteDialog] = useState(false);
  const [labToPermanentlyDelete, setLabToPermanentlyDelete] = useState(null);
  const [checkingDependencies, setCheckingDependencies] = useState(false);
  const [dependencyData, setDependencyData] = useState(null);
  const [permanentDeleteLoading, setPermanentDeleteLoading] = useState(false);
  const [permanentDeleteError, setPermanentDeleteError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    location: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    country: '',
    operatingHours: '',
    capacity: '',
    certifications: '',
    equipmentList: '',
    description: '',
    status: 'active',
  });

  const [formErrors, setFormErrors] = useState({
    email: '',
    phone: '',
  });

  const [filters, setFilters] = useState({
    status: 'active',
    search: '',
  });

  // Fetch laboratories
  useEffect(() => {
    fetchLaboratories();
  }, [filters]);

  const fetchLaboratories = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(
        `/admin/laboratories`,
        {
          params: {
            status: filters.status || undefined,
            search: filters.search || undefined,
            page: 1,
            limit: 100,
          },
        }
      );
      setLaboratories(response.data.data.laboratories || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch laboratories');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (lab = null) => {
    if (lab) {
      setIsEditing(true);
      setCurrentLab(lab);
      setFormData({
        name: lab.name,
        location: lab.location,
        email: lab.email,
        phone: lab.phone,
        address: lab.address,
        city: lab.city,
        postalCode: lab.postalCode,
        country: lab.country,
        operatingHours: lab.operatingHours,
        capacity: lab.capacity,
        certifications: lab.certifications.join(', '),
        equipmentList: lab.equipmentList.join(', '),
        description: lab.description || '',
        status: lab.status,
      });
    } else {
      setIsEditing(false);
      setCurrentLab(null);
      setFormData({
        name: '',
        location: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        postalCode: '',
        country: '',
        operatingHours: '',
        capacity: '',
        certifications: '',
        equipmentList: '',
        description: '',
        status: 'active',
      });
    }
    setOpenDialog(true);
    setFormErrors({ email: '', phone: '' });
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setIsEditing(false);
    setCurrentLab(null);
    setFormErrors({ email: '', phone: '' });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    // Pre-validation
    const emailRegex = /.+@.+\..+/;
    const phoneRegex = /^[0-9]{10}$/;
    
    let hasErrors = false;
    const newErrors = { email: '', phone: '' };

    if (!emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
      hasErrors = true;
    }

    if (!phoneRegex.test(formData.phone)) {
      newErrors.phone = 'Phone number must be exactly 10 digits';
      hasErrors = true;
    }

    if (hasErrors) {
      setFormErrors(newErrors);
      return;
    }

    try {
      const payload = {
        ...formData,
        capacity: parseInt(formData.capacity),
        certifications: formData.certifications
          .split(',')
          .map((c) => c.trim())
          .filter((c) => c),
        equipmentList: formData.equipmentList
          .split(',')
          .map((e) => e.trim())
          .filter((e) => e),
      };

      if (isEditing && currentLab) {
        // Update
        await api.put(
          `/admin/laboratories/${currentLab._id}`,
          payload
        );
        setSuccess('Laboratory updated successfully');
      } else {
        // Create
        await api.post(
          `/admin/laboratories`,
          payload
        );
        setSuccess('Laboratory created successfully');
        // Clear the search bar so the newly added lab shows up
        setFilters(prev => ({ ...prev, search: '' }));
      }

      handleCloseDialog();
      fetchLaboratories();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save laboratory');
    }
  };

  const handleDeleteClick = (lab) => {
    setLabToDelete(lab);
    setOpenDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!labToDelete) return;
    
    try {
      await api.delete(`/admin/laboratories/${labToDelete._id}`);
      setSuccess('Laboratory deactivated successfully');
      fetchLaboratories();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete laboratory');
    } finally {
      setOpenDeleteDialog(false);
      setLabToDelete(null);
    }
  };

  const handlePermanentDeleteClick = async (lab) => {
    setLabToPermanentlyDelete(lab);
    setOpenPermanentDeleteDialog(true);
    setCheckingDependencies(true);
    setDependencyData(null);
    setPermanentDeleteError('');

    try {
      const response = await api.get(`/admin/laboratories/${lab._id}/dependencies`);
      setDependencyData(response.data?.data || null);
    } catch (err) {
      console.error('Error fetching lab dependencies:', err);
      setPermanentDeleteError(err.response?.data?.message || 'Failed to check laboratory dependencies');
    } finally {
      setCheckingDependencies(false);
    }
  };

  const handleClosePermanentDeleteDialog = () => {
    setOpenPermanentDeleteDialog(false);
    setLabToPermanentlyDelete(null);
    setDependencyData(null);
    setPermanentDeleteError('');
    setPermanentDeleteLoading(false);
  };

  const handleConfirmPermanentDelete = async () => {
    if (!labToPermanentlyDelete) return;

    setPermanentDeleteLoading(true);
    setPermanentDeleteError('');

    try {
      await api.delete(`/admin/laboratories/${labToPermanentlyDelete._id}/permanent?confirm=true`);
      setSuccess(`Laboratory "${labToPermanentlyDelete.name}" permanently deleted successfully`);
      handleClosePermanentDeleteDialog();
      fetchLaboratories();
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to permanently delete laboratory';
      setPermanentDeleteError(errorMsg);
      // If backend returned active requests in errors
      if (err.response?.data?.errors && Array.isArray(err.response.data.errors)) {
        setDependencyData({
          laboratoryId: labToPermanentlyDelete._id,
          laboratoryName: labToPermanentlyDelete.name,
          canPermanentlyDelete: false,
          activeRequestsCount: err.response.data.errors.length,
          activeRequests: err.response.data.errors,
        });
      }
    } finally {
      setPermanentDeleteLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <h2>Laboratory Management</h2>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Add Laboratory
          </Button>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              placeholder="Search by name, location, or city..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              size="small"
              type="search"
              autoComplete="off"
              name="laboratory_search"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filters.status}
                label="Status"
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
                <MenuItem value="suspended">Suspended</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell><strong>Name</strong></TableCell>
                <TableCell><strong>Location</strong></TableCell>
                <TableCell><strong>Email</strong></TableCell>
                <TableCell><strong>Capacity</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell align="center"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {laboratories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No laboratories found
                  </TableCell>
                </TableRow>
              ) : (
                laboratories.map((lab) => (
                  <TableRow key={lab._id} hover>
                    <TableCell>{lab.name}</TableCell>
                    <TableCell>{lab.location}</TableCell>
                    <TableCell>{lab.email}</TableCell>
                    <TableCell>{lab.capacity}</TableCell>
                    <TableCell>
                      <Chip
                        label={lab.status}
                        color={lab.status === 'active' ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleOpenDialog(lab)}
                        title="Edit"
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteClick(lab)}
                        title="Deactivate"
                      >
                        <DeleteIcon />
                      </IconButton>
                      <Tooltip title="Permanently Delete (Verifies Lab Schedules)">
                        <IconButton
                          size="small"
                          sx={{ color: '#d32f2f' }}
                          onClick={() => handlePermanentDeleteClick(lab)}
                        >
                          <DeleteForeverIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Dialog for Create/Edit */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {isEditing ? 'Edit Laboratory' : 'Add New Laboratory'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            fullWidth
            label="Laboratory Name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
          />
          <TextField
            fullWidth
            label="Location"
            name="location"
            value={formData.location}
            onChange={handleInputChange}
            required
          />
          <TextField
            fullWidth
            label="Email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleInputChange}
            error={!!formErrors.email}
            helperText={formErrors.email}
            required
          />
          <TextField
            fullWidth
            label="Phone"
            name="phone"
            value={formData.phone}
            onChange={handleInputChange}
            error={!!formErrors.phone}
            helperText={formErrors.phone}
            required
          />
          <TextField
            fullWidth
            label="Address"
            name="address"
            value={formData.address}
            onChange={handleInputChange}
            required
          />
          <TextField
            fullWidth
            label="City"
            name="city"
            value={formData.city}
            onChange={handleInputChange}
            required
          />
          <TextField
            fullWidth
            label="Postal Code"
            name="postalCode"
            value={formData.postalCode}
            onChange={handleInputChange}
            required
          />
          <TextField
            fullWidth
            label="Country"
            name="country"
            value={formData.country}
            onChange={handleInputChange}
            required
          />
          <TextField
            fullWidth
            label="Operating Hours"
            name="operatingHours"
            value={formData.operatingHours}
            onChange={handleInputChange}
            placeholder="e.g., 9 AM - 5 PM"
            required
          />
          <TextField
            fullWidth
            label="Capacity"
            name="capacity"
            type="number"
            value={formData.capacity}
            onChange={handleInputChange}
            required
          />
          <TextField
            fullWidth
            label="Certifications (comma-separated)"
            name="certifications"
            value={formData.certifications}
            onChange={handleInputChange}
            placeholder="ISO 9001, ISO 17025"
          />
          <TextField
            fullWidth
            label="Equipment List (comma-separated)"
            name="equipmentList"
            value={formData.equipmentList}
            onChange={handleInputChange}
            multiline
            rows={2}
            placeholder="Microscope, Centrifuge"
          />
          <TextField
            fullWidth
            label="Description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            multiline
            rows={2}
          />
          {isEditing && (
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                name="status"
                value={formData.status}
                label="Status"
                onChange={handleInputChange}
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
                <MenuItem value="suspended">Suspended</MenuItem>
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" color="primary">
            {isEditing ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog for Delete/Deactivate */}
      <Dialog
        open={openDeleteDialog}
        onClose={() => setOpenDeleteDialog(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
          }
        }}
      >
        <DialogTitle sx={{ color: 'error.main', fontWeight: 'bold' }}>
          Deactivate Laboratory?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to deactivate the laboratory <strong>{labToDelete?.name}</strong>? 
            This action can be reversed later if needed.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button 
            onClick={() => setOpenDeleteDialog(false)} 
            color="inherit" 
            variant="text"
            sx={{ fontWeight: 500 }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmDelete} 
            variant="contained" 
            color="error"
            disableElevation
            sx={{ borderRadius: 1.5, fontWeight: 600 }}
          >
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>

      {/* Safe Permanent Delete Dialog with Dependency Verification */}
      <Dialog
        open={openPermanentDeleteDialog}
        onClose={handleClosePermanentDeleteDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            border: dependencyData && !dependencyData.canPermanentlyDelete 
              ? '2px solid #ed6c02' 
              : '2px solid #d32f2f',
          }
        }}
      >
        <Box sx={{ 
          bgcolor: dependencyData && !dependencyData.canPermanentlyDelete ? '#e65100' : 'error.main', 
          color: 'white', 
          p: 2, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          gap: 1 
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {dependencyData && !dependencyData.canPermanentlyDelete ? (
              <BlockIcon />
            ) : (
              <DeleteForeverIcon />
            )}
            <DialogTitle sx={{ p: 0, fontWeight: 'bold', fontSize: '1.15rem' }}>
              {dependencyData && !dependencyData.canPermanentlyDelete
                ? 'CANNOT PERMANENTLY DELETE — ACTIVE SCHEDULES ASSIGNED'
                : 'PERMANENT DELETE LABORATORY'}
            </DialogTitle>
          </Box>
          <Chip 
            label={labToPermanentlyDelete?.name || 'Laboratory'} 
            sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }}
            size="small"
          />
        </Box>

        <DialogContent sx={{ mt: 2, pb: 1 }}>
          {/* Loading Dependency Check */}
          {checkingDependencies && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4, gap: 2 }}>
              <CircularProgress size={36} color="error" />
              <Typography variant="body1" color="text.secondary">
                Checking lab staff dashboard assignments and active test schedules...
              </Typography>
            </Box>
          )}

          {/* Error Alert */}
          {permanentDeleteError && !checkingDependencies && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {permanentDeleteError}
            </Alert>
          )}

          {/* Case 1: Dependency Check Blocked (Assigned to Schedules) */}
          {!checkingDependencies && dependencyData && !dependencyData.canPermanentlyDelete && (
            <Box>
              <Alert 
                severity="error" 
                icon={<BlockIcon fontSize="inherit" />}
                sx={{ mb: 2.5, borderRadius: 1.5, '& .MuiAlert-message': { width: '100%' } }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Permanent Deletion Blocked
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  This laboratory has been assigned by lab staff to <strong>{dependencyData.activeRequestsCount} active schedule(s)</strong>. 
                  Deleting this laboratory would destroy test workflow continuity and create dangling references.
                </Typography>
              </Alert>

              <Card variant="outlined" sx={{ mb: 2, borderColor: '#ffb74d', bgcolor: '#fffdfa' }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <ScheduleIcon color="warning" fontSize="small" />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#b26a00' }}>
                      Assigned Lab Requests in Staff Schedule ({dependencyData.activeRequests?.length || 0})
                    </Typography>
                  </Box>

                  <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 220, bgcolor: 'background.paper' }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow sx={{ '& th': { bgcolor: '#f5f5f5', fontWeight: 700 } }}>
                          <TableCell>Request Number</TableCell>
                          <TableCell>Workflow Status</TableCell>
                          <TableCell>Scheduled Date & Slot</TableCell>
                          <TableCell>Priority</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {dependencyData.activeRequests?.map((req) => (
                          <TableRow key={req._id || req.requestNumber} hover>
                            <TableCell sx={{ fontWeight: 600, color: '#1976d2' }}>
                              {req.requestNumber}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={
                                  req.status === 'sample_scheduled'
                                    ? 'Sample Scheduled'
                                    : req.status.replace(/_/g, ' ').toUpperCase()
                                }
                                size="small"
                                color={
                                  req.status === 'sample_scheduled'
                                    ? 'warning'
                                    : req.status === 'testing_in_progress'
                                    ? 'primary'
                                    : 'info'
                                }
                                sx={{ fontWeight: 600, fontSize: '0.72rem' }}
                              />
                            </TableCell>
                            <TableCell>
                              {req.scheduledCollection?.date ? (
                                <Box>
                                  <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                                    {new Date(req.scheduledCollection.date).toLocaleDateString()}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {req.scheduledCollection.timeSlot || 'Any Time'}
                                  </Typography>
                                </Box>
                              ) : (
                                <Typography variant="caption" color="text.secondary">
                                  Not scheduled yet
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={req.priority || 'medium'}
                                size="small"
                                variant="outlined"
                                color={req.priority === 'urgent' || req.priority === 'high' ? 'error' : 'default'}
                                sx={{ textTransform: 'capitalize', fontSize: '0.7rem' }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>

              <Alert severity="info" icon={<InfoIcon fontSize="inherit" />} sx={{ borderRadius: 1.5 }}>
                <Typography variant="body2">
                  <strong>Resolution:</strong> The lab staff or administrator must first reassign these requests to another laboratory 
                  or complete the test cycle before this laboratory can be permanently removed.
                </Typography>
              </Alert>
            </Box>
          )}

          {/* Case 2: Dependency Check Passed (No active requests) */}
          {!checkingDependencies && dependencyData && dependencyData.canPermanentlyDelete && (
            <Box>
              <Alert 
                severity="success" 
                icon={<CheckCircleIcon fontSize="inherit" />}
                sx={{ mb: 2, borderRadius: 1.5 }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Safety Check Passed — No Active Schedules
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  This laboratory is <strong>not assigned to any active requests</strong> in the Lab Staff dashboard. It can be safely and permanently deleted.
                </Typography>
              </Alert>

              {dependencyData.historicalCount > 0 && (
                <Alert severity="info" sx={{ mb: 2, borderRadius: 1.5 }}>
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    Note: <strong>{dependencyData.historicalCount}</strong> completed/archived past test request(s) reference this lab ID. 
                    Those historical records will remain intact in archives.
                  </Typography>
                </Alert>
              )}

              <Box sx={{ p: 2, bgcolor: '#ffebee', borderRadius: 2, border: '1px solid #ffcdd2', mt: 1 }}>
                <Typography color="error.dark" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <WarningIcon fontSize="small" /> CRITICAL WARNING: Permanent Deletion Cannot Be Undone
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Are you sure you want to permanently delete <strong>{labToPermanentlyDelete?.name}</strong>? 
                  The laboratory record, contact information, and testing capabilities will be completely wiped from the database.
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, pt: 1, gap: 1 }}>
          <Button 
            onClick={handleClosePermanentDeleteDialog} 
            color="inherit" 
            variant="outlined"
            disabled={permanentDeleteLoading}
          >
            {dependencyData && !dependencyData.canPermanentlyDelete ? 'Close' : 'Cancel'}
          </Button>

          {dependencyData && !dependencyData.canPermanentlyDelete ? (
            <Tooltip title="Cannot permanently delete laboratory while it has active or scheduled test requests">
              <span>
                <Button 
                  variant="contained" 
                  color="error" 
                  disabled
                  startIcon={<BlockIcon />}
                  sx={{ 
                    borderRadius: 1.5, 
                    fontWeight: 'bold',
                    px: 3,
                  }}
                >
                  CANT PERMANENTLY DELETE
                </Button>
              </span>
            </Tooltip>
          ) : (
            <Button 
              onClick={handleConfirmPermanentDelete} 
              variant="contained" 
              color="error"
              disabled={checkingDependencies || permanentDeleteLoading || !dependencyData?.canPermanentlyDelete}
              autoFocus
              startIcon={permanentDeleteLoading ? <CircularProgress size={18} color="inherit" /> : <DeleteForeverIcon />}
              sx={{ 
                borderRadius: 1.5, 
                fontWeight: 'bold',
                px: 3,
                '&:hover': { bgcolor: '#b71c1c' }
              }}
            >
              {permanentDeleteLoading ? 'DELETING...' : 'DELETE FOREVER'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default LaboratoryManagement;
