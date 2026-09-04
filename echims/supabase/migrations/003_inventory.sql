CREATE TABLE inventory (
    inventory_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    item_id BIGINT NOT NULL,
    rhu_id BIGINT NOT NULL,
    barangay_id BIGINT,

    quantity_on_hand DECIMAL(10,2) NOT NULL DEFAULT 0,
    reorder_level DECIMAL(10,2) NOT NULL DEFAULT 0,

    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_inventory_item
        FOREIGN KEY (item_id)
        REFERENCES item(item_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_inventory_rhu
        FOREIGN KEY (rhu_id)
        REFERENCES rhu(rhu_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_inventory_barangay
        FOREIGN KEY (barangay_id)
        REFERENCES barangay(barangay_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_inventory_quantity
        CHECK (quantity_on_hand >= 0),

    CONSTRAINT chk_inventory_reorder_level
        CHECK (reorder_level >= 0)
);


CREATE TABLE inventory_transaction (
    transaction_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    inventory_id BIGINT NOT NULL,

    transaction_type VARCHAR(30) NOT NULL,
    quantity DECIMAL(10,2) NOT NULL,

    transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    batch_number VARCHAR(100),
    expiration_date DATE,

    performed_by UUID NOT NULL,

    remarks TEXT,

    CONSTRAINT fk_transaction_inventory
        FOREIGN KEY (inventory_id)
        REFERENCES inventory(inventory_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_transaction_performed_by
        FOREIGN KEY (performed_by)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_transaction_type
        CHECK (
            transaction_type IN (
                'RECEIVED',
                'ISSUED',
                'ADJUSTMENT',
                'EXPIRED',
                'DAMAGED',
                'TRANSFER'
            )
        ),

    CONSTRAINT chk_transaction_quantity
        CHECK (quantity > 0)
);