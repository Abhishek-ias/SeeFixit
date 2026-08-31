const express = require("express");

const app = express();


const swaggerUi = require("swagger-ui-express");

const swaggerSpec = require("./config/swagger");


// ======================================================
// Middleware
// ======================================================

app.use(express.json());


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

const port = 5000;

app.listen(port, () => {

    console.log(`SeeFixit server running on port ${port}`);

});