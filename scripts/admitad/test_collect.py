import io
import unittest
import xml.etree.ElementTree as ET
from collect import BoundedReader, https_url, normalize, original_url, collect

# Recorded official feed record (2026-09-19), never submitted by these tests.
PID = '1005006548242531'
AFF = 'https://rzekl.com/g/1e8d11449490865f8c2d16525dc3e8/?ulp=https%3A%2F%2Fs.click.aliexpress.com%2Fdeep_link.htm%3Faff_short_key%3D_c3s1yQkJ%26dl_target_url%3Dhttps%253A%252F%252Fwww.aliexpress.com%252Fitem%252F1005006548242531.html%253Fpdp_npi%253D6%252540dis%252521USD%25252112.78%25252112.78%252521%252521%25252185.15%25252185.15%252521%2525402151fd2c17897688545506451e0dee%25252112000037631740694%252521affd%252521%252521%252521%2525211%2525210%252521%26hot_product%3D1&i=5&f_id=50003'

class CollectorTests(unittest.TestCase):
    def test_real_deeplink_target(self):
        self.assertTrue(original_url(AFF, PID).startswith('https://www.aliexpress.com/item/'+PID+'.html?'))
    def test_wrong_product_target(self):
        with self.assertRaises(ValueError): original_url(AFF, '1005000000000')
    def test_unapproved_affiliate_host(self):
        with self.assertRaises(ValueError): original_url(AFF.replace('rzekl.com','evil.invalid'), PID)
    def test_no_invented_direct_link(self):
        with self.assertRaises(ValueError): original_url('https://rzekl.com/no-product-target', PID)
    def test_unsafe_urls(self):
        for url in ['http://example.com', 'https://u:p@example.com', 'https://example.com:444/', 'https://example.com/\n']:
            with self.assertRaises(ValueError): https_url(url)
    def test_external_entities_rejected(self):
        with self.assertRaises(ValueError): BoundedReader(io.BytesIO(b'<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]>')).read(1000)
    def test_split_entity_declaration_rejected(self):
        reader=BoundedReader(io.BytesIO(b'<!DOCTYPE test>'));reader.read(4)
        with self.assertRaises(ValueError): reader.read(20)
    def test_truncated_feed_cannot_reconcile(self):
        with self.assertRaises(ET.ParseError): collect(io.BytesIO(b'<yml_catalog><shop><offers>'))
    def test_empty_feed_cannot_reconcile(self):
        with self.assertRaises(ValueError): collect(io.BytesIO(b'<yml_catalog><shop/></yml_catalog>'))
    def test_unexpected_format_rejected(self):
        with self.assertRaises(ValueError): collect(io.BytesIO(b'<html/>'))
    def test_selection_limit(self):
        with self.assertRaises(ValueError): collect(io.BytesIO(b''),101)
    def test_unselected_real_clothing_category_excluded(self):
        e=ET.fromstring('<offer id="1005006548242531"><categoryId>200000779</categoryId></offer>')
        self.assertIsNone(normalize(e,{'200000779':('T-Shirts','200000343'),'200000343':("Men’s Clothing",None)}))

if __name__=='__main__': unittest.main()
