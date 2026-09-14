CREATE TABLE sync_log (
    sync_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    sync_type VARCHAR(50) NOT NULL,
    sync_status VARCHAR(50) NOT NULL,

    sync_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_completed_at TIMESTAMPTZ,

    records_uploaded INTEGER NOT NULL DEFAULT 0,
    records_downloaded INTEGER NOT NULL DEFAULT 0,

    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    user_id UUID NOT NULL,

    CONSTRAINT fk_sync_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_sync_uploaded
        CHECK (records_uploaded >= 0),

    CONSTRAINT chk_sync_downloaded
        CHECK (records_downloaded >= 0)
);