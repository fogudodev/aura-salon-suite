-- Enable unaccent extension for accent removal
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Function to normalize text into a slug
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

-- Function to generate a unique professional slug
CREATE OR REPLACE FUNCTION public.generate_unique_professional_slug(v_base text)
RETURNS text AS $$
DECLARE
  v_slug text;
  v_final_slug text;
  v_counter integer := 1;
BEGIN
  -- Generate initial slug
  v_slug := public.slugify(v_base);
  
  -- Fallback if slug is empty
  IF v_slug = '' OR v_slug IS NULL THEN
    v_slug := 'prof';
  END IF;
  
  v_final_slug := v_slug;
  
  -- Check for uniqueness and append suffix if needed
  WHILE EXISTS (SELECT 1 FROM public.professionals WHERE slug = v_final_slug) LOOP
    v_final_slug := v_slug || '-' || v_counter;
    v_counter := v_counter + 1;
  END LOOP;
  
  RETURN v_final_slug;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for automatic slug generation on creation
CREATE OR REPLACE FUNCTION public.handle_professional_slug_generation()
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

-- Create the trigger
DROP TRIGGER IF EXISTS tr_generate_professional_slug ON public.professionals;
CREATE TRIGGER tr_generate_professional_slug
BEFORE INSERT ON public.professionals
FOR EACH ROW
EXECUTE FUNCTION public.handle_professional_slug_generation();

-- Backfill existing records with null or empty slugs
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT id, name, business_name 
    FROM public.professionals 
    WHERE slug IS NULL OR slug = '' 
  LOOP
    UPDATE public.professionals
    SET slug = public.generate_unique_professional_slug(COALESCE(NULLIF(r.business_name, ''), r.name))
    WHERE id = r.id;
  END LOOP;
END;
$$;
