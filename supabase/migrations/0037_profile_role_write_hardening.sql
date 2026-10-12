-- Prevent self-promotion through editable profile metadata.
-- A user's display name may be edited; their default_role and email are system-owned.
revoke update on public.profiles from public, anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Review of authenticated campaign approvals will use auth.users.app_metadata,
-- not public.profiles.default_role or editable user_metadata.
