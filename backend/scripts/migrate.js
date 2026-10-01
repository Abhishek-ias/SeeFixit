const fs = require("fs");
const path = require("path");

const pool = require("../db/database");

async function runMigrations() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) UNIQUE NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const migrationsDir = path.join(__dirname, "../db/migrations");

        const files = fs
            .readdirSync(migrationsDir)
            .filter(file => file.endsWith(".sql"))
            .sort();

        const result = await client.query(`
            SELECT filename
            FROM schema_migrations
        `);

        const appliedMigrations = new Set(
            result.rows.map(row => row.filename)
        );

        for (const file of files) {

            if (appliedMigrations.has(file)) {
                console.log(`Skipping ${file}`);
                continue;
            }

            console.log(`Running ${file}...`);

            const filePath = path.join(migrationsDir, file);
            const sql = fs.readFileSync(filePath, "utf8");

            await client.query(sql);

            await client.query(
                `
                INSERT INTO schema_migrations (filename)
                VALUES ($1)
                `,
                [file]
            );

            console.log(`Completed ${file}`);
        }

        await client.query("COMMIT");

        console.log("All migrations completed successfully.");
    }
    catch (error) {
        await client.query("ROLLBACK");

        console.error("Migration failed:", error.message);

        process.exitCode = 1;
    }
    finally {
        client.release();
        await pool.end();
    }
}

runMigrations();