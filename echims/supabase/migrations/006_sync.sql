CREATE TABLE sync_log (
    sync_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id UUID NOT NULL,

    device_identifier VARCHAR(150),

    sync_type VARCHAR(30) NOT NULL DEFAULT 'PUSH',

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    records_uploaded INTEGER NOT NULL DEFAULT 0,
    records_downloaded INTEGER NOT NULL DEFAULT 0,

    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',

    error_message TEXT,

    CONSTRAINT fk_sync_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_sync_type
        CHECK (
            sync_type IN (
                'PUSH',
                'PULL',
                'BIDIRECTIONAL'
            )
        ),

    CONSTRAINT chk_sync_status
        CHECK (
            status IN (
                'PENDING',
                'SUCCESS',
                'FAILED'
            )
        ),

    CONSTRAINT chk_sync_uploaded
        CHECK (records_uploaded >= 0),

    CONSTRAINT chk_sync_downloaded
        CHECK (records_downloaded >= 0)
);