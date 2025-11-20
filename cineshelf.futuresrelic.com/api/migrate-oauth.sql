-- CineShelf OAuth Migration
-- Adds authentication and session management

-- Add OAuth fields to users table
ALTER TABLE users ADD COLUMN oauth_provider TEXT;
ALTER TABLE users ADD COLUMN oauth_provider_id TEXT;
ALTER TABLE users ADD COLUMN profile_picture TEXT;
ALTER TABLE users ADD COLUMN updated_at DATETIME;

-- Set default timestamp for existing users
UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;

-- Create index on OAuth provider ID
CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    oauth_access_token TEXT,
    oauth_refresh_token TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);