-- Prevent checked-mode supplements from claiming more source answers than
-- their reviewed school/year parent aggregate contains.
ALTER TABLE public.beagu_school_question_modes_supplement_v1
  ADD CONSTRAINT beagu_school_question_modes_supplement_aggregate_fk
  FOREIGN KEY (school_id,survey_year)
  REFERENCES public.beagu_school_question_aggregates_v2(school_id,survey_year);

CREATE OR REPLACE FUNCTION beagu_private.check_school_question_mode_source_rows()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE parent_rows integer;
BEGIN
  SELECT a.source_rows INTO parent_rows
  FROM public.beagu_school_question_aggregates_v2 a
  WHERE a.school_id = NEW.school_id AND a.survey_year = NEW.survey_year;
  IF parent_rows IS NULL OR NEW.valid_rows > parent_rows THEN
    RAISE EXCEPTION 'Verified question mode cannot exceed parent source rows'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION beagu_private.check_school_question_mode_source_rows() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS check_school_question_mode_source_rows ON public.beagu_school_question_modes_supplement_v1;
CREATE TRIGGER check_school_question_mode_source_rows
BEFORE INSERT OR UPDATE OF school_id,survey_year,valid_rows
ON public.beagu_school_question_modes_supplement_v1
FOR EACH ROW EXECUTE FUNCTION beagu_private.check_school_question_mode_source_rows();
