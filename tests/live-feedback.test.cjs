const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {execFileSync}=require('node:child_process');
const React=require('react');
const root=path.resolve(__dirname,'..');
function hooks(){
 let cells=[],cursor=0,pending=[];
 const react={...React,
  useState(initial){const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],v=>{cells[i]=typeof v==='function'?v(cells[i]):v}]},
  useRef(initial){const i=cursor++;return cells[i]??(cells[i]={current:initial})},
  useEffect(fn,deps){const i=cursor++;if(!cells[i]||deps.some((d,j)=>d!==cells[i].deps[j])){cells[i]?.cleanup?.();pending.push(()=>{cells[i]={deps,cleanup:fn()}})}},
  useMemo(fn,deps){const i=cursor++;if(!cells[i]||deps.some((d,j)=>d!==cells[i].deps[j]))cells[i]={deps,value:fn()};return cells[i].value},
  useTransition(){return [false,fn=>fn()]}};
 return {react,render(fn){cursor=0;pending=[];const out=fn();pending.forEach(f=>f());return out},cleanup(){cells.forEach(c=>c?.cleanup?.())}};
}
function load(rel,mocks){const file=path.join(root,rel);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const mod={exports:{}};new Function('require','module','exports',code)(id=>id in mocks?mocks[id]:id.startsWith('@/')?load(id.slice(2)+'.ts',mocks):require(id),mod,mod.exports);return mod.exports;}
class Target{constructor(){this.listeners={}}addEventListener(k,fn){(this.listeners[k]??=new Set()).add(fn)}removeEventListener(k,fn){this.listeners[k]?.delete(fn)}dispatchEvent(e){for(const fn of this.listeners[e.type]??[])fn(e);return true}}
function environment(){const w=global.window,d=global.document;global.window=new Target();global.document=Object.assign(new Target(),{visibilityState:'visible',blocked:false,querySelector(){return this.blocked?{}:null}});return()=>{global.window=w;global.document=d}}
const locale={'@/components/locale-provider':{useLocale:()=> 'ru'},'@/lib/ui-text':{uiText:(_l,v)=>v}};
function nodes(node,type){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(n=>nodes(n,type));return [...(node.type===type?[node]:[]),...nodes(node.props?.children,type)]}

test('actions lock synchronously, disable the scope, recover after failure and allow retry',async()=>{
 const restore=environment(),h=hooks();try{
  const mod=load('components/action-feedback.tsx',{react:h.react,...locale});let resets=0,calls=0,release;const render=()=>h.render(()=>mod.useActionFeedback(()=>resets++));let action=render();
  const one=action.run(async()=>{calls++;await new Promise(r=>release=r)});const two=action.run(async()=>calls++);assert.equal(calls,1);action=render();assert.equal(action.pending,true);
  const scope=mod.ActionScope({pending:action.pending,error:'',children:'contents'});assert.equal(scope.type,'fieldset');assert.equal(scope.props.disabled,true);assert.equal(scope.props['aria-busy'],true);
  release();await Promise.all([one,two]);action=render();assert.equal(action.pending,false);assert.equal(resets,1);
  await action.run(async()=>{throw Error('network')});action=render();assert.match(action.error,/Не удалось выполнить/);assert.equal(action.pending,false);assert.equal(resets,2);
  await action.run(async()=>calls++);action=render();assert.equal(action.error,'');assert.equal(calls,2);
 }finally{h.cleanup();restore()}
});

test('navigation spinner follows actual Next Link pending state and preserves link props',()=>{
 let pending=false;const Link=function Link(){};const mod=load('components/pending-link.tsx',{'next/link':{__esModule:true,default:Link,useLinkStatus:()=>({pending})},'@/components/loading-indicator':{__esModule:true,default:()=>null}});
 const link=mod.default({href:'/organizer',target:'_self',children:'Open'});assert.equal(link.type,Link);assert.equal(link.props.href,'/organizer');const child=link.props.children[1];assert.equal(child.type(),null);pending=true;assert.ok(child.type());
 const css=fs.readFileSync(path.join(root,'app/globals.css'),'utf8');assert.match(css,/@keyframes tp-spin/);assert.match(css,/button:not\(:disabled\):active/);
});

