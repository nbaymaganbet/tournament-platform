import { createClient } from "@/lib/supabase/server";
import { hasTournamentPermission, permissionDeniedPage } from "@/lib/tournament-permissions";

export default async function SettingsLayout({children,params}:{children:React.ReactNode;params:Promise<{id:string}>}){
  const {id}=await params;
  const s=await createClient();
  if(!(await hasTournamentPermission(s,id,"settings"))) return permissionDeniedPage();
  return children;
}
