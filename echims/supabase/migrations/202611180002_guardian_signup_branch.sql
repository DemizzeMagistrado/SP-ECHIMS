-- Preserves the supplied staff registration function; adds an early guardian branch.
BEGIN;
CREATE OR REPLACE FUNCTION public.handle_new_echims_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_role TEXT;
    v_rhu_id BIGINT;
    v_barangay_id BIGINT;
    v_barangay_text TEXT;

BEGIN

    -- Guardian phone registrations do not create worker accounts or assignments.
    -- This marker grants no record access: portal RPCs independently verify identity.
    IF NEW.raw_user_meta_data->>'account_type' = 'guardian'
       AND NULLIF(NEW.phone, '') IS NOT NULL THEN
        RETURN NEW;
    END IF;

    /* =====================================================
       1. GET REQUESTED ROLE
    ===================================================== */

    v_role := COALESCE(
        NULLIF(
            TRIM(
                NEW.raw_user_meta_data
                ->>'requested_role'
            ),
            ''
        ),
        NULLIF(
            TRIM(
                NEW.raw_user_meta_data
                ->>'role'
            ),
            ''
        )
    );


    /* =====================================================
       2. GET RHU ID FOR HEALTH WORKERS
    ===================================================== */

    IF LOWER(COALESCE(v_role, '')) <> 'administrator'
    THEN

        IF NULLIF(
            TRIM(
                NEW.raw_user_meta_data
                ->>'rhu_id'
            ),
            ''
        ) IS NULL THEN

            RAISE EXCEPTION
                'RHU is required for health worker registration.';

        END IF;


        BEGIN

            v_rhu_id :=
                (
                    NEW.raw_user_meta_data
                    ->>'rhu_id'
                )::BIGINT;

        EXCEPTION
            WHEN invalid_text_representation THEN

                RAISE EXCEPTION
                    'Invalid RHU ID.';

        END;


        /* Make sure RHU exists */

        IF NOT EXISTS (
            SELECT 1
            FROM public.rhu
            WHERE rhu_id = v_rhu_id
        ) THEN

            RAISE EXCEPTION
                'Selected RHU does not exist.';

        END IF;

    ELSE

        v_rhu_id := NULL;

    END IF;


    /* =====================================================
       3. CREATE PUBLIC USER

       ALL new registrations start PENDING.
    ===================================================== */

    INSERT INTO public.users (
        user_id,
        full_name,
        username,
        email,
        contact_number,
        account_status
    )
    VALUES (
        NEW.id,

        COALESCE(
            NULLIF(
                TRIM(
                    NEW.raw_user_meta_data
                    ->>'full_name'
                ),
                ''
            ),
            COALESCE(
                NEW.email,
                'Unknown User'
            )
        ),

        COALESCE(
            NULLIF(
                TRIM(
                    NEW.raw_user_meta_data
                    ->>'username'
                ),
                ''
            ),
            split_part(
                COALESCE(
                    NEW.email,
                    NEW.id::TEXT
                ),
                '@',
                1
            )
        ),

        NEW.email,

        NULLIF(
            TRIM(
                NEW.raw_user_meta_data
                ->>'contact_number'
            ),
            ''
        ),

        'PENDING'
    )
    ON CONFLICT (user_id)
    DO NOTHING;


    /* =====================================================
       4. ADMINISTRATOR
    ===================================================== */

    IF LOWER(COALESCE(v_role, '')) =
        'administrator'
    THEN

        INSERT INTO public.administrator (
            user_id
        )
        VALUES (
            NEW.id
        )
        ON CONFLICT (user_id)
        DO NOTHING;


    /* =====================================================
       5. HEALTH WORKERS
    ===================================================== */

    ELSIF LOWER(COALESCE(v_role, '')) IN (
        'public health nurse',
        'rural health midwife',
        'barangay health worker',
        'barangay nutrition scholar',
        'nutrition scholar'
    )
    THEN

        INSERT INTO public.health_worker (
            user_id,
            employee_id,
            license_number
        )
        VALUES (
            NEW.id,

            NULLIF(
                TRIM(
                    NEW.raw_user_meta_data
                    ->>'employee_id'
                ),
                ''
            ),

            NULLIF(
                TRIM(
                    NEW.raw_user_meta_data
                    ->>'license_number'
                ),
                ''
            )
        )
        ON CONFLICT (user_id)
        DO NOTHING;


        /* =================================================
           5A. PUBLIC HEALTH NURSE

           One PHN → One RHU

           PHN automatically supervises all barangays
           belonging to that RHU.
        ================================================= */

        IF LOWER(v_role) =
            'public health nurse'
        THEN

            INSERT INTO public.public_health_nurse (
                user_id,
                rhu_id
            )
            VALUES (
                NEW.id,
                v_rhu_id
            )
            ON CONFLICT (user_id)
            DO UPDATE SET
                rhu_id = EXCLUDED.rhu_id;


        /* =================================================
           5B. RURAL HEALTH MIDWIFE

           One RHM → One RHU
                   → Multiple barangays allowed
        ================================================= */

        ELSIF LOWER(v_role) =
            'rural health midwife'
        THEN

            INSERT INTO public.rural_health_midwife (
                user_id
            )
            VALUES (
                NEW.id
            )
            ON CONFLICT (user_id)
            DO NOTHING;


            /* Must have barangay_ids array */

            IF NOT (
                NEW.raw_user_meta_data
                ? 'barangay_ids'
            )
            OR
            jsonb_typeof(
                NEW.raw_user_meta_data
                ->'barangay_ids'
            ) <> 'array'
            THEN

                RAISE EXCEPTION
                    'Barangay assignments are required for Rural Health Midwife registration.';

            END IF;


            IF jsonb_array_length(
                NEW.raw_user_meta_data
                ->'barangay_ids'
            ) = 0
            THEN

                RAISE EXCEPTION
                    'At least one barangay is required for Rural Health Midwife registration.';

            END IF;


            /* Loop through selected barangays */

            FOR v_barangay_text IN

                SELECT value
                FROM jsonb_array_elements_text(
                    NEW.raw_user_meta_data
                    ->'barangay_ids'
                )

            LOOP

                BEGIN

                    v_barangay_id :=
                        v_barangay_text::BIGINT;

                EXCEPTION
                    WHEN invalid_text_representation THEN

                        RAISE EXCEPTION
                            'Invalid barangay ID: %',
                            v_barangay_text;

                END;


                /* Validate barangay belongs to RHU */

                IF NOT EXISTS (
                    SELECT 1
                    FROM public.barangay
                    WHERE
                        barangay_id =
                            v_barangay_id
                    AND
                        rhu_id =
                            v_rhu_id
                )
                THEN

                    RAISE EXCEPTION
                        'Barangay % does not belong to RHU %.',
                        v_barangay_id,
                        v_rhu_id;

                END IF;


                /* Create requested assignment */

                IF NOT EXISTS (
                    SELECT 1
                    FROM public.health_worker_assignment
                    WHERE
                        user_id = NEW.id
                    AND
                        barangay_id =
                            v_barangay_id
                )
                THEN

                    INSERT INTO public.health_worker_assignment (
                        assigned_date,
                        status,
                        user_id,
                        barangay_id
                    )
                    VALUES (
                        CURRENT_DATE,
                        'PENDING',
                        NEW.id,
                        v_barangay_id
                    );

                END IF;

            END LOOP;


        /* =================================================
           5C. BARANGAY HEALTH WORKER

           One BHW → One RHU → One barangay
        ================================================= */

        ELSIF LOWER(v_role) =
            'barangay health worker'
        THEN

            INSERT INTO public.barangay_health_worker (
                user_id
            )
            VALUES (
                NEW.id
            )
            ON CONFLICT (user_id)
            DO NOTHING;


            IF NULLIF(
                TRIM(
                    NEW.raw_user_meta_data
                    ->>'barangay_id'
                ),
                ''
            ) IS NULL
            THEN

                RAISE EXCEPTION
                    'Barangay is required for Barangay Health Worker registration.';

            END IF;


            BEGIN

                v_barangay_id :=
                    (
                        NEW.raw_user_meta_data
                        ->>'barangay_id'
                    )::BIGINT;

            EXCEPTION
                WHEN invalid_text_representation THEN

                    RAISE EXCEPTION
                        'Invalid barangay ID.';

            END;


            /* Validate barangay belongs to RHU */

            IF NOT EXISTS (
                SELECT 1
                FROM public.barangay
                WHERE
                    barangay_id =
                        v_barangay_id
                AND
                    rhu_id =
                        v_rhu_id
            )
            THEN

                RAISE EXCEPTION
                    'Selected barangay does not belong to selected RHU.';

            END IF;


            INSERT INTO public.health_worker_assignment (
                assigned_date,
                status,
                user_id,
                barangay_id
            )
            VALUES (
                CURRENT_DATE,
                'PENDING',
                NEW.id,
                v_barangay_id
            );


        /* =================================================
           5D. BARANGAY NUTRITION SCHOLAR

           One BNS → One RHU → One barangay
        ================================================= */

        ELSIF LOWER(v_role) IN (
            'barangay nutrition scholar',
            'nutrition scholar'
        )
        THEN

            INSERT INTO public.barangay_nutrition_scholar (
                user_id
            )
            VALUES (
                NEW.id
            )
            ON CONFLICT (user_id)
            DO NOTHING;


            IF NULLIF(
                TRIM(
                    NEW.raw_user_meta_data
                    ->>'barangay_id'
                ),
                ''
            ) IS NULL
            THEN

                RAISE EXCEPTION
                    'Barangay is required for Barangay Nutrition Scholar registration.';

            END IF;


            BEGIN

                v_barangay_id :=
                    (
                        NEW.raw_user_meta_data
                        ->>'barangay_id'
                    )::BIGINT;

            EXCEPTION
                WHEN invalid_text_representation THEN

                    RAISE EXCEPTION
                        'Invalid barangay ID.';

            END;


            /* Validate barangay belongs to RHU */

            IF NOT EXISTS (
                SELECT 1
                FROM public.barangay
                WHERE
                    barangay_id =
                        v_barangay_id
                AND
                    rhu_id =
                        v_rhu_id
            )
            THEN

                RAISE EXCEPTION
                    'Selected barangay does not belong to selected RHU.';

            END IF;


            INSERT INTO public.health_worker_assignment (
                assigned_date,
                status,
                user_id,
                barangay_id
            )
            VALUES (
                CURRENT_DATE,
                'PENDING',
                NEW.id,
                v_barangay_id
            );

        END IF;

    ELSE

        RAISE EXCEPTION
            'Invalid registration role: %',
            COALESCE(
                v_role,
                'NULL'
            );

    END IF;


    RETURN NEW;

END;

$function$;
COMMIT;
