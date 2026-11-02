-- 033 (owner, Nov 2026): the app's contact e-mail is now amihaji.bd@gmail.com.
-- Changes only the e-mail inside the saved terms. updated_at (the version people agreed to) is NOT touched, so nobody
-- is asked to agree again for a changed contact address. Safe to run more than once.
update public.app_texts
   set body = replace(body, 'traveladda.z@gmail.com', 'amihaji.bd@gmail.com')
 where key in ('terms_haji', 'terms_leader') and body like '%traveladda.z@gmail.com%';

notify pgrst, 'reload schema';
