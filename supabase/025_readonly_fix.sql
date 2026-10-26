-- 025: fix "কাজটি হয়নি" on the admin's user page. Run AFTER 024. Safe to run more than once.
-- The server runs "stable" functions in read-only mode, but admin_user_detail writes a line to the work record
-- ('user_viewed'). Marking it volatile lets it write. Nothing else changes.
alter function public.admin_user_detail(uuid) volatile;
notify pgrst, 'reload schema';
