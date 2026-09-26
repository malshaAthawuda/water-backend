const request = require('supertest');
const app = require('../app');
const { connect, clearDatabase, closeDatabase } = require('./setup');
const { PublicReport } = require('../models/PublicReport.model');
const { User } = require('../models/User.model');

// Smallest byte sequences that start with each real file signature.
const b64 = (...parts) => Buffer.concat(parts).toString('base64');
// Genuine, complete tiny images (real signatures + closing markers).
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==';
const WEBP = b64(Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8));
const HTML = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');

describe('Public report photo upload validation', () => {
    let reportId;
    let reportToken;

    beforeAll(async () => {
        await connect();
    });

    afterEach(async () => {
        await clearDatabase();
    });

    afterAll(async () => {
        await closeDatabase();
    });

    beforeEach(async () => {
        const res = await request(app).post('/api/v1/public-reports').send({ nic: '123456789V' });
        reportId = res.body.data.report._id;
        reportToken = res.body.data.accessToken;
    });

    const upload = (images) =>
        request(app)
            .post(`/api/v1/public-reports/${reportId}/images`)
            .set('x-report-token', reportToken)
            .send({ images });

    const storedImages = async () => (await PublicReport.findById(reportId)).images;

    describe('accepts real photos', () => {
        it.each([
            ['PNG', PNG, 'image/png'],
            ['JPEG', JPEG, 'image/jpeg'],
            ['WebP', WEBP, 'image/webp'],
        ])('should accept a real %s', async (_name, data, contentType) => {
            const res = await upload([{ imageType: 'water_source', data, contentType }]);

            expect(res.status).toBe(200);
            expect(res.body.data.imageCount).toBe(1);
            expect((await storedImages())[0].contentType).toBe(contentType);
        });

        it('should accept a data-URI prefix but store clean base64', async () => {
            const res = await upload([
                { imageType: 'water_source', data: `data:image/png;base64,${PNG}`, contentType: 'image/png' },
            ]);

            expect(res.status).toBe(200);
            expect((await storedImages())[0].data).toBe(PNG);
        });

        it('should store the type the server detected (image/jpg label -> image/jpeg)', async () => {
            const res = await upload([{ imageType: 'water_source', data: JPEG, contentType: 'image/jpg' }]);

            expect(res.status).toBe(200);
            expect((await storedImages())[0].contentType).toBe('image/jpeg');
        });

        it('should strip folders and odd characters from the filename', async () => {
            const res = await upload([
                { imageType: 'water_source', data: PNG, contentType: 'image/png', filename: '../../evil<script>.png' },
            ]);

            expect(res.status).toBe(200);
            const { filename } = (await storedImages())[0];
            expect(filename).not.toMatch(/[\\/<>]/);
            expect(filename.endsWith('.png')).toBe(true);
        });
    });

    describe('rejects fake photos', () => {
        it('should reject a web page labelled text/html', async () => {
            const res = await upload([{ imageType: 'water_source', data: HTML, contentType: 'text/html' }]);

            expect(res.status).toBe(400);
            expect(await storedImages()).toHaveLength(0);
        });

        it('should reject a web page pretending to be image/png', async () => {
            const res = await upload([{ imageType: 'water_source', data: HTML, contentType: 'image/png' }]);

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('not a valid image');
        });

        it('should reject real PNG bytes with a mismatching label', async () => {
            const res = await upload([{ imageType: 'water_source', data: PNG, contentType: 'image/jpeg' }]);

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('does not match');
        });

        it('should reject data that is not base64', async () => {
            const res = await upload([{ imageType: 'water_source', data: 'not base64 !!!', contentType: 'image/png' }]);

            expect(res.status).toBe(400);
        });

        it('should reject data that is not a string', async () => {
            const res = await upload([{ imageType: 'water_source', data: { evil: true }, contentType: 'image/png' }]);

            expect(res.status).toBe(400);
        });

        it('should save nothing when one image in the batch is fake', async () => {
            const res = await upload([
                { imageType: 'water_source', data: PNG, contentType: 'image/png' },
                { imageType: 'water_sample', data: HTML, contentType: 'text/html' },
            ]);

            expect(res.status).toBe(400);
            expect(await storedImages()).toHaveLength(0);
        });
    });

    describe('deeper structural checks', () => {
        // Build a PNG with chosen dimensions; optionally omit the closing IEND chunk.
        const buildPng = (width, height, { withIend = true } = {}) => {
            const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
            const w = Buffer.alloc(4); w.writeUInt32BE(width);
            const h = Buffer.alloc(4); h.writeUInt32BE(height);
            const ihdr = Buffer.concat([
                Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR'),
                w, h, Buffer.from([8, 2, 0, 0, 0]), Buffer.alloc(4),
            ]);
            const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
            return Buffer.concat(withIend ? [sig, ihdr, iend] : [sig, ihdr]).toString('base64');
        };

        it('should reject a PNG with no closing IEND chunk (incomplete)', async () => {
            const res = await upload([
                { imageType: 'water_source', contentType: 'image/png', data: buildPng(4, 4, { withIend: false }) },
            ]);

            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toContain('incomplete');
        });

        it('should reject a JPEG with no closing EOI marker (incomplete)', async () => {
            const truncated = Buffer.from(JPEG, 'base64').subarray(0, -2).toString('base64');
            const res = await upload([{ imageType: 'water_source', contentType: 'image/jpeg', data: truncated }]);

            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toContain('incomplete');
        });

        it('should reject an image whose dimensions are too large', async () => {
            const res = await upload([
                { imageType: 'water_source', contentType: 'image/png', data: buildPng(20000, 20000) },
            ]);

            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toContain('dimensions');
        });

        it('should accept a normal-sized complete PNG', async () => {
            const res = await upload([
                { imageType: 'water_source', contentType: 'image/png', data: buildPng(640, 480) },
            ]);

            expect(res.status).toBe(200);
        });
    });

    describe('request-shape validation (schema layer)', () => {
        it('should reject a contentType outside the allowlist', async () => {
            const res = await upload([{ imageType: 'water_source', data: PNG, contentType: 'application/pdf' }]);

            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toContain('Allowed: JPEG, PNG, WebP');
        });

        it('should reject an unknown imageType', async () => {
            const res = await upload([{ imageType: 'malware', data: PNG, contentType: 'image/png' }]);

            expect(res.status).toBe(400);
        });

        it('should reject an empty images array', async () => {
            const res = await upload([]);

            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toContain('at least one image');
        });

        it('should reject more than 10 images at the schema layer', async () => {
            const many = Array.from({ length: 11 }, () => ({
                imageType: 'water_source',
                data: PNG,
                contentType: 'image/png',
            }));
            const res = await upload(many);

            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toContain('Maximum 10 images');
            expect(await storedImages()).toHaveLength(0);
        });
    });
});