test('live refresh batches bursts, defers while editing, refreshes on reconnect and focus, and cleans up',async()=>{
 const restore=environment(),h=hooks(),timeouts=new Map(),intervals=new Map();let clock=0,id=0,callback,status,removed=0,refreshes=0,paused=false;const originals=[global.setTimeout,global.clearTimeout,global.setInterval,global.clearInterval];
 global.setTimeout=(fn,ms)=>{timeouts.set(++id,{fn,at:clock+ms});return id};global.clearTimeout=id=>timeouts.delete(id);global.setInterval=(fn,ms)=>{intervals.set(++id,fn);return id};global.clearInterval=id=>intervals.delete(id);
 const bindings=[];const channel={on(_kind,config,fn){bindings.push(config);callback=fn;return this},subscribe(fn){status=fn;return this}};
 try{
  const mod=load('lib/use-live-refresh.ts',{react:h.react,'@/lib/supabase/client':{createClient:()=>({channel:()=>channel,removeChannel(){removed++}})}});
  const render=()=>h.render(()=>mod.useLiveRefresh('t','matches,match_schedule',()=>{refreshes++},paused,15000));
  async function advance(ms){clock+=ms;for(const [key,t]of [...timeouts])if(t.at<=clock){timeouts.delete(key);await t.fn()}await Promise.resolve()}
  render();assert.equal(bindings[0].filter,'tournament_id=eq.t');assert.equal(bindings[1].filter,undefined);
  for(let i=0;i<100;i++)callback();assert.equal(timeouts.size,1);await advance(300);assert.equal(refreshes,1);
  paused=true;render();callback();await advance(300);assert.equal(refreshes,1);paused=false;render();await advance(400);assert.equal(refreshes,2);
  document.blocked=true;callback();await advance(300);assert.equal(refreshes,2);document.blocked=false;await advance(400);assert.equal(refreshes,3);
  status('SUBSCRIBED');await advance(300);assert.equal(refreshes,4);
  document.visibilityState='hidden';window.dispatchEvent(new Event('focus'));assert.equal(timeouts.size,0);document.visibilityState='visible';document.dispatchEvent(new Event('visibilitychange'));await advance(300);assert.equal(refreshes,5);
  h.cleanup();assert.equal(removed,1);assert.equal(intervals.size,0);assert.equal(timeouts.size,0);assert.equal(window.listeners.focus.size,0);
 }finally{[global.setTimeout,global.clearTimeout,global.setInterval,global.clearInterval]=originals;restore()}
});

test('participant list accepts external updates without losing an open edit form',()=>{
 const h=hooks(),client={};const mod=load('app/organizer/tournaments/[id]/participants/participants-client.tsx',{react:h.react,...locale,'@/lib/supabase/client':{createClient:()=>client},'@/lib/i18n':{translations:{ru:{participantStatuses:{confirmed:'confirmed'}}}},'@/components/action-feedback':{ActionScope:'scope',useActionFeedback:()=>({pending:false,error:'',run:fn=>fn()})}});
 const a={id:'a',participant_id:'a',first_name:'A',last_name:'One',status:'confirmed',payment_status:'paid',age:10,weight:35};const b={...a,id:'b',participant_id:'b',first_name:'B'};let rows=[a];const render=()=>{h.render(()=>mod.default({tournamentId:'t',initialRows:rows}));return h.render(()=>mod.default({tournamentId:'t',initialRows:rows}))};let tree=render();assert.equal(nodes(tree,'article').length,1);rows=[a,b];tree=render();assert.equal(nodes(tree,'article').length,2);
 nodes(tree,'button').find(n=>n.props['aria-label']==='Действия').props.onClick();tree=render();nodes(tree,'button').find(n=>n.props.children==='Изменить').props.onClick();tree=render();assert.equal(tree.props.paused,true);
 const first=nodes(tree,'input').find(n=>n.props.value==='A');first.props.onChange({target:{value:'Unsaved name'}});rows=[{...a,first_name:'External name'},b];tree=render();assert.ok(nodes(tree,'input').some(n=>n.props.value==='Unsaved name'));h.cleanup();
});

