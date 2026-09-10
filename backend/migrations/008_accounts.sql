CREATE TABLE accounts (
    principal_id uuid PRIMARY KEY REFERENCES principals(id) ON DELETE CASCADE,
    username text NOT NULL UNIQUE CHECK (username = lower(username) AND username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
    email text UNIQUE CHECK (email = lower(email)),
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
