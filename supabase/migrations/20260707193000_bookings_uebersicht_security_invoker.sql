-- Supabase linter 0010: avoid SECURITY DEFINER behavior for public views.
-- The app currently reads public.bookings server-side; no direct client usage
-- of public.bookings_uebersicht was found in the codebase.
alter view public.bookings_uebersicht set (security_invoker = true);
