"use client";

import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";

type Locale="ru"|"kk";

export default function LanguageToggle(){
 const router=useRouter();
 const [locale,setLocale]=useState<Locale>("ru");
 useEffect(()=>{const v=localStorage.getItem("tp-lang");if(v==="kk")setLocale("kk")},[]);
 function change(next:Locale){setLocale(next);localStorage.setItem("tp-lang",next);document.cookie=`tp-lang=${next}; path=/; max-age=31536000; samesite=lax`;router.refresh()}
 return <div className="language-toggle" aria-label="Language"><button type="button" className={locale==="ru"?"active":""} onClick={()=>change("ru")}>RU</button><button type="button" className={locale==="kk"?"active":""} onClick={()=>change("kk")}>KZ</button></div>;
}
