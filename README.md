# eCHIMS: A Rule-Based Early Child Health Information and Monitoring System for Child Health Program Management at the City Health Offices and Rural Health Units

The system supports child health program management in Rural Health Units (RHUs) and City Health Offices. It brings child profiles, vaccination, nutritional assessment, supplementation, scheduling and alerts into one system for monitoring children aged 0–59 months.
The system uses rule-based evaluation to identify records requiring follow-up and helps authorized staff coordinate services within their assigned RHU or barangay.

| Layer | Technology |
| --- | --- |
| Application | Next.js App Router and TypeScript |
| Interface | React, Tailwind CSS and Lucide icons |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Data access control | PostgreSQL Row Level Security (RLS) |
| Scheduled processing | PostgreSQL `pg_cron` |
| Local offline storage | Browser IndexedDB |
| Hosting | Vercel |

| Role | Responsibility |
| --- | --- |
| Administrator | System-wide administration and oversight |
| Public Health Nurse (PHN) | Supervision and review within the assigned RHU |
| Rural Health Midwife (RHM) | Barangay coordination and authorized clinical supplementation workflows |
| Barangay Health Worker (BHW) | Assigned community records and permitted health-service recording |
| Barangay Nutrition Scholar (BNS) | Nutritional assessment and permitted supplementation recording |
| Guardian | Intended recipient of guardian communications; no staff dashboard access |
