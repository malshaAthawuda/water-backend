const express = require('express');
const request = require('supertest');
const app = require('../app');
const config = require('../config');
const { connect, clearDatabase, closeDatabase } = require('./setup');
const { User } = require('../models/User.model');
const { createAuthLimiter } = require('../middlewares/rateLimit.middleware');

/**
 * Finding 4 - Credential brute forcing on /auth/login
 * (OWASP A07:2021, CWE-307)
 */
describe('Login brute-force protection', () => {
    const account = {
        name: 'Brute Force Target',
        email: 'target@example.com',
        password: 'Password123',
    };

    const login = (password, email = account.email) =>
        request(app).post('/api/v1/auth/login').send({ email, password });

    const failTimes = async (n) => {
        for (let i = 0; i < n; i++) {
            await login(`WrongPassword${i}A`).expect(401);
        }
    };

    beforeAll(async () => {
        await connect();
    });

    beforeEach(async () => {
        await request(app).post('/api/v1/auth/register').send(account).expect(201);
    });

    afterEach(async () => {
        await clearDatabase();
    });

    afterAll(async () => {
        await closeDatabase();
    });

    describe('per-account lockout', () => {
        it('counts consecutive failed attempts', async () => {
            await failTimes(2);
            const user = await User.findOne({ email: account.email }).select('+failedLoginAttempts');
            expect(user.failedLoginAttempts).toBe(2);
        });

        it('locks the account after the configured number of failures', async () => {
            await failTimes(config.auth.maxLoginAttempts);

            const user = await User.findOne({ email: account.email }).select('+lockUntil');
            expect(user.lockUntil.getTime()).toBeGreaterThan(Date.now());

            const res = await login('WrongAgain1').expect(429);
            expect(res.body.message).toMatch(/Account locked/);
        });

        it('rejects even the correct password while locked', async () => {
            await failTimes(config.auth.maxLoginAttempts);

            const res = await login(account.password).expect(429);
            expect(res.body.data).toBeUndefined();
        });

        it('allows login again once the lock has expired', async () => {
            await failTimes(config.auth.maxLoginAttempts);
            await User.updateOne(
                { email: account.email },
                { lockUntil: new Date(Date.now() - 1000) }
            );

            const res = await login(account.password).expect(200);
            expect(res.body.data).toHaveProperty('token');
        });

        it('resets the failure counter after a successful login', async () => {
            await failTimes(config.auth.maxLoginAttempts - 1);
            await login(account.password).expect(200);

            const user = await User.findOne({ email: account.email }).select('+failedLoginAttempts');
            expect(user.failedLoginAttempts).toBe(0);

            // A single new failure must not lock the account
            await login('WrongPassword9Z').expect(401);
        });

        it('does not count parallel guesses past the limit', async () => {
            await Promise.all(
                Array.from({ length: config.auth.maxLoginAttempts * 2 }, (_, i) =>
                    login(`ParallelGuess${i}A`))
            );

            await login(account.password).expect(429);
        });

        it('never exposes lockout fields in API responses', async () => {
            await failTimes(1);
            const res = await login(account.password).expect(200);
            expect(res.body.data.user).not.toHaveProperty('failedLoginAttempts');
            expect(res.body.data.user).not.toHaveProperty('lockUntil');
        });
    });

    describe('account enumeration', () => {
        it('returns the same message for unknown emails and wrong passwords', async () => {
            const unknown = await login('Password123', 'nobody@example.com').expect(401);
            const wrong = await login('WrongPassword1A').expect(401);
            expect(unknown.body.message).toBe(wrong.body.message);
        });

        it('does not reveal a deactivated account without the correct password', async () => {
            await User.updateOne({ email: account.email }, { isActive: false });

            const wrong = await login('WrongPassword1A').expect(401);
            expect(wrong.body.message).toBe('Invalid email or password');

            const right = await login(account.password).expect(401);
            expect(right.body.message).toMatch(/deactivated/);
        });
    });

    describe('per-IP auth rate limiter', () => {
        const buildApp = () => {
            const limited = express();
            limited.use(express.json());
            limited.post('/login', createAuthLimiter({ limit: 3, windowMs: 60 * 1000 }), (req, res) => {
                if (req.body.password === 'correct') return res.json({ ok: true });
                return res.status(401).json({ ok: false });
            });
            return limited;
        };

        it('blocks an IP after too many failed attempts', async () => {
            const limited = buildApp();
            for (let i = 0; i < 3; i++) {
                await request(limited).post('/login').send({ password: 'wrong' }).expect(401);
            }
            const res = await request(limited).post('/login').send({ password: 'wrong' }).expect(429);
            expect(res.body.message).toMatch(/Too many authentication attempts/);
        });

        it('does not count successful logins', async () => {
            const limited = buildApp();
            for (let i = 0; i < 5; i++) {
                await request(limited).post('/login').send({ password: 'correct' }).expect(200);
            }
        });
    });
});
