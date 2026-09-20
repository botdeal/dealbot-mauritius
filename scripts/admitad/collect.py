"""Official Admitad YML collector. Streams to EOF; never reconciles a partial feed.

The URL below was generated in Admitad for DealBot (2993975), Hot Products
(50003), USD 75–100, discounted products, YML on 2026-09-19. It contains no credential.
Only the bounded curated selection, not the entire upstream feed, is published.
"""
import argparse
import collections
import datetime as dt
import hashlib
import heapq
import http.client
import json
import os
import re
import sqlite3
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

FEED = 'https://feed.admitad.com/api/external/feed_export/50003?min_price=75&max_price=100&website_id=2993975&currency=USD&products_discount_only=true&format=yml'
ENDPOINT = 'https://rrcxlohsbxfldflqfgqx.supabase.co/functions/v1/dealbot-sync'
SOURCE = 'admitad-aliexpress-hot-usd'
AUDIENCE = 'dealbot-admitad-collector'
# Explicit taxonomy translation, not invented source categories or product data.
ROOTS = {'13': ('Bricolage', 'Home Improvement'), '39': ('Éclairage', 'Lights & Lighting'),
         '44': ('Électronique', 'Consumer Electronics'), '6': ('Électroménager', 'Home Appliances'),
         '7': ('Informatique', 'Computer & Office'), '15': ('Maison et jardin', 'Home & Garden'),
         '18': ('Sports et loisirs', 'Sports & Entertainment'), '21': ('Fournitures de bureau', 'Office & School Supplies'),
         '1420': ('Outils', 'Tools'), '26': ('Jeux et jouets', 'Toys & Hobbies')}
REJECT = re.compile(r'\b(replica|luxury brand|electronic cigarette|vape|tobacco|weapon|pistol|rifle|ammunition|sex toy|medical|surgical|diagnostic|reagent|troponin|poct|prescription|pharmaceutical|laboratory|tattoo|nicotine)\b', re.I)

def https_url(value, hosts=None):
    p = urllib.parse.urlsplit(value or '')
    if (p.scheme != 'https' or not p.hostname or p.username or p.password or p.port not in (None, 443)
            or len(value) > 2048 or re.search(r'[\s\\\x00-\x1f]', value)
            or (hosts is not None and p.hostname not in hosts)):
        raise ValueError('invalid_url')
    return value

def original_url(affiliate, product_id):
    # Extract the original URL actually supplied inside Admitad's deep link.
    # Never synthesize a product URL or modify the affiliate URL.
    https_url(affiliate, {'rzekl.com'})
    nested = urllib.parse.parse_qs(urllib.parse.urlsplit(affiliate).query).get('ulp', [''])[0]
    https_url(nested, {'s.click.aliexpress.com'})
    original = urllib.parse.parse_qs(urllib.parse.urlsplit(nested).query).get('dl_target_url', [''])[0]
    https_url(original, {'www.aliexpress.com', 'aliexpress.com'})
    if urllib.parse.urlsplit(original).path != '/item/' + product_id + '.html':
        raise ValueError('product_link_mismatch')
    return original

def normalize(element, categories):
    product_id = element.get('id', '')
    if not re.fullmatch(r'[0-9]{8,20}', product_id):
        raise ValueError('invalid_id')
    fields = {child.tag: child.text or '' for child in element}
    category = fields.get('categoryId'); visited = set()
    while category in categories and categories[category][1]:
        if category in visited: raise ValueError('category_cycle')
        visited.add(category); category = categories[category][1]
    if category not in ROOTS: return None
    name = fields.get('name', '').strip()
    if not 1 <= len(name) <= 250 or re.search(r'[\x00-\x1f]', name) or REJECT.search(name): return None
    from decimal import Decimal, InvalidOperation
    try: price = Decimal(fields.get('price', ''))
    except InvalidOperation: raise ValueError('invalid_price')
    if not price.is_finite() or not 75 <= price <= 100 or price != price.quantize(Decimal('.01')):
        raise ValueError('invalid_price')
    if fields.get('currencyId') != 'USD': raise ValueError('unexpected_currency')
    image = https_url(fields.get('picture', ''))
    if not urllib.parse.urlsplit(image).hostname.endswith('.aliexpress-media.com'): return None
    affiliate = fields.get('url', '')
    stock = {'true': 'in_stock', 'false': 'out_of_stock'}.get(element.get('available'), 'unknown')
    fr, en = ROOTS[category]
    offer = {'external_id': product_id, 'name': name, 'price': float(price), 'currency': 'USD',
             'availability': stock, 'image_url': image, 'affiliate_url': affiliate,
             'original_url': original_url(affiliate, product_id),
             'merchant': {'external_id': 'aliexpress', 'name': 'AliExpress', 'website_url': 'https://aliexpress.com'},
             'category': {'external_id': category, 'name_fr': fr, 'name_en': en}}
    # Omit absent old prices/descriptions. Do not infer discounts from URL parameters.
    if fields.get('oldprice'):
        try: old = Decimal(fields['oldprice'])
        except InvalidOperation: raise ValueError('invalid_reference_price')
        if not old.is_finite() or old < price or old > Decimal('999999999999.99') or old != old.quantize(Decimal('.01')):
            raise ValueError('invalid_reference_price')
        offer['old_price'] = float(old)
    if fields.get('description', '').strip():
        description = fields['description'].strip()
        if len(description) <= 5000 and not re.search(r'[\x00-\x1f]', description): offer['description'] = description
    return offer

