require("dotenv").config();

function getRequiredEnv(name) {
    const value = process.env[name];

    if (!value || value.trim() === "") {
        throw new Error(`Missing required environment variable: ${name}`);
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
        throw new Error(`Invalid ${name}: must be a valid port number`);
    }

    return port;
}

const config = {
    server: {
        port: getPort("PORT", 5000)
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