test('live refresh is read-only and the original realtime migration only enables publications',()=>{
 const refresh=fs.readFileSync(path.join(root,'components/live-refresh.tsx'),'utf8');assert.doesNotMatch(refresh,/\.rpc\(|\.insert\(|\.update\(|\.delete\(/);
 const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261031174622_enable_working_list_realtime.sql'),'utf8');assert.doesNotMatch(migration,/\b(insert|update|delete|truncate|drop|grant|revoke)\b/i);assert.match(migration,/alter publication supabase_realtime add table/);
});

test('weigh-in preserves an unsaved actual weight during an external refresh',()=>{
 const h=hooks();const mod=load('app/organizer/tournaments/[id]/weigh-in/weigh-in-client.tsx',{react:h.react,...locale,'@/lib/supabase/client':{createClient:()=>({})},'@/lib/i18n':{translations:{ru:{}}},'@/app/tournaments/[id]/register/registration-form':{__esModule:true,default:'registration'},'@/components/action-feedback':{ActionScope:'scope',useActionFeedback:()=>({pending:false,error:'',run:fn=>fn()})}});
 const category={id:'c',name:'Category',participantCount:1};const person={id:'p',first_name:'Athlete',last_name:'One',age:10,weight:35};let props={tournamentId:'t',initialCategories:[category],participants:[person],initialAssignments:{p:'c'},initialWeighIns:{p:{categoryId:'c',weight:null,status:'pending'}}};
 const render=()=>{h.render(()=>mod.default(props));return h.render(()=>mod.default(props))};let tree=render();const input=nodes(tree,'input').find(n=>n.props.type==='number');input.props.onChange({target:{value:'37'}});tree=render();assert.equal(tree.props.paused,true);
 props={...props,initialCategories:[{...category,participantCount:2}],participants:[person,{...person,id:'other'}],initialWeighIns:{p:{categoryId:'c',weight:36,status:'pending'}}};tree=render();assert.equal(nodes(tree,'input').find(n=>n.props.type==='number').props.value,37);h.cleanup();
});

test('running filters survive external bouts and reordering preserves hidden slots',async()=>{
 const h=hooks(),rpc=[];const router={refresh(){}};const client={async rpc(name,args){rpc.push({name,args});return {error:null}}};const mod=load('app/organizer/tournaments/[id]/running/running-client.tsx',{react:h.react,...locale,'@/components/match-scoreboard':{__esModule:true,default:()=>null},'next/navigation':{useRouter:()=>router},'@/lib/supabase/client':{createClient:()=>client},'@/components/action-feedback':{ActionScope:'scope',useActionFeedback:()=>({pending:false,error:'',run:fn=>fn()})}});
 const m=(id,c)=>({id,category_id:c,status:'scheduled',match_number:Number(id.slice(1)),round_number:1,participant_a_id:id+'a',participant_b_id:id+'b'});const s=(id,z,n)=>({id:'s'+id,match_id:id,mat_id:z,scheduled_order:n});
 let props={timing:{duration:5,gap:0,rest:5},tournamentId:'t',initialMatches:[m('m1','c1'),m('m2','c2'),m('m3','c1')],initialSchedule:[s('m1','z1',1),s('m2','z2',2),s('m3','z1',3)],categoryNames:{c1:'Category 1',c2:'Category 2'},zoneNames:{z1:'Mat 1',z2:'Mat 2'}};
 const render=()=>{h.render(()=>mod.default(props));return h.render(()=>mod.default(props))};let tree=render();nodes(tree,'select')[0].props.onChange({target:{value:'z1'}});tree=render();nodes(tree,'select')[1].props.onChange({target:{value:'c1'}});tree=render();assert.deepEqual(nodes(tree,'article').map(n=>n.key),['sm1','sm3']);
 nodes(tree,'button').find(n=>n.props['aria-label']==='Опустить бой 1').props.onClick();await new Promise(setImmediate);assert.deepEqual(rpc[0].args.p_match_ids,['m3','m2','m1']);
 props={...props,initialMatches:[...props.initialMatches,m('m4','c1')],initialSchedule:[...props.initialSchedule,s('m4','z1',4)]};tree=render();assert.deepEqual(nodes(tree,'select').map(n=>n.props.value),['z1','c1']);assert.deepEqual(nodes(tree,'article').map(n=>n.key),['sm1','sm3','sm4']);h.cleanup();
});

test('before start, only walkover can be recorded; points result requires both scores',async()=>{
 const h=hooks(),rpc=[];const client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})}),async rpc(name,args){rpc.push({name,args});return{error:null}}};
 const mod=load('app/organizer/tournaments/[id]/running/running-client.tsx',{react:h.react,...locale,'@/components/match-scoreboard':{__esModule:true,default:()=>null},'next/navigation':{useRouter:()=>({refresh(){}})},'@/lib/supabase/client':{createClient:()=>client},'@/components/action-feedback':{ActionScope:'scope',useActionFeedback:()=>({pending:false,error:'',run:fn=>fn()})}});
 const match={id:'m',category_id:'c',status:'scheduled',match_number:1,round_number:1,participant_a_id:'a',participant_b_id:'b',winner_id:null,participantA:{last_name:'A',first_name:'One'},participantB:{last_name:'B',first_name:'Two'}};
 let props={tournamentId:'t',initialMatches:[match],initialSchedule:[{id:'s',match_id:'m',scheduled_order:1,mat_id:'z'}],categoryNames:{c:'Category'},zoneNames:{z:'Mat'},timing:{duration:5,gap:0,rest:5}};
 const render=()=>h.render(()=>mod.default(props));let tree=render();assert.equal(nodes(tree,'button').filter(n=>n.props.children==='Победа').length,0);
 nodes(tree,'button').find(n=>n.props.children==='Неявка').props.onClick();await new Promise(setImmediate);tree=render();let dialog=nodes(tree,'dialog')[0];assert.deepEqual(nodes(dialog,'option').map(n=>n.props.value),['walkover']);nodes(dialog,'button').find(n=>n.props.children==='Подтвердить победу').props.onClick();await new Promise(setImmediate);assert.equal(rpc.at(-1).args.p_method,'walkover');
 props={...props,initialMatches:[{...match,status:'running'}]};render();tree=render();nodes(tree,'button').find(n=>n.props.children==='Победа').props.onClick();await new Promise(setImmediate);tree=render();dialog=nodes(tree,'dialog')[0];assert.equal(nodes(dialog,'option').length,7);assert.equal(nodes(dialog,'input').length,2);
 let count=rpc.length;nodes(dialog,'button').find(n=>n.props.children==='Подтвердить победу').props.onClick();await new Promise(setImmediate);assert.equal(rpc.length,count);
 nodes(dialog,'input')[0].props.onChange({target:{value:'4'}});nodes(dialog,'input')[1].props.onChange({target:{value:'2'}});tree=render();dialog=nodes(tree,'dialog')[0];nodes(dialog,'button').find(n=>n.props.children==='Подтвердить победу').props.onClick();await new Promise(setImmediate);assert.equal(rpc.at(-1).args.p_method,'points');assert.equal(rpc.at(-1).args.p_score_a,4);assert.equal(rpc.at(-1).args.p_score_b,2);assert.equal(rpc.at(-1).args.p_winner_id,'a');h.cleanup();
});

