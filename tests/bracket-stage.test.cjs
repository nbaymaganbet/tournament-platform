const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/bracket-stage.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod.exports,Set});
const {bracketStage}=mod.exports;
const match=(id,next=null,loser=null,round=1)=>({id,match_number:1,round_number:round,next_match_id:next,loser_next_match_id:loser});
test('stages follow links even when stored round numbers repeat',()=>{
 const group=[match('q','s'),match('s','f'),match('f')];
 assert.equal(bracketStage(group[0],group,false),'1/4 финала');
 assert.equal(bracketStage(group[1],group,false),'Полуфинал');
 assert.equal(bracketStage(group[2],group,false),'Финал');
 assert.equal(bracketStage(group[1],group,true),'Жартылай финал');
});
test('bronze differs from the terminal final',()=>{
 const group=[match('a','f','b'),match('c','f','b'),match('f'),match('b')];
 assert.equal(bracketStage(group[0],group,false),'Полуфинал');
 assert.equal(bracketStage(group[2],group,false),'Финал');
 assert.equal(bracketStage(group[3],group,false),'За 3-е место');
});
test('three-athlete repechage does not mislabel a qualifier as bronze',()=>{
 const group=[match('a','f','b'),match('b','f',null,2),match('f',null,null,3)];
 assert.equal(bracketStage(group[0],group,false),'Предварительная встреча');
 assert.equal(bracketStage(group[1],group,false),'Отборочная встреча');
 assert.equal(bracketStage(group[2],group,false),'Финал');
});
test('round robin never gets elimination stage names',()=>{
 const group=[match('a',null,null,3)];
 assert.equal(bracketStage(group[0],group,false,true),'Тур 3');
});
test('broken links and cycles use a safe fallback',()=>{
 const broken=[match('a','missing')],cyclic=[match('a','b'),match('b','a')];
 assert.equal(bracketStage(broken[0],broken,false),'Этап 1');
 assert.equal(bracketStage(cyclic[0],cyclic,false),'Этап 1');
});
