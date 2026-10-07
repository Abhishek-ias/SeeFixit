require("dotenv").config();


const express = require("express");

const pool = require("./db/database");

const app = express();


const swaggerUi = require("swagger-ui-express");

const swaggerSpec = require("./config/swagger");

const config = require("./config/config");

const logger = require("./utils/logger");

const requestLogger = require("./middleware/requestLogger");

// ======================================================
// Middleware
// ======================================================

app.use(express.json());
app.use(requestLogger);

// ======================================================
// Rate Limiting
// ======================================================

const apiLimiter = require("./middleware/rateLimiter");

app.use(apiLimiter);


// ======================================================
// Routes
// ======================================================

const reportRoutes = require("./routes/reportRoutes");
const authRoutes = require("./routes/authRoutes");

app.use("/api", reportRoutes);
app.use("/api/auth", authRoutes);


// ======================================================
// Authentication Middleware
// ======================================================

const authenticateToken = require("./middleware/authMiddleware");

app.get(
    "/api/test-auth",
    authenticateToken,
    (req, res) => {

        res.json({
            message: "You are authenticated",
            user: req.user
        });

    }
);




// ======================================================
// Error Handling Middleware
// ======================================================

const errorHandler = require("./middleware/errorMiddleware");

app.use(errorHandler);



app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec)
);

// ======================================================
// Start Server
// ======================================================



const port = config.server.port;

const server = app.listen(port, () => {

    logger.info("SeeFixit server started", {
    port
});

});


async function gracefulShutdown(signal) {

    logger.info("Graceful shutdown started", {
    signal
});

    server.close(async () => {

        logger.info("HTTP server closed");

        try {

            await pool.end();

            logger.info("Database pool closed");

            process.exit(0);

        }

        catch (error) {

    logger.error("Error closing database pool", {
        error: error.message
    });

    process.exit(1);

}

    });

}


process.on("SIGINT", () => {

    gracefulShutdown("SIGINT");

});


process.on("SIGTERM", () => {

    gracefulShutdown("SIGTERM");

});