test('hiding optional schedule settings preserves current and edited values without writes',async()=>{
 const h=hooks(),rpc=[];const action={pending:false,error:'',run:fn=>fn()};
 const mod=load('app/organizer/tournaments/[id]/schedule/schedule-client.tsx',{react:h.react,...locale,'@/components/action-feedback':{ActionScope:()=>null,useActionFeedback:()=>action},'@/lib/supabase/client':{createClient:()=>({rpc:async(name,args)=>{rpc.push({name,args});return {error:null}}})}});
 const props={tournamentId:'t',startTime:'11:00',scheduledCount:32,timing:{duration:7,gap:2,rest:8}};
 const render=()=>h.render(()=>mod.default(props));let tree=render();
 assert.equal(nodes(tree,'input').filter(n=>n.props.type==='number').length,0);assert.equal(rpc.length,0);
 nodes(tree,'input').find(n=>n.props.type==='checkbox').props.onChange({target:{checked:true}});tree=render();
 assert.deepEqual(nodes(tree,'input').filter(n=>n.props.type==='number').map(n=>n.props.value),[7,2,8]);
 nodes(tree,'input').find(n=>n.props.type==='number').props.onChange({target:{value:'9'}});
 tree=render();nodes(tree,'input').find(n=>n.props.type==='checkbox').props.onChange({target:{checked:false}});
 tree=render();assert.equal(rpc.length,0);nodes(tree,'input').find(n=>n.props.type==='checkbox').props.onChange({target:{checked:true}});
 tree=render();assert.deepEqual(nodes(tree,'input').filter(n=>n.props.type==='number').map(n=>n.props.value),[9,2,8]);
 nodes(tree,'button').find(n=>n.props.children==='Сохранить параметры').props.onClick();await new Promise(setImmediate);
 assert.deepEqual(rpc,[{name:'save_bout_timing',args:{p_tournament_id:'t',p_duration:9,p_interval:2,p_rest:8}}]);h.cleanup();
});
test('moving zone controls retains manual assignments and only writes after an explicit selection',async()=>{
 const restore=environment(),h=hooks(),rpc=[];try{
  const action={pending:false,error:'',run:fn=>fn()};
  const mod=load('app/organizer/tournaments/[id]/schedule/category-zones.tsx',{react:h.react,...locale,'@/components/action-feedback':{ActionScope:()=>null,useActionFeedback:()=>action},'@/lib/supabase/client':{createClient:()=>({rpc:async(name,args)=>{rpc.push({name,args});return {error:null}}})}});
  const props={tournamentId:'t',initialCategories:[{id:'c',name:'Category',count:2,preferred_mat_id:'z'}],mats:[{id:'z',name:'Mat',is_active:false}]};
  const render=()=>h.render(()=>mod.default(props));let tree=render();assert.equal(rpc.length,0);
  assert.equal(nodes(tree,'select')[0].props.value,'z');assert.equal(nodes(tree,'option').length,2);
  nodes(tree,'select')[0].props.onChange({target:{value:''}});await new Promise(setImmediate);tree=render();
  assert.equal(nodes(tree,'select')[0].props.value,'');assert.deepEqual(rpc,[{name:'set_category_schedule_zone',args:{p_category_id:'c',p_mat_id:null}}]);
 }finally{h.cleanup();restore()}
});

