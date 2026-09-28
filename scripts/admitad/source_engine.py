"""Capability-based source execution; credentials/URLs stay in server adapters.
The only installed adapter is the existing approved AliExpress feed collector.
Search-time network calls and deeplink generation require an actual adapter;
they are never synthesized from a merchant URL.
"""
from dataclasses import dataclass
import re

@dataclass(frozen=True)
class Source:
    id: str
    network: str
    program: str
    affiliate_authorized: bool
    cache_permitted: bool
    mode: str
    collect: object

class SourceOrchestrator:
    def __init__(self, sources):
        self.sources = {source.id: source for source in sources}
    def collect(self, source_id, per_category, demands=()):
        source = self.sources.get(source_id)
        if not source or not source.affiliate_authorized or not source.cache_permitted:
            raise ValueError('source_not_authorized')
        if source.mode != 'scheduled_feed':
            raise ValueError('source_capability_not_installed')
        offers, summary = source.collect(per_category, demands=demands)
        # The concrete parser validates official affiliate host + original target.
        if any(not o.get('affiliate_url') or not o.get('original_url') for o in offers):
            raise ValueError('official_affiliate_link_missing')
        return offers, summary

def demand_priority(offer, demands):
    text = re.sub(r'[^a-z0-9]+', ' ', offer['name'].lower())
    text = re.sub(r'(\d+)\s+(gb|tb)\b', r'\1\2', text)
    words = set(text.split()); priority = 0
    for demand in demands:
        tokens = demand['query'].split()
        if tokens and all(t in words for t in tokens):
            demand['matches'] = demand.get('matches', 0) + 1
            priority += min(20, max(0, int(demand.get('weight', 0))))
    return min(priority, 100)
