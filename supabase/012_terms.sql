-- 012: separate terms for hajis and for leaders. Run AFTER 011. Safe to re-run.
--  * Two texts: 'terms_haji' and 'terms_leader'. The admin can change each in the app (Admin > শর্তাবলি).
--    A first draft of both is put in here only if that text does not exist yet, so the admin's own edits are never overwritten.
--  * Who agreed to which version, and when, is recorded (terms_agreements). A haji agrees at sign-up;
--    a leader agrees to the leader terms again when sending the leader application. The application cannot be sent without it.
--  * The old single text 'terms' still works for apps that have not been updated.

-- 1) Texts --------------------------------------------------------------------------------------------------------------
alter table public.app_texts drop constraint if exists app_texts_key_check;
alter table public.app_texts add constraint app_texts_key_check check (key in ('terms', 'terms_haji', 'terms_leader'));

insert into public.app_texts (key, body) values ('terms_haji', $T$Travel Adda — হাজীদের জন্য শর্তাবলি

Travel Adda অ্যাপ ব্যবহার করার আগে এই শর্তগুলো মন দিয়ে পড়ুন। অ্যাকাউন্ট খুললে ধরে নেওয়া হবে আপনি এগুলো মেনে নিয়েছেন।

১. অ্যাপটি কী
• Travel Adda একটি সরকার অনুমোদিত ট্রাভেল এজেন্সির অ্যাপ। এতে হজ ও ওমরাহর গাইড, দোয়া, নামাজের সময়, কাগজপত্র রাখা, যাচাই করা লিডার খোঁজা, চুক্তি ও টাকা জমার ব্যবস্থা আছে।
• গাইড ও দোয়া সাহায্যের জন্য। কোনো মাসআলা নিয়ে সন্দেহ হলে আপনার আলেম বা লিডারের সঙ্গে কথা বলুন।
• নামাজের সময় ও কিবলার দিক ফোনের হিসাবে দেখানো হয়; স্থানীয় মসজিদের সময়ের সঙ্গে সামান্য পার্থক্য হতে পারে।

২. আপনার অ্যাকাউন্ট
• নিজের আসল নাম ও নিজের মোবাইল নম্বর দিয়ে অ্যাকাউন্ট খুলুন। একজনের একটি অ্যাকাউন্ট।
• পাসওয়ার্ড ও এসএমএস কোড কাউকে বলবেন না। Travel Adda কখনো ফোন করে পাসওয়ার্ড বা কোড চায় না।
• আপনার অ্যাকাউন্টে যা হয়, তার দায় আপনার। কেউ আপনার অ্যাকাউন্ট ব্যবহার করছে মনে হলে সঙ্গে সঙ্গে আমাদের জানান।

৩. লিডার ও চুক্তি
• অ্যাপে শুধু সেই লিডারদের দেখানো হয়, যাঁদের লাইসেন্স Travel Adda যাচাই করেছে।
• চুক্তির দাম, কী কী অন্তর্ভুক্ত, যাত্রার তারিখ এবং বাতিল ও টাকা ফেরতের নিয়ম লিডার লিখে পাঠান। "রাজি আছি" চাপার আগে পুরো চুক্তি পড়ুন। রাজি হওয়া মানে আপনি এই চুক্তিতে ডিজিটালভাবে সম্মতি দিলেন।
• চুক্তি বাতিল হলে টাকা ফেরত হবে সেই চুক্তিতে লেখা নিয়ম অনুযায়ী।

৪. টাকা পরিশোধ (খুব জরুরি)
• প্যাকেজের টাকা শুধু অ্যাপে দেখানো Travel Adda-র নিজস্ব বিকাশ বা ব্যাংক অ্যাকাউন্টে পাঠাবেন, তারপর অ্যাপে রসিদ জমা দেবেন।
• লিডার বা অন্য কারো ব্যক্তিগত নম্বরে বা হাতে টাকা দেবেন না। অ্যাপের বাইরে দেওয়া টাকার দায় Travel Adda নিতে পারবে না।
• Travel Adda টাকা মিলিয়ে নিশ্চিত করলে তবেই সেটা জমা হিসেবে ধরা হবে। এরপর চুক্তি অনুযায়ী Travel Adda লিডারকে টাকা দেয়। টাকা ফেরতও Travel Adda-র মাধ্যমে হয়।
• ভুল বা নকল রসিদ দিলে অ্যাকাউন্ট বন্ধ হতে পারে।

৫. কাগজপত্র ও গোপনীয়তা
• পাসপোর্ট, ভিসা ও টিকেটের ছবি গোপনভাবে রাখা হয়। আপনি ছাড়া কেউ সেগুলো দেখতে পারে না।
• আপনার মোবাইল নম্বর লিডার বা অন্য হাজীদের দেখানো হয় না।
• কোন তথ্য কেন রাখা হয়, তা অ্যাপের "গোপনীয়তা নীতি"-তে লেখা আছে। "আমার তথ্য" থেকে যেকোনো সময় অ্যাকাউন্ট ও সব তথ্য মুছে ফেলতে পারবেন।

৬. অভিযোগ, রিপোর্ট ও আচরণ
• কোনো লিডারের বিষয়ে সমস্যা হলে অ্যাপ থেকে অভিযোগ করুন। Travel Adda যাচাই করে ব্যবস্থা নেবে।
• মিথ্যা অভিযোগ, গালাগালি, অন্যকে হয়রানি বা ভুয়া তথ্য দেওয়া যাবে না। এমন হলে অ্যাকাউন্ট সাময়িক বা স্থায়ীভাবে বন্ধ করা হতে পারে।

৭. জরুরি অবস্থা
• বিপদে আগে স্থানীয় জরুরি নম্বরে বা কাছের পুলিশ/হাসপাতালে যোগাযোগ করুন। অ্যাপের জরুরি পাতা ও হেল্পলাইন সাহায্যের জন্য, তবে সরকারি জরুরি সেবার বিকল্প নয়।

৮. পরিবর্তন ও যোগাযোগ
• প্রয়োজনে এই শর্তাবলি বদলানো হতে পারে। সর্বশেষটি সবসময় অ্যাপের "আমার তথ্য → শর্তাবলি"-তে থাকবে।
• এই শর্তাবলি বাংলাদেশের আইন অনুযায়ী।
• প্রশ্ন বা অভিযোগ: traveladda.z@gmail.com অথবা অ্যাপের হেল্পলাইন।$T$)
on conflict (key) do nothing;

