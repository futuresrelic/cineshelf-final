-- CineShelf v2.0 Database Schema
-- SQLite database with proper relational structure
-- Inspired by ChoreQuest's clean architecture

-- ============================================
-- GLOBAL MOVIES DATABASE
-- One entry per film, shared across all users
-- ============================================

CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdb_id TEXT UNIQUE NOT NULL,
    imdb_id TEXT,
    title TEXT NOT NULL,
    display_title TEXT,
    year INTEGER,
    poster_url TEXT,
    backdrop_url TEXT,
    overview TEXT,
    rating REAL,
    runtime INTEGER,
    director TEXT,
    genre TEXT,
    certification TEXT,
    actors TEXT,
    studio TEXT,
    media_type TEXT DEFAULT 'movie',
    number_of_seasons INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_movies_tmdb ON movies(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title);

-- ============================================
-- USERS
-- User accounts with settings
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    is_admin INTEGER DEFAULT 0,
    settings_json TEXT,
    oauth_provider TEXT DEFAULT 'legacy',
    oauth_provider_id TEXT,
    profile_picture TEXT,
    display_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider_id);

-- ============================================
-- OAUTH SESSIONS
-- Session-based authentication with OAuth tokens
-- ============================================

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

-- ============================================
-- PHYSICAL COPIES
-- User's actual DVD/Blu-ray/etc collection
-- Links users to movies with format details
-- ============================================

CREATE TABLE IF NOT EXISTS copies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    movie_id INTEGER NOT NULL,
    edition_id INTEGER,
    format TEXT NOT NULL,
    edition TEXT,
    region TEXT,
    condition TEXT DEFAULT 'Good',
    location TEXT,
    purchase_date DATE,
    purchase_price REAL,
    notes TEXT,
    barcode TEXT,
    seasons_owned TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    FOREIGN KEY (edition_id) REFERENCES media_editions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_copies_user ON copies(user_id);
CREATE INDEX IF NOT EXISTS idx_copies_movie ON copies(movie_id);
CREATE INDEX IF NOT EXISTS idx_copies_barcode ON copies(barcode);

-- ============================================
-- WISHLIST
-- Movies user wants to acquire
-- ============================================

