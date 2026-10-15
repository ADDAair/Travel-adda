import json, urllib.request
UA={'User-Agent':'Mozilla/5.0'}
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60) as r: return r.read().decode('utf-8','replace')
def note(t,m): print(f"::notice title={t}::{m.replace(chr(10),' | ')[:1800]}")
try:
    e=json.loads(get('https://api.alquran.cloud/v1/edition?type=transliteration'))['data']
    note('alquran translit', '; '.join(f"{x['identifier']}({x['language']}) {x['name']}" for x in e))
except Exception as ex: note('alquran err',str(ex))
try:
    e=json.loads(get('https://api.alquran.cloud/v1/edition?language=bn'))['data']
    note('alquran bn', '; '.join(f"{x['identifier']} {x['type']} {x['name']} / {x['englishName']}" for x in e))
except Exception as ex: note('alquran bn err',str(ex))
try:
    e=json.loads(get('https://api.quran.com/api/v4/resources/translations?language=bn'))['translations']
    note('qurancom bn translations', '; '.join(f"{x['id']} {x['name']} ({x['language_name']}) by {x.get('author_name')}" for x in e if x['language_name'].lower() in ('bengali','bangla')))
except Exception as ex: note('qurancom err',str(ex))
try:
    e=json.loads(get('https://api.quran.com/api/v4/resources/languages'))
    note('qurancom langs ok', str(len(e.get('languages',[]))))
    t=json.loads(get('https://api.quran.com/api/v4/verses/by_key/1:2?words=true&word_fields=text_uthmani&language=bn'))
    w=t['verse']['words'][0]; note('qurancom word bn', json.dumps({'translit':w.get('transliteration'),'trans':w.get('translation')},ensure_ascii=False))
except Exception as ex: note('qurancom word err',str(ex))
