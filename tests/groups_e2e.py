# End-to-end test of "my group & leader" with two dedicated CI accounts on the real database:
#   H = haji test account (01300000001), L = leader test account (01300000002).
# Phase A (L is not a leader yet): L applies to become a leader -> the owner approves it in the app (Admin page).
# Phase B (L is a leader): invite by phone, accept, package terms, agreement, emergency call button, remove,
#   "removed" code check, second group joined by code, leave. Screenshots go to shots-groups/.
import os, re, json, time
from playwright.sync_api import sync_playwright

OUT = 'shots-groups'; os.makedirs(OUT, exist_ok=True)
H = (os.environ['H_PHONE'], os.environ['H_PW'], 'পরীক্ষা ব্যবহারকারী CI')
L = (os.environ['L_PHONE'], os.environ['L_PW'], 'CI লিডার পরীক্ষা')
steps = []; result = {'phase': None, 'steps': steps, 'errors': []}

def shot(pg, name):
    pg.wait_for_timeout(700); pg.screenshot(path=f'{OUT}/{name}.png', full_page=True)

def step(name, ok, note=''):
    steps.append({'step': name, 'ok': bool(ok), 'note': note}); print(('PASS ' if ok else 'FAIL ') + name, note, flush=True)
    if not ok: raise SystemExit(f'step failed: {name}')

def has(pg, text, t=6000):
    try: pg.get_by_text(text).first.wait_for(timeout=t); return True
    except Exception: return False

def btn(pg, pattern):
    return pg.get_by_role('button', name=re.compile(pattern)).first

def login(ctx, who, tag):
    phone, pw, name = who
    pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept()); pg.on('pageerror', lambda e: result['errors'].append(f'{tag}: {e}'))
    pg.goto('http://localhost:8080/'); pg.wait_for_timeout(3000)
    for _ in range(3): pg.get_by_text('পরবর্তী', exact=True).first.click(); pg.wait_for_timeout(400)
    pg.get_by_text('শুরু করুন', exact=True).first.click(); pg.wait_for_timeout(800)
    pg.get_by_label('মোবাইল নম্বর').fill(phone); pg.get_by_label('পাসওয়ার্ড', exact=True).fill(pw)
    pg.get_by_text('লগইন করুন', exact=True).first.click(); pg.wait_for_timeout(4500)
    if pg.get_by_text('মেলেনি').count() > 0:    # first run: create the test account
        pg.get_by_text('নতুন অ্যাকাউন্ট', exact=True).first.click(); pg.wait_for_timeout(500)
        pg.get_by_label('আপনার নাম').fill(name); pg.get_by_label('মোবাইল নম্বর').fill(phone); pg.get_by_label('পাসওয়ার্ড', exact=True).fill(pw)
        pg.get_by_text('অ্যাকাউন্ট খুলুন', exact=True).first.click(); pg.wait_for_timeout(5000)
    pg.wait_for_timeout(1500)
    if pg.get_by_text('পরে তুলব', exact=True).count() > 0: pg.get_by_text('পরে তুলব', exact=True).first.click(); pg.wait_for_timeout(1500)
    step(f'{tag}: লগইন', pg.get_by_role('tab', name='হোম').count() > 0)
    return pg

def open_group(pg):
    pg.get_by_role('tab', name='হোম').click(); pg.wait_for_timeout(900)
    btn(pg, '^আমার দল ও লিডার খুলুন').click(); pg.wait_for_timeout(3000)

def read_code(pg):
    lab = pg.get_by_label(re.compile('^কোড ')).first.get_attribute('aria-label')
    return lab.replace('কোড', '').replace(' ', '')