test('public and organizer bracket cards and diagram share PDF stage names even when round numbers repeat',()=>{
 const h=hooks();try{
  const mod=load('components/bracket-view.tsx',{react:h.react});
  const match=(id,num,next=null,loser=null)=>({id,match_number:num,round_number:1,category_id:'c',next_match_id:next,loser_next_match_id:loser,status:'scheduled',winner_id:null,participant_a_id:null,participant_b_id:null});
  const matches=[match('s1',1,'f','b'),match('s2',2,'f','b'),match('f',3),match('b',4)];
  const render=()=>h.render(()=>mod.default({matches,people:[],kk:false}));let tree=render();
  const text=node=>node==null?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
  assert.deepEqual(nodes(tree,'h3').map(text),['Полуфинал','Финал','За 3-е место']);
  assert.deepEqual(nodes(tree,'article').map(n=>text(nodes(n,'strong')[0])),['#1 · Полуфинал','#2 · Полуфинал','#3 · Финал','#4 · За 3-е место']);
  nodes(tree,'button').find(n=>text(n)==='Показать сетку').props.onClick();tree=render();
  const labels=nodes(nodes(tree,'svg')[0],'text').map(text);
  for(const label of ['#1 · Полуфинал','#3 · Финал','#4 · За 3-е место'])assert.ok(labels.some(value=>value.startsWith(label)));
  const robin=h.render(()=>mod.default({matches,people:[],kk:false,roundRobin:true}));
  assert.deepEqual(nodes(robin,'h3').map(text),['Тур 1']);
 }finally{h.cleanup()}
});
test('running uses each complete category bracket for stages and preserves round-robin labels',()=>{
 const h=hooks();try{
  const mod=load('app/organizer/tournaments/[id]/running/running-client.tsx',{react:h.react,...locale,'@/components/match-scoreboard':{__esModule:true,default:()=>null},'next/navigation':{useRouter:()=>({refresh(){}})},'@/lib/supabase/client':{createClient:()=>({})},'@/components/action-feedback':{ActionScope:'scope',useActionFeedback:()=>({pending:false,error:'',run:fn=>fn()})}});
  const match=(id,category,next=null)=>({id,category_id:category,match_number:Number(id.slice(1)),round_number:1,next_match_id:next,loser_next_match_id:null,status:'scheduled',winner_id:null,participant_a_id:null,participant_b_id:null});
  const props={tournamentId:'t',initialMatches:[match('m1','c','m2'),match('m2','c'),match('m3','r')],initialSchedule:[{id:'s1',match_id:'m1',scheduled_order:1,mat_id:'z'},{id:'s2',match_id:'m2',scheduled_order:2,mat_id:'z'},{id:'s3',match_id:'m3',scheduled_order:3,mat_id:'z'}],categoryNames:{c:'Elimination',r:'Robin'},categoryFormats:{r:'round_robin'},zoneNames:{z:'Mat'},timing:{duration:5,gap:0,rest:5}};
  let tree=h.render(()=>mod.default(props));tree=h.render(()=>mod.default(props));
  const labels=nodes(tree,'span').map(n=>n.props.children);
  assert.ok(labels.includes('Полуфинал'));assert.ok(labels.includes('Финал'));assert.ok(labels.includes('Тур 1'));
 }finally{h.cleanup()}
});
test('registration success does not issue a ticket or expose a private status link',async()=>{
 const h=hooks();try{
  const calls=[],action={pending:false,error:'',run:fn=>fn()};
  const mod=load('app/tournaments/[id]/register/registration-form.tsx',{react:h.react,...locale,'@/components/pending-link':{__esModule:true,default:'a'},'@/components/action-feedback':{ActionScope:'scope',useActionFeedback:()=>action},'@/lib/supabase/client':{createClient:()=>({rpc:async(name,args)=>{calls.push(name);return{data:[{registration_id:'test-registration',application_number:'TEST-APPLICATION'}],error:null}}})}});
  const render=()=>h.render(()=>mod.default({tournamentId:'t'}));let tree=render();
  for(const [index,value]of [[0,'First'],[1,'Last'],[2,'12'],[3,'40']]){nodes(tree,'input')[index].props.onChange({target:{value}});tree=render()}
  await nodes(tree,'form')[0].props.onSubmit({preventDefault(){}});tree=render();
  assert.deepEqual(calls,['submit_tournament_registration']);assert.deepEqual(nodes(tree,'a').map(n=>n.props.href),['/tournaments/t']);
  const rendered=JSON.stringify(tree);assert.ok(rendered.includes('Заявка отправлена'));assert.ok(!rendered.includes('TEST-APPLICATION'));assert.ok(!rendered.includes('/registration/status'));
  assert.equal(fs.existsSync(path.join(root,'app/registration/status/page.tsx')),false);
 }finally{h.cleanup()}
});

