const request = require('supertest');
const app = require('../app');
const config = require('../config');
const { connect, clearDatabase, closeDatabase } = require('./setup');
const { User } = require('../models/User.model');
const OAuthState = require('../models/OAuthState.model');

/**
 * Discord OAuth 2.0 (Authorization Code grant) - sign in and account linking.
 * Discord's HTTP API is replaced with a fetch mock.
 */
describe('Discord OAuth 2.0 login', () => {
    const originalDiscord = { ...config.discord };
    let discordProfile;
    let tokenResponse;
    let fetchCalls;

    const mockDiscord = () => {
        fetchCalls = [];
        jest.spyOn(global, 'fetch').mockImplementation(async (url, options = {}) => {
            fetchCalls.push({ url: String(url), options });
            if (String(url).endsWith('/oauth2/token')) {
                return new Response(JSON.stringify(tokenResponse.body), { status: tokenResponse.status });
            }
            if (String(url).endsWith('/users/@me')) {
                return new Response(JSON.stringify(discordProfile), { status: 200 });
            }
            if (String(url).endsWith('/oauth2/token/revoke')) {
                return new Response('{}', { status: 200 });
            }
            throw new Error(`Unexpected fetch ${url}`);
        });
    };

    // Start the flow like a browser: returns the state cookie and state value
    const start = async (path = '/api/v1/auth/discord') => {
        const res = await request(app).get(path).expect(302);
        const location = new URL(res.headers.location);
        const cookie = (res.headers['set-cookie'] || [])[0]?.split(';')[0];
        return { res, location, cookie, state: location.searchParams.get('state') };
    };

    const callback = (state, cookie, extra = 'code=test-code') => {
        const req = request(app).get(`/api/v1/auth/discord/callback?${extra}&state=${encodeURIComponent(state)}`);
        if (cookie) req.set('Cookie', cookie);
        return req.expect(302);
    };

    const fragment = (res) => new URLSearchParams(new URL(res.headers.location).hash.slice(1));

    const signInWithDiscord = async () => {
        const { state, cookie } = await start();
        const cb = await callback(state, cookie);
        return fragment(cb);
    };

    beforeAll(async () => {
        await connect();
    });

    beforeEach(() => {
        Object.assign(config.discord, {
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            redirectUri: 'http://localhost:5173/api/v1/auth/discord/callback',
        });
        discordProfile = {
            id: '112233445566778899',
            username: 'waterfan',
            global_name: 'Water Fan',
            email: 'waterfan@example.com',
            verified: true,
        };
        tokenResponse = { status: 200, body: { access_token: 'discord-access', token_type: 'Bearer', scope: 'identify email' } };
        mockDiscord();
    });

    afterEach(async () => {
        await clearDatabase();
    });

    afterAll(async () => {
        Object.assign(config.discord, originalDiscord);
        await closeDatabase();
    });

    describe('GET /auth/discord (authorization request)', () => {
        it('returns 503 when Discord is not configured', async () => {
            config.discord.clientSecret = undefined;
            await request(app).get('/api/v1/auth/discord').expect(503);
        });

        it('redirects to Discord with code flow parameters and a random state', async () => {
            const { location, state } = await start();

            expect(location.origin + location.pathname).toBe('https://discord.com/oauth2/authorize');
            expect(location.searchParams.get('response_type')).toBe('code');
            expect(location.searchParams.get('client_id')).toBe('test-client-id');
            expect(location.searchParams.get('redirect_uri')).toBe(config.discord.redirectUri);
            expect(location.searchParams.get('scope')).toBe('identify email');
            expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
        });

        it('binds the state to the browser with an httpOnly cookie and stores only its hash', async () => {
            const { res, state } = await start();
            const setCookie = res.headers['set-cookie'][0];

            expect(setCookie).toMatch(/HttpOnly/i);
            expect(setCookie).toMatch(/SameSite=Lax/i);
            expect(setCookie).toMatch(/Path=\/api\/v1\/auth\/discord/);

            const records = await OAuthState.find();
            expect(records).toHaveLength(1);
            expect(records[0].stateHash).not.toBe(state);
        });
    });

    describe('GET /auth/discord/callback', () => {
        it('rejects a state that does not match the browser cookie (login CSRF)', async () => {
            const { cookie } = await start();
            const { state: otherState } = await start();

            const res = await callback(otherState, cookie);
            expect(fragment(res).get('error')).toBe('invalid_state');
            expect(fetchCalls).toHaveLength(0);
        });

        it('rejects a callback without the state cookie', async () => {
            const { state } = await start();
            const res = await callback(state, null);
            expect(fragment(res).get('error')).toBe('invalid_state');
        });

        it('rejects a replayed state', async () => {
            const { state, cookie } = await start();
            await callback(state, cookie);

            const replay = await callback(state, cookie);
            expect(fragment(replay).get('error')).toBe('invalid_state');
        });

        it('handles the user cancelling on Discord', async () => {
            const { state, cookie } = await start();
            const res = await callback(state, cookie, 'error=access_denied');
            expect(fragment(res).get('error')).toBe('access_denied');
        });

        it('exchanges the code server-side using the client secret', async () => {
            await signInWithDiscord();

            const tokenCall = fetchCalls.find((c) => c.url.endsWith('/oauth2/token'));
            const body = new URLSearchParams(tokenCall.options.body.toString());
            expect(body.get('grant_type')).toBe('authorization_code');
            expect(body.get('code')).toBe('test-code');
            expect(body.get('client_secret')).toBe('test-client-secret');
            expect(body.get('redirect_uri')).toBe(config.discord.redirectUri);
        });

        it('revokes the Discord access token after reading the profile', async () => {
            await signInWithDiscord();
            expect(fetchCalls.some((c) => c.url.endsWith('/oauth2/token/revoke'))).toBe(true);
        });

        it('fails safely when Discord rejects the code', async () => {
            tokenResponse = { status: 400, body: { error: 'invalid_grant' } };
            const result = await signInWithDiscord();
            expect(result.get('error')).toBe('token_exchange_failed');
        });

        it('fails when Discord did not grant the email scope', async () => {
            tokenResponse.body.scope = 'identify';
            const result = await signInWithDiscord();
            expect(result.get('error')).toBe('insufficient_scope');
        });

        it('redirects to the frontend with the result in the URL fragment only', async () => {
            const { state, cookie } = await start();
            const res = await callback(state, cookie);
            const location = new URL(res.headers.location);

            expect(location.origin).toBe(config.frontendUrl);
            expect(location.pathname).toBe('/oauth/callback');
            expect(location.search).toBe('');
            expect(location.hash).toMatch(/^#ticket=/);
        });
    });

    describe('sign in / sign up', () => {
        it('creates a USER account and logs in through the one-time ticket', async () => {
            const ticket = (await signInWithDiscord()).get('ticket');

            const res = await request(app).post('/api/v1/auth/discord/exchange').send({ ticket }).expect(200);
            expect(res.body.data.user).toMatchObject({
                email: 'waterfan@example.com',
                role: 'USER',
                discord: { linked: true, username: 'waterfan' },
            });

            await request(app).get('/api/v1/auth/me')
                .set('Authorization', `Bearer ${res.body.data.token}`).expect(200);

            const user = await User.findOne({ email: 'waterfan@example.com' }).select('+password');
            expect(user.discordId).toBe(discordProfile.id);
            expect(user.password).toBeUndefined();
            expect(user.isEmailVerified).toBe(true);
        });

        it('only accepts a login ticket once', async () => {
            const ticket = (await signInWithDiscord()).get('ticket');
            await request(app).post('/api/v1/auth/discord/exchange').send({ ticket }).expect(200);
            await request(app).post('/api/v1/auth/discord/exchange').send({ ticket }).expect(401);
        });

        it('rejects an unknown ticket', async () => {
            await request(app).post('/api/v1/auth/discord/exchange').send({ ticket: 'forged' }).expect(401);
        });

        it('signs a returning user into the same account (matched by Discord id)', async () => {
            await signInWithDiscord();
            discordProfile.email = 'changed@example.com';
            discordProfile.username = 'renamed';

            const ticket = (await signInWithDiscord()).get('ticket');
            const res = await request(app).post('/api/v1/auth/discord/exchange').send({ ticket }).expect(200);

            expect(res.body.data.user.email).toBe('waterfan@example.com');
            expect(res.body.data.user.discord.username).toBe('renamed');
            expect(await User.countDocuments()).toBe(1);
        });

        it('refuses Discord accounts without a verified email', async () => {
            discordProfile.verified = false;
            expect((await signInWithDiscord()).get('error')).toBe('discord_email_unverified');
            expect(await User.countDocuments()).toBe(0);
        });

        it('does not silently take over an existing password account with the same email', async () => {
            await request(app).post('/api/v1/auth/register').send({
                name: 'Existing', email: 'waterfan@example.com', password: 'Password123',
            }).expect(201);

            expect((await signInWithDiscord()).get('error')).toBe('account_exists');
            const user = await User.findOne({ email: 'waterfan@example.com' });
            expect(user.discordId).toBeUndefined();
        });

        it('refuses deactivated accounts', async () => {
            await signInWithDiscord();
            await User.updateOne({ discordId: discordProfile.id }, { isActive: false });
            expect((await signInWithDiscord()).get('error')).toBe('account_deactivated');
        });

        it('Discord-only accounts cannot log in with a password', async () => {
            await signInWithDiscord();
            await request(app).post('/api/v1/auth/login')
                .send({ email: 'waterfan@example.com', password: 'Password123' }).expect(401);
        });
    });

    describe('linking Discord to an existing account', () => {
        let token;

        beforeEach(async () => {
            const res = await request(app).post('/api/v1/auth/register').send({
                name: 'Local User', email: 'local@example.com', password: 'Password123',
            });
            token = res.body.data.token;
        });

        const link = async () => {
            const res = await request(app).post('/api/v1/auth/discord/link')
                .set('Authorization', `Bearer ${token}`).expect(200);
            const { state, cookie } = await start(`/api/v1${res.body.data.path}`);
            return fragment(await callback(state, cookie));
        };

        it('requires authentication to get a link ticket', async () => {
            await request(app).post('/api/v1/auth/discord/link').expect(401);
        });

        it('links Discord and then allows Discord sign-in to that account', async () => {
            expect((await link()).get('linked')).toBe('discord');

            const user = await User.findOne({ email: 'local@example.com' });
            expect(user.discordId).toBe(discordProfile.id);

            const ticket = (await signInWithDiscord()).get('ticket');
            const res = await request(app).post('/api/v1/auth/discord/exchange').send({ ticket }).expect(200);
            expect(res.body.data.user.email).toBe('local@example.com');
        });

        it('rejects an invalid link ticket', async () => {
            const res = await request(app).get('/api/v1/auth/discord?link_ticket=forged').expect(302);
            expect(fragment(res).get('error')).toBe('invalid_ticket');
        });

        it('does not allow one Discord account on two users', async () => {
            await signInWithDiscord(); // Discord user already owns another account
            expect((await link()).get('error')).toBe('discord_already_linked');
        });

        it('unlinks Discord from an account that has a password', async () => {
            await link();
            await request(app).delete('/api/v1/auth/discord/link')
                .set('Authorization', `Bearer ${token}`).expect(200);
            const user = await User.findOne({ email: 'local@example.com' });
            expect(user.discordId).toBeUndefined();
        });

        it('refuses to unlink a Discord-only account', async () => {
            const ticket = (await signInWithDiscord()).get('ticket');
            const res = await request(app).post('/api/v1/auth/discord/exchange').send({ ticket });
            await request(app).delete('/api/v1/auth/discord/link')
                .set('Authorization', `Bearer ${res.body.data.token}`).expect(400);
        });
    });
});
