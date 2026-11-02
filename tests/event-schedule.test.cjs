const test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('fs'),vm=require('vm');
function load(file){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:mod,exports:mod.exports,require,Date,Map,Set,Math});return mod.exports;}
const {projectSchedule,nextMatchIds,bracketLayout}=load('lib/event-brackets.ts');
const now=Date.parse('2026-11-02T10:00:00Z');
const base={round_number:1,next_match_id:null,loser_next_match_id:null,winner_id:null,status:'scheduled',category_id:'c',participant_a_id:'a',participant_b_id:'b',mat_id:'mat',approximate_time:'2026-11-02T05:00:00Z'};
const match=(id,order,extra={})=>({...base,id,match_number:order,scheduled_order:order,...extra});
test('overrunning bout shifts remaining forecast and leaves current bout intact',()=>{
 const rows=projectSchedule([match('1',1,{status:'running',started_at:'2026-11-02T09:45:00Z'}),match('2',2,{participant_a_id:'c',participant_b_id:'d'}),match('3',3,{participant_a_id:'e',participant_b_id:'f'})],5,1,5,now);
 assert.equal(rows[0].status,'running');assert.equal(Date.parse(rows[1].approximate_time),now+60000);assert.equal(Date.parse(rows[2].approximate_time),now+7*60000);
 assert.equal(nextMatchIds(rows).size,0);
});
test('completed bouts never pull the queue back to event opening',()=>{
 const rows=projectSchedule([match('1',1,{status:'completed',completed_at:'2026-11-02T09:59:00Z'}),match('2',2,{participant_a_id:'c',participant_b_id:'d'}),match('3',3,{participant_a_id:'e',participant_b_id:'f'})],5,0,5,now);
 assert.equal(Date.parse(rows[1].approximate_time),now);assert.equal(Date.parse(rows[2].approximate_time),now+5*60000);assert.ok(nextMatchIds(rows).has('2'));
});
test('future final waits for both feeders and athlete rest across mats',()=>{
 const rows=projectSchedule([match('1',1,{status:'running',started_at:'2026-11-02T09:59:00Z',next_match_id:'3'}),match('2',2,{mat_id:'other',participant_a_id:'c',participant_b_id:'d',next_match_id:'3'}),match('3',3,{round_number:2,participant_a_id:null,participant_b_id:null})],5,0,5,now);
 assert.equal(Date.parse(rows[2].approximate_time),now+10*60000);
});
test('pre-event planned schedule stays unchanged',()=>{
 const rows=[match('1',1),match('2',2)];assert.equal(projectSchedule(rows,5,0,5,Date.parse('2026-11-02T04:00:00Z')),rows);
});
test('bracket diagram preserves both semifinal links and separate bronze branch',()=>{
 const rows=[match('1',1,{next_match_id:'3',loser_next_match_id:'4'}),match('2',2,{next_match_id:'3',loser_next_match_id:'4'}),match('3',3,{round_number:2}),match('4',4,{round_number:2})];const layout=bracketLayout(rows);
 assert.equal(layout.boxes.length,4);assert.equal(layout.links.length,4);assert.equal(layout.links.filter(l=>l.loser).length,2);assert.ok(layout.boxes.find(b=>b.match.id==='4').y>layout.boxes.find(b=>b.match.id==='3').y);
});

test('diagram columns follow feeder links even when stored round numbers repeat',()=>{
 const rows=[match('1',1,{round_number:3,next_match_id:'3'}),match('2',2,{round_number:2,next_match_id:'3'}),match('3',3,{round_number:3})];const layout=bracketLayout(rows);
 for(const {from,to} of layout.links)assert.ok(to.x>from.x);
});
