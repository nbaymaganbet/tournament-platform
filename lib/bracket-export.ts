import {bracketLayout,type BracketPerson,type BracketResult,type EventCategory,type EventMatch} from "./event-brackets";
import {pendingAthlete} from "./bracket-display";
import {bracketStage} from "./bracket-stage";
export type ExportCategory={category:EventCategory;matches:EventMatch[];results?:BracketResult[]};
// One landscape PDF page per category; the same geometry as the on-screen bracket.
export async function exportBrackets(title:string,groups:ExportCategory[],people:BracketPerson[],kk:boolean):Promise<Blob>{
 const names=new Map(people.map(p=>[p.id,p]));const images:{bytes:Uint8Array;width:number;height:number}[]=[];
 for(const {category,matches,results=[]} of groups){
  const layout=bracketLayout(matches);const roundRobin=category.format==="round_robin";
  const width=Math.max(1200,layout.width+60),height=Math.max(848,layout.height+230,roundRobin?matches.length*95+160:0);
  const canvas=document.createElement("canvas");canvas.width=width*1.5;canvas.height=height*1.5;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas unavailable");ctx.scale(1.5,1.5);ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);
  ctx.fillStyle="#111";ctx.font="bold 24px sans-serif";ctx.fillText(title,30,38,width-60);ctx.font="18px sans-serif";ctx.fillText(category.name,30,68,width-60);
  const person=(m:EventMatch,side:"a"|"b")=>{const id=side==="a"?m.participant_a_id:m.participant_b_id;return {id,p:id?names.get(id):undefined,name:(id?names.get(id)?.name:null)??pendingAthlete(m,side,matches,kk)}};
  if(roundRobin){matches.forEach((m,i)=>{ctx.fillStyle="#111";ctx.font="bold 16px sans-serif";ctx.fillText(`#${m.match_number} · ${bracketStage(m,matches,kk,true)}`,30,110+i*95);(["a","b"] as const).forEach((side,j)=>{const p=person(m,side);ctx.fillStyle=p.id===m.winner_id?"#167041":"#111";ctx.font="15px sans-serif";ctx.fillText(`${p.name} · ${[p.p?.club,p.p?.city].filter(Boolean).join(" · ")}`,30,134+i*95+j*24,width-60);});});}
  else{
   ctx.translate(22,95);ctx.strokeStyle="#777";ctx.lineWidth=1;
   for(const {from,to,loser} of layout.links){ctx.setLineDash(loser?[4,4]:[]);ctx.beginPath();ctx.moveTo(from.x+266,from.y+48);ctx.lineTo(from.x+282,from.y+48);ctx.lineTo(from.x+282,to.y+48);ctx.lineTo(to.x+8,to.y+48);ctx.stroke();}ctx.setLineDash([]);
   for(const {match:m,x,y} of layout.boxes){ctx.strokeStyle="#aaa";ctx.strokeRect(x+8,y+8,258,98);ctx.fillStyle="#555";ctx.font="11px sans-serif";ctx.fillText(`#${m.match_number} · ${bracketStage(m,matches,kk)}${m.status==="completed"?(kk?" · Аяқталды":" · Завершён"):""}`,x+16,y+25,240);(["a","b"] as const).forEach((side,i)=>{const p=person(m,side);ctx.fillStyle=p.id&&p.id===m.winner_id?"#167041":"#111";ctx.font="bold 12px sans-serif";ctx.fillText(p.name,x+16,y+45+i*30,240);ctx.font="10px sans-serif";ctx.fillStyle="#555";ctx.fillText([p.p?.club,p.p?.city].filter(Boolean).join(" · "),x+16,y+58+i*30,240);});}
   ctx.translate(-22,-95);
  }
  if(results.length){ctx.fillStyle="#111";ctx.font="bold 18px sans-serif";ctx.fillText(kk?"Нәтижелер":"Результаты",30,height-120,width-60);}
  ctx.fillStyle="#111";ctx.font="16px sans-serif";
  results.slice().sort((a,b)=>a.place-b.place).forEach((m,i)=>ctx.fillText(`${m.place}. ${names.get(m.participant_id)?.name??""}`,30,height-92+i*22,width-60));
  const url=canvas.toDataURL("image/jpeg",.92).split(",")[1];images.push({bytes:Uint8Array.from(atob(url),c=>c.charCodeAt(0)),width:canvas.width,height:canvas.height});canvas.width=0;canvas.height=0;
 }
 // Small PDF writer: JPEG XObjects avoid font substitution for Russian and Kazakh names.
 const enc=new TextEncoder(),parts:Uint8Array[]=[],offsets:number[]=[0];let size=0;
 const add=(data:string|Uint8Array)=>{const bytes=typeof data==="string"?enc.encode(data):data;parts.push(bytes);size+=bytes.length;};
 const obj=(id:number,body:string|Uint8Array)=>{offsets[id]=size;add(`${id} 0 obj\n`);add(body);add("\nendobj\n");};
 add("%PDF-1.4\n");obj(1,"<< /Type /Catalog /Pages 2 0 R >>");obj(2,`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_,i)=>`${3+i*3} 0 R`).join(" ")}] >>`);
 images.forEach((im,i)=>{const id=3+i*3;const scale=Math.min(842/im.width,595/im.height),w=im.width*scale,h=im.height*scale;const stream=`q ${w} 0 0 ${h} ${(842-w)/2} ${(595-h)/2} cm /Im${i} Do Q`;
 obj(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Im${i} ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);
 offsets[id+1]=size;add(`${id+1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`);add(im.bytes);add("\nendstream\nendobj\n");obj(id+2,`<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}\nendstream`);
 });
 const xref=size;add(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(let i=1;i<offsets.length;i++)add(`${String(offsets[i]).padStart(10,"0")} 00000 n \n`);add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
 return new Blob(parts as BlobPart[],{type:"application/pdf"});
}
