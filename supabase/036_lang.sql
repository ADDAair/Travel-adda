-- 036 (owner, Nov 2026): English step 5 — the server's own notices also in English. Safe to run more than once.
-- Run in the Supabase SQL Editor (after 035).
--   * profiles.lang: the language each person chose in the app ('bn' or 'en'); the app sets it with set_my_lang().
--     Nobody can write it directly; it says nothing private, it only picks the language of notices.
--   * notice_en: one English rule for each Bengali notice the server makes (contract, money, group, fund...).
--     Fixed texts are matched exactly; texts with names or numbers are matched with a pattern that keeps them.
--     Only the server can read it. A notice with no rule simply stays in Bengali.
--   * my_notices_en(ids): the English of my own notices, for the notification box (other people's: never).
--   * Phone alerts (push) now come in the person's language. Notices that Travel Adda writes by hand stay as written.
--   * The Bengali notices themselves are not changed.

-- 1) The chosen language ---------------------------------------------------------------------------------------------
alter table public.profiles add column if not exists lang text not null default 'bn';
alter table public.profiles drop constraint if exists profiles_lang_check;
alter table public.profiles add constraint profiles_lang_check check (lang in ('bn', 'en'));

create or replace function public.set_my_lang(p_lang text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_lang is null or p_lang not in ('bn', 'en') then return 'bad'; end if;
  update public.profiles set lang = p_lang where id = v_uid and lang is distinct from p_lang;
  return 'ok';
end $$;
revoke all on function public.set_my_lang(text) from public, anon;
grant execute on function public.set_my_lang(text) to authenticated;

-- 2) English rules for the server's notices ---------------------------------------------------------------------------
create table if not exists public.notice_en (
  ord      int primary key,
  is_re    boolean not null default false,   -- false: the whole text must be exactly bn; true: bn is a pattern (\1 keeps a part)
  bn       text not null,
  en       text not null
);
alter table public.notice_en enable row level security;
revoke all on public.notice_en from public, anon, authenticated;

