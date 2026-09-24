import { useState } from 'react';
import {
    Box, Typography, Button, Container, TextField, Card, CardContent,
    Stack, Chip, CircularProgress, Alert, Tabs, Tab, Divider
} from '@mui/material';
import {
    Search as SearchIcon,
    WaterDrop as WaterDropIcon,
    QrCode as QrCodeIcon,
    Email as EmailIcon,
} from '@mui/icons-material';
import { trackReportByCode, requestTrackingOtp, verifyTrackingOtp, trackReportsByNic } from '../services/publicReportService';

const STATUS_COLORS = { pending: 'warning', approved: 'success', rejected: 'error' };

export default function PublicReportTracker() {
    const [tab, setTab] = useState(0); // 0 = by tracking code, 1 = by NIC + email

    // Tracking code flow
    const [trackingCode, setTrackingCode] = useState('');
    const [tcReport, setTcReport] = useState(null);
    const [tcLoading, setTcLoading] = useState(false);
    const [tcError, setTcError] = useState(null);
    const [tcSearched, setTcSearched] = useState(false);

    // Email OTP flow
    const [nic, setNic] = useState('');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [otpStep, setOtpStep] = useState(0); // 0 = form, 1 = enter code, 2 = results
    const [reports, setReports] = useState([]);
    const [nicLoading, setNicLoading] = useState(false);
    const [nicError, setNicError] = useState(null);
    const [trackingToken, setTrackingToken] = useState(null);
    const [infoMsg, setInfoMsg] = useState(null);

    const handleTrackByCode = async (e) => {
        e.preventDefault();
        setTcError(null);
        setTcSearched(true);
        if (!trackingCode.trim()) { setTcError('Please enter a tracking code.'); return; }
        setTcLoading(true);
        try {
            const r = await trackReportByCode(trackingCode.trim());
            setTcReport(r);
        } catch (err) {
            setTcError(err.response?.data?.message || 'Report not found. Please check your tracking code.');
            setTcReport(null);
        } finally {
            setTcLoading(false);
        }
    };

    const handleRequestOtp = async (e) => {
        e.preventDefault();
        setNicError(null);
        setInfoMsg(null);
        if (!nic.trim() || !email.trim()) { setNicError('Please enter both your NIC and registered email.'); return; }
        setNicLoading(true);
        try {
            const res = await requestTrackingOtp(nic.trim(), email.trim());
            setOtpStep(1);
            setInfoMsg(res.message || 'Verification code sent to your email.');
            // In dev mode, the server returns debugOtp
            if (res.data?.debugOtp) {
                setInfoMsg(`${res.message} [DEV] Code: ${res.data.debugOtp}`);
            }
        } catch (err) {
            setNicError(err.response?.data?.message || 'Failed to request verification code.');
        } finally {
            setNicLoading(false);
        }
    };

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setNicError(null);
        if (!otp.trim()) { setNicError('Please enter the verification code.'); return; }
        setNicLoading(true);
        try {
            const token = await verifyTrackingOtp(nic.trim(), email.trim(), otp.trim());
            setTrackingToken(token);
            const data = await trackReportsByNic(nic.trim(), token);
            setReports(data || []);
            setOtpStep(2);
        } catch (err) {
            setNicError(err.response?.data?.message || 'Invalid or expired verification code.');
        } finally {
            setNicLoading(false);
        }
    };

    const resetNicFlow = () => {
        setOtpStep(0);
        setOtp('');
        setReports([]);
        setTrackingToken(null);
        setNicError(null);
        setInfoMsg(null);
    };

    const ReportCard = ({ report }) => (
        <Card elevation={0} sx={{ border: '1px solid #E0E0E0', borderRadius: 3, transition: '0.2s', '&:hover': { borderColor: 'primary.main', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' } }}>
            <CardContent sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, p: 3, '&:last-child': { pb: 3 } }}>
                <Box sx={{ flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <WaterDropIcon sx={{ fontSize: 20, color: '#1565C0' }} />
                        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
                            {report.waterSource || 'Unknown Source'}
                        </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {report.location?.city || 'Location unavailable'} • Submitted on {new Date(report.createdAt).toLocaleDateString()}
                    </Typography>
                    {report.trackingCode && (
                        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#78909C', fontFamily: 'monospace' }}>
                            Code: {report.trackingCode}
                        </Typography>
                    )}
                    {report.maskedNic && (
                        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#78909C' }}>
                            NIC: {report.maskedNic}
                        </Typography>
                    )}
                    {report.mod_status === 'rejected' && report.rejection_reason && (
                        <Alert severity="error" sx={{ mt: 2, py: 0, '& .MuiAlert-message': { p: 1 } }}>
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>Reason for rejection:</Typography><br />
                            <Typography variant="caption">{report.rejection_reason}</Typography>
                        </Alert>
                    )}
                </Box>
                <Chip
                    label={report.mod_status?.toUpperCase()}
                    color={STATUS_COLORS[report.mod_status] || 'default'}
                    sx={{ fontWeight: 700, borderRadius: 2 }}
                />
            </CardContent>
        </Card>
    );

    return (
        <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#F5F7FA' }}>
            <Container maxWidth="sm" sx={{ flexGrow: 1, py: { xs: 3, md: 6 } }}>
                <Card elevation={2} sx={{ borderRadius: 4, mb: 4, overflow: 'visible' }}>
                    <CardContent sx={{ p: { xs: 3, md: 5 }, textAlign: 'center' }}>
                        <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: '#E3F2FD', color: '#1565C0', mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
                            <SearchIcon sx={{ fontSize: 32 }} />
                        </Box>
                        <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
                            Track Your Submission
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                            Use your Tracking Code or verify your identity with email to view your report status.
                        </Typography>

                        <Tabs value={tab} onChange={(_, v) => setTab(v)} centered sx={{ mb: 3 }}>
                            <Tab icon={<QrCodeIcon />} label="Tracking Code" iconPosition="start" />
                            <Tab icon={<EmailIcon />} label="NIC + Email" iconPosition="start" />
                        </Tabs>
                        <Divider sx={{ mb: 3 }} />

                        {/* Tab 0: Tracking Code */}
                        {tab === 0 && (
                            <form onSubmit={handleTrackByCode}>
                                {tcError && <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>{tcError}</Alert>}
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                    <TextField
                                        fullWidth
                                        variant="outlined"
                                        placeholder="e.g. WR-A1B2-C3D4"
                                        value={trackingCode}
                                        onChange={(e) => setTrackingCode(e.target.value.toUpperCase())}
                                        disabled={tcLoading}
                                        InputProps={{ sx: { borderRadius: 2, fontFamily: 'monospace', letterSpacing: 1 } }}
                                        label="Tracking Code"
                                    />
                                    <Button
                                        type="submit"
                                        variant="contained"
                                        disabled={tcLoading}
                                        startIcon={tcLoading ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
                                        sx={{ py: 1.5, px: 4, borderRadius: 2, fontWeight: 600, textTransform: 'none', minWidth: 120 }}
                                    >
                                        {tcLoading ? 'Searching...' : 'Track'}
                                    </Button>
                                </Stack>
                                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
                                    Your tracking code was displayed after submitting your report.
                                </Typography>
                            </form>
                        )}

                        {/* Tab 1: NIC + Email OTP flow */}
                        {tab === 1 && (
                            <Box>
                                {nicError && <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>{nicError}</Alert>}
                                {infoMsg && <Alert severity="info" sx={{ mb: 2, textAlign: 'left' }}>{infoMsg}</Alert>}

                                {otpStep === 0 && (
                                    <form onSubmit={handleRequestOtp}>
                                        <Stack spacing={2}>
                                            <TextField fullWidth label="NIC Number" value={nic} onChange={(e) => setNic(e.target.value)} disabled={nicLoading} placeholder="e.g. 901234567V" />
                                            <TextField fullWidth label="Email (used when submitting)" value={email} onChange={(e) => setEmail(e.target.value)} disabled={nicLoading} type="email" />
                                            <Button type="submit" variant="contained" disabled={nicLoading} startIcon={nicLoading ? <CircularProgress size={18} color="inherit" /> : <EmailIcon />} sx={{ borderRadius: 2, fontWeight: 600, textTransform: 'none' }}>
                                                {nicLoading ? 'Sending...' : 'Send Verification Code'}
                                            </Button>
                                        </Stack>
                                    </form>
                                )}

                                {otpStep === 1 && (
                                    <form onSubmit={handleVerifyOtp}>
                                        <Stack spacing={2}>
                                            <TextField fullWidth label="6-Digit Verification Code" value={otp} onChange={(e) => setOtp(e.target.value)} disabled={nicLoading} inputProps={{ maxLength: 6 }} placeholder="123456" />
                                            <Stack direction="row" spacing={1}>
                                                <Button onClick={resetNicFlow} variant="outlined" sx={{ borderRadius: 2, textTransform: 'none' }}>Back</Button>
                                                <Button type="submit" variant="contained" disabled={nicLoading} startIcon={nicLoading ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />} sx={{ borderRadius: 2, fontWeight: 600, textTransform: 'none', flexGrow: 1 }}>
                                                    {nicLoading ? 'Verifying...' : 'Verify & View Reports'}
                                                </Button>
                                            </Stack>
                                        </Stack>
                                    </form>
                                )}

                                {otpStep === 2 && (
                                    <Box>
                                        <Button onClick={resetNicFlow} size="small" sx={{ mb: 2, textTransform: 'none' }}>← Search Again</Button>
                                    </Box>
                                )}
                            </Box>
                        )}
                    </CardContent>
                </Card>

                {/* Tracking code result */}
                {tab === 0 && tcSearched && !tcLoading && !tcError && tcReport && (
                    <Stack spacing={2}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, px: 1 }}>Report found:</Typography>
                        <ReportCard report={tcReport} />
                    </Stack>
                )}

                {/* NIC+email results */}
                {tab === 1 && otpStep === 2 && (
                    <Box>
                        {reports.length === 0 ? (
                            <Card elevation={0} sx={{ bgcolor: 'transparent', textAlign: 'center', py: 4 }}>
                                <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                    No reports found for this NIC.
                                </Typography>
                            </Card>
                        ) : (
                            <Stack spacing={2}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700, px: 1 }}>
                                    Found {reports.length} report{reports.length !== 1 ? 's' : ''}:
                                </Typography>
                                {reports.map((report) => (
                                    <ReportCard key={report._id} report={report} />
                                ))}
                            </Stack>
                        )}
                    </Box>
                )}
            </Container>
        </Box>
    );
}
