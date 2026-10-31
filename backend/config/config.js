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

    db: {
        user: getRequiredEnv("DB_USER"),
        host: getRequiredEnv("DB_HOST"),
        database: getRequiredEnv("DB_NAME"),
        password: getRequiredEnv("DB_PASSWORD"),
        port: getPort("DB_PORT")
    }

};

module.exports = config;