describe('Serving stored photos to staff', () => {
    let adminToken;

    beforeAll(async () => {
        await connect();
    });

    afterEach(async () => {
        await clearDatabase();
    });

    afterAll(async () => {
        await closeDatabase();
    });

    beforeEach(async () => {
        const res = await request(app)
            .post('/api/v1/auth/register')
            .send({ name: 'Staff Member', email: 'staff@example.com', password: 'Password123' });
        adminToken = res.body.data.token;
        await User.findOneAndUpdate({ email: 'staff@example.com' }, { role: 'ADMIN' });
    });

    const seedImage = async (image) => {
        const report = await PublicReport.create({ nic: '123456789V', wizardCompleted: true });
        report.images.push({ imageType: 'water_source', ...image });
        await report.save();
        return { reportId: report._id, imageId: report.images[0]._id };
    };

    const fetchImage = ({ reportId, imageId }) =>
        request(app)
            .get(`/api/v1/public-reports-admin/${reportId}/images/${imageId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .buffer(true)
            .parse((res, cb) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => cb(null, Buffer.concat(chunks)));
            });

    it('should serve a real image with its real type and safety headers', async () => {
        const ids = await seedImage({ data: PNG, contentType: 'image/png' });

        const res = await fetchImage(ids);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('image/png');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['content-security-policy']).toContain('sandbox');
        expect(res.body.equals(Buffer.from(PNG, 'base64'))).toBe(true);
    });

    it('should never serve an old fake "photo" as a web page', async () => {
        const ids = await seedImage({ data: HTML, contentType: 'text/html' });

        const res = await fetchImage(ids);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/octet-stream');
        expect(res.headers['content-type']).not.toContain('html');
        expect(res.headers['content-disposition']).toContain('attachment');
    });

    it('should ignore a wrong stored label and use the real image type', async () => {
        const ids = await seedImage({ data: PNG, contentType: 'text/html' });

        const res = await fetchImage(ids);

        expect(res.headers['content-type']).toBe('image/png');
    });

    it('should still serve older records stored with a data-URI prefix', async () => {
        const ids = await seedImage({ data: `data:image/png;base64,${PNG}`, contentType: 'image/png' });

        const res = await fetchImage(ids);

        expect(res.headers['content-type']).toBe('image/png');
        expect(res.body.equals(Buffer.from(PNG, 'base64'))).toBe(true);
    });
});
