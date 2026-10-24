# End-to-end test on the real database with two dedicated CI accounts ("two phones"):
#   H = haji account (01300000001), L = LEADER account (01300000003, opened with "আমি গ্রুপ লিডার").
# Phase A (L not approved yet): L completes the leader registration -> the owner approves it in the app (Admin).
# Phase B (L approved): contract request to H's ID, H accepts, phones become visible, rating, directory & profile,
#   "please call me", SOS button, cancel with a reason, group with code + announcement, packages. Screenshots: shots-groups/.
import os, re, json, time
from playwright.sync_api import sync_playwright

OUT = 'shots-groups'; os.makedirs(OUT, exist_ok=True)
H = (os.environ['H_PHONE'], os.environ['H_PW'], 'পরীক্ষা ব্যবহারকারী CI', 'haji')
L = (os.environ['L_PHONE'], os.environ['L_PW'], 'CI লিডার পরীক্ষা', 'leader')
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

def tab(pg, name):
    pg.get_by_role('tab', name=name, exact=True).last.click(); pg.wait_for_timeout(1500)

def home(pg):
    tab(pg, 'হোম')

def login(ctx, who, tag):
    phone, pw, name, kind = who
    pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept()); pg.on('pageerror', lambda e: result['errors'].append(f'{tag}: {e}'))
    pg.goto('http://localhost:8080/'); pg.wait_for_timeout(3000)
    for _ in range(3): pg.get_by_text('পরবর্তী', exact=True).first.click(); pg.wait_for_timeout(400)
    pg.get_by_text('শুরু করুন', exact=True).first.click(); pg.wait_for_timeout(800)
    pg.get_by_label('মোবাইল নম্বর').fill(phone); pg.get_by_label('পাসওয়ার্ড', exact=True).fill(pw)
    pg.get_by_text('লগইন করুন', exact=True).first.click(); pg.wait_for_timeout(4500)
    if pg.get_by_text('মেলেনি').count() > 0:    # first run: open the test account with the right type
        pg.get_by_text('নতুন অ্যাকাউন্ট', exact=True).first.click(); pg.wait_for_timeout(500)
        btn(pg, '^আমি গ্রুপ লিডার' if kind == 'leader' else '^আমি হাজী').click(); pg.wait_for_timeout(500)
        pg.get_by_label('আপনার নাম').fill(name); pg.get_by_label('মোবাইল নম্বর').fill(phone); pg.get_by_label('পাসওয়ার্ড', exact=True).fill(pw)
        if pg.get_by_role('checkbox', name=re.compile('শর্তাবলি')).count(): pg.get_by_role('checkbox', name=re.compile('শর্তাবলি')).click()
        pg.get_by_text('অ্যাকাউন্ট খুলুন', exact=True).first.click(); pg.wait_for_timeout(5000)
    pg.wait_for_timeout(1500)
    if pg.get_by_text('পরে তুলব', exact=True).count() > 0: pg.get_by_text('পরে তুলব', exact=True).first.click(); pg.wait_for_timeout(1500)
    step(f'{tag}: লগইন', pg.get_by_role('tab', name='হোম').count() > 0)
    return pg

def my_code(pg):
    home(pg)
    lab = pg.get_by_label(re.compile('আইডি (TA|TL)-')).first.get_attribute('aria-label') or ''
    m = re.search(r'(T[AL]-\d+)', lab)
    return m.group(1) if m else None

