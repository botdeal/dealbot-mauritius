(function (root) {
  'use strict';
  function safeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }
  function isPublished(deal, now = Date.now()) {
    return deal.status === 'active' && (!deal.starts_at || Date.parse(deal.starts_at) <= now)
      && (!deal.expires_at || Date.parse(deal.expires_at) > now);
  }
  function normalizeDeal(deal, merchants, categories) {
    const merchant = merchants.find(m => String(m.id) === String(deal.merchant_id));
    const category = categories.find(c => String(c.id) === String(deal.category_id));
    return {
      id: Number(deal.id), name: deal.name, category: category?.slug || 'uncategorized',
      categoryId: deal.category_id, merchantId: deal.merchant_id, store: merchant?.name || 'Marchand non renseigné',
      price: Number(deal.price), oldPrice: deal.old_price == null ? Number(deal.price) : Number(deal.old_price),
      score: Number(deal.dealbot_score), availability: ({in_stock:'available', out_of_stock:'outofstock',limited:'limited'})[deal.availability] || 'unknown',
      syncSource: deal.sync_source || '', syncExternalId: deal.sync_external_id || '', syncRevision: deal.sync_revision ?? null,
      scoreMethod: deal.score_method || 'editorial', scoreDetails: deal.score_details || null,
      description: deal.description || deal.short_description || '', addedAt: (deal.created_at || '').slice(0,10),
      affiliateUrl: safeUrl(deal.affiliate_url || deal.original_url), originalUrl: safeUrl(deal.original_url),
      affiliateOverride: safeUrl(deal.affiliate_url),
      imageUrl: safeUrl(deal.image_url), currency: deal.currency || 'MUR', featured: !!deal.is_featured,
      status: deal.status, published: isPublished(deal), verified: !!merchant?.is_verified,
      expiresAt: deal.expires_at, startsAt: deal.starts_at
    };
  }
  async function checked(query) {
    const result = await query;
    if (result.error) throw result.error;
    return result.data;
  }
  async function allRows(db, table, order = 'id') {
    const rows = [];
    for (let start = 0; ; start += 500) {
      const page = await checked(db.from(table).select('*').order(order).range(start, start + 499));
      rows.push(...page);
      if (rows.length > 10000) throw new Error('Catalogue trop volumineux : affinez le chargement côté serveur.');
      if (page.length < 500) return rows;
    }
  }
  function create(db) {
    return {
      async catalog() {
        const [deals, categories, merchants] = await Promise.all(['deals','categories','merchants'].map(t => allRows(db,t)));
        return {deals: deals.map(d => normalizeDeal(d,merchants,categories)), categories, merchants};
      },
      async personal(userId) {
        const [favorites, compare, alerts] = await Promise.all(['favorites','compare_items','price_alerts'].map(t => checked(db.from(t).select('*').eq('user_id', userId))));
        return {favorites: favorites.map(x=>Number(x.deal_id)), compare:compare.map(x=>Number(x.deal_id)),
          alerts:alerts.filter(x=>x.status !== 'deleted').map(x=>({id:Number(x.id),productId:Number(x.deal_id),targetPrice:Number(x.target_price),status:x.status,currency:x.currency}))};
      },
      savePersonal(state, expectedState) { return checked(db.rpc('save_personal_state_checked',{expected_state:expectedState,favorite_ids:state.favorites,comparison_ids:state.compare,
        alerts:state.alerts.map(a=>({productId:a.productId,targetPrice:a.targetPrice,currency:a.currency}))})); },
      saveDeal(payload) { return checked(db.rpc('admin_save_deal',{payload})); },
      archiveDeal(id) { return checked(db.from('deals').update({status:'archived'}).eq('id',id).select('id').single()); },
      history(id) { return checked(db.from('price_history').select('price,currency,recorded_at').eq('deal_id',id).order('recorded_at',{ascending:false}).limit(30)); },
      track(id, session, source) { return checked(db.rpc('track_deal_click',{offer_id:id,browser_session:session,page_source:source})); }
    };
  }
  const exported = {safeUrl,isPublished,normalizeDeal,checked,create};
  if (typeof module !== 'undefined') module.exports = exported;
  else root.DealBotBackend = exported;
})(typeof window !== 'undefined' ? window : this);
