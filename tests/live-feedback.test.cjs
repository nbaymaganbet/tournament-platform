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
 const h=hooks(),rpc=[];const router={refresh(){}};const client={async rpc(name,args){rpc.push({name,args});return {error:null}}};const mod=load('app/organizer/tournaments/[id]/running/running-client.tsx',{react:h.react,...locale,'next/navigation':{useRouter:()=>router},'@/lib/supabase/client':{createClient:()=>client},'@/components/action-feedback':{ActionScope:'scope',useActionFeedback:()=>({pending:false,error:'',run:fn=>fn()})}});
 const m=(id,c)=>({id,category_id:c,status:'scheduled',match_number:Number(id.slice(1)),round_number:1,participant_a_id:id+'a',participant_b_id:id+'b'});const s=(id,z,n)=>({id:'s'+id,match_id:id,mat_id:z,scheduled_order:n});
 let props={timing:{duration:5,gap:0,rest:5},tournamentId:'t',initialMatches:[m('m1','c1'),m('m2','c2'),m('m3','c1')],initialSchedule:[s('m1','z1',1),s('m2','z2',2),s('m3','z1',3)],categoryNames:{c1:'Category 1',c2:'Category 2'},zoneNames:{z1:'Mat 1',z2:'Mat 2'}};
 const render=()=>{h.render(()=>mod.default(props));return h.render(()=>mod.default(props))};let tree=render();nodes(tree,'select')[0].props.onChange({target:{value:'z1'}});tree=render();nodes(tree,'select')[1].props.onChange({target:{value:'c1'}});tree=render();assert.deepEqual(nodes(tree,'article').map(n=>n.key),['sm1','sm3']);
 nodes(tree,'button').find(n=>n.props['aria-label']==='Опустить бой 1').props.onClick();await new Promise(setImmediate);assert.deepEqual(rpc[0].args.p_match_ids,['m3','m2','m1']);
 props={...props,initialMatches:[...props.initialMatches,m('m4','c1')],initialSchedule:[...props.initialSchedule,s('m4','z1',4)]};tree=render();assert.deepEqual(nodes(tree,'select').map(n=>n.props.value),['z1','c1']);assert.deepEqual(nodes(tree,'article').map(n=>n.key),['sm1','sm3','sm4']);h.cleanup();
});