class BoundedReader:
    def __init__(self, stream):
        self.stream = stream; self.bytes = 0; self.start = time.monotonic(); self.tail = b''
    def read(self, size=-1):
        data = self.stream.read(min(size if size >= 0 else 65536, 65536))
        self.bytes += len(data)
        if self.bytes > 2 * 1024**3 or time.monotonic() - self.start > 2100:
            raise ValueError('feed_resource_limit_no_import')
        scan = (self.tail + data).upper()
        if b'<!DOCTYPE' in scan or b'<!ENTITY' in scan: raise ValueError('unsafe_xml')
        self.tail = scan[-16:]
        return data

def yml_records(reader):
    """Isolate malformed upstream offers, but require a valid envelope and footer.

    Admitad's observed YML contains a malformed offer at line 2284286 in the
    USD 10–25 partition. Never repair affiliate URLs or publish a partial feed.
    Each bounded offer is independently parsed strictly; malformed ones are
    quarantined by count while a missing/truncated envelope remains fatal.
    """
    buffer = b''
    while b'<offers>' not in buffer:
        part = reader.read(65536)
        if not part: raise ET.ParseError('missing offers envelope')
        buffer += part
        if len(buffer) > 2 * 1024**2: raise ValueError('feed_header_limit')
    header, buffer = buffer.split(b'<offers>', 1)
    root = ET.fromstring(header + b'</shop></yml_catalog>')
    if root.tag != 'yml_catalog' or root.find('shop') is None: raise ValueError('unexpected_feed_format')
    for category in root.findall('./shop/categories/category'):
        yield 'category', category
    while True:
        buffer = buffer.lstrip()
        if buffer.startswith(b'</offers>'):
            while True:
                part = reader.read(65536)
                if not part: break
                buffer += part
                if len(buffer) > 4096: raise ET.ParseError('unexpected data after offers')
            if not re.fullmatch(rb'</offers>\s*</shop>\s*</yml_catalog>\s*', buffer):
                raise ET.ParseError('invalid final envelope')
            return
        end = buffer.find(b'</offer>')
        if end >= 0:
            if not re.match(rb'<offer(?:\s|>)', buffer): raise ET.ParseError('invalid offer boundary')
            raw, buffer = buffer[:end+8], buffer[end+8:]
            if len(raw) > 512 * 1024: raise ValueError('offer_size_limit')
            try: element = ET.fromstring(raw)
            except ET.ParseError: element = None
            yield 'offer', element
            continue
        if len(buffer) > 512 * 1024: raise ValueError('offer_size_limit')
        part = reader.read(65536)
        if not part: raise ET.ParseError('truncated offers envelope')
        buffer += part

def collect(stream, per_category=100):
    if not 1 <= per_category <= 100: raise ValueError('selection_limit')
    reader = BoundedReader(stream); categories = {}; selected = {}; heaps = collections.defaultdict(list)
    counts = collections.Counter()
    # Disk-backed fingerprints avoid keeping a giant catalogue in memory.
    with tempfile.TemporaryDirectory() as directory:
        db = sqlite3.connect(os.path.join(directory, 'seen.sqlite'))
        db.execute('create table seen(id text primary key, digest text not null)')
        for event, element in yml_records(reader):
            if event == 'category':
                categories[element.get('id')] = (element.text, element.get('parentId'))
            elif event == 'offer':
                counts['scanned'] += 1
                if counts['scanned'] > 1000000: raise ValueError('feed_offer_limit_no_import')
                if element is None:
                    counts['invalid'] += 1; counts['invalid_xml_offer'] += 1
                    continue
                try:
                    offer = normalize(element, categories)
                except ValueError as error:
                    counts['invalid'] += 1
                    counts['invalid_' + str(error)] += 1
                    offer = None
                if offer is not None:
                    pid = offer['external_id']; digest = hashlib.sha256(json.dumps(offer, sort_keys=True).encode()).hexdigest()
                    previous = db.execute('select digest from seen where id=?', (pid,)).fetchone()
                    if previous:
                        if previous[0] != digest: raise ValueError('conflicting_duplicate')
                        counts['duplicates'] += 1
                    else:
                        db.execute('insert into seen values (?,?)', (pid, digest)); counts['eligible'] += 1
                        category = offer['category']['external_id']; heap = heaps[category]
                        # Stable selection independent of feed ordering, evenly bounded by category.
                        rank = int(hashlib.sha256(pid.encode()).hexdigest(), 16)
                        if len(heap) < per_category:
                            heapq.heappush(heap, (-rank, pid)); selected[pid] = offer
                        elif rank < -heap[0][0]:
                            removed = heapq.heapreplace(heap, (-rank, pid))[1]
                            del selected[removed]; selected[pid] = offer
                else: counts['excluded'] += 1
                element.clear()
                if counts['scanned'] % 50000 == 0:
                    print(json.dumps({'scanned': counts['scanned'], 'selected': len(selected), 'bytes': reader.bytes}), flush=True)
        db.close()
    # Reaching this point proves XML EOF, not just a successful HTTP header.
    if counts['scanned'] == 0 or not selected: raise ValueError('empty_feed_no_reconciliation')
    if counts['invalid'] > max(10, counts['eligible'] * .1): raise ValueError('abnormal_invalid_ratio_no_import')
    counts['bytes'] = reader.bytes; counts['selected'] = len(selected)
    counts['seconds'] = round(time.monotonic() - reader.start)
    return sorted(selected.values(), key=lambda o: o['external_id']), dict(counts)

