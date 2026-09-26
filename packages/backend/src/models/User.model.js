const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * User roles enum
 */
const UserRole = {
    USER: 'USER',
    MODERATOR: 'MODERATOR',
    ADMIN: 'ADMIN',
    LAB_STAFF: 'LAB_STAFF',
};

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            minlength: [2, 'Name must be at least 2 characters'],
            maxlength: [100, 'Name cannot exceed 100 characters'],
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            trim: true,
            lowercase: true,
            match: [
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                'Please provide a valid email address',
            ],
        },
        password: {
            type: String,
            // Accounts created through "Sign in with Discord" have no local password
            required: [function () { return !this.discordId; }, 'Password is required'],
            minlength: [8, 'Password must be at least 8 characters'],
            select: false, // Don't include password in queries by default
        },
        role: {
            type: String,
            enum: Object.values(UserRole),
            default: UserRole.USER,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        // Linked Discord identity (OAuth 2.0). The Discord user id is the stable
        // identifier; the username is only kept for display.
        discordId: {
            type: String,
            unique: true,
            sparse: true,
        },
        discordUsername: {
            type: String,
        },
        isEmailVerified: {
            type: Boolean,
            default: false,
        },
        lastLoginAt: {
            type: Date,
        },
        passwordChangedAt: {
            type: Date,
        },
        // Incremented to revoke every JWT issued to this user so far
        // (logout, role change, deactivation). Tokens carry it as "tv".
        tokenVersion: {
            type: Number,
            default: 0,
            select: false,
        },
        // Brute-force protection (see auth.service.login)
        failedLoginAttempts: {
            type: Number,
            default: 0,
            select: false,
        },
        lockUntil: {
            type: Date,
            select: false,
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret.password;
                delete ret.tokenVersion;
                delete ret.failedLoginAttempts;
                delete ret.lockUntil;
                delete ret.__v;
                return ret;
            },
        },
        toObject: {
            virtuals: true,
        },
    }
);

// Index for faster queries
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

/**
 * Pre-save middleware to hash password
 * Using async function - no need for next() in Mongoose 5+
 */
userSchema.pre('save', async function () {
    // Only hash the password if it has been modified
    if (!this.isModified('password')) {
        return;
    }

    // Generate salt and hash password
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);

    // Update passwordChangedAt
    if (!this.isNew) {
        this.passwordChangedAt = Date.now() - 1000; // Subtract 1 second for token comparison
    }
});

/**
 * Instance method to compare passwords
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
    // Discord-only accounts have no password and can never log in with one
    if (!this.password) return false;
    return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Instance method to check if password was changed after token was issued
 */
userSchema.methods.changedPasswordAfter = function (jwtTimestamp) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
        return jwtTimestamp < changedTimestamp;
    }
    return false;
};

/**
 * Instance method to check whether the account is temporarily locked
 */
userSchema.methods.isLocked = function () {
    return !!(this.lockUntil && this.lockUntil.getTime() > Date.now());
};

/**
 * Static method to revoke all existing tokens for a user
 */
userSchema.statics.revokeTokens = function (userId) {
    return this.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
};

/**
 * Static method to find user by email
 */
userSchema.statics.findByEmail = function (email) {
    return this.findOne({ email: email.toLowerCase() });
};

const User = mongoose.model('User', userSchema);

module.exports = { User, UserRole };
