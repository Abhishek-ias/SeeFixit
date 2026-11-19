const fs = require("fs");
const path = require("path");
const pool = require("./database");
const logger = require("../utils/logger");

/**
 * Automatically applies pending SQL migrations on application startup.
 * Runs idempotently using the schema_migrations table.
 */
async function runAutoMigrations() {
    let client;
    try {
        client = await pool.connect();
    } catch (connErr) {
        logger.error("[Auto-Migrate] Could not connect to database for migrations", {
            error: connErr.message
        });
        return;
    }

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) UNIQUE NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const migrationsDir = path.join(__dirname, "migrations");
        if (!fs.existsSync(migrationsDir)) {
            logger.warn("[Auto-Migrate] Migrations directory not found", { migrationsDir });
            return;
        }

        const files = fs
            .readdirSync(migrationsDir)
            .filter((file) => file.endsWith(".sql"))
            .sort();

        const result = await client.query("SELECT filename FROM schema_migrations;");
        const appliedMigrations = new Set(result.rows.map((row) => row.filename));

        let appliedCount = 0;
        for (const file of files) {
            if (appliedMigrations.has(file)) {
                continue;
            }

            logger.info(`[Auto-Migrate] Applying pending migration: ${file}...`);
            const filePath = path.join(migrationsDir, file);
            const sql = fs.readFileSync(filePath, "utf8");

            try {
                await client.query("BEGIN");
                await client.query(sql);
                await client.query(
                    "INSERT INTO schema_migrations (filename) VALUES ($1);",
                    [file]
                );
                await client.query("COMMIT");
                logger.info(`[Auto-Migrate] Successfully applied: ${file}`);
                appliedCount++;
            } catch (migErr) {
                await client.query("ROLLBACK");
                logger.error(`[Auto-Migrate] Failed to apply ${file}: ${migErr.message}`);
                // Continue with next migration if independent
            }
        }

        if (appliedCount > 0) {
            logger.info(`[Auto-Migrate] Applied ${appliedCount} new migrations successfully.`);
        } else {
            logger.info("[Auto-Migrate] Database schema is up to date.");
        }
    } catch (err) {
        logger.error("[Auto-Migrate] Migration check error", { error: err.message });
    } finally {
        if (client) {
            client.release();
        }
    }
}

module.exports = { runAutoMigrations };
