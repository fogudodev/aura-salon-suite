-- Hardening the slug generation system for production concurrency and edge cases

-- Improve generate_unique_professional_slug with advisory locking and better fallback
CREATE OR REPLACE FUNCTION public.generate_unique_professional_slug(v_base text)
RETURNS text AS $$
DECLARE
  v_slug text;
  v_final_slug text;
  v_counter integer := 1;
  v_max_attempts integer := 100;
BEGIN
  -- 1. Generate initial normalized slug
  v_slug := public.slugify(v_base);
  
  -- 2. Fallback if slug is empty or invalid
  IF v_slug = '' OR v_slug IS NULL THEN
    -- Use a random value for fallback to avoid predictable collisions and ensure a valid URL
    v_slug := 'prof-' || substring(gen_random_uuid()::text, 1, 8);
  END IF;

  -- 3. Concurrency Safety: Advisory Locking
  -- Acquire an advisory lock based on the base slug to serialize concurrent inserts of the same name.
  -- This prevents the race condition where two transactions check EXISTS at the same time and both see 'false'.
  -- The lock is automatically released at the end of the transaction.
  PERFORM pg_advisory_xact_lock(hashtext(v_slug));
  
  v_final_slug := v_slug;
  
  -- 4. Uniqueness Loop
  -- Check for uniqueness and append suffix if needed
  -- We limit attempts to prevent infinite loops, though unlikely
  WHILE v_counter < v_max_attempts AND EXISTS (SELECT 1 FROM public.professionals WHERE slug = v_final_slug) LOOP
    v_final_slug := v_slug || '-' || v_counter;
    v_counter := v_counter + 1;
  END LOOP;
  
  -- 5. Emergency Fallback
  -- If we still have a collision after max attempts, use a random suffix to GUARANTEE uniqueness
  IF EXISTS (SELECT 1 FROM public.professionals WHERE slug = v_final_slug) THEN
     v_final_slug := v_slug || '-' || substring(gen_random_uuid()::text, 1, 8);
  END IF;
  
  RETURN v_final_slug;
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger function uses the hardened logic (no changes needed to the call itself, but confirming)
-- The trigger function 'handle_professional_slug_generation' already calls this function.
