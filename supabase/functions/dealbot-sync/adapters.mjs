// Adapters translate data; only the engine writes the catalog.
export const adapters = {
  'canonical-v1': payload => payload,
  'fixture-v1': payload => ({...payload,offers:payload.offers.map(row=>({
    external_id:row.sku,name:row.title,price:row.price,old_price:row.reference_price,
    currency:row.currency,availability:row.stock,original_url:row.url,
    description:row.description,merchant:row.merchant,category:row.category
  }))})
};
export function adapt(name,payload) {
  if(!Object.hasOwn(adapters,name)) throw new Error('Unsupported adapter');
  if(!payload || !Array.isArray(payload.offers) || payload.offers.length>500) throw new Error('Invalid offer batch');
  return adapters[name](payload);
}
