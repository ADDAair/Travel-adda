# Automated visual walk-through of the app (web build) for review screenshots.
import os, sys
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
            shot(pg, f'{scale_name}-07-home')
            pg.get_by_role('tab', name='দোয়া').click(); pg.wait_for_timeout(1000); shot(pg, f'{scale_name}-08-dua-after-practice')
            pg.get_by_role('tab', name='আমার তথ্য').click(); pg.wait_for_timeout(1500); shot(pg, f'{scale_name}-09-account')
            pg.get_by_role('tab', name='ম্যাপ ও SOS').click(); pg.wait_for_timeout(800); shot(pg, f'{scale_name}-10-map-soon')
        open(f'{OUT}/{scale_name}-errors.txt', 'w').write('\n'.join(errs))
        ctx.close()
    b.close()
print('shots:', log)
