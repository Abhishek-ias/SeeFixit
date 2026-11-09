
-- =====================================================
-- SeeFixit: Refresh Token Session Management
-- Migration 007
-- =====================================================

CREATE TABLE auth_refresh_tokens (
    id UUID PRIMARY KEY,

    family_id UUID NOT NULL,

    user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    token_hash CHAR(64) NOT NULL UNIQUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    expires_at TIMESTAMPTZ NOT NULL,

    consumed_at TIMESTAMPTZ,

    revoked_at TIMESTAMPTZ,

    CONSTRAINT auth_refresh_tokens_expiry_check
        CHECK (expires_at > created_at)
);

-- Find refresh tokens belonging to a session family.
CREATE INDEX auth_refresh_tokens_family_id_idx
    ON auth_refresh_tokens(family_id);

-- Find sessions belonging to a user.
CREATE INDEX auth_refresh_tokens_user_id_idx
    ON auth_refresh_tokens(user_id);

-- Support expiration cleanup.
CREATE INDEX auth_refresh_tokens_expires_at_idx
    ON auth_refresh_tokens(expires_at);

-- Only one active refresh token per session family.
CREATE UNIQUE INDEX auth_refresh_tokens_one_active_per_family_idx
    ON auth_refresh_tokens(family_id)
    WHERE consumed_at IS NULL
      AND revoked_at IS NULL;
