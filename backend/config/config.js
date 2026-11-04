
require("dotenv").config();

function getRequiredEnv(name) {
    const value = process.env[name];

    if (!value || value.trim() === "") {
        throw new Error(
            `Missing required environment variable: ${name}`
        );
    }

    return value.trim();
}

function getBooleanEnv(name, defaultValue = false) {
    const value = process.env[name];

    if (value === undefined) {
        return defaultValue;
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
        return true;
    }

    if (normalized === "false") {
        return false;
    }

    throw new Error(
        `Invalid ${name}: must be true or false`
    );
}

function getVerifiedPostgresUrl(name) {
    const value = getRequiredEnv(name);

    let parsedUrl;

    try {
        parsedUrl = new URL(value);
    } catch {
        throw new Error(
            `Invalid ${name}: must be a valid PostgreSQL URL`
        );
    }

    if (
        !["postgres:", "postgresql:"].includes(parsedUrl.protocol)
    ) {
        throw new Error(
            `Invalid ${name}: must use PostgreSQL protocol`
        );
    }

    if (
        parsedUrl.searchParams.get("sslmode") !== "verify-full"
    ) {
        throw new Error(
            `${name} must use sslmode=verify-full`
        );
    }

    return value;
}

function getPort(name, defaultValue = null) {
    const value = process.env[name];

    if (!value && defaultValue !== null) {
        return defaultValue;
    }

    const port = Number(value);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(
            `Invalid ${name}: must be a valid port number`
        );
    }

    return port;
}


// ======================================================
// Environment Configuration
// ======================================================

const nodeEnv = (
    process.env.NODE_ENV || "development"
).trim().toLowerCase();

const allowedEnvironments = [
    "development",
    "test",
    "production"
];

if (!allowedEnvironments.includes(nodeEnv)) {
    throw new Error(`Invalid NODE_ENV: ${nodeEnv}`);
}

const isProduction = nodeEnv === "production";


// ======================================================
// Database Connection Selection
// ======================================================

const dbConnection = (
    process.env.DB_CONNECTION || "local"
).trim().toLowerCase();

const allowedDbConnections = [
    "local",
    "neon"
];

if (!allowedDbConnections.includes(dbConnection)) {
    throw new Error(
        "Invalid DB_CONNECTION: must be local or neon"
    );
}

const dbSslEnabled = getBooleanEnv(
    "DB_SSL",
    isProduction
);

if (
    isProduction &&
    dbConnection === "local" &&
    !dbSslEnabled
) {
    throw new Error(
        "DB_SSL must be true in production"
    );
}


// ======================================================
// Authentication Configuration
// ======================================================

const jwtSecret = getRequiredEnv("JWT_SECRET");

if (isProduction && jwtSecret.length < 32) {
    throw new Error(
        "JWT_SECRET must be at least 32 characters in production"
    );
}


// ======================================================
// Frontend Origin Validation
// ======================================================

const frontendOrigin =
    process.env.FRONTEND_ORIGIN?.trim() ||
    (isProduction ? null : "http://localhost:5173");

if (isProduction) {

    if (!frontendOrigin) {
        throw new Error(
            "Missing required environment variable: FRONTEND_ORIGIN"
        );
    }

    let frontendUrl;

    try {
        frontendUrl = new URL(frontendOrigin);
    } catch {
        throw new Error(
            "Invalid FRONTEND_ORIGIN: must be a valid HTTPS origin"
        );
    }

    if (
        frontendUrl.protocol !== "https:" ||
        frontendUrl.origin !== frontendOrigin
    ) {
        throw new Error(
            "Invalid FRONTEND_ORIGIN: production requires an HTTPS origin without a path"
        );
    }
}


// ======================================================
// Database Configuration
// ======================================================

// Application connection:
// Neon uses pooled connection.
// Local uses local PostgreSQL.

const databaseConfig = dbConnection === "neon"
    ? {
        connectionString: getVerifiedPostgresUrl(
            "DATABASE_URL"
        )
    }
    : {
        user: getRequiredEnv("DB_USER"),
        host: getRequiredEnv("DB_HOST"),
        database: getRequiredEnv("DB_NAME"),
        password: getRequiredEnv("DB_PASSWORD"),
        port: getPort("DB_PORT"),
        ssl: dbSslEnabled
            ? { rejectUnauthorized: true }
            : false
    };


// Migration connection:
// Neon uses direct connection.
// Local uses the same local PostgreSQL settings.

const migrationDatabaseConfig = dbConnection === "neon"
    ? {
        connectionString: getVerifiedPostgresUrl(
            "DIRECT_DATABASE_URL"
        )
    }
    : databaseConfig;


// ======================================================
// Centralized Application Configuration
// ======================================================

const config = {

    server: {
        environment: nodeEnv,
        isProduction,
        port: getPort("PORT", 5000),
        frontendOrigin
    },

    auth: {
        jwtSecret
    },

    db: databaseConfig,

    dbMigration: migrationDatabaseConfig

};

module.exports = config;
