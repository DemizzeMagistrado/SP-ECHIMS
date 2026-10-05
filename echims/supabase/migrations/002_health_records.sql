CREATE TABLE health_activity_schedule (
    schedule_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    activity_type VARCHAR(100) NOT NULL,
    schedule_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,

    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    remarks TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    barangay_id BIGINT NOT NULL,
    approved_by UUID,

    CONSTRAINT fk_schedule_created_by
        FOREIGN KEY (created_by)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_schedule_barangay
        FOREIGN KEY (barangay_id)
        REFERENCES barangay(barangay_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_schedule_approved_by
        FOREIGN KEY (approved_by)
        REFERENCES public_health_nurse(user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

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


-- =========================================================
-- CHILD PROFILE RECORD
-- =========================================================

CREATE TABLE child_profile_record (
    profile_record_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    profiling_date DATE NOT NULL DEFAULT CURRENT_DATE,
    remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    child_id BIGINT NOT NULL,
    schedule_id BIGINT,
    recorded_by UUID NOT NULL,

    CONSTRAINT fk_profile_child
        FOREIGN KEY (child_id)
        REFERENCES child(child_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_profile_schedule
        FOREIGN KEY (schedule_id)
        REFERENCES health_activity_schedule(schedule_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_profile_recorded_by
        FOREIGN KEY (recorded_by)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);


-- =========================================================
-- VACCINATION RECORD
-- =========================================================

CREATE TABLE vaccination_record (
    vaccination_record_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    vaccination_date DATE NOT NULL,
    dose_number INTEGER NOT NULL,
    batch_number VARCHAR(100),
    vaccination_site VARCHAR(150),
    remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    child_id BIGINT NOT NULL,
    vaccine_id BIGINT NOT NULL,
    recorded_by UUID NOT NULL,
    schedule_id BIGINT,

    CONSTRAINT fk_vaccination_child
        FOREIGN KEY (child_id)
        REFERENCES child(child_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_vaccination_vaccine
        FOREIGN KEY (vaccine_id)
        REFERENCES vaccine(vaccine_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_vaccination_recorded_by
        FOREIGN KEY (recorded_by)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_vaccination_schedule
        FOREIGN KEY (schedule_id)
        REFERENCES health_activity_schedule(schedule_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT chk_vaccination_dose
        CHECK (dose_number > 0)
);


-- =========================================================
-- NUTRITIONAL ASSESSMENT
-- =========================================================

CREATE TABLE nutritional_assessment (
    assessment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,

    weight NUMERIC NOT NULL,
    height NUMERIC NOT NULL,
    muac NUMERIC,

    weight_for_age VARCHAR(100),
    height_for_age VARCHAR(100),
    weight_for_height VARCHAR(100),

    nutritional_status VARCHAR(100) NOT NULL,
    remarks TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    child_id BIGINT NOT NULL,
    assessed_by UUID NOT NULL,

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
        CHECK (weight > 0),

    CONSTRAINT chk_nutrition_height
        CHECK (height > 0),

    CONSTRAINT chk_nutrition_muac
        CHECK (
            muac IS NULL
            OR muac > 0
        )
);


-- =========================================================
-- SUPPLEMENTATION RECORD
-- =========================================================

CREATE TABLE supplementation_record (
    supplementation_record_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    supplementation_date DATE NOT NULL,
    quantity_given NUMERIC NOT NULL,
    batch_number VARCHAR(100),
    remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    child_id BIGINT NOT NULL,
    recorded_by UUID NOT NULL,
    supplement_id BIGINT NOT NULL,
    schedule_id BIGINT,

    CONSTRAINT fk_supplementation_child
        FOREIGN KEY (child_id)
        REFERENCES child(child_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_supplementation_recorded_by
        FOREIGN KEY (recorded_by)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_supplementation_supplement
        FOREIGN KEY (supplement_id)
        REFERENCES supplement(supplement_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_supplementation_schedule
        FOREIGN KEY (schedule_id)
        REFERENCES health_activity_schedule(schedule_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT chk_supplementation_quantity
        CHECK (quantity_given > 0)
);