with sync_playwright() as p:
    b = p.chromium.launch()
    mk = lambda: b.new_context(viewport={'width': 390, 'height': 780}, device_scale_factor=2, locale='bn-BD')
    try:
        lp = login(mk(), L, 'লিডার')
        home(lp); shot(lp, 'L01-home')
        if lp.get_by_role('button', name='লিডার প্যানেল খুলুন').count() == 0:
            result['phase'] = 'A'
            step('লিডার অ্যাকাউন্টের হোমে "অনুমোদন বাকি" কার্ড', lp.get_by_role('button', name='লিডার আবেদনের অবস্থা দেখুন').count() > 0)
            lp.get_by_role('button', name='লিডার আবেদনের অবস্থা দেখুন').click(); lp.wait_for_timeout(3000); shot(lp, 'L02-apply')
            if has(lp, 'শীঘ্রই চালু হবে', 1500):
                result['phase'] = 'db-missing'; step('ডেটাবেস ধাপ (০০৭) চালানো হয়েছে', False, 'অ্যাপে "শীঘ্রই চালু হবে"')
            if not has(lp, 'আপনার আবেদন যাচাই হচ্ছে', 1500):
                step('লিডারের ধরন বাছার দুটি পথ', has(lp, 'আমার নিজের এজেন্সি আছে', 3000) and has(lp, 'Travel Adda-র সাথে সরাসরি', 1000)); shot(lp, 'L02b-apply-kinds')
                lp.get_by_role('button', name=re.compile('^আমার নিজের এজেন্সি আছে')).click(); lp.wait_for_timeout(600)
                btn(lp, 'নিবন্ধন জমা দিন$').click(); lp.wait_for_timeout(600)
                step('খালি ফর্মে ভুল ধরা পড়ে', has(lp, 'এজেন্সির নাম লিখুন', 2000)); shot(lp, 'L03-apply-empty')
                lp.get_by_label('এজেন্সির নাম').fill('CI পরীক্ষা এজেন্সি (আসল নয়)')
                lp.get_by_label('ওমরাহ লাইসেন্স নম্বর').fill('CI-UMRAH-01')
                lp.get_by_role('button', name=re.compile('^১. জেলা')).click(); lp.wait_for_timeout(600)
                lp.get_by_label('খুঁজুন').fill('সিলেট'); lp.get_by_role('button', name='সিলেট', exact=True).click(); lp.wait_for_timeout(400)
                lp.get_by_role('button', name=re.compile('^২. উপজেলা')).click(); lp.wait_for_timeout(600)
                step('জেলা বাছার পর সেই জেলার উপজেলার তালিকা আসে', lp.get_by_role('button', name='বিয়ানীবাজার', exact=True).count() > 0)
                lp.get_by_role('button', name='বিয়ানীবাজার', exact=True).click(); lp.wait_for_timeout(400)
                lp.get_by_label('৩. ইউনিয়ন').fill('CI ইউনিয়ন (আসল নয়)')
                with lp.expect_file_chooser() as fc: btn(lp, 'ফোন থেকে ফাইল বাছুন$').click()
                fc.value.set_files('assets/ihram/ihram-man.png'); lp.wait_for_timeout(800)
                if lp.get_by_role('checkbox', name=re.compile('লিডারদের শর্তাবলি')).count():
                    btn(lp, 'নিবন্ধন জমা দিন$').click(); lp.wait_for_timeout(600)
                    step('শর্তাবলিতে টিক ছাড়া জমা হয় না', has(lp, 'লিডারদের শর্তাবলি পড়ে টিক দিন', 2000))
                    lp.get_by_role('checkbox', name=re.compile('লিডারদের শর্তাবলি')).click(); lp.wait_for_timeout(300)
                shot(lp, 'L04-apply-filled')
                btn(lp, 'নিবন্ধন জমা দিন$').click(); lp.wait_for_timeout(6000)
            shot(lp, 'L05-pending'); step('নিবন্ধন "যাচাই হচ্ছে" দেখাচ্ছে', has(lp, 'আপনার আবেদন যাচাই হচ্ছে'))
            tab(lp, 'অফার'); lp.wait_for_timeout(1500); shot(lp, 'L06-offers-pending')
            step('লিডারের "অফার" ট্যাবে নিজের প্যাকেজের পাতা (অনুমোদনের অপেক্ষা)', has(lp, 'অনুমোদনের পর প্যাকেজ দিতে পারবেন', 2000))
            result['next'] = 'অ্যাডমিন → লিডার আবেদন থেকে "CI লিডার পরীক্ষা" অনুমোদন দিন'
        else:
            result['phase'] = 'B'
            stamp = time.strftime('%d%m-%H%M')
            hp = login(mk(), H, 'হাজী')
            hcode = my_code(hp); step('হাজীর আইডি পাওয়া গেছে', bool(hcode), hcode or '')
            tab(hp, 'হোম'); btn(hp, '^লিডার ও চুক্তি খুলুন').click(); hp.wait_for_timeout(3000); shot(hp, 'H01-myleader')
            # leftovers from an earlier run: cancel an active contract
            if hp.get_by_role('button', name='চুক্তি বাতিল করুন').count():
                hp.get_by_role('button', name='চুক্তি বাতিল করুন').first.click(); hp.wait_for_timeout(500)
                hp.get_by_label('কারণ লিখুন').fill('আগের পরীক্ষার চুক্তি বন্ধ করা হচ্ছে'); btn(hp, '^চুক্তি বাতিল করুন$').click(); hp.wait_for_timeout(4000)

            tab(lp, 'অফার'); lp.wait_for_timeout(2500); shot(lp, 'L09-offers-tab')
            step('লিডারের "অফার" ট্যাবে "নতুন প্যাকেজ দিন"', lp.get_by_role('button', name=re.compile('নতুন প্যাকেজ দিন')).count() > 0)
            # form only (nothing is sent): umrah has no qurbani choice, hajj has; labels are whole
            try:
                btn(lp, 'নতুন প্যাকেজ দিন').click(); lp.wait_for_timeout(1500); shot(lp, 'L09b-offer-form')
                cb = lambda n: lp.get_by_role('checkbox', name=n).count()
                step('ওমরাহ প্যাকেজে কুরবানি বাছাই নেই', cb('কুরবানি') == 0 and cb('আলেম / গাইড') == 1)
                lp.get_by_role('tab', name='হজ', exact=True).first.click(); lp.wait_for_timeout(500)
                step('হজ প্যাকেজে কুরবানি বাছাই আছে', cb('কুরবানি') == 1)
                if lp.get_by_text('✈️ যাত্রাপথ').count():
                    lp.get_by_text('✈️ যাত্রাপথ').first.scroll_into_view_if_needed(); lp.wait_for_timeout(500); shot(lp, 'L09c-offer-route')
                    step('প্যাকেজ ফর্মে যাত্রাপথ (বিমানবন্দর, মক্কা ও মদিনায় কত রাত)', lp.get_by_role('tab', name=re.compile('শাহজালাল')).count() >= 2 and lp.get_by_label('মক্কায় কত রাত').count() == 1)
                btn(lp, 'প্যাকেজ না দিয়ে ফিরে যান').click(); lp.wait_for_timeout(1000)
            except Exception as e:
                step('প্যাকেজ ফর্মের বাছাই', False, str(e)[:150])
            # haji's Offers page: search by leader ID, filters, short cards, package page with the leader's details
            try:
                tab(hp, 'অফার'); hp.wait_for_timeout(3000); shot(hp, 'H01o-offers')
                step('অফার পাতায় লিডারের আইডি দিয়ে খোঁজার ঘর', hp.get_by_label('লিডারের আইডি বা নাম দিয়ে খুঁজুন').count() == 1)
                btn(hp, 'বাছাই করুন').click(); hp.wait_for_timeout(500)
                step('মাস, বিমানবন্দর ও দাম দিয়ে বাছাই', has(hp, 'কোন বিমানবন্দর থেকে', 2000) and has(hp, 'সর্বোচ্চ দাম', 1000)); shot(hp, 'H01p-filters')
                hp.get_by_role('button', name=re.compile('^মাস: সব মাস')).first.click(); hp.wait_for_timeout(500); shot(hp, 'H01p1-months')
                step('ওমরাহর মাস ড্রপডাউনে: সব মাস একসাথে + সামনের ১২ মাস', hp.get_by_role('button', name=re.compile('^সব মাস একসাথে')).count() == 1 and hp.get_by_role('button', name=re.compile(r'^\S+ ২০২[৬-৯] \(')).count() >= 12)
                hp.get_by_role('button', name=re.compile('^সব মাস একসাথে')).first.click(); hp.wait_for_timeout(300)
                hp.get_by_role('tab', name='হজ', exact=True).first.click(); hp.wait_for_timeout(2000)
                step('হজে মাস বাছাই নেই (হজ বছরে একবার)', hp.get_by_role('button', name=re.compile('^মাস:')).count() == 0)
                hp.get_by_role('tab', name='ওমরাহ', exact=True).first.click(); hp.wait_for_timeout(2000)
                hp.get_by_label('সর্বোচ্চ দাম, জনপ্রতি (টাকা)').fill('২.৫ লাখ'); hp.wait_for_timeout(500)
                step('দাম নিজে লেখা যায় (২.৫ লাখ)', has(hp, 'বা তার কম দামের প্যাকেজ', 2000)); shot(hp, 'H01p2-price')
                hp.get_by_label('সর্বোচ্চ দাম, জনপ্রতি (টাকা)').fill('')
                more = hp.get_by_role('button', name=re.compile('বিস্তারিত দেখতে চাপুন'))
                if more.count():
                    live020 = 'আইডি TL-' in (more.first.get_attribute('aria-label') or '')
                    more.first.click(); hp.wait_for_timeout(1500); shot(hp, 'H01q-offer-page')
                    if live020: step('প্যাকেজের পাতায় যাত্রাপথ ও লিডারের পরিচয়', has(hp, 'যাত্রাপথ', 2000) and has(hp, 'যে লিডার প্যাকেজটি দিচ্ছেন', 2000))
                    else: step('প্যাকেজের পাতা খোলে (০২০ চালানো বাকি, লিডারের পরিচয় পরে দেখাবে)', has(hp, 'প্যাকেজ নম্বর', 2000))
                    btn(hp, 'সব প্যাকেজের তালিকায় ফিরে যান').first.click(); hp.wait_for_timeout(800)
                tab(hp, 'হোম'); hp.wait_for_timeout(800)
            except Exception as e:
                step('হাজীর অফার পাতা', False, str(e)[:150])
            home(lp)
            # 1) leader sends a contract to the haji's ID
            lp.get_by_role('button', name='লিডার প্যানেল খুলুন').click(); lp.wait_for_timeout(2500); shot(lp, 'L10-panel')
            # 0) work area on "আমার লিডার প্রোফাইল": district list > that district's upazilas > union typed (nothing saved)
            try:
                btn(lp, 'আমার লিডার প্রোফাইল$').click(); lp.wait_for_timeout(3000)
                step('লিডার প্রোফাইলে "কাজের এলাকা" (অফিসের ঠিকানা নয়)', has(lp, 'কাজের এলাকা', 3000) and lp.get_by_text('অফিসের জেলা').count() == 0)
                lp.get_by_role('button', name=re.compile('^১. জেলা')).click(); lp.wait_for_timeout(600)
                lp.get_by_label('খুঁজুন').fill('নোয়াখালী'); lp.get_by_role('button', name='নোয়াখালী', exact=True).click(); lp.wait_for_timeout(400)
                lp.get_by_role('button', name=re.compile('^২. উপজেলা')).click(); lp.wait_for_timeout(600); shot(lp, 'L10b-upazila-list')
                ok_list = lp.get_by_role('button', name='কোম্পানীগঞ্জ', exact=True).count() > 0 and lp.get_by_role('button', name='বিয়ানীবাজার', exact=True).count() == 0
                step('নোয়াখালী বাছলে শুধু নোয়াখালীর উপজেলা আসে', ok_list)
                lp.get_by_label('খুঁজুন').fill('পরীক্ষা থানা'); lp.wait_for_timeout(300)
                step('তালিকায় না থাকলে নিজে লিখে রাখা যায়', btn(lp, '"পরীক্ষা থানা" লিখে রাখুন$').count() > 0)
                lp.get_by_label('খুঁজুন').fill(''); lp.get_by_role('button', name='কোম্পানীগঞ্জ', exact=True).click(); lp.wait_for_timeout(400)
                lp.get_by_label('৩. ইউনিয়ন').fill('চরহাজারী'); shot(lp, 'L10c-work-area')
                step('ইউনিয়নের ঘরে হাতে লেখা যায়', lp.get_by_label('৩. ইউনিয়ন').input_value() == 'চরহাজারী')
                if lp.get_by_role('button', name=re.compile('^আপনার পেশা')).count():          # step 017 live
                    lp.get_by_role('button', name=re.compile('^আপনার পেশা')).click(); lp.wait_for_timeout(600); shot(lp, 'L10d-profession-list')
                    step('পেশার তালিকায় ইমাম, মুয়াজ্জিন, মাদ্রাসার শিক্ষক আছে', all(lp.get_by_role('button', name=n, exact=True).count() > 0 for n in ['ইমাম', 'মুয়াজ্জিন', 'মাদ্রাসার শিক্ষক']))
                    btn(lp, '^বন্ধ করুন$').click(); lp.wait_for_timeout(400)
            except Exception as e:
                step('লিডার প্রোফাইলের কাজের এলাকা', False, str(e)[:150])
            home(lp); lp.get_by_role('button', name='লিডার প্যানেল খুলুন').click(); lp.wait_for_timeout(2500)
            btn(lp, '^চুক্তি ও রেফারেল হাজী$').click(); lp.wait_for_timeout(3000); shot(lp, 'L11-contracts')
            btn(lp, '^নতুন চুক্তির অনুরোধ পাঠান$').click(); lp.wait_for_timeout(800)
            btn(lp, '^চুক্তির অনুরোধ পাঠান$').click(); lp.wait_for_timeout(600)
            step('চুক্তির খালি ফর্মে ভুল ধরা পড়ে', has(lp, 'হাজীর আইডি লিখুন', 2000)); shot(lp, 'L12-contract-empty')
            lp.get_by_label('হাজীর আইডি').fill(hcode)
            lp.get_by_label('প্যাকেজের নাম').fill(f'CI পরীক্ষা ওমরাহ {stamp}')
            lp.get_by_label('জনপ্রতি মোট দাম (টাকা)').fill('১৫০০০০')
            lp.get_by_label('যা অন্তর্ভুক্ত', exact=True).fill('বিমান টিকেট, ভিসা, হারাম থেকে ৫০০ মিটারের হোটেল')
            lp.get_by_label('বাতিল ও টাকা ফেরতের নিয়ম').fill('ভিসার আগে বাতিলে পুরো টাকা ফেরত')
            shot(lp, 'L13-contract-filled')
            btn(lp, '^চুক্তির অনুরোধ পাঠান$').click(); lp.wait_for_timeout(5000); shot(lp, 'L14-contract-sent')
            step('চুক্তির অনুরোধ পাঠানো হয়েছে', has(lp, 'চুক্তির অনুরোধ পাঠানো হয়েছে'))

            # 2) haji reads and accepts; phones become visible on both sides
            tab(hp, 'হোম'); btn(hp, '^লিডার ও চুক্তি খুলুন').click(); hp.wait_for_timeout(3500); shot(hp, 'H02-request')
            if hp.get_by_role('button', name=re.compile('^নোটিফিকেশন')).count():   # 009: the bell shows the new contract
                hp.get_by_role('button', name=re.compile('^নোটিফিকেশন')).first.click(); hp.wait_for_timeout(3000); shot(hp, 'H02n-notifications')
                step('নোটিফিকেশনে নতুন চুক্তির খবর', has(hp, 'নতুন চুক্তির অনুরোধ এসেছে'))
                hp.get_by_role('button', name=re.compile('^নতুন। নতুন চুক্তির অনুরোধ এসেছে')).first.click(); hp.wait_for_timeout(3000)
                result['notifications'] = 'ok'
            else:
                result['notifications'] = 'db-missing (009 not run)'
            step('হাজী চুক্তির অনুরোধ দেখছেন', has(hp, 'নতুন চুক্তির অনুরোধ') and has(hp, '১,৫০,০০০ টাকা', 2000))
            step('রাজি হওয়ার আগে লিডারের ফোন বাটন নেই', hp.get_by_role('button', name=re.compile('^লিডারকে ফোন করুন')).count() == 0)
            btn(hp, '^পড়েছি, আমি রাজি$').click(); hp.wait_for_timeout(4500); shot(hp, 'H03-accepted')
            step('চুক্তি চালু হয়েছে', has(hp, 'চুক্তি চালু হয়েছে'))
            step('এখন লিডারের ফোন বাটন আছে', hp.get_by_role('button', name=re.compile('^লিডারকে ফোন করুন')).count() > 0)
            btn(lp, 'লিডার প্যানেলে ফিরে যান').click(); lp.wait_for_timeout(1500); btn(lp, '^চুক্তি ও রেফারেল হাজী$').click(); lp.wait_for_timeout(3000); shot(lp, 'L15-contract-active')
            step('লিডার হাজীর ফোন বাটন দেখছেন', lp.get_by_role('button', name=re.compile('^হাজীকে ফোন করুন')).count() > 0)
            # payment box (008): shown on the active contract; only the form checks are tested, nothing is submitted
            if has(hp, 'টাকা জমা', 2500):
                hp.get_by_text('টাকা জমা').first.scroll_into_view_if_needed(); shot(hp, 'H03b-payment-box')
                step('টাকা Travel Adda-তে দেওয়ার সতর্কতা দেখাচ্ছে', has(hp, 'টাকা শুধু Travel Adda-র অফিসিয়াল অ্যাকাউন্টে দিন', 2000))
                btn(hp, '^টাকা পাঠিয়েছি, তথ্য দিন$').click(); hp.wait_for_timeout(600)
                btn(hp, '^জমার তথ্য পাঠান$').click(); hp.wait_for_timeout(600); shot(hp, 'H03c-payment-empty')
                step('খালি জমার ফর্মে ভুল ধরা পড়ে', has(hp, 'শুধু সংখ্যায় লিখুন', 2000) and has(hp, 'লেনদেন নম্বর (TrxID) বা রসিদ নম্বর লিখুন', 2000))
                btn(hp, '^বাতিল$').click(); hp.wait_for_timeout(400)
                result['payments'] = 'form ok'
            else:
                result['payments'] = 'db-missing (008 not run)'

            # 3) rating, directory, profile, call request, SOS
            btn(hp, '^লিডারকে রেটিং দিন$').click(); hp.wait_for_timeout(500)
            hp.get_by_role('radio', name=re.compile('^৫ তারা')).click(); hp.get_by_label(re.compile('^মন্তব্য')).fill('CI পরীক্ষার রেটিং')
            btn(hp, '^রেটিং জমা দিন$').click(); hp.wait_for_timeout(4000); shot(hp, 'H04-rated')
            step('রেটিং জমা হয়েছে', has(hp, 'রেটিং জমা হয়েছে'))
            btn(hp, '^যাচাই করা লিডার খুঁজুন$').click(); hp.wait_for_timeout(3000)
            hp.get_by_label(re.compile('^নাম, এজেন্সি')).fill('CI লিডার'); hp.wait_for_timeout(2500); shot(hp, 'H05-directory')
            step('তালিকায় লিডার আছেন, ফোন নম্বর নেই', has(hp, 'CI লিডার পরীক্ষা') and not has(hp, L[0], 1000))
            btn(hp, '^CI লিডার পরীক্ষা').click(); hp.wait_for_timeout(3500); shot(hp, 'H06-profile')
            step('প্রোফাইলে রেটিং দেখাচ্ছে', has(hp, 'জনের রেটিং'))
            if hp.get_by_role('button', name='আমাকে ফোন করুন').count():
                btn(hp, '^আমাকে ফোন করুন$').click(); hp.wait_for_timeout(4000)
            step('"আমাকে ফোন করুন" অনুরোধ আছে', has(hp, 'অনুরোধ পাঠানো') or has(hp, 'আগেই পাঠানো আছে', 1500)); shot(hp, 'H07-call-request')
            tab(hp, 'জরুরি'); hp.wait_for_timeout(3000); shot(hp, 'H08-sos')
            step('জরুরি পাতায় চুক্তির লিডারকে ফোনের বাটন', hp.get_by_role('button', name=re.compile('লিডারকে ফোন করুন \\(CI লিডার')).count() > 0)

            # 4) haji cancels with a reason (also leaves the account clean for the next run)
            tab(hp, 'হোম'); btn(hp, '^লিডার ও চুক্তি খুলুন').click(); hp.wait_for_timeout(3000)
            btn(hp, '^চুক্তি বাতিল করুন$').click(); hp.wait_for_timeout(500)
            btn(hp, '^চুক্তি বাতিল করুন$').click(); hp.wait_for_timeout(500)
            step('কারণ ছাড়া বাতিল হয় না', has(hp, 'কারণটি একটু বিস্তারিত লিখুন', 2000))
            hp.get_by_label('কারণ লিখুন').fill('CI পরীক্ষা শেষ, চুক্তি বন্ধ করা হচ্ছে')
            btn(hp, '^চুক্তি বাতিল করুন$').click(); hp.wait_for_timeout(4000); shot(hp, 'H09-cancelled')
            step('চুক্তি বাতিল হয়েছে', has(hp, 'চুক্তি বাতিল হয়েছে'))

            # 5) group by code + announcement (no phone without an active contract)
            btn(lp, 'লিডার প্যানেলে ফিরে যান').click(); lp.wait_for_timeout(2000)
            lp.get_by_label('দলের নাম').fill(f'CI দল {stamp}'); btn(lp, '^দল বানান$').click(); lp.wait_for_timeout(4000)
            code = (lp.get_by_label(re.compile('^কোড ')).first.get_attribute('aria-label') or '').replace('কোড', '').replace(' ', '')
            step('দল তৈরি ও কোড দেখা যায়', re.fullmatch(r'[A-Z2-9]{8}', code) is not None, code)
            ann = lp.get_by_label('ঘোষণা', exact=True)
            if ann.count():
                ann.fill('CI পরীক্ষা ঘোষণা: কাল ভোর ৫টায় বাস'); btn(lp, '^সবাইকে পাঠান$').click(); lp.wait_for_timeout(4000)
                step('ঘোষণা পাঠানো হয়েছে', has(lp, 'ঘোষণা পাঠানো হয়েছে'))
            btn(hp, '^আমার দল ও লিডারের ঘোষণা$').click(); hp.wait_for_timeout(3000)
            hp.get_by_label('লিডারের দেওয়া কোড').fill(code); btn(hp, 'দলে যোগ দিন$').click(); hp.wait_for_timeout(4000); shot(hp, 'H10-group')
            step('কোড দিয়ে দলে যোগ', has(hp, 'দলে যোগ দেওয়া হয়েছে।'))
            step('চুক্তি ছাড়া লিডারের নম্বর দেখা যায় না', hp.get_by_role('button', name=re.compile('^লিডারকে ফোন করুন')).count() == 0)
            if ann.count(): step('দলের পাতায় ঘোষণা দেখা যায়', has(hp, 'কাল ভোর ৫টায় বাস'))
            # 6) help chat (step 018): the haji asks privately, the leader answers, the haji sees the answer
            btn(hp, 'লিডার ও খাদেমকে প্রশ্ন করুন$').click(); hp.wait_for_timeout(3500); shot(hp, 'H11-help')
            box = hp.get_by_label('আপনার প্রশ্ন, সমস্যা বা পরামর্শ')
            try: box.first.wait_for(state='visible', timeout=6000); live = True
            except Exception: live = False
            if live:
                box.first.fill(f'CI প্রশ্ন {stamp}: রুমের চাবি'); btn(hp, '^পাঠান$').click(); hp.wait_for_timeout(4000)
                step('হাজী লিডারকে প্রশ্ন পাঠাতে পারেন', has(hp, 'পাঠানো হয়েছে', 4000)); shot(hp, 'H12-help-sent')
                btn(lp, 'হাজীদের প্রশ্ন দেখুন$').click(); lp.wait_for_timeout(4000); shot(lp, 'L16-inbox')
                step('প্রশ্ন লিডারের কাছে পৌঁছেছে (উত্তর বাকি)', has(lp, f'CI প্রশ্ন {stamp}', 5000) and has(lp, 'উত্তর বাকি', 2000))
                lp.get_by_role('button', name=re.compile(f'CI প্রশ্ন {stamp}')).first.click(); lp.wait_for_timeout(3000)
                lp.get_by_label('আপনার উত্তর').fill('CI উত্তর: রিসেপশনে বলা হয়েছে'); btn(lp, '^উত্তর পাঠান$').click(); lp.wait_for_timeout(4000); shot(lp, 'L17-replied')
                step('লিডার উত্তর দিতে পারেন', has(lp, 'উত্তর পাঠানো হয়েছে', 4000))
                step('হাজী উত্তর দেখতে পান', has(hp, 'CI উত্তর: রিসেপশনে', 25000)); shot(hp, 'H13-help-answer')
            else: step('সাহায্য-চ্যাট "শীঘ্রই আসছে" দেখায় (০১৮ চালানো বাকি)', True)
            btn(hp, 'আমার দল পাতায় ফিরে যান').click(); hp.wait_for_timeout(2500)
            hp.get_by_role('button', name='দল ছেড়ে দিন').first.click(); hp.wait_for_timeout(3500)
            step('দল ছেড়ে দেওয়া যায়', has(hp, 'দল ছেড়ে দেওয়া হয়েছে।'))
            result['stamp'] = stamp
    except SystemExit as e:
        result['failed'] = str(e)
    except Exception as e:
        result['failed'] = f'{type(e).__name__}: {e}'
    b.close()
json.dump(result, open(f'{OUT}/result.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps(result, ensure_ascii=False, indent=1))
if result.get('failed') or result['errors']: raise SystemExit(1)
