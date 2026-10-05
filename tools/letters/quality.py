"""
Maz Vantage — Letters & Outlooks tools: what the crawler is too generous without.

site_is_firm(name, host, title)
    A homepage counts as the firm's only if the firm's own descriptor ("Asset
    Management", "Capital", "Advisors"...) is in the page title or the address
    beside its distinctive word. On the first run a shared word alone matched a
    hotel group, a property lawyer, a Bitcoin exchange and an accounting
    package — about half of all matches.

doc_ok(title, firm_name)
    Drops press releases and media mentions, link text ("Download", "Access
    the research"), regulatory filings, events and foreign-language pages.

clean(title)
    Turns listing text ("Commentary / Jul 20, 2026 / PDF Driehaus ...") into a title.

classify(title, url)
    Kind, topics and regions from the title. A guess, which is why the page
    marks these entries "Filed automatically".
"""
import re

from common import GENERIC, fold, tokens

FIN = re.compile(r'invest|capital|asset|fund|wealth|management|financ|equit|partners|research|portfolio|securities|advis', re.I)
NOT_FIN = re.compile(r'vastgoed|real estate dev|recruit|\blaw\b|software|consult|hotel|construct|design|marketing|photograph|'
                     r'security management|coins|watches|gifts|dog food|architect|genomics|teaching|accounting|logiciel|'
                     r'point of sale|house buy|bitcoin', re.I)


def site_is_firm(name, host, title):
    if NOT_FIN.search(title):
        return False
    t = tokens(name)
    core = [w for w in t if w not in GENERIC]
    generic = [w for w in t if w in GENERIC and w not in ('the', 'and', 'global', 'international')]
    ft = fold(title)
    dom = fold(host).replace('www.', '')
    if not core:  # "Capital Group": every word is generic, so all must be in the title, and more besides
        rest = ft
        for w in t:
            rest = rest.replace(w, ' ')
        return all(w in ft for w in t if w not in ('the', 'and')) and bool(FIN.search(rest))
    if not all(w in ft or w in dom for w in core):
        return False
    if not generic:  # a one-word name: the title must at least be about money
        return bool(FIN.search(ft)) and any(w in ft for w in core)
    short = {'capital': ['cap'], 'management': ['mgmt'], 'investments': ['invest'], 'investment': ['invest'], 'funds': ['fund'],
             'fund': ['funds'], 'asset': ['am'], 'advisors': ['advisers'], 'advisers': ['advisors']}

    def has(w, hay):
        return w in hay or any(s in hay for s in short.get(w, []))
    return any(has(w, ft) for w in generic) or any(has(w, dom.split('.')[0]) for w in generic)


PRESS = re.compile(r'\b(continues|announc\w*|welcomes?|joins?|appoint\w*|strengthen\w*|now open|opens|opening|awards?|recogni[sz]\w*|ranked|'
                   r'named|most influential|celebrat\w*|launch\w*|partners with|partnership|hires?|promot\w*|expands?|acquir\w*|completes?|'
                   r'closes|webinar|webcast|event|podcast|episode|video|replay|livestream|register|registration|conference|summit|'
                   r'careers?|we.re hiring|reuters|bloomberg|cnbc|barron.s|financial times|wall street journal|in the news|interview with|'
                   r'quoted|featured in|speaks (to|with)|on air|panel)\b', re.I)
LINKTEXT = re.compile(r'^(access|download|read|view|watch|listen|learn|explore|see|click|open|get|visit|discover|find out)\b', re.I)
REGULATORY = re.compile(r'(semi-?annual|annual) report(?!.*letter)|financial statements|form n-|n-csr|tailored shareholder|prospectus|'
                        r'holdings report|portfolio holdings|fact ?sheet|kiid|\bkid\b|priips|scheme document|relationship summary|'
                        r'form crs|privacy|disclosure|proxy voting|code of ethics|key information|in your language', re.I)
FOREIGN = re.compile(r'\b(le|la|les|des|pour|avec|une|du|au|und|der|die|das|für|mit|ein|eine|von|zu|im|el|los|las|para|con|del|'
                     r'het|een|en|för|och|av|på|med|til|og|di|per|nel)\b', re.I)
