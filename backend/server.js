require("dotenv").config();


const express = require("express");

const pool = require("./db/database");

const app = express();


const swaggerUi = require("swagger-ui-express");

const swaggerSpec = require("./config/swagger");


// ======================================================
// Middleware
// ======================================================

app.use(express.json());


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



const port = process.env.PORT || 5000;

const server = app.listen(port, () => {

    console.log(`SeeFixit server running on port ${port}`);

});


async function gracefulShutdown(signal) {

    console.log(`\n${signal} received. Shutting down gracefully...`);

    server.close(async () => {

        console.log("HTTP server closed.");

        try {

            await pool.end();

            console.log("Database pool closed.");

            process.exit(0);

        }

        catch (error) {

            console.error(
                "Error closing database pool:",
                error
            );

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