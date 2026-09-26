/**
 * Bootstrap an ADMIN account.
 *
 * Public registration always creates USER accounts, so the very first
 * administrator has to be created out-of-band by someone with shell and
 * database access. Credentials are read from environment variables (not
 * CLI arguments) so they do not end up in shell history or `ps` output.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='Str0ngPassw0rd' \
 *   ADMIN_NAME='System Admin' npm run create-admin
 *
 * If a user with ADMIN_EMAIL already exists it is promoted to ADMIN and
 * ADMIN_PASSWORD is ignored.
 */
const { connectDB, disconnectDB } = require('../src/config/database');
const { User, UserRole } = require('../src/models/User.model');
const { registerSchema } = require('../src/validations/auth.validation');

const run = async () => {
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || '';
    const name = (process.env.ADMIN_NAME || 'System Administrator').trim();

    if (!email) {
        console.error('ADMIN_EMAIL is required');
        process.exit(1);
    }

    await connectDB();

    const existing = await User.findByEmail(email);
    if (existing) {
        existing.role = UserRole.ADMIN;
        await existing.save({ validateBeforeSave: false });
        console.log(`Promoted existing user ${email} to ADMIN`);
    } else {
        // Re-use the registration rules so the admin password meets the same policy
        const { error } = registerSchema.validate({ name, email, password });
        if (error) {
            console.error(`Invalid admin details: ${error.details.map((d) => d.message).join('; ')}`);
            await disconnectDB();
            process.exit(1);
        }

        await User.create({ name, email, password, role: UserRole.ADMIN });
        console.log(`Created ADMIN account ${email}`);
    }

    await disconnectDB();
};

run().catch(async (err) => {
    console.error(err.message);
    await disconnectDB().catch(() => {});
    process.exit(1);
});
