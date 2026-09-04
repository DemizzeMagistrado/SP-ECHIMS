CREATE TABLE child_movement (
    movement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    movement_type VARCHAR(50) NOT NULL,
    movement_date DATE NOT NULL,
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    previous_address TEXT,
    new_address TEXT,
    previous_latitude DECIMAL(10, 7),
    previous_longitude DECIMAL(10, 7),
    new_latitude DECIMAL(10, 7),
    new_longitude DECIMAL(10, 7),
    remarks TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    child_id BIGINT NOT NULL,
    from_household_id BIGINT,
    to_household_id BIGINT,

    CONSTRAINT fk_movement_child
        FOREIGN KEY (child_id)
        REFERENCES child(child_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_movement_from_household
        FOREIGN KEY (from_household_id)
        REFERENCES household(household_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_movement_to_household
        FOREIGN KEY (to_household_id)
        REFERENCES household(household_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_movement_type
        CHECK (
            movement_type IN (
                'MIGRATED',
                'LOST',
                'RETURNED',
                'TRANSFERRED'
            )
        )
);


CREATE TABLE sms_notification (
    notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    notification_type VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'SMS',
    sent_at TIMESTAMPTZ,
    delivery_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    alert_id BIGINT,
    child_id BIGINT NOT NULL,
    guardian_id BIGINT NOT NULL,

    CONSTRAINT fk_sms_alert
        FOREIGN KEY (alert_id)
        REFERENCES alert(alert_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_sms_child
        FOREIGN KEY (child_id)
        REFERENCES child(child_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_sms_guardian
        FOREIGN KEY (guardian_id)
        REFERENCES guardian(guardian_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_sms_channel
        CHECK (channel = 'SMS'),

    CONSTRAINT chk_sms_delivery_status
        CHECK (
            delivery_status IN (
                'PENDING',
                'SENT',
                'DELIVERED',
                'FAILED'
            )
        )
);