const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const vm=require('node:vm');
function setup({size=100,type='image/webp',decodeFails=false,previewFails=false}={}){
 const calls=[];const dimensions=[];
 const context={exports:{},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>calls.push('revoke')},Image:class{naturalWidth=4800;naturalHeight=3200;async decode(){if(decodeFails)throw Error('decode')}},document:{createElement:()=>{const canvas={getContext:()=>({drawImage(){dimensions.push([canvas.width,canvas.height])}}),toBlob:cb=>cb({size,type})};return canvas}},crypto:{randomUUID:()=> 'uuid'}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/poster-upload.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
 const client={storage:{from:()=>({upload:async(path,body)=>{calls.push({path,body});return {error:previewFails&&path.endsWith('.webp')?{message:'failed'}:null}},getPublicUrl:path=>({data:{publicUrl:`https://example.test/${path}`}})})}};
 return {...context.exports,client,calls,dimensions};
}
const file={type:'image/jpeg',name:'poster.jpg',size:1000};
test('display copy is smaller, bounded and original upload stays untouched',async()=>{const s=setup();const result=await s.uploadPoster(s.client,file,'org','event');assert.equal(s.calls[1].body,file);assert.equal(s.calls[2].body.size,100);assert.deepEqual(s.dimensions[0],[2400,1600]);assert.equal(result.storage_path,'org/event/uuid-poster.jpg');assert.match(result.public_url,/preview.webp$/);assert.deepEqual(Array.from(s.posterStoragePaths(result)),[result.storage_path,`${result.storage_path}.preview.webp`]);});
test('larger compression or unsupported encoding retains original',async()=>{for(const config of [{size:2000},{type:'image/png'},{decodeFails:true}]){const s=setup(config);assert.equal(await s.compressPoster(file),file);assert.ok(s.calls.includes('revoke'));}});
test('failed optional preview upload still produces usable original URL',async()=>{const s=setup({previewFails:true});const result=await s.uploadPoster(s.client,file,'org','event');assert.equal(result.public_url,`https://example.test/${result.storage_path}`);assert.equal(s.posterStoragePaths(result).length,1);});
test('animated and vector inputs stay untouched',async()=>{const s=setup();for(const type of ['image/gif','image/svg+xml']){const input={...file,type};assert.equal(await s.compressPoster(input),input);}});
