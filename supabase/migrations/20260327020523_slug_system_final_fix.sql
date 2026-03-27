-- Consolidated fix for the professional slug system
-- This migration is idempotent and safe to run multiple times.

-- 1. Ensure unaccent extension is enabled
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Create or replace slugify function
CREATE OR REPLACE FUNCTION public.slugify(v_text text)
RETURNS text AS $$
DECLARE
  v_slug text;
BEGIN
  -- Lowercase and remove accents
  v_slug := lower(unaccent(v_text));
  -- Replace non-alphanumeric with hyphens
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  -- Trim hyphens from both ends
  v_slug := trim(both '-' from v_slug);
  -- Limit to 50 characters
  v_slug := substring(v_slug, 1, 50);
  -- Trim hyphens again in case the cut left a trailing hyphen
  v_slug := trim(both '-' from v_slug);
  RETURN v_slug;
END;
$$ LANGUAGE plpgsql;

-- 3. Create or replace generate_unique_professional_slug function (Hardened version)
CREATE OR REPLACE FUNCTION public.generate_unique_professional_slug(v_base text)
RETURNS text AS $$
DECLARE
  v_slug text;
  v_final_slug text;
  v_counter integer := 1;
  v_max_attempts integer := 100;
BEGIN
  -- Generate initial normalized slug
  v_slug := public.slugify(v_base);
  
  -- Fallback if slug is empty or invalid
  IF v_slug = '' OR v_slug IS NULL THEN
    v_slug := 'prof-' || substring(gen_random_uuid()::text, 1, 8);
  END IF;

  -- Advisory Lock for concurrency safety
  PERFORM pg_advisory_xact_lock(hashtext(v_slug));
  
  v_final_slug := v_slug;
  
  -- Uniqueness Loop
  WHILE v_counter < v_max_attempts AND EXISTS (SELECT 1 FROM public.professionals WHERE slug = v_final_slug) LOOP
    v_final_slug := v_slug || '-' || v_counter;
    v_counter := v_counter + 1;
  END LOOP;
  
  -- Emergency Fallback
  IF EXISTS (SELECT 1 FROM public.professionals WHERE slug = v_final_slug) THEN
     v_final_slug := v_slug || '-' || substring(gen_random_uuid()::text, 1, 8);
  END IF;
  
  RETURN v_final_slug;
END;
$$ LANGUAGE plpgsql;

-- 4. Create or replace the trigger function (with the name requested by the user)
CREATE OR REPLACE FUNCTION public.set_professional_slug()
RETURNS trigger AS $$
BEGIN
  -- Only generate if slug is not explicitly provided
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_unique_professional_slug(
      COALESCE(NULLIF(NEW.business_name, ''), NEW.name)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Re-create the trigger (with the name requested by the user)
-- First drop existing triggers if they exist to avoid duplicates or name conflicts
DROP TRIGGER IF EXISTS tr_generate_professional_slug ON public.professionals;
DROP TRIGGER IF EXISTS before_insert_set_slug ON public.professionals;

CREATE TRIGGER before_insert_set_slug
BEFORE INSERT ON public.professionals
FOR EACH ROW
EXECUTE FUNCTION public.set_professional_slug();

-- 6. Backfill existing records (Safe Update)
UPDATE public.professionals
SET slug = public.generate_unique_professional_slug(COALESCE(NULLIF(business_name, ''), name))
WHERE slug IS NULL OR slug = '';