delete from public.notice_en;
insert into public.notice_en (ord, is_re, bn, en) values
  -- contracts
  (10, false, 'নতুন চুক্তির অনুরোধ এসেছে', 'New contract request'),
  (11, true,  '^(.*) \((.*)\) আপনাকে "(.*)" চুক্তি পাঠিয়েছেন। পড়ে রাজি হলে চুক্তি চালু হবে।$', '\1 (\2) sent you the contract "\3". Read it; the contract starts when you agree.'),
  (12, false, 'হাজী চুক্তিতে রাজি হয়েছেন', 'The haji agreed to the contract'),
  (13, true,  '^(.*) \((.*)\) "(.*)" চুক্তিতে রাজি হয়েছেন। চুক্তি নম্বর (.*)।$', '\1 (\2) agreed to the contract "\3". Contract no. \4.'),
  (14, false, 'হাজী চুক্তিতে রাজি হননি', 'The haji did not agree to the contract'),
  (15, true,  '^(.*) \((.*)\) "(.*)" চুক্তি নেননি।$', '\1 (\2) did not accept the contract "\3".'),
  (16, false, 'হাজী চুক্তি বাতিল করেছেন', 'The haji cancelled the contract'),
  (17, false, 'লিডার চুক্তি বাতিল করেছেন', 'The leader cancelled the contract'),
  (18, true,  '^চুক্তি ([^।]*)। কারণ: (.*) জমা দেওয়া টাকার বিষয়ে Travel Adda হেল্পলাইনে যোগাযোগ করুন।$', 'Contract \1. Reason: \2 For money already paid, contact the Travel Adda helpline.'),
  (19, true,  '^চুক্তি ([^।]*)। কারণ: (.*)$', 'Contract \1. Reason: \2'),
  (20, false, 'সফর সম্পন্ন হিসেবে চিহ্নিত হয়েছে', 'The journey has been marked as completed'),
  (21, false, 'আপনার অভিজ্ঞতা জানাতে লিডারকে রেটিং দিতে পারেন।', 'You can rate the leader to share your experience.'),
  -- money
  (30, false, 'আপনার টাকা পাওয়া গেছে', 'Your money has been received'),
  (31, true,  '^Travel Adda আপনার (.*) টাকা \(লেনদেন নম্বর (.*)\) নিশ্চিত করেছে।$', 'Travel Adda has confirmed your Tk \1 (transaction no. \2).'),
  (32, false, 'হাজীর টাকা নিশ্চিত হয়েছে', 'The haji''s money is confirmed'),
  (33, true,  '^(.*) \((.*)\)-এর (.*) টাকা Travel Adda পেয়েছে। চুক্তি (.*)।$', 'Travel Adda received Tk \3 from \1 (\2). Contract \4.'),
  (34, false, 'টাকার জমা মেলেনি', 'The payment did not match'),
  (35, true,  '^লেনদেন নম্বর ([^।]*)। কারণ: (.*) প্রয়োজনে হেল্পলাইনে যোগাযোগ করুন।$', 'Transaction no. \1. Reason: \2 Contact the helpline if needed.'),
  (36, false, 'Travel Adda আপনাকে টাকা পাঠিয়েছে', 'Travel Adda has sent you money'),
  (37, false, 'Travel Adda আপনাকে টাকা ফেরত পাঠিয়েছে', 'Travel Adda has refunded your money'),
  (38, true,  '^(.*) টাকা, লেনদেন নম্বর ([^।]*)। চুক্তি (.*)।$', 'Tk \1, transaction no. \2. Contract \3.'),
  -- leader registration, complaints, referral
  (40, false, 'অভিনন্দন! আপনি এখন যাচাই করা গ্রুপ লিডার', 'Congratulations! You are now a verified group leader'),
  (41, false, 'লিডার নিবন্ধন অনুমোদন হয়নি', 'Leader registration was not approved'),
  (42, false, 'লিডার তালিকায় আপনাকে দেখা যাবে। এখন প্যাকেজ দিতে ও হাজীদের চুক্তি পাঠাতে পারবেন।', 'You will be seen in the leader list. You can now add packages and send contracts to hajis.'),
  (43, true,  '^অ্যাডমিনের নোট: (.*)$', 'Admin''s note: \1'),
  (44, false, 'সঠিক তথ্য দিয়ে আবার চেষ্টা করুন।', 'Try again with correct information.'),
  (45, false, 'আপনার অভিযোগ যাচাই হয়েছে', 'Your complaint has been verified'),
  (46, false, 'আপনার অভিযোগের প্রমাণ পাওয়া যায়নি', 'No proof was found for your complaint'),
  (47, false, 'আপনার বিরুদ্ধে একটি অভিযোগ যাচাই হয়েছে', 'A complaint against you has been verified'),
  (48, false, 'অভিযোগটি আপনার প্রোফাইলে দেখা যাবে। কিছু জানাতে চাইলে Travel Adda হেল্পলাইনে যোগাযোগ করুন।', 'The complaint will be seen on your profile. To say anything about it, contact the Travel Adda helpline.'),
  (49, false, 'একজন হাজী আপনার রেফারেল কোডে যুক্ত হয়েছেন', 'A haji has joined with your referral code'),
  (50, false, 'নিশ্চিত করতে "চুক্তি ও রেফারেল হাজী" পাতা খুলুন।', 'Open the "Contracts and referral hajis" page to confirm.'),
  (51, false, 'লিডার আপনার রেফারেল নিশ্চিত করেছেন', 'The leader confirmed your referral'),
  (52, false, 'লিডার রেফারেল নিশ্চিত করেননি', 'The leader did not confirm the referral'),
  -- groups, khadems, questions
  (60, false, 'দলে যোগ দেওয়ার আমন্ত্রণ', 'Invitation to join a group'),
  (61, true,  '^"(.*)" দলে আপনাকে আমন্ত্রণ জানানো হয়েছে।$', 'You have been invited to the group "\1".'),
  (62, true,  '^📢 দল: লিডারের ঘোষণা$', '📢 Group: leader''s announcement'),
  (63, true,  '^📢 (.*): লিডারের ঘোষণা$', '📢 \1: leader''s announcement'),
  (64, true,  '^"(.*)" দলের খাদেম হওয়ার অনুরোধ$', 'Request to be a khadem of the group "\1"'),
  (65, false, 'রাজি থাকলে খাদেমের পাতায় গিয়ে "রাজি" চাপুন। না চাইলে "না" চাপুন।', 'If you agree, accept it on the khadem page. If not, decline it there.'),
  (66, true,  '^আপনাকে "(.*)" দলের খাদেম করা হয়েছে$', 'You have been made a khadem of the group "\1"'),
  (76, false, 'খাদেমের পাতায় দলের হাজী আর তাঁদের প্রশ্ন দেখতে পাবেন।', 'On the khadem page you will see the group''s hajis and their questions.'),
  (67, false, 'নতুন প্রশ্ন: হাজী', 'New question: a haji'),
  (68, true,  '^নতুন প্রশ্ন: (.*)$', 'New question: \1'),
  (69, false, 'লিডার আপনার প্রশ্নের উত্তর দিয়েছেন', 'The leader answered your question'),
  (70, false, 'খাদেম আপনার প্রশ্নের উত্তর দিয়েছেন', 'A khadem answered your question'),
  (71, true,  '^একজন "(.*)" দলের খাদেম হতে রাজি হয়েছেন$', 'Someone agreed to be a khadem of the group "\1"'),
  (72, true,  '^(.*) "(.*)" দলের খাদেম হতে রাজি হয়েছেন$', '\1 agreed to be a khadem of the group "\2"'),
  (73, false, 'খাদেম ও তৈরি উত্তর পাতায় দেখুন।', 'See it on the khadems and ready answers page.'),
  (74, false, 'Travel Adda আপনার অনুমতি চাইছে', 'Travel Adda is asking your permission'),
  (75, false, 'বিরোধ মেটাতে লিডারের সাথে আপনার প্রশ্ন-উত্তর দেখার অনুমতি চাওয়া হয়েছে। আপনি রাজি না হলে কেউ দেখবে না।', 'Permission is asked to see your questions and answers with the leader, to settle a dispute. If you do not agree, nobody will see them.'),
  -- packages
  (80, true,  '^প্যাকেজ অনুমোদন হয়েছে: (.*)$', 'Package approved: \1'),
  (81, false, 'হাজীরা এখন "অফার" পাতায় প্যাকেজটি দেখতে পাচ্ছেন।', 'Hajis can now see the package on the "Offers" page.'),
  (82, true,  '^প্যাকেজ ঠিক করতে হবে: (.*)$', 'Package needs changes: \1'),
  (83, true,  '^কারণ: (.*)। ঠিক করে আবার জমা দিন।$', 'Reason: \1. Fix it and submit again.'),
  -- emergency and help fund (for the admin and the people involved)
  (90, true,  '^🆘 জরুরি: একজন হাজী (\S+)-এ ফোন করেছেন$', '🆘 Emergency: a haji called \1'),
  (91, true,  '^🆘 জরুরি: (.*) (\S+)-এ ফোন করেছেন$', '🆘 Emergency: \1 called \2'),
  (92, false, 'অবস্থান পাঠানো হয়নি। অ্যাডমিন প্যানেলে "জরুরি রেকর্ড" দেখুন।', 'Location was not sent. See "Emergency records" in the admin panel.'),
  (93, false, 'অবস্থান পাঠানো হয়েছে। অ্যাডমিন প্যানেলে "জরুরি রেকর্ড" দেখুন।', 'Location was sent. See "Emergency records" in the admin panel.'),
  (94, false, 'সহায়তা তহবিলে নতুন আবেদন', 'New application to the help fund'),
  (95, false, 'অ্যাডমিন প্যানেলে "সহায়তা তহবিল" দেখুন।', 'See "Help fund" in the admin panel.'),
  (96, false, 'সহায়তা তহবিলে নতুন দান যাচাই বাকি', 'A new gift to the help fund needs checking'),
  (97, false, 'সহায়তা তহবিলে দানের অনুমতি চেয়েছেন', 'Someone asked permission to give to the help fund'),
  (98, false, 'অ্যাডমিন প্যানেলে "সহায়তা তহবিল" → "অনুমতি" দেখুন।', 'See "Help fund" → "Permission" in the admin panel.'),
  (99, false, 'আপনার সহায়তার আবেদন অনুমোদিত হয়েছে', 'Your application for help has been approved'),
  (100, false, 'আপনার সহায়তার আবেদন গ্রহণ করা যায়নি', 'Your application for help could not be accepted'),
  (101, false, 'তহবিলে টাকা জমা হলে Travel Adda আপনার সাথে যোগাযোগ করবে।', 'When the fund has money, Travel Adda will contact you.'),
  (102, false, 'আপনার দান তহবিলে জমা হয়েছে। আল্লাহ কবুল করুন।', 'Your gift has been added to the fund. May Allah accept it.'),
  (103, false, 'আপনার দানের টাকা মেলানো যায়নি', 'Your gift could not be matched'),
  (104, false, 'সহায়তা তহবিল থেকে আপনার জন্য টাকা দেওয়া হয়েছে', 'Money has been given to you from the help fund'),
  (105, false, 'সহায়তা তহবিলে দান করার অনুমতি পেয়েছেন', 'You have permission to give to the help fund'),
  (106, false, 'এখন "সহায়তা তহবিল" → "দান করুন" থেকে দান করতে পারবেন।', 'You can now give from "Help fund" → "Donate".'),
  (107, false, 'বিস্তারিত দেখতে অ্যাপ খুলুন', 'Open the app to see the details');

