import axios from 'axios';

/**
 * Public Report API Service
 * Wraps /api/v1/public-reports endpoints.
 * Works for both:
 *   - Public users (no JWT)
 *   - Logged-in users (USER role, JWT auto-injected by the AuthContext interceptor)
 */

// In-memory storage for the per-report access token during the wizard session
// Using a module-level variable avoids sessionStorage cross-tab leaking
let _currentReportAccessToken = null;
let _currentTrackingCode = null;

// Use the Vite proxy path (/api/v1) so CORS is handled correctly
// Never hardcode the backend URL in API calls from the frontend
const BASE_URL = '/api/v1';

const publicApi = axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/json' },
});

/**
 * Returns headers containing the per-report access token when available.
 * Falls back to sessionStorage so the token survives a component remount
 * (but not a full page refresh — which is acceptable for wizard flow).
 */
function getReportHeaders() {
    const token = _currentReportAccessToken || sessionStorage.getItem('wq_report_access_token');
    if (token) {
        return { 'x-report-token': token };
    }
    return {};
}

/**
 * Store the access token + tracking code for the active wizard session.
 */
export function saveReportCredentials(accessToken, trackingCode) {
    _currentReportAccessToken = accessToken;
    _currentTrackingCode = trackingCode;
    if (accessToken) sessionStorage.setItem('wq_report_access_token', accessToken);
    if (trackingCode) sessionStorage.setItem('wq_report_tracking_code', trackingCode);
}

export function getSavedTrackingCode() {
    return _currentTrackingCode || sessionStorage.getItem('wq_report_tracking_code');
}

export function clearReportCredentials() {
    _currentReportAccessToken = null;
    _currentTrackingCode = null;
    sessionStorage.removeItem('wq_report_access_token');
    sessionStorage.removeItem('wq_report_tracking_code');
}

/**
 * Step 1: Initialize a new public report.
 * Returns { report, trackingCode, accessToken }
 */
export const createPublicReport = async (nic) => {
    const { data } = await publicApi.post('/public-reports', { nic });
    const { report, trackingCode, accessToken } = data.data;
    // Persist for subsequent wizard steps
    saveReportCredentials(accessToken, trackingCode);
    return { report, trackingCode, accessToken };
};

/**
 * Step 2: Auto-save wizard step data.
 */
export const updatePublicReport = async (id, updateBody) => {
    const { data } = await publicApi.patch(`/public-reports/${id}`, updateBody, {
        headers: getReportHeaders(),
    });
    return data.data.report;
};

/**
 * Step 3: Final submit.
 */
export const submitPublicReport = async (id) => {
    const { data } = await publicApi.post(`/public-reports/${id}/submit`, {}, {
        headers: getReportHeaders(),
    });
    clearReportCredentials();
    return data.data.report;
};

/**
 * Upload images for a report (base64 payload).
 */
export const uploadPublicReportImage = async (id, imagesPayload) => {
    const { data } = await publicApi.post(`/public-reports/${id}/images`, imagesPayload, {
        headers: getReportHeaders(),
    });
    return data.data.imageCount;
};

/**
 * [SECURE] Track a single report by Tracking Code (public, no auth required).
 * The response NIC is masked automatically by the server.
 */
export const trackReportByCode = async (trackingCode) => {
    const { data } = await publicApi.get(`/public-reports/track/${trackingCode.toUpperCase().trim()}`);
    return data.data.report;
};

/**
 * [SECURE] Step 1 of NIC tracking: Request an email OTP.
 */
export const requestTrackingOtp = async (nic, email) => {
    const { data } = await publicApi.post('/public-reports/tracking/request-code', { nic, email });
    return data;
};

/**
 * [SECURE] Step 2 of NIC tracking: Verify OTP and get a scoped tracking JWT.
 */
export const verifyTrackingOtp = async (nic, email, code) => {
    const { data } = await publicApi.post('/public-reports/tracking/verify-code', { nic, email, code });
    return data.data.trackingToken;
};

/**
 * [SECURE] Get reports by NIC after OTP verification (requires scoped JWT).
 */
export const trackReportsByNic = async (nic, trackingToken) => {
    const { data } = await publicApi.get(`/public-reports/by-nic/${nic}`, {
        headers: { Authorization: `Bearer ${trackingToken}` },
    });
    return data.data.reports;
};

/**
 * Get full report data by ID (requires report access token).
 */
export const getFullPublicReport = async (id) => {
    const { data } = await publicApi.get(`/public-reports/${id}/full`, {
        headers: getReportHeaders(),
    });
    return data.data.report;
};