insert into public.app_texts (key, body) values ('terms_leader', $T$Travel Adda — গ্রুপ লিডারদের জন্য শর্তাবলি

লিডার হিসেবে নিবন্ধন করার আগে এই শর্তগুলো মন দিয়ে পড়ুন। নিবন্ধন জমা দিলে ধরে নেওয়া হবে আপনি এগুলো মেনে নিয়েছেন।

১. কারা লিডার হতে পারবেন
• যাঁদের সরকার অনুমোদিত হজ বা ওমরাহ এজেন্সির বৈধ লাইসেন্স আছে, অথবা এমন এজেন্সির পক্ষে কাজ করেন।
• নিবন্ধনে এজেন্সির নাম, লাইসেন্স নম্বর, ঠিকানা ও কাগজ সত্য দিতে হবে। Travel Adda যাচাই করে অনুমোদন দেবে; প্রয়োজনে কারণসহ বা কারণ ছাড়া আবেদন বাতিল করতে পারে।
• লাইসেন্স বাতিল বা মেয়াদ শেষ হলে সঙ্গে সঙ্গে Travel Adda-কে জানাতে হবে।

২. অ্যাকাউন্ট
• অ্যাকাউন্ট আপনার নিজের; পাসওয়ার্ড ও এসএমএস কোড কাউকে দেবেন না। আপনার অ্যাকাউন্টে যা হয়, তার দায় আপনার।

৩. প্যাকেজ ও অফার
• প্যাকেজের দাম, কী কী অন্তর্ভুক্ত ও কী নয়, যাত্রার তারিখ ও শেষ তারিখ সত্য ও স্পষ্ট লিখবেন।
• বিভ্রান্তিকর বা মিথ্যা তথ্য দেওয়া যাবে না। মেয়াদ শেষ হওয়া প্যাকেজ সরিয়ে দেবেন।

৪. চুক্তি
• হাজীর সঙ্গে সব শর্ত অ্যাপের চুক্তিতে লিখবেন: দাম, অন্তর্ভুক্ত সেবা, তারিখ, বাতিল ও টাকা ফেরতের নিয়ম।
• হাজী রাজি হওয়ার পর চুক্তিতে লেখা সেবা দিতে আপনি বাধ্য। চুক্তির বাইরে লুকানো বা বাড়তি টাকা চাওয়া যাবে না।
• আপনি সেবা দিতে না পারলে বা চুক্তি বাতিল হলে হাজী চুক্তিতে লেখা নিয়ম অনুযায়ী টাকা ফেরত পাবেন।

৫. টাকা লেনদেন (খুব জরুরি)
• Travel Adda অ্যাপের মাধ্যমে আসা হাজীদের কাছ থেকে আপনি সরাসরি টাকা নিতে পারবেন না। সব টাকা হাজী Travel Adda-র অ্যাকাউন্টে দেবেন।
• Travel Adda টাকা নিশ্চিত হওয়ার পর কমিশন রেখে বাকি টাকা চুক্তি অনুযায়ী আপনাকে পাঠাবে। কমিশনের হার আপনাকে আগে জানানো হবে।
• অভিযোগ যাচাই চলাকালে বা চুক্তি নিয়ে বিরোধ থাকলে Travel Adda আপনার পাওনা সাময়িকভাবে আটকে রাখতে পারে, এবং প্রয়োজনে হাজীকে টাকা ফেরত দিতে পারে।
• অ্যাপের বাইরে হাজীর কাছ থেকে টাকা নিলে লিডার অ্যাকাউন্ট বন্ধ করা হতে পারে।

৬. হাজীদের তথ্য
• হাজীদের যে তথ্য আপনি পান, তা শুধু তাঁদের যাত্রার কাজে ব্যবহার করবেন। কাউকে দেবেন না, বিক্রি করবেন না, বিজ্ঞাপনে ব্যবহার করবেন না।
• দলের ঘোষণায় শুধু যাত্রা-সংক্রান্ত কথা লিখবেন।

৭. আচরণ, রেটিং ও অভিযোগ
• হাজীদের সঙ্গে সম্মান ও সততার সঙ্গে আচরণ করবেন। বাংলাদেশ ও সৌদি আরবের নিয়ম মেনে চলবেন।
• হাজীরা আপনাকে রেটিং দিতে ও অভিযোগ করতে পারবেন। Travel Adda যাচাই করা অভিযোগ আপনার প্রোফাইলে দেখাতে পারে।
• প্রতারণা, হয়রানি, মিথ্যা তথ্য বা এই শর্ত ভাঙলে Travel Adda সতর্ক করতে, অ্যাকাউন্ট সাময়িক বা স্থায়ীভাবে বন্ধ করতে এবং প্রয়োজনে আইনগত ব্যবস্থা নিতে পারে।

৮. পরিবর্তন ও যোগাযোগ
• প্রয়োজনে এই শর্তাবলি বদলানো হতে পারে। সর্বশেষটি সবসময় অ্যাপের "আমার তথ্য → শর্তাবলি"-তে থাকবে।
• এই শর্তাবলি বাংলাদেশের আইন অনুযায়ী।
• প্রশ্ন: traveladda.z@gmail.com অথবা অ্যাপের হেল্পলাইন।$T$)
on conflict (key) do nothing;

