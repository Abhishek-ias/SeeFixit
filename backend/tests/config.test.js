const { test, after } = require("node:test");
const assert = require("node:assert/strict");

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const configPath = path.resolve(
    __dirname,
    "../config/config.js"
);

// Use an isolated directory so the project's .env
// cannot interfere with individual configuration tests.
const isolatedDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "seefixit-config-")
);

after(() => {
    fs.rmSync(isolatedDirectory, {
        recursive: true,
        force: true
    });
});

// Run config.js in a separate Node.js process.
function runConfig(overrides = {}, removeVariables = []) {

    const env = {
        ...process.env,

        DB_USER: "test-user",
        DB_HOST: "localhost",
        DB_NAME: "seefixit_test",
        DB_PASSWORD: "test-password",
        DB_PORT: "5432",

        JWT_SECRET: "test-secret-with-at-least-32-characters",
        PORT: "5000",

        ...overrides
    };

    // Remove selected environment variables.
    for (const variable of removeVariables) {
        delete env[variable];
    }

    const script = `
        const config = require(${JSON.stringify(configPath)});

        console.log(JSON.stringify({
    environment: config.server.environment,
    production: config.server.isProduction,
    port: config.server.port,
    frontendOrigin: config.server.frontendOrigin,
    jwtConfigured: Boolean(config.auth.jwtSecret),

    dbConnection: config.db.connectionString
        ? "neon"
        : "local",

    dbApplicationHost: config.db.connectionString
        ? new URL(config.db.connectionString).hostname
        : config.db.host,

    dbMigrationHost: config.dbMigration.connectionString
        ? new URL(config.dbMigration.connectionString).hostname
        : config.dbMigration.host,

    dbApplicationSslMode: config.db.connectionString
        ? new URL(config.db.connectionString).searchParams.get("sslmode")
        : null,

    dbMigrationSslMode: config.dbMigration.connectionString
        ? new URL(config.dbMigration.connectionString).searchParams.get("sslmode")
        : null,

    dbSsl: config.db.ssl === false
        ? false
        : config.db.ssl?.rejectUnauthorized ?? null
}));
    `;

    return spawnSync(
        process.execPath,
        ["-e", script],
        {
            cwd: isolatedDirectory,
            env,
            encoding: "utf8"
        }
    );
}

// Parse the configuration returned by the child process.
function parseConfigOutput(result) {
    const lines = result.stdout
        .trim()
        .split(/\r?\n/);

    return JSON.parse(lines.at(-1));
}


// ======================================================
// 1. Development Defaults
// ======================================================

test("development configuration uses local defaults", () => {

    const result = runConfig(
        {},
        ["NODE_ENV", "FRONTEND_ORIGIN", "DB_SSL"]
    );

    assert.equal(result.status, 0, result.stderr);

    const config = parseConfigOutput(result);

    assert.equal(config.environment, "development");
    assert.equal(config.production, false);
    assert.equal(config.port, 5000);

    assert.equal(
        config.frontendOrigin,
        "http://localhost:5173"
    );

    assert.equal(config.jwtConfigured, true);
    assert.equal(config.dbSsl, false);
});


// ======================================================
// 2. Reject Unsupported Environment
// ======================================================

test("configuration rejects unsupported NODE_ENV", () => {

    const result = runConfig({
        NODE_ENV: "staging"
    });

    assert.notEqual(result.status, 0);

    assert.match(
        result.stderr,
        /Invalid NODE_ENV/
    );
});


// ======================================================
// 3. Production Requires Frontend Origin
// ======================================================

test("production requires FRONTEND_ORIGIN", () => {

    const result = runConfig(
        {
            NODE_ENV: "production"
        },
        ["FRONTEND_ORIGIN"]
    );

    assert.notEqual(result.status, 0);

    assert.match(
        result.stderr,
        /Missing required environment variable: FRONTEND_ORIGIN/
    );
});


// ======================================================
// 4. Production Requires HTTPS
// ======================================================

test("production rejects HTTP frontend origins", () => {

    const result = runConfig({
        NODE_ENV: "production",
        FRONTEND_ORIGIN: "http://localhost:5173"
    });

    assert.notEqual(result.status, 0);

    assert.match(
        result.stderr,
        /production requires an HTTPS origin/
    );
});


// ======================================================
// 5. Production Requires Strong JWT Secret
// ======================================================

test("production rejects JWT secrets shorter than 32 characters", () => {

    const result = runConfig({
        NODE_ENV: "production",
        FRONTEND_ORIGIN: "https://seefixit.example.com",
        JWT_SECRET: "short-secret"
    });

    assert.notEqual(result.status, 0);

    assert.match(
        result.stderr,
        /JWT_SECRET must be at least 32 characters/
    );
});


// ======================================================
// 6. Missing JWT Secret Is Rejected
// ======================================================

test("configuration rejects a missing JWT secret", () => {

    const result = runConfig(
        {},
        ["JWT_SECRET"]
    );

    assert.notEqual(result.status, 0);

    assert.match(
        result.stderr,
        /Missing required environment variable: JWT_SECRET/
    );
});


// ======================================================
// 7. Valid Production Configuration
// ======================================================

