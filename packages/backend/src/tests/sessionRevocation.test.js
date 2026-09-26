const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../app');
const config = require('../config');
const { connect, clearDatabase, closeDatabase, promoteUser } = require('./setup');
const { User } = require('../models/User.model');

/**
 * Finding 8 - JWTs not invalidated on logout / role change / deactivation
 * (OWASP A07:2021, CWE-613)
 */
describe('Session (JWT) revocation', () => {
    const creds = { name: 'Session User', email: 'session@example.com', password: 'Password123' };
    let userId;
    let token;

    const me = (t) => request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${t}`);
    const login = async () => {
        const res = await request(app).post('/api/v1/auth/login')
            .send({ email: creds.email, password: creds.password }).expect(200);
        return res.body.data.token;
    };

    const createAdmin = async () => {
        const res = await request(app).post('/api/v1/auth/register').send({
            name: 'Admin', email: 'admin@example.com', password: 'Password123',
        });
        await promoteUser(res.body.data.user.id, 'ADMIN');
        return res.body.data.token;
    };

    beforeAll(async () => {
        await connect();
    });

    beforeEach(async () => {
        const res = await request(app).post('/api/v1/auth/register').send(creds).expect(201);
        userId = res.body.data.user.id;
        token = res.body.data.token;
    });

    afterEach(async () => {
        await clearDatabase();
    });

    afterAll(async () => {
        await closeDatabase();
    });

    it('embeds the token version in issued tokens', () => {
        const decoded = jwt.decode(token);
        expect(decoded).toMatchObject({ id: userId, tv: 0 });
    });

    it('rejects a token after the user logs out', async () => {
        await me(token).expect(200);
        await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`).expect(200);

        const res = await me(token).expect(401);
        expect(res.body.message).toMatch(/revoked/);
    });

    it('logging out revokes tokens on every device', async () => {
        const laptopToken = token;
        const phoneToken = await login();

        await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${phoneToken}`).expect(200);

        await me(laptopToken).expect(401);
        await me(phoneToken).expect(401);
    });

    it('issues a working token on the next login', async () => {
        await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`).expect(200);
        const fresh = await login();
        await me(fresh).expect(200);
        expect(jwt.decode(fresh).tv).toBe(1);
    });

    it('revokes existing tokens when an admin changes the role', async () => {
        const adminToken = await createAdmin();
        await request(app).patch(`/api/v1/admin/users/${userId}/role`)
            .set('Authorization', `Bearer ${adminToken}`).send({ role: 'MODERATOR' }).expect(200);

        await me(token).expect(401);
        const res = await me(await login()).expect(200);
        expect(res.body.data.user.role).toBe('MODERATOR');
    });

    it('keeps tokens revoked after deactivate then reactivate', async () => {
        const adminToken = await createAdmin();
        const setActive = (isActive) => request(app).patch(`/api/v1/admin/users/${userId}/status`)
            .set('Authorization', `Bearer ${adminToken}`).send({ isActive }).expect(200);

        await setActive(false);
        await setActive(true);

        await me(token).expect(401);
    });

    it('does not expose tokenVersion in API responses', async () => {
        const res = await me(token).expect(200);
        expect(res.body.data.user).not.toHaveProperty('tokenVersion');
        const stored = await User.findById(userId);
        expect(stored.toJSON()).not.toHaveProperty('tokenVersion');
    });

    it('rejects tokens signed with an unexpected algorithm', async () => {
        const forged = jwt.sign({ id: userId, tv: 0 }, config.jwt.secret, { algorithm: 'HS512' });
        await me(forged).expect(401);

        const unsigned = jwt.sign({ id: userId, tv: 0 }, null, { algorithm: 'none' });
        await me(unsigned).expect(401);
    });
});
