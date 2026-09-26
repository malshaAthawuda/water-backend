const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger');

const connectDB = async () => {
    if (!config.mongoose.url) {
        logger.error('MONGODB_URI is not set. Add it to packages/backend/.env (see README).');
        process.exit(1);
    }

    try {
        const conn = await mongoose.connect(config.mongoose.url, config.mongoose.options);

        logger.info(`MongoDB Connected: ${conn.connection.host}`);

        // Handle connection events
        mongoose.connection.on('error', (err) => {
            logger.error(`MongoDB connection error: ${err}`);
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected. Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('MongoDB reconnected');
        });

        return conn;
    } catch (error) {
        logger.error(`Error connecting to MongoDB: ${error.message}`);
        process.exit(1);
    }
};

const disconnectDB = async () => {
    try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
    } catch (error) {
        logger.error(`Error disconnecting from MongoDB: ${error.message}`);
        throw error;
    }
};

module.exports = { connectDB, disconnectDB };
