# Automated visual walk-through of the app (web build) for review screenshots.
import os, sys, re
from playwright.sync_api import sync_playwright
OUT = 'shots'; os.makedirs(OUT, exist_ok=True)
PHONE = os.environ.get('TEST_PHONE', ''); PW = os.environ.get('TEST_PW', '')
log = []
def shot(pg, name):
    pg.wait_for_timeout(700); pg.screenshot(path=f'{OUT}/{name}.png'); log.append(name)
def click_text(pg, t, exact=False):
    pg.get_by_text(t, exact=exact).first.click(); pg.wait_for_timeout(600)
with sync_playwright() as p:
    b = p.chromium.launch()
    for scale_name, vw in (('normal', 390), ('small', 320)):
        ctx = b.new_context(viewport={'width': vw, 'height': 780}, device_scale_factor=2, locale='bn-BD')
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8080/'); pg.wait_for_timeout(3000)
        shot(pg, f'{scale_name}-01-onboarding-1'); click_text(pg, 'পরবর্তী', True)
        shot(pg, f'{scale_name}-02-onboarding-2'); click_text(pg, 'পরবর্তী', True)
        shot(pg, f'{scale_name}-03-onboarding-3'); click_text(pg, 'শুরু করুন', True)
        shot(pg, f'{scale_name}-04-login')
        click_text(pg, 'লগইন করুন', True); shot(pg, f'{scale_name}-05-login-empty-errors')
        click_text(pg, 'নতুন অ্যাকাউন্ট', True); shot(pg, f'{scale_name}-06-register')
        pg.get_by_label('পাসওয়ার্ড', exact=True).fill('12345678'); shot(pg, f'{scale_name}-06b-pw-weak')
        pg.get_by_label('পাসওয়ার্ড', exact=True).fill('karim2026'); shot(pg, f'{scale_name}-06c-pw-medium')
        pg.get_by_label('পাসওয়ার্ড', exact=True).fill('Karim2026!'); shot(pg, f'{scale_name}-06d-pw-strong')
        pg.get_by_label('পাসওয়ার্ড', exact=True).fill('')
        if scale_name == 'normal' and PHONE and PW:
            click_text(pg, 'লগইন', True)
            pg.get_by_label('মোবাইল নম্বর').fill(PHONE); pg.get_by_label('পাসওয়ার্ড', exact=True).fill(PW)
            click_text(pg, 'লগইন করুন', True); pg.wait_for_timeout(4000)
            if pg.get_by_text('মেলেনি').count() > 0:
                click_text(pg, 'নতুন অ্যাকাউন্ট', True)
                pg.get_by_label('আপনার নাম').fill('পরীক্ষা ব্যবহারকারী CI')
                pg.get_by_label('মোবাইল নম্বর').fill(PHONE); pg.get_by_label('পাসওয়ার্ড', exact=True).fill(PW)
                click_text(pg, 'অ্যাকাউন্ট খুলুন', True); pg.wait_for_timeout(4000)
            pg.wait_for_timeout(1500)
            if pg.get_by_text('পরে তুলব', exact=True).count() > 0:   # photo step (only if this account has no photo yet)
                shot(pg, f'{scale_name}-06e-photo-step'); click_text(pg, 'পরে তুলব', True); pg.wait_for_timeout(1500)
            shot(pg, f'{scale_name}-07-home')
            pg.get_by_role('tab', name='দোয়া').click(); pg.wait_for_timeout(1000); shot(pg, f'{scale_name}-08-dua-after-practice')
            pg.get_by_role('tab', name='ওমরাহর দোয়া').click(); pg.wait_for_timeout(600); shot(pg, f'{scale_name}-08b-dua-umrah')
            pg.get_by_label('দোয়া খুঁজুন').fill('তালবিয়াহ'); pg.wait_for_timeout(600); shot(pg, f'{scale_name}-08c-dua-search')
            pg.get_by_role('button', name=re.compile('^তালবিয়াহ')).first.click(); pg.wait_for_timeout(800); shot(pg, f'{scale_name}-08d-dua-detail')
            pg.get_by_role('button', name='লেখা বড় করুন').click(); pg.wait_for_timeout(500); shot(pg, f'{scale_name}-08e-dua-detail-big')
            pg.mouse.wheel(0, 1500); pg.wait_for_timeout(500); shot(pg, f'{scale_name}-08f-dua-detail-bottom')
            pg.get_by_role('button', name='সব দোয়ার তালিকায় ফিরে যান').first.click(); pg.wait_for_timeout(500)
            pg.get_by_role('tab', name='আল-কুরআন').click(); pg.wait_for_timeout(800); shot(pg, f'{scale_name}-11-quran-list')
            pg.get_by_role('tab', name='দোয়া', exact=True).first.click(); pg.wait_for_timeout(500); shot(pg, f'{scale_name}-11a-back-to-dua')
            pg.get_by_role('tab', name='আল-কুরআন').click(); pg.wait_for_timeout(500); shot(pg, f'{scale_name}-11b-quran-again')
            pg.get_by_role('button', name=re.compile('^সূরা 1,')).first.click(); pg.wait_for_timeout(1500); shot(pg, f'{scale_name}-12-quran-fatiha')
            pg.get_by_role('button', name='সব সূরার তালিকায় ফিরে যান').first.click(); pg.wait_for_timeout(600)
            pg.get_by_label('সূরা খুঁজুন').fill('ইয়াসীন'); pg.wait_for_timeout(600); shot(pg, f'{scale_name}-13-quran-search')
            pg.get_by_role('button', name=re.compile('^সূরা 36,')).first.click(); pg.wait_for_timeout(1500); shot(pg, f'{scale_name}-14-quran-yasin')
            pg.get_by_role('switch', name='অনুবাদ দেখান').click(); pg.wait_for_timeout(500); shot(pg, f'{scale_name}-15-quran-no-trans')
            pg.get_by_role('switch', name='অনুবাদ দেখান').click(); pg.mouse.wheel(0, 4000); pg.wait_for_timeout(1500)
            pg.get_by_role('button', name='সব সূরার তালিকায় ফিরে যান').first.click(); pg.wait_for_timeout(800); shot(pg, f'{scale_name}-16-quran-resume')
            pg.get_by_role('button', name=re.compile('^সূরা 2,')).first.click(); pg.wait_for_timeout(2500); shot(pg, f'{scale_name}-17-quran-baqara')
            pg.get_by_role('tab', name='আমার তথ্য').click(); pg.wait_for_timeout(1500); shot(pg, f'{scale_name}-09-account')
            pg.get_by_role('tab', name='ম্যাপ ও SOS').click(); pg.wait_for_timeout(800); shot(pg, f'{scale_name}-10-map-soon')
            # Guides, at normal and at narrow width
            for w, tag in ((390, 'n'), (320, 's')):
                pg.set_viewport_size({'width': w, 'height': 780})
                pg.get_by_role('tab', name='হোম').click(); pg.wait_for_timeout(1200); pg.mouse.wheel(0, 600); pg.wait_for_timeout(400); shot(pg, f'{scale_name}-19{tag}-home-cards')
                pg.get_by_role('button', name=re.compile('^মীকাত ও ইহরাম গাইড খুলুন')).click(); pg.wait_for_timeout(1000); shot(pg, f'{scale_name}-20{tag}-ihram-list')
                secs = ['আমার মীকাত কোথায়', 'প্রস্তুতির চেকলিস্ট', 'ধাপে ধাপে ইহরাম বাঁধা', 'নিয়ত ও তালবিয়াহ', 'ইহরামে যা নিষেধ', 'যে ভুলগুলো অনেকে করেন', 'বয়স্ক, অসুস্থ ও শিশু', 'ভুল হয়ে গেলে']
                for k, sec in enumerate(secs):
                    pg.get_by_role('button', name=re.compile(sec)).first.click(); pg.wait_for_timeout(800)
                    shot(pg, f'{scale_name}-2{k+1}{tag}-ihram-{k+1}')
                    if k == 0:
                        pg.get_by_role('radio', name='সৌদি আরবে থাকি').click(); pg.wait_for_timeout(500); shot(pg, f'{scale_name}-2{k+1}{tag}b-ihram-saudi')
                    if k == 1:
                        pg.get_by_role('checkbox').first.click(); pg.wait_for_timeout(400); shot(pg, f'{scale_name}-2{k+1}{tag}b-ihram-checked')
                    if k == 2:
                        pg.get_by_role('button', name='পরের ধাপ ›').click(); pg.wait_for_timeout(300)
                        pg.get_by_role('button', name='পরের ধাপ ›').click(); pg.wait_for_timeout(600); shot(pg, f'{scale_name}-2{k+1}{tag}b-ihram-step3')
                        pg.mouse.wheel(0, 900); pg.wait_for_timeout(500); shot(pg, f'{scale_name}-2{k+1}{tag}c-ihram-step3-pics')
                    if k == 4:
                        pg.get_by_role('tab', name=re.compile('যা করা যায়')).click(); pg.wait_for_timeout(400); shot(pg, f'{scale_name}-2{k+1}{tag}b-ihram-allowed')
                    pg.get_by_role('button', name='গাইডের সব অংশে ফিরে যান').first.click(); pg.wait_for_timeout(600)
                # Umrah
                pg.get_by_role('tab', name='হোম').click(); pg.wait_for_timeout(800)
                pg.get_by_role('button', name=re.compile('^ওমরাহ ধাপে ধাপে খুলুন')).click(); pg.wait_for_timeout(1000); shot(pg, f'{scale_name}-30{tag}-umrah-1')
                pg.get_by_role('button', name='সব ধাপের তালিকা দেখুন').click(); pg.wait_for_timeout(500); shot(pg, f'{scale_name}-31{tag}-umrah-list')
                pg.get_by_role('button', name=re.compile('^ধাপ 6:')).click(); pg.wait_for_timeout(800); shot(pg, f'{scale_name}-32{tag}-umrah-tawaf')
                pg.get_by_role('button', name=re.compile('দোয়া দেখুন')).first.click(); pg.wait_for_timeout(500); shot(pg, f'{scale_name}-33{tag}-umrah-dua-open')
                pg.get_by_role('button', name='এক চক্কর শেষ হলো').click(); pg.wait_for_timeout(300)
                pg.get_by_role('button', name='এক চক্কর শেষ হলো').click(); pg.wait_for_timeout(300)
                pg.get_by_label(re.compile('চক্করের মধ্যে')).first.scroll_into_view_if_needed(); pg.wait_for_timeout(400); shot(pg, f'{scale_name}-34{tag}-umrah-counter')
                pg.get_by_role('button', name='‹ আগের ধাপ').click(); pg.wait_for_timeout(300)
                for _ in range(4): pg.get_by_role('button', name='পরের ধাপ ›').click(); pg.wait_for_timeout(300)
                shot(pg, f'{scale_name}-35{tag}-umrah-sai')
                # Hajj
                pg.get_by_role('tab', name='হোম').click(); pg.wait_for_timeout(800)
                pg.get_by_role('button', name=re.compile('^হজের দিনগুলো খুলুন')).click(); pg.wait_for_timeout(1000); shot(pg, f'{scale_name}-40{tag}-hajj-list')
                pg.get_by_role('button', name=re.compile('আরাফা দিবস')).click(); pg.wait_for_timeout(800); shot(pg, f'{scale_name}-41{tag}-hajj-arafa')
                pg.get_by_role('button', name=re.compile('^পরের অংশ')).click(); pg.wait_for_timeout(800); shot(pg, f'{scale_name}-42{tag}-hajj-muzdalifa')
                pg.get_by_role('button', name='হজের সব দিনের তালিকায় ফিরে যান').first.click(); pg.wait_for_timeout(500)
                pg.get_by_role('button', name=re.compile('ঈদের দিন')).click(); pg.wait_for_timeout(800); shot(pg, f'{scale_name}-43{tag}-hajj-eid')
                # New dua categories
                pg.get_by_role('tab', name='দোয়া', exact=True).first.click(); pg.wait_for_timeout(1000); shot(pg, f'{scale_name}-50{tag}-dua-cats')
                pg.get_by_role('tab', name='সফরের দোয়া').click(); pg.wait_for_timeout(600); shot(pg, f'{scale_name}-51{tag}-dua-safar')
                pg.get_by_role('tab', name='দৈনন্দিন দোয়া').click(); pg.wait_for_timeout(600); shot(pg, f'{scale_name}-52{tag}-dua-daily')
                pg.get_by_role('tab', name='মদিনা যিয়ারতের দোয়া').click(); pg.wait_for_timeout(600); shot(pg, f'{scale_name}-53{tag}-dua-madinah')
                pg.get_by_role('tab', name='নামাজের দোয়া').click(); pg.wait_for_timeout(400)
        open(f'{OUT}/{scale_name}-errors.txt', 'w').write('\n'.join(errs))
        ctx.close()
    b.close()
print('shots:', log)
