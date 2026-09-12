const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../backend.js');

function catalogDatabase(count) {
  return {from(table) {return {
    select() {return this;}, order() {return this;},
    async range(start,end) {
      const size = table === 'deals' ? count : 0;
      return {data:Array.from({length:Math.max(0,Math.min(size,end+1)-start)},(_,i)=>({id:start+i,status:'active',price:1})),error:null};
    }
  };}};
}
test('catalog accepts exactly 10000 rows and refuses overflow',async()=>{
  assert.equal((await create(catalogDatabase(10000)).catalog()).deals.length,10000);
  await assert.rejects(create(catalogDatabase(10001)).catalog(),/volumineux/);
});
