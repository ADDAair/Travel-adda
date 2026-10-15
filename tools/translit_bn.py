# Rule-based Arabic (Tanzil "simple" script with harakat) -> Bengali pronunciation (উচ্চারণ).
# An aid for readers who cannot yet read Arabic. It cannot express every tajweed rule,
# and the output must be reviewed by a qualified person before public launch.
import re

FATHA, DAMMA, KASRA = 'َ', 'ُ', 'ِ'
TF, TD, TK = 'ً', 'ٌ', 'ٍ'
SHADDA, SUKUN, DAGGER, MADDA, TATWEEL = 'ّ', 'ْ', 'ٰ', 'ٓ', 'ـ'
MARKS = (FATHA, DAMMA, KASRA, TF, TD, TK, SHADDA, SUKUN, DAGGER, MADDA)
SKIP = set(chr(c) for c in range(0x06D6, 0x06EE)) | {'ٔ', 'ٕ', 'ٖ'}

CONS = {
    'ب': 'ব', 'ت': 'ত', 'ث': 'ছ', 'ج': 'জ', 'ح': 'হ', 'خ': 'খ', 'د': 'দ', 'ذ': 'য', 'ر': 'র', 'ز': 'য',
    'س': 'স', 'ش': 'শ', 'ص': 'স', 'ض': 'দ্ব', 'ط': 'ত', 'ظ': 'য', 'غ': 'গ', 'ف': 'ফ', 'ق': 'ক', 'ك': 'ক',
    'ل': 'ল', 'م': 'ম', 'ن': 'ন', 'ه': 'হ',
}
SUN = set('تثدذرزسشصضطظلن')
GLOTTAL = set('ءأإؤئع')            # written as independent vowels
SIGN = {FATHA: 'া', KASRA: 'ি', DAMMA: 'ু'}
LSIGN = {FATHA: 'া', KASRA: 'ী', DAMMA: 'ূ'}
IND = {FATHA: 'আ', KASRA: 'ই', DAMMA: 'উ'}
LIND = {FATHA: 'আ', KASRA: 'ঈ', DAMMA: 'ঊ'}
PREFIX = set('وفبلك')
MUQ = {'ا': 'আলিফ', 'ل': 'লাম', 'م': 'মীম', 'ص': 'সোয়াদ', 'ر': 'রা', 'ك': 'কাফ', 'ه': 'হা', 'ي': 'ইয়া',
       'ع': 'আইন', 'ط': 'ত্বা', 'س': 'সীন', 'ح': 'হা', 'ق': 'ক্বাফ', 'ن': 'নূন'}

def tokens(word):
    out = []
    for ch in word:
        if ch == TATWEEL or ch in SKIP:
            continue
        if ch in MARKS:
            if out:
                out[-1][1] += ch
            continue
        out.append([ch, ''])
    return out

def vow(m):
    for v in (FATHA, KASRA, DAMMA):
        if v in m:
            return v
    return None

def tan(m):
    return {TF: FATHA, TK: KASRA, TD: DAMMA}.get(next((c for c in m if c in (TF, TD, TK)), None))

def bare(u):
    return not vow(u[1]) and not tan(u[1]) and SHADDA not in u[1] and MADDA not in u[1]

def is_muqattaat(word):
    return bool(word) and not re.search('[ً-ْٰ]', word) and all(c in MUQ for c in word)