test("production configuration accepts valid settings", () => {

    const result = runConfig(
        {
            NODE_ENV: "production",
            FRONTEND_ORIGIN: "https://seefixit.example.com",
            JWT_SECRET: "production-secret-with-more-than-32-characters"
        },
        ["DB_SSL"]
    );

    assert.equal(result.status, 0, result.stderr);

    const config = parseConfigOutput(result);

    assert.equal(config.environment, "production");
    assert.equal(config.production, true);

    assert.equal(
        config.frontendOrigin,
        "https://seefixit.example.com"
    );

    assert.equal(config.jwtConfigured, true);
    assert.equal(config.dbSsl, true);
});


// ======================================================
// 8. Development Can Enable SSL Explicitly
// ======================================================

test("development can explicitly enable database SSL", () => {

    const result = runConfig({
        NODE_ENV: "development",
        DB_SSL: "true"
    });

    assert.equal(result.status, 0, result.stderr);

    const config = parseConfigOutput(result);

    assert.equal(config.dbSsl, true);
});


// ======================================================
// 9. Invalid DB_SSL Values Are Rejected
// ======================================================

test("configuration rejects invalid DB_SSL values", () => {

    const result = runConfig({
        DB_SSL: "yes"
    });

    assert.notEqual(result.status, 0);

    assert.match(
        result.stderr,
        /Invalid DB_SSL/
    );
});


// ======================================================
// 10. Production Enables SSL By Default
// ======================================================

test("production enables database SSL by default", () => {

    const result = runConfig(
        {
            NODE_ENV: "production",
            FRONTEND_ORIGIN: "https://seefixit.example.com",
            JWT_SECRET: "production-secret-with-more-than-32-characters"
        },
        ["DB_SSL"]
    );

    assert.equal(result.status, 0, result.stderr);

    const config = parseConfigOutput(result);

    assert.equal(config.dbSsl, true);
});


// ======================================================
// 11. Production Cannot Disable SSL
// ======================================================

test("production rejects disabled database SSL", () => {

    const result = runConfig({
    NODE_ENV: "production",
    FRONTEND_ORIGIN: "https://seefixit.example.com",
    JWT_SECRET: "production-secret-with-more-than-32-characters",
    DB_SSL: "false"
});

    assert.notEqual(result.status, 0);

    assert.match(
        result.stderr,
        /DB_SSL must be true in production/
    );
});




const testPooledUrl =
    "postgresql://test-user:test-password@ep-example-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full";

const testDirectUrl =
    "postgresql://test-user:test-password@ep-example.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full";

test("Neon mode selects pooled and direct connections correctly", () => {
    const result = runConfig(
        {
            DB_CONNECTION: "neon",
            DATABASE_URL: testPooledUrl,
            DIRECT_DATABASE_URL: testDirectUrl
        },
        [
            "DB_USER",
            "DB_HOST",
            "DB_NAME",
            "DB_PASSWORD",
            "DB_PORT"
        ]
    );

    assert.equal(result.status, 0, result.stderr);

    const config = parseConfigOutput(result);

    assert.equal(config.dbConnection, "neon");
    assert.match(config.dbApplicationHost, /-pooler/);
    assert.doesNotMatch(config.dbMigrationHost, /-pooler/);

    assert.equal(config.dbApplicationSslMode, "verify-full");
    assert.equal(config.dbMigrationSslMode, "verify-full");
});

test("Neon configuration rejects a missing DATABASE_URL", () => {
    const result = runConfig(
        {
            DB_CONNECTION: "neon",
            DIRECT_DATABASE_URL: testDirectUrl
        },
        [
            "DATABASE_URL",
            "DB_USER",
            "DB_HOST",
            "DB_NAME",
            "DB_PASSWORD",
            "DB_PORT"
        ]
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /DATABASE_URL/);
});

test("Neon configuration rejects a missing DIRECT_DATABASE_URL", () => {
    const result = runConfig(
        {
            DB_CONNECTION: "neon",
            DATABASE_URL: testPooledUrl
        },
        [
            "DIRECT_DATABASE_URL",
            "DB_USER",
            "DB_HOST",
            "DB_NAME",
            "DB_PASSWORD",
            "DB_PORT"
        ]
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /DIRECT_DATABASE_URL/);
});

test("Neon configuration rejects non-PostgreSQL URLs", () => {
    const result = runConfig({
        DB_CONNECTION: "neon",
        DATABASE_URL: "https://example.com/database",
        DIRECT_DATABASE_URL: testDirectUrl
    });

    assert.notEqual(result.status, 0);

    assert.match(
        result.stderr,
        /must use PostgreSQL protocol/
    );
});

test("Neon configuration rejects SSL modes weaker than verify-full", () => {
    const result = runConfig({
        DB_CONNECTION: "neon",
        DATABASE_URL:
            "postgresql://test:test@ep-pooler.example.com/neondb?sslmode=require",
        DIRECT_DATABASE_URL: testDirectUrl
    });

    assert.notEqual(result.status, 0);

    assert.match(
        result.stderr,
        /DATABASE_URL must use sslmode=verify-full/
    );
});

test("configuration rejects unsupported database connection modes", () => {
    const result = runConfig({
        DB_CONNECTION: "mysql"
    });

    assert.notEqual(result.status, 0);

    assert.match(
        result.stderr,
        /Invalid DB_CONNECTION/
    );
});
