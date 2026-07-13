ALTER TYPE public.training_level ADD VALUE IF NOT EXISTS 'diamante' BEFORE 'champion';
ALTER TABLE public.weekly_reports ALTER COLUMN nota_geral TYPE numeric(4,2) USING nota_geral::numeric;