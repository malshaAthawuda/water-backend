const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

// Set required environment variables for testing
process.env.JWT_SECRET = 'test-secret-key-for-jwt-signing';
process.env.JWT_EXPIRES_IN = '1d';
process.env.NODE_ENV = 'test';


/**
 * Connect to in-memory MongoDB before all tests
 */
const connect = async () => {
    if (process.env.TEST_MONGODB_URI) {
        await mongoose.connect(process.env.TEST_MONGODB_URI);
        return;
    }
    try {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose.connect(uri);
    } catch {
        // Fallback to local MongoDB instance
        await mongoose.connect('mongodb://127.0.0.1:27017/water_quality_test_db');
    }
};

/**
 * Clear all collections after each test
 */
const clearDatabase = async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
};

/**
 * Close connection and stop MongoDB after all tests
 */
const closeDatabase = async () => {
    try {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
    } catch {}
    if (mongoServer) {
        await mongoServer.stop();
    }
};

module.exports = {
    connect,
    clearDatabase,
    closeDatabase,
};