test('confirmation cancellation appears only for confirmed rows, matches menu styling and supports reconfirmation',async()=>{
 const restore=environment(),h=hooks(),rpc=[];try{
  global.window.confirm=()=>true;global.window.alert=message=>{throw Error(message)};
  const client={rpc:async(name,args)=>{rpc.push({name,args});return {data:{registration_id:'r'},error:null}}};
  const mod=load('app/organizer/tournaments/[id]/participants/participants-client.tsx',{react:h.react,...locale,'@/lib/supabase/client':{createClient:()=>client},'@/components/action-feedback':{ActionScope:'scope',useActionFeedback:()=>({pending:false,error:'',run:fn=>fn()})}});
  const row={id:'r',participant_id:'p',application_number:'A-1',status:'confirmed',payment_status:'paid',first_name:'First',last_name:'Last',age:12,weight:50,experience:null,phone:null,city:null,club:null,coach:null};
  const props={tournamentId:'t',initialRows:[row]},render=()=>h.render(()=>mod.default(props));let tree=render();
  nodes(tree,'button').find(n=>n.props['aria-label']==='Действия').props.onClick();tree=render();
  const edit=nodes(tree,'button').find(n=>n.props.children==='Изменить'),cancel=nodes(tree,'button').find(n=>n.props.children==='Отменить подтверждение');
  assert.equal(cancel.props.className,edit.props.className);assert.deepEqual(cancel.props.style,edit.props.style);
  cancel.props.onClick();await new Promise(setImmediate);tree=render();
  assert.deepEqual(rpc,[{name:'cancel_tournament_registration',args:{p_registration_id:'r'}}]);
  assert.ok(nodes(tree,'button').some(n=>n.props.children==='Подтвердить заявку'));
  nodes(tree,'button').find(n=>n.props['aria-label']==='Действия').props.onClick();tree=render();
  assert.ok(!nodes(tree,'button').some(n=>n.props.children==='Отменить подтверждение'));
  nodes(tree,'button').find(n=>n.props.children==='Подтвердить заявку').props.onClick();await new Promise(setImmediate);tree=render();
  assert.equal(rpc.at(-1).name,'confirm_tournament_registration');assert.ok(nodes(tree,'button').some(n=>n.props.children==='Заявка подтверждена'));
 }finally{h.cleanup();restore()}
});
test('declined and bracket-blocked cancellation keep the participant confirmed',async()=>{
 const restore=environment(),h=hooks(),rpc=[],alerts=[];let consent=false;try{
  global.window.confirm=()=>consent;global.window.alert=message=>alerts.push(message);
  const mod=load('app/organizer/tournaments/[id]/participants/participants-client.tsx',{react:h.react,...locale,'@/lib/supabase/client':{createClient:()=>({rpc:async(name,args)=>{rpc.push({name,args});return{data:null,error:{message:'Participant is already in a bracket; confirmation cannot be cancelled'}}}})},'@/components/action-feedback':{ActionScope:'scope',useActionFeedback:()=>({pending:false,error:'',run:fn=>fn()})}});
  const props={tournamentId:'t',initialRows:[{id:'r',participant_id:'p',application_number:'A-1',status:'confirmed',payment_status:'paid',first_name:'First',last_name:'Last',age:12,weight:50}]};
  const render=()=>h.render(()=>mod.default(props));let tree=render();
  const open=()=>{nodes(tree,'button').find(n=>n.props['aria-label']==='Действия').props.onClick();tree=render()};
  open();nodes(tree,'button').find(n=>n.props.children==='Отменить подтверждение').props.onClick();await new Promise(setImmediate);tree=render();assert.equal(rpc.length,0);
  consent=true;open();nodes(tree,'button').find(n=>n.props.children==='Отменить подтверждение').props.onClick();await new Promise(setImmediate);tree=render();
  assert.equal(rpc.length,1);assert.match(alerts[0],/уже включён в сетку/);assert.ok(nodes(tree,'button').some(n=>n.props.children==='Заявка подтверждена'));
 }finally{h.cleanup();restore()}
});
