CREATE TABLE inventory (
    inventory_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    quantity_on_hand NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    item_id BIGINT NOT NULL,
    barangay_id BIGINT NOT NULL,

    CONSTRAINT fk_inventory_item
        FOREIGN KEY (item_id)
        REFERENCES item(item_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_inventory_barangay
        FOREIGN KEY (barangay_id)
        REFERENCES barangay(barangay_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_inventory_quantity
        CHECK (quantity_on_hand >= 0)
);


-- =========================================================
-- STOCK REQUEST
-- =========================================================

CREATE TABLE stock_request (
    stock_request_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    restock_type VARCHAR(100) NOT NULL,
    request_date DATE NOT NULL DEFAULT CURRENT_DATE,
    requested_quantity NUMERIC NOT NULL,

    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',

    remarks TEXT,
    approved_at TIMESTAMPTZ,

    requested_by UUID NOT NULL,
    approved_by UUID,

    item_id BIGINT NOT NULL,

    CONSTRAINT fk_stock_request_requested_by
        FOREIGN KEY (requested_by)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_stock_request_approved_by
        FOREIGN KEY (approved_by)
        REFERENCES public_health_nurse(user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_stock_request_item
        FOREIGN KEY (item_id)
        REFERENCES item(item_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_stock_request_quantity
        CHECK (requested_quantity > 0)
);


-- =========================================================
-- INVENTORY TRANSACTION
-- =========================================================

CREATE TABLE inventory_transaction (
    transaction_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    transaction_type VARCHAR(50) NOT NULL,
    quantity NUMERIC NOT NULL,

    transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    reference_number VARCHAR(100),
    remarks TEXT,

    inventory_id BIGINT NOT NULL,
    performed_by UUID NOT NULL,

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

    CONSTRAINT chk_transaction_quantity
        CHECK (quantity > 0)
);