def request_json(url, body=None, headers=None):
    request = urllib.request.Request(url, data=None if body is None else json.dumps(body, ensure_ascii=False).encode(), headers=headers or {})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)

def send(payload):
    for attempt in range(4):
        try:
            token_url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL'] + '&audience=' + urllib.parse.quote(AUDIENCE)
            token = request_json(token_url, headers={'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})['value']
            result = request_json(ENDPOINT, payload, {'Authorization': 'Bearer ' + token, 'x-dealbot-auth': 'github-oidc', 'Content-Type': 'application/json'})
            if not result.get('ok'): raise ValueError('autopilot_rejected')
            return result
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3: raise ValueError('autopilot_http_' + str(error.code)) from None
        except (TimeoutError, urllib.error.URLError):
            if attempt == 3: raise ValueError('autopilot_transport_failed') from None
        time.sleep(2 ** (attempt + 1))

def publish(offers):
    revision = int(os.environ['GITHUB_RUN_NUMBER']) * 1000 + int(os.environ.get('GITHUB_RUN_ATTEMPT', '1'))
    key = 'github-' + os.environ['GITHUB_RUN_ID'] + '-' + os.environ.get('GITHUB_RUN_ATTEMPT', '1')
    chunks = [offers[i:i+100] for i in range(0, len(offers), 100)]
    manifest = send({'op': 'begin', 'source': SOURCE, 'key': key, 'revision': revision, 'pages': len(chunks), 'offers': len(offers)})
    digests = []
    for page, chunk in enumerate(chunks):
        result = send({'op': 'chunk', 'id': manifest['id'], 'page': page, 'offers': chunk})
        digests.append(result['digest'])
    sealed = send({'op': 'seal', 'id': manifest['id'], 'digests': digests})
    for _ in range(36):
        result = send({'op': 'run_status', 'id': sealed['run_id']})
        if result['run']['state'] == 'succeeded': return result['run']
        if result['run']['state'] in ('failed', 'superseded'): raise ValueError('autopilot_run_' + result['run']['state'])
        time.sleep(5)
    raise ValueError('autopilot_run_pending_check_admin')

def load_offers(per_category, opener=urllib.request.urlopen, pause=time.sleep):
    # A broken stream has no safe byte cursor/ETag advertised by this source.
    # Restart once from the official URL; never reconcile an unfinished scan.
    for attempt in range(2):
        try:
            with opener(FEED, timeout=60) as stream:
                if stream.status != 200 or stream.headers.get_content_type() not in ('application/xml', 'text/xml'):
                    raise ValueError('unexpected_feed_response')
                return collect(stream, per_category)
        except urllib.error.HTTPError as error:
            if error.code not in (429,500,502,503,504) or attempt: raise
        except (TimeoutError, urllib.error.URLError, http.client.IncompleteRead, ConnectionError):
            if attempt: raise
        except ET.ParseError as error:
            if 'truncated' not in str(error) or attempt: raise
        print('Upstream interrupted; restarting complete scan (attempt 2/2)', flush=True)
        pause(5)

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--per-category', type=int, default=3)
    parser.add_argument('--publish', action='store_true'); parser.add_argument('--output')
    args = parser.parse_args()
    offers, summary = load_offers(args.per_category)
    print(json.dumps({'feed': 'Admitad AliExpress WW Hot Products', **summary}), flush=True)
    if args.output:
        with open(args.output, 'w') as out: json.dump(offers, out, ensure_ascii=False)
    if args.publish:
        result = publish(offers)
        print(json.dumps({'run_id': result['id'], 'state': result['state'], 'result': result.get('result')}))

if __name__ == '__main__':
    try: main()
    except Exception as error:
        # Never print HTTP headers, tokens, response bodies, or full feed records.
        print('COLLECTOR FAILED:', str(error) if isinstance(error, (ValueError, ET.ParseError)) else type(error).__name__)
        raise SystemExit(1)
