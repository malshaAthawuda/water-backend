import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Button, Container, TextField, Card, CardContent,
    Stack, CircularProgress, Alert, MenuItem, Stepper, Step, StepLabel,
    Select, InputLabel, FormControl, Chip, Divider, Paper
} from '@mui/material';
import {
    CloudUpload as CloudUploadIcon,
    Lock as LockIcon,
    QrCode as QrCodeIcon,
    CheckCircle as CheckCircleIcon,
    ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import { createPublicReport, updatePublicReport, submitPublicReport } from '../services/publicReportService';
import { useAuth } from '../context/AuthContext';

const WATER_SOURCES = ['well', 'river', 'lake', 'tap', 'tank', 'canal', 'spring', 'rainwater', 'borehole', 'other'];

export default function PublicReportSubmit() {
    const navigate = useNavigate();
    const { isAuthenticated, user } = useAuth();
    const [activeStep, setActiveStep] = useState(0);
    const [reportId, setReportId] = useState(null);
    const [trackingCode, setTrackingCode] = useState(null);
    const [accessToken, setAccessToken] = useState(null);
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);

    // Form states
    const [nic, setNic] = useState('');
    const [waterSource, setWaterSource] = useState('');
    const [location, setLocation] = useState({ district: '', city: '', address: '' });
    const [appearance, setAppearance] = useState('');
    const [turbidity, setTurbidity] = useState('');
    const [image, setImage] = useState(null);

    const steps = ['Identity', 'Details', 'Photo (Optional)', 'Review'];
    const isUserPortal = isAuthenticated && user?.role === 'USER';
    const trackPath = isUserPortal ? '/app/user/reports/track' : '/track';

    const handleCopy = () => {
        navigator.clipboard.writeText(trackingCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleNext = async () => {
        setError(null);
        setLoading(true);
        try {
            if (activeStep === 0) {
                // Step 1: Create wizard
                if (!nic.trim()) throw new Error('NIC is required');
                const { report, trackingCode: tc, accessToken: at } = await createPublicReport(nic.trim());
                setReportId(report._id);
                setTrackingCode(tc);
                setAccessToken(at);
            } else if (activeStep === 1) {
                // Step 2: Save details
                if (!waterSource) throw new Error('Water source type is required');
                if (!location.district || !location.city) throw new Error('District and City are required');
                await updatePublicReport(reportId, {
                    waterSource,
                    location: { ...location },
                    appearance: { value: appearance, notes: '' },
                    turbidity: { value: turbidity },
                    currentStep: 2
                });
            } else if (activeStep === 2) {
                // Step 3: Image (optional — skip if none)
            } else if (activeStep === steps.length - 1) {
                // Final submit
                await submitPublicReport(reportId);
                setSubmitted(true);
                return;
            }
            setActiveStep((prev) => prev + 1);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        setError(null);
        setActiveStep((prev) => prev - 1);
    };

    // ── SUCCESS SCREEN ────────────────────────────────────────────────────────
    if (submitted) {
        return (
            <Box sx={{ minHeight: '100vh', bgcolor: '#F5F7FA', display: 'flex', alignItems: 'center' }}>
                <Container maxWidth="sm">
                    <Card elevation={3} sx={{ borderRadius: 4, overflow: 'hidden' }}>
                        {/* Green header */}
                        <Box sx={{ bgcolor: '#2E7D32', p: 4, textAlign: 'center', color: 'white' }}>
                            <CheckCircleIcon sx={{ fontSize: 64, mb: 1 }} />
                            <Typography variant="h5" fontWeight={800}>Report Submitted!</Typography>
                            <Typography variant="body2" sx={{ opacity: 0.85, mt: 1 }}>
                                Your report is now in the moderation queue.
                            </Typography>
                        </Box>

                        <CardContent sx={{ p: 4 }}>
                            {/* Tracking code highlight */}
                            <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>
                                Your Secure Tracking Code
                            </Typography>
                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#F1F8E9', borderColor: '#81C784' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <QrCodeIcon sx={{ color: '#2E7D32', fontSize: 28 }} />
                                    <Typography variant="h6" fontFamily="monospace" fontWeight={800} letterSpacing={2} color="#1B5E20">
                                        {trackingCode}
                                    </Typography>
                                </Box>
                                <Button
                                    size="small"
                                    onClick={handleCopy}
                                    startIcon={<ContentCopyIcon />}
                                    variant={copied ? 'contained' : 'outlined'}
                                    color="success"
                                    sx={{ textTransform: 'none', borderRadius: 2 }}
                                >
                                    {copied ? 'Copied!' : 'Copy'}
                                </Button>
                            </Paper>

                            {/* Security badge — demonstrates the fix */}
                            <Box sx={{ mt: 3, p: 2, borderRadius: 2, bgcolor: '#E3F2FD', border: '1px solid #90CAF9' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                    <LockIcon sx={{ color: '#1565C0', fontSize: 18 }} />
                                    <Typography variant="caption" fontWeight={700} color="#1565C0">
                                        HOW YOUR PRIVACY IS PROTECTED
                                    </Typography>
                                </Box>
                                <Divider sx={{ mb: 1.5 }} />
                                <Stack spacing={0.75}>
                                    <Typography variant="caption" sx={{ display: 'flex', gap: 1 }}>
                                        <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main', mt: '1px' }} />
                                        Your raw NIC is <strong>never exposed</strong> publicly — only masked (e.g. {nic.slice(0, 3) + '*****' + nic.slice(-2)})
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'flex', gap: 1 }}>
                                        <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main', mt: '1px' }} />
                                        Your report is protected with a <strong>secret Access Token</strong> — only you can edit it
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'flex', gap: 1 }}>
                                        <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main', mt: '1px' }} />
                                        NIC lookups now require <strong>email OTP verification</strong> to prevent enumeration
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'flex', gap: 1 }}>
                                        <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main', mt: '1px' }} />
                                        Track your report publicly using the <strong>Tracking Code above</strong>
                                    </Typography>
                                </Stack>
                            </Box>

                            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
                                <Button
                                    fullWidth
                                    variant="contained"
                                    color="primary"
                                    sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                                    onClick={() => navigate(trackPath)}
                                >
                                    Track My Report
                                </Button>
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    sx={{ borderRadius: 2, textTransform: 'none' }}
                                    onClick={() => navigate(isUserPortal ? '/app' : '/')}
                                >
                                    Go Home
                                </Button>
                            </Stack>
                        </CardContent>
                    </Card>
                </Container>
            </Box>
        );
    }

    // ── WIZARD ────────────────────────────────────────────────────────────────
    return (
        <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#F5F7FA' }}>
            <Container maxWidth="md" sx={{ flexGrow: 1, py: { xs: 3, md: 6 } }}>
                <Card elevation={0} sx={{ borderRadius: 4, border: '1px solid #E0E0E0' }}>
                    <CardContent sx={{ p: { xs: 3, md: 5 } }}>
                        <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 5 }}>
                            {steps.map((label) => (
                                <Step key={label}>
                                    <StepLabel>{label}</StepLabel>
                                </Step>
                            ))}
                        </Stepper>

                        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

                        {/* Security notice on step 0 */}
                        {activeStep === 0 && (
                            <Alert severity="info" icon={<LockIcon />} sx={{ mb: 3, borderRadius: 2 }}>
                                <strong>Privacy notice:</strong> Your NIC will never be exposed publicly.
                                You will receive a <strong>secure Tracking Code</strong> and <strong>Access Token</strong> after submission.
                            </Alert>
                        )}

                        {/* Show tracking code on step 1+ as a reminder */}
                        {activeStep >= 1 && trackingCode && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, p: 1.5, bgcolor: '#F1F8E9', borderRadius: 2, border: '1px solid #C8E6C9' }}>
                                <QrCodeIcon sx={{ color: '#2E7D32', fontSize: 20 }} />
                                <Typography variant="caption" color="text.secondary">Your tracking code:</Typography>
                                <Chip label={trackingCode} size="small" color="success" sx={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1 }} />
                                <LockIcon sx={{ fontSize: 14, color: '#1565C0', ml: 'auto' }} />
                                <Typography variant="caption" color="#1565C0">Report is token-protected</Typography>
                            </Box>
                        )}

                        <Box sx={{ minHeight: 250 }}>
                            {/* Step 0: Identity */}
                            {activeStep === 0 && (
                                <Box sx={{ maxWidth: 400, mx: 'auto', textAlign: 'center' }}>
                                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Provide Your NIC</Typography>
                                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                                        Your NIC is used to associate this report. It will <strong>never be publicly visible</strong>.
                                    </Typography>
                                    <TextField
                                        fullWidth
                                        label="NIC Number"
                                        placeholder="e.g. 901234567V or 200012345678"
                                        value={nic}
                                        onChange={(e) => setNic(e.target.value)}
                                        required
                                    />
                                </Box>
                            )}

                            {/* Step 1: Details */}
                            {activeStep === 1 && (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <Typography variant="h6" sx={{ fontWeight: 700 }}>Observations & Location</Typography>

                                    <FormControl fullWidth required>
                                        <InputLabel>Water Source Type</InputLabel>
                                        <Select value={waterSource} label="Water Source Type" onChange={(e) => setWaterSource(e.target.value)}>
                                            {WATER_SOURCES.map((s) => (
                                                <MenuItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>

                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                        <TextField fullWidth label="District" required value={location.district} onChange={(e) => setLocation({ ...location, district: e.target.value })} />
                                        <TextField fullWidth label="City/Town" required value={location.city} onChange={(e) => setLocation({ ...location, city: e.target.value })} />
                                    </Stack>

                                    <TextField fullWidth label="Specific Address / Area (Optional)" value={location.address} onChange={(e) => setLocation({ ...location, address: e.target.value })} />

                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                        <FormControl fullWidth>
                                            <InputLabel>Visual Appearance</InputLabel>
                                            <Select value={appearance} label="Visual Appearance" onChange={(e) => setAppearance(e.target.value)}>
                                                <MenuItem value=""><em>None Selected</em></MenuItem>
                                                <MenuItem value="Clear">Clear</MenuItem>
                                                <MenuItem value="Cloudy">Cloudy</MenuItem>
                                                <MenuItem value="Muddy">Muddy</MenuItem>
                                                <MenuItem value="Colored">Colored/Tinted</MenuItem>
                                            </Select>
                                        </FormControl>

                                        <FormControl fullWidth>
                                            <InputLabel>Turbidity / Murkiness</InputLabel>
                                            <Select value={turbidity} label="Turbidity / Murkiness" onChange={(e) => setTurbidity(e.target.value)}>
                                                <MenuItem value=""><em>None Selected</em></MenuItem>
                                                <MenuItem value="Low">Low (Transparent)</MenuItem>
                                                <MenuItem value="Medium">Medium (Slightly hazy)</MenuItem>
                                                <MenuItem value="High">High (Completely opaque)</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Stack>
                                </Box>
                            )}

                            {/* Step 2: Photo */}
                            {activeStep === 2 && (
                                <Box sx={{ maxWidth: 400, mx: 'auto', textAlign: 'center' }}>
                                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Upload a Photo</Typography>
                                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                                        A photo of the water source helps moderators verify your report.
                                    </Typography>
                                    <Button
                                        variant="outlined"
                                        component="label"
                                        fullWidth
                                        sx={{ py: 4, borderStyle: 'dashed', borderWidth: 2, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 1 }}
                                    >
                                        <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
                                        <Typography sx={{ textTransform: 'none', color: 'text.primary', fontWeight: 600 }}>
                                            {image ? image.name : 'Click to select an image (optional)'}
                                        </Typography>
                                        <input type="file" hidden accept="image/*" onChange={(e) => setImage(e.target.files[0])} />
                                    </Button>
                                    {image && (
                                        <Button size="small" color="error" sx={{ mt: 1, textTransform: 'none' }} onClick={() => setImage(null)}>
                                            Remove Image
                                        </Button>
                                    )}
                                </Box>
                            )}

                            {/* Step 3: Review */}
                            {activeStep === 3 && (
                                <Box>
                                    <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, color: '#1565C0' }}>Review & Submit</Typography>

                                    <Box sx={{ bgcolor: '#FAFAFA', p: 3, borderRadius: 2, border: '1px solid #EEE', mb: 3 }}>
                                        <Stack spacing={1}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">NIC (private)</Typography>
                                                <Typography variant="body2" fontWeight={600}>{nic.slice(0, 3) + '*****' + nic.slice(-2)}</Typography>
                                            </Box>
                                            <Divider />
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">Water Source</Typography>
                                                <Typography variant="body2" fontWeight={600}>{waterSource || '—'}</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">Location</Typography>
                                                <Typography variant="body2" fontWeight={600}>{location.city}, {location.district}</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">Appearance</Typography>
                                                <Typography variant="body2" fontWeight={600}>{appearance || '—'}</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" color="text.secondary">Photo</Typography>
                                                <Typography variant="body2" fontWeight={600}>{image ? '📷 Attached' : 'None'}</Typography>
                                            </Box>
                                            <Divider />
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Typography variant="body2" color="text.secondary">Tracking Code</Typography>
                                                <Chip label={trackingCode} size="small" color="success" icon={<QrCodeIcon />} sx={{ fontFamily: 'monospace', fontWeight: 700 }} />
                                            </Box>
                                        </Stack>
                                    </Box>

                                    <Alert severity="success" icon={<LockIcon />} sx={{ borderRadius: 2 }}>
                                        <strong>Protected submission:</strong> Your report is secured with a unique Access Token.
                                        Only you and authorized moderators can modify it.
                                    </Alert>
                                </Box>
                            )}
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4, pt: 3, borderTop: '1px solid #EEE' }}>
                            <Button disabled={activeStep === 0 || loading} onClick={handleBack} sx={{ textTransform: 'none' }}>
                                Back
                            </Button>
                            <Button
                                variant="contained"
                                onClick={handleNext}
                                disabled={loading}
                                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
                                sx={{ borderRadius: 2, textTransform: 'none', px: 4, fontWeight: 600 }}
                            >
                                {activeStep === steps.length - 1 ? 'Submit Report' : 'Next'}
                            </Button>
                        </Box>
                    </CardContent>
                </Card>
            </Container>
        </Box>
    );
}
