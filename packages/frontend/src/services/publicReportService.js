import axios from 'axios';

/**
 * Public Report API Service
 * Wraps /api/v1/public-reports endpoints for non-authenticated public users
 */

// Local storage keys for persisting the report access token and tracking code
const REPORT_ACCESS_TOKEN_KEY = 'wq_report_access_token';
const REPORT_TRACKING_CODE_KEY = 'wq_report_tracking_code';

// Separate axios instance for public routes (no auto-injected auth token)
const publicApi = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api/v1',
    headers: { 'Content-Type': 'application/json' },
});

/**
 * Attach the per-report access token (not the user JWT) to requests when available.
 */
function getReportHeaders() {
    const token = sessionStorage.getItem(REPORT_ACCESS_TOKEN_KEY);
    return token ? { 'x-report-token': token } : {};
}

/**
 * Persist the access token and tracking code returned at report creation time.
 */
export function saveReportCredentials(accessToken, trackingCode) {
    sessionStorage.setItem(REPORT_ACCESS_TOKEN_KEY, accessToken);
    if (trackingCode) {
        sessionStorage.setItem(REPORT_TRACKING_CODE_KEY, trackingCode);
    }
}

/**
 * Retrieve the saved tracking code for the current session.
 */
export function getSavedTrackingCode() {
    return sessionStorage.getItem(REPORT_TRACKING_CODE_KEY);
}

/**
 * Clear saved report credentials after submission.
 */
export function clearReportCredentials() {
    sessionStorage.removeItem(REPORT_ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REPORT_TRACKING_CODE_KEY);
}

/**
 * Step 1: Initialize a new public report
 * Returns { report, trackingCode, accessToken }
 */
export const createPublicReport = async (nic) => {
    const { data } = await publicApi.post('/public-reports', { nic });
    const { report, trackingCode, accessToken } = data.data;
    // Persist credentials for this browser session
    saveReportCredentials(accessToken, trackingCode);
    return { report, trackingCode, accessToken };
};

/**
 * Step 2: Update an existing report (auto-save)
 */
export const updatePublicReport = async (id, updateBody) => {
    const { data } = await publicApi.patch(`/public-reports/${id}`, updateBody, {
        headers: getReportHeaders(),
    });
    return data.data.report;
};

/**
 * Step 3: Final Submit
 */
export const submitPublicReport = async (id) => {
    const { data } = await publicApi.post(`/public-reports/${id}/submit`, {}, {
        headers: getReportHeaders(),
    });
    clearReportCredentials();
    return data.data.report;
};

/**
 * Upload an Image
 */
export const uploadPublicReportImage = async (id, imagesPayload) => {
    const { data } = await publicApi.post(`/public-reports/${id}/images`, imagesPayload, {
        headers: getReportHeaders(),
    });
    return data.data.imageCount;
};

/**
 * [SECURE] Track a single report by Tracking Code (no auth needed, NIC is masked in response)
 */
export const trackReportByCode = async (trackingCode) => {
    const { data } = await publicApi.get(`/public-reports/track/${trackingCode.toUpperCase().trim()}`);
    return data.data.report;
};

/**
 * [SECURE] Step 1 of NIC tracking: Request an email OTP verification code
 */
export const requestTrackingOtp = async (nic, email) => {
    const { data } = await publicApi.post('/public-reports/tracking/request-code', { nic, email });
    return data;
};

/**
 * [SECURE] Step 2 of NIC tracking: Verify OTP and get a scoped tracking JWT
 */
export const verifyTrackingOtp = async (nic, email, code) => {
    const { data } = await publicApi.post('/public-reports/tracking/verify-code', { nic, email, code });
    return data.data.trackingToken;
};

/**
 * [SECURE] Track reports by NIC after OTP verification (requires scoped tracking token)
 */
export const trackReportsByNic = async (nic, trackingToken) => {
    const { data } = await publicApi.get(`/public-reports/by-nic/${nic}`, {
        headers: { Authorization: `Bearer ${trackingToken}` },
    });
    return data.data.reports;
};

/**
 * Get full report data by ID (requires report access token)
 */
export const getFullPublicReport = async (id) => {
    const { data } = await publicApi.get(`/public-reports/${id}/full`, {
        headers: getReportHeaders(),
    });
    return data.data.report;
};
