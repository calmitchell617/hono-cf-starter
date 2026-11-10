ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version > 0);
ALTER TABLE tokens ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version > 0);
