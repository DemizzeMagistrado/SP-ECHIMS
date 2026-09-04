CREATE TABLE rhu (
    rhu_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rhu_name VARCHAR(150) NOT NULL,
    municipality VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    contact_number VARCHAR(20),
    email VARCHAR(150),
    account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    
    CONSTRAINT chk_rhu_account_status
        CHECK (account_status IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE barangay (
    barangay_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    barangay_name VARCHAR(150) NOT NULL,
    barangay_coordinates TEXT,
    municipality VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    rhu_id BIGINT NOT NULL,

    CONSTRAINT fk_barangay_rhu
        FOREIGN KEY (rhu_id)
        REFERENCES rhu(rhu_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE household (
    household_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    household_address TEXT NOT NULL,
    purok VARCHAR(100),
    is_4ps_member BOOLEAN NOT NULL DEFAULT FALSE,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    barangay_id BIGINT NOT NULL,

    CONSTRAINT fk_household_barangay
        FOREIGN KEY (barangay_id)
        REFERENCES barangay(barangay_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash TEXT,
    email VARCHAR(150) UNIQUE,
    contact_number VARCHAR(20),
    account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_user_account_status
        CHECK (account_status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'))
);

CREATE TABLE administrator (
    user_id UUID PRIMARY KEY,

    CONSTRAINT fk_administrator_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE health_worker (
    user_id UUID PRIMARY KEY,
    employee_id VARCHAR(50) UNIQUE,
    license_number VARCHAR(100),

    CONSTRAINT fk_health_worker_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE public_health_nurse (
    user_id UUID PRIMARY KEY,

    CONSTRAINT fk_phn_health_worker
        FOREIGN KEY (user_id)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE rural_health_midwife (
    user_id UUID PRIMARY KEY,

    CONSTRAINT fk_midwife_health_worker
        FOREIGN KEY (user_id)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE barangay_health_worker (
    user_id UUID PRIMARY KEY,

    CONSTRAINT fk_bhw_health_worker
        FOREIGN KEY (user_id)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE barangay_nutrition_scholar (
    user_id UUID PRIMARY KEY,

    CONSTRAINT fk_bns_health_worker
        FOREIGN KEY (user_id)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE health_worker_assignment (
    assignment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    assigned_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    user_id UUID NOT NULL,
    barangay_id BIGINT NOT NULL,

    CONSTRAINT fk_assignment_health_worker
        FOREIGN KEY (user_id)
        REFERENCES health_worker(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_assignment_barangay
        FOREIGN KEY (barangay_id)
        REFERENCES barangay(barangay_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_assignment_status
        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE guardian (
    guardian_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    contact_number VARCHAR(20),
    address TEXT,
    relationship_to_child VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE child (
    child_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    sex VARCHAR(20) NOT NULL,
    birth_place VARCHAR(200),
    address TEXT,
    registration_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    household_id BIGINT NOT NULL,
    barangay_id BIGINT NOT NULL,
    guardian_id BIGINT,

    CONSTRAINT fk_child_household
        FOREIGN KEY (household_id)
        REFERENCES household(household_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_child_barangay
        FOREIGN KEY (barangay_id)
        REFERENCES barangay(barangay_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_child_guardian
        FOREIGN KEY (guardian_id)
        REFERENCES guardian(guardian_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT chk_child_sex
        CHECK (sex IN ('MALE', 'FEMALE')),

    CONSTRAINT chk_child_status
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'MOVED', 'LOST', 'DECEASED'))
);


CREATE TABLE item (
    item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_name VARCHAR(150) NOT NULL,
    description TEXT,
    unit VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT chk_item_status
        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE vaccine (
    item_id BIGINT PRIMARY KEY,
    vaccine_type VARCHAR(100) NOT NULL,
    dosage_volume VARCHAR(50),
    route VARCHAR(100),
    target_age VARCHAR(100),

    CONSTRAINT fk_vaccine_item
        FOREIGN KEY (item_id)
        REFERENCES item(item_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE supplement (
    item_id BIGINT PRIMARY KEY,
    supplement_type VARCHAR(100) NOT NULL,
    dosage VARCHAR(100),
    age_group VARCHAR(100),

    CONSTRAINT fk_supplement_item
        FOREIGN KEY (item_id)
        REFERENCES item(item_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);