"use client";
import type {EventCategory,BracketPerson} from "@/lib/event-brackets";
export type BracketFilter={category:string;search:string;club:string;city:string};
export const emptyBracketFilter:BracketFilter={category:"",search:"",club:"",city:""};
export function matchesAthleteFilter(person:BracketPerson,filter:BracketFilter){
 return (!filter.search||person.name.toLocaleLowerCase().includes(filter.search.toLocaleLowerCase()))
  &&(!filter.club||person.club===filter.club)
  &&(!filter.city||person.city===filter.city);
}
export function filterCategories<T extends EventCategory>(categories:T[],people:BracketPerson[],filter:BracketFilter){return categories.filter(c=>(!filter.category||c.id===filter.category)&&(!filter.search&&!filter.club&&!filter.city||people.some(p=>p.category_id===c.id&&matchesAthleteFilter(p,filter))));}
export default function BracketFilters({categories,people,value,onChange,kk,collapseAll=false}:{categories:EventCategory[];people:BracketPerson[];value:BracketFilter;onChange:(value:BracketFilter)=>void;kk:boolean;collapseAll?:boolean}){
 const options=(key:"club"|"city")=>[...new Set(people.map(p=>p[key]).filter((v):v is string=>!!v))].sort();
 const basic=<>
   <label>{kk?"Санат":"Категория"}<select value={value.category} onChange={e=>onChange({...value,category:e.target.value})}>
     <option value="">{kk?"Барлық санаттар":"Все категории"}</option>
     {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
   </select></label>
   <label>{kk?"Спортшы":"Спортсмен"}<input type="search" value={value.search} placeholder={kk?"Аты-жөні":"Имя или фамилия"} onChange={e=>onChange({...value,search:e.target.value})}/></label>
 </>;
 const additional=(["city","club"] as const).map(key=><label key={key}>
   {key==="city"?(kk?"Қала":"Город"):"Клуб"}
   <select value={value[key]} onChange={e=>onChange({...value,[key]:e.target.value})}>
     <option value="">{kk?"Барлығы":"Все"}</option>
     {options(key).map(v=><option key={v}>{v}</option>)}
   </select>
 </label>);
 const active=[value.city,value.club,...(collapseAll?[categories.find(c=>c.id===value.category)?.name,value.search]:[])].filter(Boolean);
 return <>
   {!collapseAll&&<div className="bracket-filters">{basic}</div>}
   <details className="filter-disclosure">
     <summary>{kk?"Сүзгілер":"Фильтры"}{active.length>0&&<span className="muted"> · {active.join(" · ")}</span>}</summary>
     <div className="bracket-filters">{collapseAll&&basic}{additional}</div>
   </details>
 </>;
}
