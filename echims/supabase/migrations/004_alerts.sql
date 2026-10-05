CREATE TABLE alert_rule (
    rule_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    rule_name VARCHAR(150) NOT NULL,
    description TEXT,

    rule_category VARCHAR(100) NOT NULL,
    condition_logic TEXT NOT NULL,

    severity VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_by UUID,

    CONSTRAINT fk_alert_rule_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT chk_alert_rule_status
        CHECK (
            status IN (
                'ACTIVE',
                'INACTIVE'
            )
        )
);


-- =========================================================
-- ALERT
-- =========================================================

CREATE TABLE alert (
    alert_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    alert_type VARCHAR(100) NOT NULL,
    alert_message TEXT NOT NULL,

    severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    status VARCHAR(20) NOT NULL DEFAULT 'UNREAD',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    resolved_at TIMESTAMPTZ,

    child_id BIGINT,
    rule_id BIGINT NOT NULL,
    inventory_id BIGINT,
    resolved_by UUID,

    CONSTRAINT fk_alert_child
        FOREIGN KEY (child_id)
        REFERENCES child(child_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_alert_rule
        FOREIGN KEY (rule_id)
        REFERENCES alert_rule(rule_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_alert_inventory
        FOREIGN KEY (inventory_id)
        REFERENCES inventory(inventory_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_alert_resolved_by
        FOREIGN KEY (resolved_by)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT chk_alert_severity
        CHECK (
            severity IN (
                'LOW',
                'MEDIUM',
                'HIGH',
                'CRITICAL'
            )
        ),

    CONSTRAINT chk_alert_status
        CHECK (
            status IN (
                'UNREAD',
                'READ',
                'RESOLVED'
            )
        )
);