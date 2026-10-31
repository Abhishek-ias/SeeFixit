require("dotenv").config();


const express = require("express");



const helmet = require("helmet");
const cors = require("cors");

const pool = require("./db/database");

const app = express();

app.disable("x-powered-by");


const swaggerUi = require("swagger-ui-express");

const swaggerSpec = require("./config/swagger");

const config = require("./config/config");

const logger = require("./utils/logger");

const requestLogger = require("./middleware/requestLogger");

// ======================================================
// Security Middleware
// ======================================================

const apiHelmet = helmet();

// Swagger UI needs a separate CSP configuration
// because its inline scripts may be blocked by the default CSP.
const docsHelmet = helmet({
    contentSecurityPolicy: false
});

app.use((req, res, next) => {
    const isSwaggerDocs =
        req.path === "/api-docs" ||
        req.path.startsWith("/api-docs/");

    const selectedHelmet = isSwaggerDocs
        ? docsHelmet
        : apiHelmet;

    selectedHelmet(req, res, next);
});

// ======================================================
// CORS Configuration
// ======================================================

app.use(cors({
    origin: (origin, callback) => {

        if (!origin || origin === config.server.frontendOrigin) {
            return callback(null, true);
        }

        return callback(null, false);
    },

    methods: [
        "GET",
        "HEAD",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS"
    ],

    allowedHeaders: [
        "Content-Type",
        "Authorization"
    ]
}));

// ======================================================
// Middleware
// ======================================================

app.use(express.json({
    limit: "10kb"
}));

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
// Readiness Check
// ======================================================

async function readinessHandler(req, res) {
    try {
        await pool.query("SELECT 1");

        return res.status(200).json({
            success: true,
            message: "SeeFixit is healthy",
            data: {
                status: "ok",
                database: "connected"
            }
        });
    } catch (error) {
        logger.error("Health check failed", {
            requestId: req.requestId,
            error: error.message
        });

        return res.status(503).json({
            success: false,
            message: "SeeFixit is unhealthy",
            error: "Database unavailable"
        });
    }
}

app.get("/api/health", readinessHandler);
app.get("/api/health/ready", readinessHandler);



// ======================================================
// Liveness Check
// ======================================================

app.get("/api/health/live", (req, res) => {
    return res.status(200).json({
        success: true,
        message: "SeeFixit process is alive",
        data: {
            status: "alive"
        }
    });
});


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

let server;
let isShuttingDown = false;
let forceShutdownStarted = false;

async function gracefulShutdown(signal) {
    if (isShuttingDown) {
        if (!forceShutdownStarted) {
            forceShutdownStarted = true;

            logger.warn("Force-closing active HTTP connections", {
                signal
            });

            server.closeAllConnections();
        }

        return;
    }

    isShuttingDown = true;

    logger.info("Graceful shutdown started", {
        signal
    });

    server.close(async () => {
        logger.info("HTTP server closed");

        try {
            await pool.end();

            logger.info("Database pool closed");

            process.exit(0);
        } catch (error) {
            logger.error("Error closing database pool", {
                error: error.message
            });

            process.exit(1);
        }
    });
}

if (require.main === module) {
    server = app.listen(port, () => {
        logger.info("SeeFixit server started", {
            port
        });
    });

    process.on("SIGINT", () => {
        gracefulShutdown("SIGINT");
    });

    process.on("SIGTERM", () => {
        gracefulShutdown("SIGTERM");
    });
}

module.exports = app;
