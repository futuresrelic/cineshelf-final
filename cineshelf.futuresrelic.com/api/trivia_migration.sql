-- ============================================
-- TRIVIA SYSTEM TABLES MIGRATION
-- Run this SQL to add trivia tables to existing database
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
