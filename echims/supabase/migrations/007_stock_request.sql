CREATE TABLE public.stock_request (
    stock_request_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    request_type VARCHAR(50) NOT NULL,
    request_date DATE NOT NULL DEFAULT CURRENT_DATE,
    requested_quantity NUMERIC NOT NULL CHECK (requested_quantity > 0),

    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED')),

    reason TEXT,
    remarks TEXT,

    approved_at TIMESTAMPTZ,

    requested_by UUID NOT NULL,
    approved_by UUID,
    item_id BIGINT NOT NULL,

    CONSTRAINT fk_stock_request_requested_by
        FOREIGN KEY (requested_by)
        REFERENCES public.health_worker(user_id),

    CONSTRAINT fk_stock_request_approved_by
        FOREIGN KEY (approved_by)
        REFERENCES public.public_health_nurse(user_id),

    CONSTRAINT fk_stock_request_item
        FOREIGN KEY (item_id)
        REFERENCES public.item(item_id)
);