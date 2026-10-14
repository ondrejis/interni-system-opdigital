-- Hledání bez diakritiky: unaccent() není IMMUTABLE, proto ho nejde použít v indexu. Tato obálka je
-- označená jako IMMUTABLE (slovník je pevný), takže nad ní lze stavět trigramové indexy (ILIKE '%…%').
CREATE OR REPLACE FUNCTION public.f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent', $1) $$;