def render(units, final):
    """Render letters (article already removed) to Bengali."""
    s = ''
    n = len(units)
    i = 0
    prev = None                       # short vowel of the previous letter, if any
    stop_at = n - 1
    if final and n >= 2 and units[-1][0] in 'اى' and bare(units[-1]) and tan(units[-2][1]) == FATHA:
        stop_at = n - 2                   # "...ًا" at a pause is read with a long a
    while i < n:
        ch, m = units[i]
        v, tw = vow(m), tan(m)
        last = i == stop_at
        nxt = units[i + 1] if i + 1 < n else None
        # ---- letters that only lengthen the previous vowel ----
        if ch == 'آ' or (ch == 'ا' and MADDA in m):
            s += 'আ' if (not s or s[-1] in ' ') else 'আ'
            prev = None; i += 1; continue
        if ch in 'اى' and bare(units[i]):
            if not s:
                s += 'আ'
            prev = None; i += 1; continue
        if ch == 'و' and bare(units[i]):
            if prev == DAMMA:
                s = s[:-1] + 'ূ' if s.endswith('ু') else s
            elif prev == FATHA:
                s += 'ও'
            elif not s:
                s += 'ও'
            prev = None; i += 1; continue
        if ch == 'ي' and bare(units[i]):
            if prev == KASRA:
                s = s[:-1] + 'ী' if s.endswith('ি') else s
            elif prev == FATHA:
                s += 'ই'
            prev = None; i += 1; continue
        if ch == 'ة' and final and last:
            s += 'হ'
            break
        # ---- doubled letter ----
        if SHADDA in m:
            if ch == 'ي':
                s += '' if s.endswith(('ি', 'ই')) else 'ই'
                s += 'য়্য'
                body = ''
                vv = v or tw
                if final and last:
                    break
                long = vv == KASRA and nxt and nxt[0] == 'ي' and bare(nxt) or DAGGER in m or (vv == FATHA and nxt and nxt[0] in 'اى' and bare(nxt)) or (vv == DAMMA and nxt and nxt[0] == 'و' and bare(nxt))
                s += (LSIGN if long else SIGN).get(vv, '')
                if long: i += 1
                prev = None if long else vv
                i += 1; continue
            if ch == 'و':
                s += 'ও'
            elif ch in CONS:
                s += CONS[ch][-1] + '্'
        # ---- consonant body ----
        if ch in GLOTTAL:
            body = None
        elif ch == 'و':
            body = {FATHA: 'ওয়', KASRA: 'উ', DAMMA: 'উ'}.get(v or tw, 'ও')
        elif ch == 'ي':
            body = {FATHA: 'ইয়', KASRA: 'ই', DAMMA: 'ইউ'}.get(v or tw, 'ই')
        elif ch == 'ة':
            body = 'ত'
        else:
            body = CONS.get(ch, '')
        vv = v or tw
        if final and last:                       # pause at the end of the verse
            if tw == FATHA:
                s += (body + 'া') if body else 'আ'
            elif body and ch not in 'وي':
                s += body
            elif ch in 'وي' and body:
                s += body
            break
        if not vv:
            if body and ch not in 'وي':
                s += body
            elif ch in 'وي':
                s += body
            prev = None; i += 1; continue
        long = False
        if nxt and bare(nxt) and ((vv == FATHA and nxt[0] in 'اى') or (vv == KASRA and nxt[0] == 'ي') or (vv == DAMMA and nxt[0] == 'و')):
            long = True
        if DAGGER in m:
            long = True
        if body is None:                          # hamza / ain
            if s.endswith('ই') and vv in (FATHA, KASRA, DAMMA) and len(s) > 1:
                s += 'য়' + (LSIGN if long else SIGN)[vv]
            else:
                s += (LIND if long else IND)[vv]
        elif ch == 'و' and vv != FATHA:
            s += 'উই' if vv == KASRA else ('ঊ' if long else 'উ')
        elif ch == 'ي' and (s.endswith(('ি', 'ই')) or (vv == KASRA and s and '\u0995' <= s[-1] <= '\u09B9')):
            s += 'য়' + (LSIGN if long else SIGN)[vv]   # "হিয়া", "ইউহয়ী"
        elif ch == 'ي' and vv != FATHA:
            s += ('ঈ' if long else 'ই') if vv == KASRA else ('ইউ')
        else:
            s += body + (LSIGN if long else SIGN)[vv]
        if long and nxt and nxt[0] in 'اىوي':
            i += 1
        prev = None if long else vv
        if tw:
            s += 'ন'
            prev = None
            if nxt and nxt[0] in 'اى' and bare(nxt):
                i += 1
        i += 1
    return s

