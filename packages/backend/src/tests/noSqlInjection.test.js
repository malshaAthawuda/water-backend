const request = require('supertest');
const app = require('../app');
const { connect, clearDatabase, closeDatabase, promoteUser } = require('./setup');
const { PublicReport } = require('../models/PublicReport.model');
const BannedUser = require('../models/BannedUser.model');
const Laboratory = require('../models/Laboratory.model');
const { escapeRegex, containsFilter } = require('../utils/safeSearch');
const { findOperatorKey } = require('../middlewares/noSqlInjection.middleware');

/**
 * Finding 6 - NoSQL regex injection / ReDoS and operator injection
 * (OWASP A03:2021, CWE-943, CWE-1333)
 */
describe('NoSQL injection protection', () => {
    let adminToken;
    let adminId;

    const lab = (overrides) => ({
        location: 'Loc', email: `${overrides.name.replace(/\W/g, '')}@lab.com`, phone: '0112233441',
        address: 'Addr', city: 'Colombo', postalCode: '1', country: 'SL',
        operatingHours: 'H', capacity: 10, ...overrides,
    });

    beforeAll(async () => {
        await connect();
    });

    beforeEach(async () => {
        const res = await request(app).post('/api/v1/auth/register').send({
            name: 'Admin', email: 'admin@example.com', password: 'Password123',
        });
        adminId = res.body.data.user.id;
        await promoteUser(adminId, 'ADMIN');
        adminToken = res.body.data.token;
    });

    afterEach(async () => {
        await clearDatabase();
    });

    afterAll(async () => {
        await closeDatabase();
    });

    describe('safeSearch helpers', () => {
        it('escapes every regex metacharacter', () => {
            const input = '.*+?^${}()|[]\\';
            expect(new RegExp(escapeRegex(input)).test(input)).toBe(true);
            expect(new RegExp(`^${escapeRegex('a.c')}$`).test('abc')).toBe(false);
        });

        it('rejects arrays, objects and over-long values', () => {
            expect(() => containsFilter(['a', 'b'])).toThrow(/single text value/);
            expect(() => containsFilter({ $ne: null })).toThrow(/single text value/);
            expect(() => containsFilter('x'.repeat(101))).toThrow(/cannot exceed/);
        });
    });

    describe('GET /public-reports-admin search', () => {
        beforeEach(async () => {
            await PublicReport.create([
                { nic: '981234567V', wizardCompleted: true, location: { district: 'Colombo' } },
                { nic: '200012345678', wizardCompleted: true, location: { district: 'Kandy' } },
            ]);
        });

        const search = (qs) => request(app)
            .get(`/api/v1/public-reports-admin?${qs}`)
            .set('Authorization', `Bearer ${adminToken}`);

        it('still supports plain substring search', async () => {
            const res = await search('nic=1234').expect(200);
            expect(res.body.data.reports).toHaveLength(2);
        });

        it('treats regex syntax as literal text (no NIC prefix probing)', async () => {
            const res = await search(`nic=${encodeURIComponent('^98')}`).expect(200);
            expect(res.body.data.reports).toHaveLength(0);
        });

        it('does not execute a catastrophic backtracking pattern', async () => {
            const started = Date.now();
            const res = await search(`district=${encodeURIComponent('^(a+)+$')}`).expect(200);
            expect(res.body.data.reports).toHaveLength(0);
            expect(Date.now() - started).toBeLessThan(2000);
        });

        it('returns 400 instead of 500 for a repeated parameter', async () => {
            await search('nic=a&nic=b').expect(400);
        });
    });

    describe('GET /laboratories search', () => {
        beforeEach(async () => {
            await Laboratory.create([lab({ name: 'Central Lab' }), lab({ name: 'North Lab' })]);
        });

        it('matches regex metacharacters literally', async () => {
            const all = await request(app)
                .get(`/api/v1/laboratories?search=${encodeURIComponent('.*')}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(all.body.data.laboratories).toHaveLength(0);

            const one = await request(app)
                .get('/api/v1/laboratories?search=central')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(one.body.data.laboratories).toHaveLength(1);
        });
    });

    describe('operator injection in JSON bodies', () => {
        it('finds nested operator keys', () => {
            expect(findOperatorKey({ a: { b: [{ $gt: 1 }] } })).toBe('a.b.0.$gt');
            expect(findOperatorKey({ a: 'x', b: { c: 1 } })).toBeNull();
            expect(findOperatorKey(undefined)).toBeNull();
        });

        it('rejects {"$ne": null} on unban and keeps the existing ban', async () => {
            await BannedUser.create({ type: 'nic', value: '111222333V', reason: 'spam', bannedBy: adminId });

            const res = await request(app)
                .post('/api/v1/public-reports-admin/unban')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ type: 'nic', value: { $ne: null } })
                .expect(400);

            expect(res.body.message).toMatch(/keys starting with "\$" are not allowed/);
            expect(await BannedUser.countDocuments()).toBe(1);
        });

        it('rejects operator payloads on public endpoints such as login', async () => {
            await request(app)
                .post('/api/v1/auth/login')
                .send({ email: 'admin@example.com', password: { $gt: '' } })
                .expect(400);
        });

        it('rejects a non-string ban value', async () => {
            await request(app)
                .post('/api/v1/public-reports-admin/ban')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ type: 'nic', value: ['a', 'b'] })
                .expect(400);
        });
    });
});
