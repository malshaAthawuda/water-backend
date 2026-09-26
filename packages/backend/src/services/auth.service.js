const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { User, UserRole } = require('../models/User.model');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Generate JWT token for user
 */
const generateToken = (userId) => {
    return jwt.sign({ id: userId }, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn,
    });
};

/**
 * Verify JWT token
 */
const verifyToken = (token) => {
    try {
        return jwt.verify(token, config.jwt.secret);
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw ApiError.unauthorized('Token has expired');
        }
        if (error.name === 'JsonWebTokenError') {
            throw ApiError.unauthorized('Invalid token');
        }
        throw ApiError.unauthorized('Token verification failed');
    }
};

/**
 * Register a new user
 */
const register = async (userData) => {
    // Role is intentionally not read from userData: public registration must
    // always produce a least-privileged account (defence in depth in case the
    // validation layer is bypassed or misconfigured).
    const { name, email, password } = userData;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
        throw ApiError.conflict('Email already registered');
    }

    // Create new user
    const user = await User.create({
        name,
        email,
        password,
        role: UserRole.USER,
    });

    // Generate token
    const token = generateToken(user._id);

    logger.info(`New user registered: ${email}`);

    return {
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
        },
        token,
    };
};

/**
 * bcrypt hash used to burn the same amount of CPU time when the email does
 * not exist, so response timing does not reveal which emails are registered.
 * Cost factor matches the real password hashes (see User.model pre-save).
 */
let dummyPasswordHash;
const getDummyPasswordHash = async () => {
    if (!dummyPasswordHash) {
        dummyPasswordHash = await bcrypt.hash('dummy-password-for-timing-equalisation', 12);
    }
    return dummyPasswordHash;
};

/**
 * Record a failed password attempt and lock the account once the
 * configured threshold is reached. Uses an atomic $inc so parallel
 * guessing requests cannot race past the limit.
 */
const registerFailedLogin = async (user) => {
    const updated = await User.findByIdAndUpdate(
        user._id,
        { $inc: { failedLoginAttempts: 1 } },
        { new: true, projection: { failedLoginAttempts: 1, email: 1 } }
    );

    if (updated && updated.failedLoginAttempts >= config.auth.maxLoginAttempts) {
        await User.updateOne(
            { _id: user._id },
            {
                $set: {
                    failedLoginAttempts: 0,
                    lockUntil: new Date(Date.now() + config.auth.lockTimeMs),
                },
            }
        );
        logger.warn(`Account locked after ${config.auth.maxLoginAttempts} failed logins: ${updated.email}`);
    }
};

/**
 * Login user
 */
const login = async (email, password) => {
    // Find user by email and include password field
    const user = await User.findOne({ email: email.toLowerCase() })
        .select('+password +failedLoginAttempts +lockUntil');

    if (!user) {
        await bcrypt.compare(password, await getDummyPasswordHash());
        throw ApiError.unauthorized('Invalid email or password');
    }

    // Refuse to even check the password while the account is locked, so an
    // attacker cannot keep guessing during the lockout window.
    if (user.isLocked()) {
        const minutesLeft = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
        logger.warn(`Login attempt on locked account: ${email}`);
        throw new ApiError(
            429,
            `Too many failed login attempts. Account locked, try again in ${minutesLeft} minute(s).`
        );
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
        await registerFailedLogin(user);
        throw ApiError.unauthorized('Invalid email or password');
    }

    // Only reveal the deactivated state to someone who knows the password
    if (!user.isActive) {
        throw ApiError.unauthorized('Account is deactivated. Please contact support.');
    }

    // Successful login clears the failure counter and any expired lock
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;

    // Update last login time
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    const { ModerationLog, ModerationAction } = require('../models/ModerationLog.model');

    // Generate token
    const token = generateToken(user._id);

    logger.info(`User logged in: ${email}`);

    // If user is moderator or admin, log their login action
    if (['MODERATOR', 'ADMIN'].includes(user.role)) {
        await ModerationLog.create({
            action: ModerationAction.LOGIN,
            moderatorId: user._id,
        }).catch(err => logger.error('Failed to log moderator login:', err));
    }

    return {
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            lastLoginAt: user.lastLoginAt,
        },
        token,
    };
};

/**
 * Get user by ID
 */
const getUserById = async (userId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw ApiError.notFound('User not found');
    }
    return user;
};

module.exports = {
    generateToken,
    verifyToken,
    register,
    login,
    getUserById,
};