def split_article(units):
    """Detect a leading (prefix +) definite article. Returns (prefix_units, kind, sun_letter, rest)."""
    p = 0
    if len(units) > 3 and units[0][0] in PREFIX and vow(units[0][1]) and units[1][0] == 'ا' and bare(units[1]) and units[2][0] == 'ل' and bare(units[2]):
        p = 1
    if len(units) > p + 2 and units[p][0] == 'ا' and bare(units[p]) and units[p + 1][0] == 'ل' and bare(units[p + 1]):
        nx = units[p + 2]
        if SHADDA in nx[1] and nx[0] in SUN:
            return units[:p], 'sun', nx[0], [[nx[0], nx[1].replace(SHADDA, '')]] + units[p + 3:]
        return units[:p], 'moon', None, units[p + 2:]
    return None

def verse_to_bn(text):
    words = [w for w in text.split(' ') if w]
    out = []                                         # list of rendered words
    for k, w in enumerate(words):
        if is_muqattaat(w):
            out.append(' '.join(MUQ[c] for c in w)); continue
        units = tokens(w)
        if not units:
            continue
        start = not out
        final = k == len(words) - 1
        plain = ''.join(u[0] for u in units)
        # Allah (الله) without prefix
        if plain.startswith('الله') and bare(units[0]):
            rest = render([['ل', SHADDA + (vow(units[2][1]) or FATHA)]] + units[3:], final)
            if start: out.append('আ' + rest)
            else: out[-1] += rest
            continue
        art = split_article(units)
        if art:
            pre, kind, sun, rest = art
            pre_s = render(pre, False) if pre else ''
            if kind == 'sun':
                head = (pre_s + CONS[sun]) if pre else ('আ' + CONS[sun] if start else None)
                body = render(rest, final)
                if head is None:
                    out[-1] += CONS[sun]          # previous word takes the sun letter
                    out.append(body)
                else:
                    out.append(head + ' ' + body)
            else:
                head = (pre_s + 'ল') if pre else ('আল' if start else None)
                body = render(rest, final)
                if head is None:
                    out[-1] += 'ল'
                    out.append(body)
                elif not pre:
                    out.append(head + body)          # verse start: "আলহামদু"
                else:
                    out.append(head + ' ' + body)
            continue
        # silent hamzat al-wasl (not an article)
        if units[0][0] == 'ا' and bare(units[0]):
            body = render(units[1:], final)
            if start:
                out.append('ই' + body)
            else:
                out[-1] += body                   # joins the previous word
            continue
        # word starting with a doubled letter after a previous word (idgham / assimilation)
        if not start and SHADDA in units[0][1] and units[0][0] in CONS:
            c = CONS[units[0][0]][-1]
            prevw = out[-1]
            if prevw.endswith('ন'):
                prevw = prevw[:-1]
            if not prevw.endswith(c):
                prevw += c
            out[-1] = prevw
            out.append(render([[units[0][0], units[0][1].replace(SHADDA, '')]] + units[1:], final))
            continue
        r = render(units, final)
        # iqlab: n before b
        if out and units[0][0] == 'ب' and out[-1].endswith('ন'):
            out[-1] = out[-1][:-1] + 'ম'
        out.append(r)
    return re.sub(r'\s+', ' ', ' '.join(out)).strip()

BISM_WORDS = 4
def surah_verses(simple_lines):
    """simple_lines: dict (s,a)->text. Yields (s, a, pron). Removes the Bismillah prefix like the app does."""
    for (s, a), t in sorted(simple_lines.items()):
        if a == 1 and s not in (1, 9):
            t = ' '.join(t.split(' ')[BISM_WORDS:])
        yield s, a, verse_to_bn(t)
