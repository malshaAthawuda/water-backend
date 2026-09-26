import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext';

// Error codes sent by the backend Discord callback (never raw error details)
const ERROR_MESSAGES = {
    access_denied: 'Discord sign-in was cancelled.',
    account_exists:
        'An account with this email already exists. Sign in with your password, then use "Connect Discord" in the menu to link it.',
    discord_email_unverified: 'Your Discord account needs a verified email address to sign in here.',
    discord_already_linked: 'That Discord account is already linked to another user.',
    account_deactivated: 'This account is deactivated. Please contact support.',
    invalid_state: 'The sign-in request expired or was already used. Please try again.',
    invalid_ticket: 'The sign-in request expired or was already used. Please try again.',
};

const DEFAULT_ERROR = 'Discord sign-in failed. Please try again.';

/**
 * Landing page for the Discord OAuth redirect.
 *
 * The backend puts the result in the URL fragment (#ticket=..., #linked=...,
 * #error=...). Fragments are not sent to servers, and we remove it from the
 * address bar straight away so the one-time ticket does not stay in history.
 */
export default function OAuthCallback() {
    const navigate = useNavigate();
    const { completeDiscordLogin, refreshUser, isAuthenticated } = useAuth();
    const [error, setError] = useState(null);
    const handled = useRef(false);

    useEffect(() => {
        // React StrictMode runs effects twice in development; a ticket is single-use
        if (handled.current) return;
        handled.current = true;

        const params = new URLSearchParams(window.location.hash.slice(1));
        window.history.replaceState(null, '', window.location.pathname);

        const run = async () => {
            if (params.get('error')) {
                setError(ERROR_MESSAGES[params.get('error')] || DEFAULT_ERROR);
                return;
            }

            if (params.get('linked') === 'discord') {
                if (isAuthenticated) {
                    await refreshUser().catch(() => {});
                }
                navigate('/app', { replace: true, state: { message: 'Discord account linked.' } });
                return;
            }

            const ticket = params.get('ticket');
            if (!ticket) {
                setError(DEFAULT_ERROR);
                return;
            }

            const user = await completeDiscordLogin(ticket);
            if (!user) {
                setError(ERROR_MESSAGES.invalid_ticket);
                return;
            }
            navigate(user.role === 'USER' ? '/app/user/reports' : '/app', { replace: true });
        };

        run();
    }, [completeDiscordLogin, isAuthenticated, navigate, refreshUser]);

    return (
        <Box sx={{
            minHeight: '100vh', display: 'flex', alignItems: 'center',
            justifyContent: 'center', bgcolor: '#F5F7FA', px: 2,
        }}>
            <Card sx={{ width: '100%', maxWidth: 420, p: 4, textAlign: 'center' }}>
                {error ? (
                    <>
                        <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>{error}</Alert>
                        <Button variant="contained" onClick={() => navigate('/login', { replace: true })}>
                            Back to sign in
                        </Button>
                    </>
                ) : (
                    <>
                        <CircularProgress sx={{ mb: 2 }} />
                        <Typography variant="body1">Completing Discord sign-in…</Typography>
                    </>
                )}
            </Card>
        </Box>
    );
}