with sync_playwright() as p:
    b = p.chromium.launch()
    mk = lambda: b.new_context(viewport={'width': 390, 'height': 780}, device_scale_factor=2, locale='bn-BD')
    try:
        lp = login(mk(), L, 'লিডার')
        open_group(lp); shot(lp, 'L01-group')
        if has(lp, 'শীঘ্রই চালু হবে', 2000):
            result['phase'] = 'db-missing'; step('ডেটাবেস ধাপ (SQL 004) চালানো হয়েছে', False, 'অ্যাপে এখনো "শীঘ্রই চালু হবে" দেখাচ্ছে')
        step('দল পাতা খুলেছে', has(lp, 'কোড দিয়ে দলে যোগ দিন'))

        if lp.get_by_role('button', name=re.compile('লিডার প্যানেল খুলুন$')).count() == 0:
            result['phase'] = 'A'
            if not has(lp, 'আপনার আবেদন যাচাই হচ্ছে', 1500):
                btn(lp, 'লিডার হতে আবেদন করুন$').click(); lp.wait_for_timeout(1000); shot(lp, 'L02-apply-form')
                btn(lp, 'আবেদন জমা দিন$').click(); lp.wait_for_timeout(600)
                step('খালি ফর্মে ভুল ধরা পড়ে', has(lp, 'এজেন্সির নাম লিখুন', 2000)); shot(lp, 'L03-apply-empty')
                lp.get_by_label('এজেন্সির নাম').fill('CI পরীক্ষা এজেন্সি (আসল নয়)')
                lp.get_by_label('এজেন্সির লাইসেন্স নম্বর').fill('CI-TEST-0001')
                with lp.expect_file_chooser() as fc: btn(lp, 'ফোন থেকে ফাইল বাছুন$').click()
                fc.value.set_files('assets/ihram/ihram-man.png'); lp.wait_for_timeout(800); shot(lp, 'L04-apply-filled')
                btn(lp, 'আবেদন জমা দিন$').click(); lp.wait_for_timeout(6000); shot(lp, 'L05-apply-done')
                step('লিডার আবেদন জমা হয়েছে', has(lp, 'আবেদন জমা হয়েছে'))
                open_group(lp)
            shot(lp, 'L06-pending'); step('আবেদন "যাচাই হচ্ছে" দেখাচ্ছে', has(lp, 'আপনার আবেদন যাচাই হচ্ছে'))
            result['next'] = 'অ্যাডমিনকে অ্যাপের অ্যাডমিন পাতা থেকে "CI লিডার পরীক্ষা" আবেদনটি অনুমোদন দিতে হবে'
        else:
            result['phase'] = 'B'
            hp = login(mk(), H, 'হাজী')
            open_group(hp); shot(hp, 'H01-group-start')
            for _ in range(5):   # leftovers from an earlier run
                if hp.get_by_role('button', name='দল ছেড়ে দিন').count() == 0: break
                hp.get_by_role('button', name='দল ছেড়ে দিন').first.click(); hp.wait_for_timeout(3000)

            # Group 1: invite by phone
            stamp = time.strftime('%d%m-%H%M')
            btn(lp, 'লিডার প্যানেল খুলুন$').click(); lp.wait_for_timeout(2500); shot(lp, 'L10-panel')
            lp.get_by_label('দলের নাম').fill(f'CI দল ক {stamp}'); btn(lp, 'দল বানান$').click(); lp.wait_for_timeout(4000)
            code1 = read_code(lp); shot(lp, 'L11-group1-created')
            step('দল ১ তৈরি ও কোড দেখা যায়', re.fullmatch(r'[A-Z2-9]{8}', code1 or '') is not None, code1)
            lp.get_by_label('হাজীর মোবাইল নম্বর').fill('0130000000'); btn(lp, 'আমন্ত্রণ পাঠান$').click(); lp.wait_for_timeout(700)
            step('ভুল নম্বরে আমন্ত্রণ আটকায়', has(lp, 'সঠিক ১১ সংখ্যার', 2000))
            lp.get_by_label('হাজীর মোবাইল নম্বর').fill(H[0]); btn(lp, 'আমন্ত্রণ পাঠান$').click(); lp.wait_for_timeout(4000); shot(lp, 'L12-invited')
            step('আমন্ত্রণ পাঠানো হয়েছে', has(lp, 'আমন্ত্রণ পাঠানো হয়েছে।'))

            open_group(hp); shot(hp, 'H02-invite')
            step('হাজী আমন্ত্রণ দেখছেন', has(hp, 'দলে যোগ দেওয়ার আমন্ত্রণ'))
            btn(hp, 'রাজি, যোগ দিন$').click(); hp.wait_for_timeout(4000); shot(hp, 'H03-joined')
            step('হাজী দলে যোগ দিয়েছেন, লিডারের নাম ও ফোন বাটন আছে', has(hp, f'CI দল ক {stamp}') and hp.get_by_role('button', name=re.compile('^লিডারকে ফোন করুন')).count() > 0)

            # Package terms
            btn(lp, 'নতুন শর্ত লিখুন$').click(); lp.wait_for_timeout(800)
            btn(lp, 'শর্ত সংরক্ষণ করুন$').click(); lp.wait_for_timeout(600)
            step('শর্তের খালি ফর্মে ভুল ধরা পড়ে', has(lp, 'প্যাকেজের নাম লিখুন', 2000)); shot(lp, 'L13-terms-empty')
            lp.get_by_label('প্যাকেজের নাম').fill('CI পরীক্ষা ওমরাহ প্যাকেজ')
            lp.get_by_label('জনপ্রতি মোট দাম (টাকা)').fill('১৫০০০০')
            lp.get_by_label('প্যাকেজে যা আছে').fill('বিমান টিকেট, ভিসা, হারাম থেকে ৫০০ মিটার দূরে হোটেল, সকালের নাশতা')
            lp.get_by_label('যা নেই (ইচ্ছা করলে)').fill('ব্যক্তিগত খরচ')
            lp.get_by_label('যাওয়ার তারিখ (ইচ্ছা করলে)').fill('২০-০১-২০২৭'); lp.get_by_label('ফেরার তারিখ (ইচ্ছা করলে)').fill('১০-০১-২০২৭')
            lp.get_by_label('বাতিল ও টাকা ফেরতের নিয়ম').fill('ভিসার আগে বাতিল করলে পুরো টাকা ফেরত, ভিসার পরে ভিসার খরচ বাদে')
            btn(lp, 'শর্ত সংরক্ষণ করুন$').click(); lp.wait_for_timeout(700)
            step('উল্টো তারিখ আটকায়', has(lp, 'ফেরার তারিখ যাওয়ার তারিখের পরে', 2000))
            lp.get_by_label('ফেরার তারিখ (ইচ্ছা করলে)').fill('০৫-০২-২০২৭'); shot(lp, 'L14-terms-filled')
            btn(lp, 'শর্ত সংরক্ষণ করুন$').click(); lp.wait_for_timeout(5000); shot(lp, 'L15-terms-saved')
            step('শর্ত সংরক্ষণ হয়েছে', has(lp, 'শর্ত সংরক্ষণ হয়েছে'))

            btn(hp, 'প্যাকেজের শর্ত ও সম্মতি$').click(); hp.wait_for_timeout(3000); shot(hp, 'H04-terms')
            step('হাজী শর্ত পড়তে পারছেন (দাম বাংলায়)', has(hp, 'CI পরীক্ষা ওমরাহ প্যাকেজ') and has(hp, '১,৫০,০০০ টাকা', 2000))
            btn(hp, 'আমি পড়েছি ও সম্মত$').click(); hp.wait_for_timeout(4000); shot(hp, 'H05-agreed')
            step('হাজীর সম্মতি সংরক্ষণ হয়েছে', has(hp, 'আপনি সম্মতি দিয়েছেন'))
            btn(hp, 'দলের পাতায় ফিরে যান').click(); hp.wait_for_timeout(1500)

            hp.get_by_role('tab', name='জরুরি').click(); hp.wait_for_timeout(3500); shot(hp, 'H06-emergency')
            step('জরুরি পাতায় দলের লিডারকে ফোনের বাটন', hp.get_by_role('button', name=re.compile('লিডারকে ফোন করুন \\(CI লিডার')).count() > 0)

            btn(lp, 'লিডার প্যানেলে ফিরে যান').click(); lp.wait_for_timeout(2500)
            btn(lp, f'CI দল ক {stamp} দল খুলুন').click(); lp.wait_for_timeout(4000); shot(lp, 'L16-members-acceptance')
            step('লিডার সদস্য ও সম্মতি দেখছেন', has(lp, 'সদস্য: ১ জন') and has(lp, 'সম্মতি দিয়েছেন: ১ জন'))

            lp.get_by_role('button', name=re.compile('-কে দল থেকে সরান$')).first.click(); lp.wait_for_timeout(4000); shot(lp, 'L17-removed')
            step('লিডার সদস্যকে সরিয়েছেন', has(lp, 'সরানো হয়েছে।'))
            open_group(hp)
            hp.get_by_label('লিডারের দেওয়া কোড').fill(code1); btn(hp, 'দলে যোগ দিন$').click(); hp.wait_for_timeout(4000); shot(hp, 'H07-removed-code')
            step('সরানো হাজী কোড দিয়ে আবার ঢুকতে পারেন না', has(hp, 'সরিয়ে দিয়েছেন'))
            hp.get_by_label('লিডারের দেওয়া কোড').fill('ZZZZ2222'); btn(hp, 'দলে যোগ দিন$').click(); hp.wait_for_timeout(4000)
            step('ভুল কোডে "দল পাওয়া যায়নি"', has(hp, 'কোনো দল পাওয়া যায়নি'))

            # Group 2: join with code, then leave
            btn(lp, 'লিডার প্যানেলে ফিরে যান').click(); lp.wait_for_timeout(2500)
            lp.get_by_label('দলের নাম').fill(f'CI দল খ {stamp}'); btn(lp, 'দল বানান$').click(); lp.wait_for_timeout(4000)
            code2 = read_code(lp)
            hp.get_by_label('লিডারের দেওয়া কোড').fill(code2.lower()); btn(hp, 'দলে যোগ দিন$').click(); hp.wait_for_timeout(4000); shot(hp, 'H08-joined-by-code')
            step('কোড দিয়ে দলে যোগ (ছোট হাতের অক্ষরেও)', has(hp, 'দলে যোগ দেওয়া হয়েছে।') and has(hp, f'CI দল খ {stamp}'))
            hp.get_by_role('button', name='দল ছেড়ে দিন').first.click(); hp.wait_for_timeout(4000); shot(hp, 'H09-left')
            step('হাজী দল ছেড়ে দিয়েছেন', has(hp, 'দল ছেড়ে দেওয়া হয়েছে।'))
            result['groups'] = [f'CI দল ক {stamp}', f'CI দল খ {stamp}']
    except SystemExit as e:
        result['failed'] = str(e)
    except Exception as e:
        result['failed'] = f'{type(e).__name__}: {e}'
    b.close()
json.dump(result, open(f'{OUT}/result.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps(result, ensure_ascii=False, indent=1))
if result.get('failed') or result['errors']: raise SystemExit(1)
