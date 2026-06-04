-- Sequence for generating sequential IDs starting at 1
CREATE SEQUENCE IF NOT EXISTS users_id_seq START WITH 1;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY DEFAULT nextval('users_id_seq'),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    account_number VARCHAR(10) UNIQUE NOT NULL,
    balance NUMERIC(12, 2) DEFAULT 1000.00 CHECK (balance >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Explicit unique index on account_number as requested
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_number ON users(account_number);

-- Recipients table (Saved contacts for transfer destination)
CREATE TABLE IF NOT EXISTS recipients (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_number VARCHAR(10) NOT NULL,
    alias VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, account_number)
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    source_account VARCHAR(10) REFERENCES users(account_number) ON DELETE SET NULL,
    destination_account VARCHAR(10) REFERENCES users(account_number) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    concept VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Event logs for security and system audit
CREATE TABLE IF NOT EXISTS event_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, -- 'login_success', 'login_failed', 'transfer_approved', 'transfer_rejected', 'account_created', 'add_contact'
    status VARCHAR(20) NOT NULL, -- 'success', 'failed', 'pending'
    detail JSONB NOT NULL
);
