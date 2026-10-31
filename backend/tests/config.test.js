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
            jwtConfigured: Boolean(config.auth.jwtSecret)
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


function parseConfigOutput(result) {
    const lines = result.stdout
        .trim()
        .split(/\r?\n/);

    return JSON.parse(lines.at(-1));
}

// 1. Development defaults

test("development configuration uses local defaults", () => {

    const result = runConfig(
        {},
        ["NODE_ENV", "FRONTEND_ORIGIN"]
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
});


// 2. Reject unsupported environment

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


// 3. Production requires frontend origin

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


// 4. Production requires HTTPS

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


// 5. Production requires a strong JWT secret

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


// 6. Missing JWT secret is rejected

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


// 7. Valid production configuration

test("production configuration accepts valid settings", () => {

    const result = runConfig({
        NODE_ENV: "production",
        FRONTEND_ORIGIN: "https://seefixit.example.com",
        JWT_SECRET: "production-secret-with-more-than-32-characters"
    });

    assert.equal(result.status, 0, result.stderr);

    const config = parseConfigOutput(result);

    assert.equal(config.environment, "production");
    assert.equal(config.production, true);
    assert.equal(
        config.frontendOrigin,
        "https://seefixit.example.com"
    );
    assert.equal(config.jwtConfigured, true);
});