CREATE TABLE IF NOT EXISTS wishlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    movie_id INTEGER NOT NULL,
    priority INTEGER DEFAULT 0,
    target_format TEXT,
    target_edition TEXT,
    max_price REAL,
    notes TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    UNIQUE(user_id, movie_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_movie ON wishlist(movie_id);

-- ============================================
-- CUSTOM EDITIONS
-- User-defined edition types
-- ============================================

CREATE TABLE IF NOT EXISTS custom_editions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_custom_editions_user ON custom_editions(user_id);

-- ============================================
-- AUDIT LOG
-- Track all important actions
-- ============================================

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    details_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

-- ============================================
-- SETTINGS
-- Global app settings
-- ============================================

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SEED DATA
-- Create default user
-- ============================================

INSERT OR IGNORE INTO users (username, is_admin, settings_json) 
VALUES ('default', 1, '{"defaultView":"grid","gridColumns":5}');

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('app_version', '2.0.0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('initialized_at', datetime('now'));

-- ============================================
-- GROUPS AND FAMILY SHARING
-- User groups for sharing collections
-- ============================================

CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_groups_creator ON groups(created_by);

CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

CREATE TABLE IF NOT EXISTS group_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    invited_email TEXT,
    invite_token TEXT UNIQUE NOT NULL,
    invited_by INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    accepted_at DATETIME,
    accepted_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (accepted_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_group_invites_token ON group_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_group_invites_group ON group_invites(group_id);

-- ============================================
-- BORROWING SYSTEM
-- Track lending and borrowing of physical copies
-- ============================================

CREATE TABLE IF NOT EXISTS borrows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    copy_id INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    borrower_id INTEGER NOT NULL,
    borrowed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    due_date DATE,
    returned_at DATETIME,
    notes TEXT,
    FOREIGN KEY (copy_id) REFERENCES copies(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (borrower_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_borrows_copy ON borrows(copy_id);
CREATE INDEX IF NOT EXISTS idx_borrows_owner ON borrows(owner_id);
CREATE INDEX IF NOT EXISTS idx_borrows_borrower ON borrows(borrower_id);

-- ============================================
-- SHELF LAYOUT SYSTEM
-- Physical organization of movie collection
-- ============================================

CREATE TABLE IF NOT EXISTS shelves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    capacity INTEGER,
    description TEXT,
    theme TEXT,
    color TEXT DEFAULT '#667eea',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shelves_user ON shelves(user_id);
CREATE INDEX IF NOT EXISTS idx_shelves_position ON shelves(user_id, position);

CREATE TABLE IF NOT EXISTS shelf_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shelf_id INTEGER NOT NULL,
    copy_id INTEGER NOT NULL,
    position_in_shelf INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE,
    FOREIGN KEY (copy_id) REFERENCES copies(id) ON DELETE CASCADE,
    UNIQUE(copy_id)
);

CREATE INDEX IF NOT EXISTS idx_shelf_assignments_shelf ON shelf_assignments(shelf_id);
CREATE INDEX IF NOT EXISTS idx_shelf_assignments_copy ON shelf_assignments(copy_id);
CREATE INDEX IF NOT EXISTS idx_shelf_assignments_position ON shelf_assignments(shelf_id, position_in_shelf);

-- ============================================
-- TRIVIA SYSTEM TABLES
-- Movie trivia game with history and stats
-- ============================================

-- Trivia Game Sessions
CREATE TABLE IF NOT EXISTS trivia_games (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    mode TEXT NOT NULL, -- sprint, endless, survival
    scope TEXT NOT NULL, -- collection, wishlist, all, mix
    questions_count INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    incorrect_count INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0, -- seconds
    completed INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    lives_remaining INTEGER DEFAULT 0, -- for survival mode
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trivia_games_user ON trivia_games(user_id);
CREATE INDEX IF NOT EXISTS idx_trivia_games_mode ON trivia_games(mode);
CREATE INDEX IF NOT EXISTS idx_trivia_games_score ON trivia_games(score DESC);

-- Trivia Questions History
CREATE TABLE IF NOT EXISTS trivia_questions (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    round_number INTEGER NOT NULL,
    question TEXT NOT NULL,
    type TEXT NOT NULL, -- multiple_choice, true_false
    difficulty TEXT NOT NULL, -- easy, medium, hard
    template_id TEXT NOT NULL,
    choices_json TEXT NOT NULL, -- JSON array of choices
    correct_answer TEXT NOT NULL,
    user_answer TEXT,
    is_correct INTEGER DEFAULT 0,
    time_taken REAL DEFAULT 0, -- seconds
    points_earned INTEGER DEFAULT 0,
    streak_at_time INTEGER DEFAULT 0,
    question_hash TEXT NOT NULL, -- for deduplication
    metadata_json TEXT, -- additional question metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES trivia_games(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trivia_questions_game ON trivia_questions(game_id);
CREATE INDEX IF NOT EXISTS idx_trivia_questions_user ON trivia_questions(user_id);
CREATE INDEX IF NOT EXISTS idx_trivia_questions_hash ON trivia_questions(question_hash);
CREATE INDEX IF NOT EXISTS idx_trivia_questions_difficulty ON trivia_questions(difficulty);

-- Trivia User Statistics
CREATE TABLE IF NOT EXISTS trivia_stats (
    user_id INTEGER PRIMARY KEY,
    total_games INTEGER DEFAULT 0,
    total_questions INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    incorrect_answers INTEGER DEFAULT 0,
    best_score INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    total_time_played INTEGER DEFAULT 0, -- seconds

    -- Stats by game mode
    sprint_games INTEGER DEFAULT 0,
    sprint_best_score INTEGER DEFAULT 0,
    sprint_wins INTEGER DEFAULT 0,

    endless_games INTEGER DEFAULT 0,
    endless_best_score INTEGER DEFAULT 0,
    endless_best_round INTEGER DEFAULT 0,

    survival_games INTEGER DEFAULT 0,
    survival_best_score INTEGER DEFAULT 0,
    survival_best_round INTEGER DEFAULT 0,

    -- Stats by difficulty
    easy_correct INTEGER DEFAULT 0,
    easy_incorrect INTEGER DEFAULT 0,
    medium_correct INTEGER DEFAULT 0,
    medium_incorrect INTEGER DEFAULT 0,
    hard_correct INTEGER DEFAULT 0,
    hard_incorrect INTEGER DEFAULT 0,

    last_played_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trivia_stats_best_score ON trivia_stats(best_score DESC);

-- ============================================
-- UMDB: MEDIA EDITIONS
-- Specific physical releases of a movie
-- Shared across all users (universal reference data)
-- ============================================

CREATE TABLE IF NOT EXISTS media_editions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id INTEGER NOT NULL,
    umdb_release_id TEXT,
    name TEXT NOT NULL,
    format TEXT,
    package_type TEXT,
    region TEXT,
    barcode TEXT,
    release_date TEXT,
    distributor TEXT,
    country TEXT,
    disc_count INTEGER DEFAULT 1,
    notes TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_media_editions_movie ON media_editions(movie_id);
CREATE INDEX IF NOT EXISTS idx_media_editions_barcode ON media_editions(barcode);
CREATE INDEX IF NOT EXISTS idx_media_editions_umdb_release ON media_editions(umdb_release_id);

-- ============================================
-- UMDB: EDITION COMPONENTS
-- What comes in the box (universal truth)
-- ============================================

CREATE TABLE IF NOT EXISTS edition_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edition_id INTEGER NOT NULL,
    component_type TEXT NOT NULL,
    component_name TEXT NOT NULL,
    description TEXT,
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (edition_id) REFERENCES media_editions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_edition_components_edition ON edition_components(edition_id);

-- ============================================
-- CINESHELF: COPY COMPONENTS (User-Specific)
-- Tracks what the user actually HAS and its condition
-- ============================================

CREATE TABLE IF NOT EXISTS copy_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    copy_id INTEGER NOT NULL,
    edition_component_id INTEGER NOT NULL,
    is_present INTEGER DEFAULT 1,
    condition TEXT DEFAULT 'Good',
    notes TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (copy_id) REFERENCES copies(id) ON DELETE CASCADE,
    FOREIGN KEY (edition_component_id) REFERENCES edition_components(id) ON DELETE CASCADE,
    UNIQUE(copy_id, edition_component_id)
);

CREATE INDEX IF NOT EXISTS idx_copy_components_copy ON copy_components(copy_id);
CREATE INDEX IF NOT EXISTS idx_copy_components_edition_component ON copy_components(edition_component_id);
