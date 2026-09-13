// Deliberately no unverified API URL, parameter, scope, or response-field mapping.
// Connection-specific transport and mapping must be implemented from the actual
// account's approved product/feed documentation, then passed to this interface.
export const connectionRequirements=Object.freeze([
 'Account authorization and approved DealBot ad space/program access',
 'Chosen documented product/feed and authorized credentials',
 'Verified pagination, rate limits, expiry and canonical field mapping'
]);
export function createAdmitadSource(connection) {
 if(!connection?.authorized || typeof connection.pages!=='function' || typeof connection.normalize!=='function'){
  throw Object.assign(new Error('Admitad is not connected'),{code:'ADMITAD_CONNECTION_REQUIRED'});
 }
 return {
  network:'admitad',
  async *offers(){
   for await(const page of connection.pages()){
    if(!Array.isArray(page))throw Error('Adapter must provide arrays of source records');
    for(const record of page)yield await connection.normalize(record);
   }
  }
 };
}
