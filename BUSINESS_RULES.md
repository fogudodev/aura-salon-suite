# BUSINESS_RULES.md

This document defines the core business logic and automated behaviors of the Aura Salon Suite.

## 1. Professional Onboarding & Public Page

### Automatic Slug Generation [FINALIZED]
- **Rule**: Every new professional or salon must have a unique public slug at creation time.
- **Trigger**: `before_insert_set_slug` (BEFORE INSERT on `professionals`).
- **Function**: `set_professional_slug()` using `generate_unique_professional_slug()`.
- **Source**: The slug is primarily derived from `business_name`. If empty, it falls back to `name`.
- **Normalization**:
  - Lowercase
  - No accents (via `unaccent`)
  - Spaces and special characters replaced by `-`
  - Multiple hyphens collapsed
  - Trimmed hyphens
  - **Character Limit**: Strictly 50 characters for SEO efficiency.
- **Uniqueness & Concurrency**: 
  - If a slug exists, a numeric suffix (`-1`, `-2`, etc.) is appended.
  - **Advisory Locking**: The system uses transaction-level advisory locks to serialize concurrent inserts of identical names, preventing race condition errors during high-traffic signups.
- **Fallback Behavior**: If a name results in an empty or invalid slug, a safe randomized slug (e.g., `prof-8a2b1c`) is automatically generated.
- **Manual Overrides**: Professionals can change their slug in the Public Page settings. The automatic generation ONLY occurs if the slug is empty during insertion.

## 2. User Roles & Access
- **Professional**: Access to calendar, services, clients, and WhatsApp automation.
- **Receptionist**: Access to the calendar and client management, but lives under a Professional/Salon account. Does NOT have its own `professionals` record (skipped in `handle_new_user`).
- **Support**: Aura internal support staff.

## 3. WhatsApp Automations
- **Default Triggers**: New professionals start with a set of default automations (e.g., `booking_created`, `reminder_24h`).
- **Status**: Some automations are active by default, others require configuration.