-- The English of one notice text, or null when there is no rule (then the Bengali is used).
create or replace function public.notice_to_en(p text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  if p is null or p = '' then return p; end if;
  if p !~ '[ঀ-৿]' then return p; end if;                  -- no Bengali: nothing to change
  select en into r from public.notice_en where not is_re and bn = p limit 1;
  if found then return r.en; end if;
  for r in select bn, en from public.notice_en where is_re order by ord loop
    if p ~ r.bn then return regexp_replace(p, r.bn, r.en); end if;
  end loop;
  return null;
exception when others then return null;
end $$;
revoke all on function public.notice_to_en(text) from public, anon, authenticated;

-- 3) The notification box in English -----------------------------------------------------------------------------------
-- Only my own notices (never anyone else's); at most 200 at a time. A notice with no English keeps its Bengali.
create or replace function public.my_notices_en(p_ids uuid[]) returns table (id uuid, title text, body text)
language sql stable security definer set search_path = '' as $$
  select n.id, coalesce(public.notice_to_en(n.title), n.title), coalesce(public.notice_to_en(n.body), n.body)
    from public.user_notifications n
   where n.user_id = (select auth.uid()) and n.id = any ((coalesce(p_ids, '{}'::uuid[]))[1:200]);
$$;
revoke all on function public.my_notices_en(uuid[]) from public, anon;
grant execute on function public.my_notices_en(uuid[]) to authenticated;

-- 4) Phone alerts in the person's language --------------------------------------------------------------------------
-- (Notices Travel Adda writes by hand go out as written; an English field for them comes with the admin step.)
create or replace function public.push_text_for(p_user uuid, p_title text) returns text[]
language sql stable security definer set search_path = '' as $$
  select case when (select lang from public.profiles where id = p_user) = 'en'
    then array[coalesce(public.notice_to_en(p_title), p_title), 'Open the app to see the details']
    else array[p_title, 'বিস্তারিত দেখতে অ্যাপ খুলুন'] end;
$$;
revoke all on function public.push_text_for(uuid, text) from public, anon, authenticated;

create or replace function public.trg_push_user_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v text[] := public.push_text_for(new.user_id, new.title);
begin
  perform public.push_send(array(select t.token from public.push_tokens t join public.profiles p on p.id = t.user_id
                                  where t.user_id = new.user_id and p.status = 'active'),
                           v[1], v[2], false);
  return new;
exception when others then return new;
end $$;
