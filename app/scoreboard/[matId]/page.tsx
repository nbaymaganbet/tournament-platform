import ScoreboardScreen from "@/components/scoreboard-screen";
import {getLocale} from "@/lib/i18n-server";
export default async function ScoreboardPage({params}:{params:Promise<{matId:string}>}){const{matId}=await params;return <ScoreboardScreen matId={matId} kk={(await getLocale())==="kk"}/>;}