create or replace function public.admin_set_text(p_key text, p_body text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('terms', 'terms_haji', 'terms_leader') then raise exception 'bad key'; end if;
  if p_body is null or trim(p_body) = '' then
    delete from public.app_texts where key = p_key;
  else
    insert into public.app_texts (key, body, updated_by) values (p_key, left(p_body, 20000), (select auth.uid()))
    on conflict (key) do update set body = excluded.body, updated_at = now(), updated_by = excluded.updated_by;
  end if;
  perform public.log_admin('text_' || p_key, null, null);
  return 'ok';
end $$;

-- 2) Who agreed to which version -------------------------------------------------------------------------------------
create table if not exists public.terms_agreements (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  key        text not null check (key in ('terms_haji', 'terms_leader')),
  version    timestamptz not null,          -- app_texts.updated_at of the text that was shown
  agreed_at  timestamptz not null default now(),
  primary key (user_id, key, version)
);
alter table public.terms_agreements enable row level security;
revoke all on public.terms_agreements from anon, authenticated;     -- only through the functions below

-- Records that the signed-in person agrees to the current text. 'none' if that text does not exist.
create or replace function public.agree_terms(p_key text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_ver timestamptz;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_key not in ('terms_haji', 'terms_leader') then return 'bad'; end if;
  select updated_at into v_ver from public.app_texts where key = p_key;
  if v_ver is null then return 'none'; end if;
  insert into public.terms_agreements (user_id, key, version) values (v_uid, p_key, v_ver) on conflict do nothing;
  return 'ok';
end $$;

-- Has this person agreed to (any version of) these terms? Used by the leader application rule.
create or replace function public.agreed_terms(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.app_texts where key = p_key)       -- no text written: nothing to agree to
      or exists (select 1 from public.terms_agreements where user_id = (select auth.uid()) and key = p_key);
$$;

-- My agreements, for the Terms page ("you agreed on ...", "terms changed since").
create or replace function public.my_terms() returns table (key text, agreed_at timestamptz, current_version boolean)
language sql stable security definer set search_path = '' as $$
  select a.key, max(a.agreed_at), bool_or(a.version = t.updated_at)
    from public.terms_agreements a left join public.app_texts t on t.key = a.key
   where a.user_id = (select auth.uid())
   group by a.key;
$$;

-- Admin: how many accounts agreed to the current version of each text.
create or replace function public.admin_terms_counts() returns table (key text, agreed int)
language sql stable security definer set search_path = '' as $$
  select t.key, (select count(distinct a.user_id)::int from public.terms_agreements a where a.key = t.key and a.version = t.updated_at)
    from public.app_texts t where t.key in ('terms_haji', 'terms_leader') and public.is_admin();
$$;

revoke all on function public.agree_terms(text) from public, anon;
revoke all on function public.agreed_terms(text) from public, anon;
revoke all on function public.my_terms() from public, anon;
revoke all on function public.admin_terms_counts() from public, anon;
grant execute on function public.agree_terms(text) to authenticated;
grant execute on function public.agreed_terms(text) to authenticated;
grant execute on function public.my_terms() to authenticated;
grant execute on function public.admin_terms_counts() to authenticated;

-- 3) A leader application needs the leader terms (same rule as 007, plus the terms) --------------------------------------
drop policy if exists "lapp_insert" on public.leader_applications;
create policy "lapp_insert" on public.leader_applications for insert to authenticated
  with check (user_id = (select auth.uid())
              and (doc_path is null or doc_path like (select auth.uid())::text || '/%')
              and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_type = 'leader' and p.role = 'haji' and p.status = 'active')
              and (not public.otp_live() or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.phone_verified))
              and (select public.agreed_terms('terms_leader')));
