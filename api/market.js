// Country only, no GPS, no visitor IP forwarded to the rates provider.
const currencies = {MU:'MUR',FR:'EUR',US:'USD',GB:'GBP',CA:'CAD'};
let cached;
module.exports = async function(req,res) {
  if(req.method!=='GET') return res.status(405).end();
  res.setHeader('Cache-Control','private, no-store');
  const country = currencies[req.headers['x-vercel-ip-country']] ? req.headers['x-vercel-ip-country'] : null;
  try {
    if(!cached || Date.now()-cached.fetched>3600000) {
      const response=await fetch('https://open.er-api.com/v6/latest/USD',{signal:AbortSignal.timeout(6000)});
      if(!response.ok) throw Error('rates_unavailable');
      const data=await response.json();
      const age=Date.now()-Number(data.time_last_update_unix)*1000;
      if(data.result!=='success'||data.base_code!=='USD'||!Number.isFinite(age)||age< -3600000||age>3*86400000)throw Error('rates_stale');
      const rates=Object.fromEntries(Object.values(currencies).map(c=>[c,data.rates[c]]));
      if(Object.values(rates).some(n=>!Number.isFinite(n)||n<=0))throw Error('invalid_rates');
      cached={fetched:Date.now(),date:new Date(data.time_last_update_unix*1000).toISOString(),rates};
    }
    if(Date.now()-Date.parse(cached.date)>3*86400000)throw Error('rates_stale');
    res.status(200).json({country,currency:currencies[country]||null,date:cached.date,rates:cached.rates});
  }catch{res.status(200).json({country,currency:currencies[country]||null,rates:null,date:null});}
};
