require("dotenv").config();

const config = {
    server: {
        port: Number(process.env.PORT) || 5000
    },

    db: {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT)
    }
};

module.exports = config;