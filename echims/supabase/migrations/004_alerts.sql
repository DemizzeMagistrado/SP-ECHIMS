CREATE TABLE alert_rule (
    rule_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    rule_name VARCHAR(150) NOT NULL,
    rule_type VARCHAR(100) NOT NULL,
    description TEXT,

    threshold_value DECIMAL(10,2),

    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_alert_rule_status
        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);


CREATE TABLE alert (
    alert_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    rule_id BIGINT NOT NULL,
    child_id BIGINT,
    inventory_id BIGINT,

    alert_type VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,

    severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    status VARCHAR(20) NOT NULL DEFAULT 'UNREAD',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,

    CONSTRAINT fk_alert_rule
        FOREIGN KEY (rule_id)
        REFERENCES alert_rule(rule_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_alert_child
        FOREIGN KEY (child_id)
        REFERENCES child(child_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_alert_inventory
        FOREIGN KEY (inventory_id)
        REFERENCES inventory(inventory_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

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