PREFIX = re.compile(r'^(feature article|article|insight|insights|commentary|blog|news|research|white paper|report|pdf|download)\s*[:\-–—]?\s+',
                    re.I)
DATE_LEAD = re.compile(r'^[A-Z][a-z]{2,8}\.? \d{1,2}, 20\d\d\s*/?\s*')


def clean(title):
    parts = [p.strip() for p in re.split(r'\s+/\s*|\s*/\s+', title) if p.strip()]
    if len(parts) > 1:
        keep = [p for p in parts if not re.fullmatch(r'(pdf|commentary|article|insight|news|[A-Z][a-z]{2,8}\.? \d{1,2}, 20\d\d)', p, re.I)]
        title = max(keep or parts, key=len)
    for _ in range(2):
        title = DATE_LEAD.sub('', PREFIX.sub('', title))
    title = re.sub(r'\s+', ' ', title).strip(' -–—|:')
    if title.isupper() and len(title) > 6:
        title = title.title()
    if len(title) > 80:  # a heading run into its teaser: keep the heading ("U.S." is not a sentence end)
        m = re.match(r'(.{20,118}?(?<![A-Z])[?.!])\s+[A-Z]', title)
        if m:
            title = m.group(1)
        elif len(title) > 120:
            title = title[:110].rsplit(' ', 1)[0] + '…'
    return title


def doc_ok(title, firm_name):
    if len(title.split()) < 3 or LINKTEXT.match(title) or PRESS.search(title) or REGULATORY.search(title):
        return False
    if len(FOREIGN.findall(title)) >= 2:
        return False
    core = [w for w in tokens(firm_name) if w not in GENERIC]
    if core and all(w in fold(title) for w in core) and len(title.split()) <= 4:  # "Insights - East Capital"
        return False
    return True


def classify(title, url=''):
    t = fold(title + ' ' + url)
    if re.search(r'letter|semi-?annual|annual review|shareholder|quarterly( \w+)? (report|update|commentary|review)|'
                 r'(h[12]|half[- ]year) 20\d\d (investment )?commentary|[1-4]q ?2?0?\d\d\b|q[1-4] ?20?\d\d\b|'
                 r'(first|second|third|fourth) quarter|investor update|partner update', t):
        kind = 'letter'
    elif re.search(r'outlook|year ahead|mid-?year|midyear|house view', t):
        kind = 'outlook'
    elif re.search(r'white ?paper|research|study|deep dive|primer', t):
        kind = 'research'
    else:
        kind = 'memo'
    topics = [key for key, pat in [
        ('ai', r'\bai\b|artificial intelligence|machine learning|data cent|semiconductor|chip'),
        ('rates', r'\brates?\b|yield|bond|treasur|duration|fixed income|central bank|\bfed\b|fomc|ecb'),
        ('inflation', r'inflation|disinflation|prices'),
        ('credit', r'credit|loan|private debt|high yield|private market|direct lending|securitiz'),
        ('energy', r'energy|oil|gas|power|electric|commodit|gold|uranium|mining|metal|copper'),
        ('geopolitics', r'geopolit|tariff|trade war|\bwar\b|china|iran|russia|election|sanction|strait'),
        ('policy', r'policy|regulat|election|government'),
        ('fiscal', r'deficit|debt|fiscal|budget'),
        ('macro', r'econom|recession|growth|gdp|macro|labou?r market|jobs'),
        ('equities', r'equit|stock|share|small[- ]cap|value|growth|dividend|earnings|valuation|portfolio'),
    ] if re.search(pat, t)]
    if not topics or kind == 'letter':
        topics = topics if 'equities' in topics else ['equities'] + topics
    regions = [key for key, pat in [
        ('us', r'\bu\.?s\.?\b|united states|america|s&p|wall street|\bfed\b'),
        ('europe', r'europ|\buk\b|britain|german|france|euro\b|eurozone|\becb\b'),
        ('asia', r'asia|china|japan|india|korea|taiwan|hong kong|singapore|australia'),
        ('em', r'emerging|frontier|latin|brazil|africa'),
    ] if re.search(pat, t)]
    return kind, topics[:4], regions or ['global']
