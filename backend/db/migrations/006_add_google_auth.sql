
-- =====================================================
-- SeeFixit: Google Authentication Support
-- Migration 006
-- =====================================================

-- Allow Google-only users to have no local password.
ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL;

-- Store Google's unique account identifier.
ALTER TABLE users
    ADD COLUMN google_sub VARCHAR(255);

-- Prevent the same Google account from linking to
-- multiple SeeFixit users.
CREATE UNIQUE INDEX users_google_sub_unique_idx
    ON users (google_sub)
    WHERE google_sub IS NOT NULL;

-- Every user must have at least one authentication method.
ALTER TABLE users
    ADD CONSTRAINT users_auth_method_check
    CHECK (
        password_hash IS NOT NULL
        OR google_sub IS NOT NULL
    );
