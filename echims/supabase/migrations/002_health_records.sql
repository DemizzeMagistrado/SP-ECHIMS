CREATE TABLE health_activity_schedule (
    schedule_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    activity_name VARCHAR(150) NOT NULL,
    activity_type VARCHAR(100) NOT NULL,
    scheduled_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    location TEXT,
    description TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',

    barangay_id BIGINT NOT NULL,
    created_by UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_schedule_barangay
        FOREIGN KEY (barangay_id)
        REFERENCES barangay(barangay_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_schedule_created_by
        FOREIGN KEY (created_by)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_schedule_status
        CHECK (
            status IN (
                'SCHEDULED',
                'ONGOING',
                'COMPLETED',
                'CANCELLED'
            )
        )
);



CREATE TABLE child_profile_record (
    profile_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    child_id BIGINT NOT NULL,
    recorded_by UUID NOT NULL,

    record_date DATE NOT NULL DEFAULT CURRENT_DATE,

    weight_kg DECIMAL(5,2),
    height_cm DECIMAL(5,2),
    head_circumference_cm DECIMAL(5,2),

    remarks TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_profile_child
        FOREIGN KEY (child_id)
        REFERENCES child(child_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_profile_recorded_by
        FOREIGN KEY (recorded_by)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_profile_weight
        CHECK (weight_kg IS NULL OR weight_kg > 0),

    CONSTRAINT chk_profile_height
        CHECK (height_cm IS NULL OR height_cm > 0),

    CONSTRAINT chk_profile_head_circumference
        CHECK (
            head_circumference_cm IS NULL
            OR head_circumference_cm > 0
        )
);



CREATE TABLE vaccination_record (
    vaccination_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    child_id BIGINT NOT NULL,
    vaccine_item_id BIGINT NOT NULL,

    schedule_id BIGINT,

    vaccination_date DATE NOT NULL,
    dose_number INTEGER NOT NULL,

    administered_by UUID NOT NULL,

    batch_number VARCHAR(100),
    remarks TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_vaccination_child
        FOREIGN KEY (child_id)
        REFERENCES child(child_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_vaccination_vaccine
        FOREIGN KEY (vaccine_item_id)
        REFERENCES vaccine(item_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_vaccination_schedule
        FOREIGN KEY (schedule_id)
        REFERENCES health_activity_schedule(schedule_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_vaccination_administered_by
        FOREIGN KEY (administered_by)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_vaccination_dose
        CHECK (dose_number > 0),

    CONSTRAINT chk_vaccination_status
        CHECK (
            status IN (
                'COMPLETED',
                'MISSED',
                'CANCELLED'
            )
        )
);




CREATE TABLE nutritional_assessment (
    assessment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    child_id BIGINT NOT NULL,
    assessed_by UUID NOT NULL,

    assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,

    weight_kg DECIMAL(5,2) NOT NULL,
    height_cm DECIMAL(5,2) NOT NULL,

    weight_for_age VARCHAR(50),
    height_for_age VARCHAR(50),
    weight_for_height VARCHAR(50),

    nutritional_status VARCHAR(100) NOT NULL,

    remarks TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_nutrition_child
        FOREIGN KEY (child_id)
        REFERENCES child(child_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_nutrition_assessed_by
        FOREIGN KEY (assessed_by)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_nutrition_weight
        CHECK (weight_kg > 0),

    CONSTRAINT chk_nutrition_height
        CHECK (height_cm > 0)
);



CREATE TABLE supplementation_record (
    supplementation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    child_id BIGINT NOT NULL,
    supplement_item_id BIGINT NOT NULL,

    schedule_id BIGINT,

    supplementation_date DATE NOT NULL,
    quantity DECIMAL(10,2) NOT NULL,

    administered_by UUID NOT NULL,

    batch_number VARCHAR(100),
    remarks TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'GIVEN',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_supplementation_child
        FOREIGN KEY (child_id)
        REFERENCES child(child_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_supplementation_supplement
        FOREIGN KEY (supplement_item_id)
        REFERENCES supplement(item_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_supplementation_schedule
        FOREIGN KEY (schedule_id)
        REFERENCES health_activity_schedule(schedule_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_supplementation_administered_by
        FOREIGN KEY (administered_by)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_supplementation_quantity
        CHECK (quantity > 0),

    CONSTRAINT chk_supplementation_status
        CHECK (
            status IN (
                'GIVEN',
                'MISSED',
                'CANCELLED'
            )
        )
);




