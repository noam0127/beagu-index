// Factory for a future dedicated Edge Function; caller supplies existing service client and approved identity provider.
import {createBoundary} from "./server-boundary.mjs";
import {policy} from "./record-policy.mjs";
import {createGateway} from "./gateway.mjs";
import {createRemoteVerifier,createSupabaseAdapters} from "./supabase-bridge.mjs";
export function createOfficialHandler({admin,supabaseUrl,actorSecret,workerUrl,workerSecret,getIdentityToken,enabled=()=>false,fetcher=fetch}){
 const adapters=createSupabaseAdapters({admin,supabaseUrl,actorSecret,fetcher});
 const replayVerifier=createRemoteVerifier({workerUrl,secret:workerSecret,getIdentityToken,fetcher});
 const boundary=createBoundary({policy,...adapters,replayVerifier,newId:()=>crypto.randomUUID(),seed:()=>crypto.getRandomValues(new Uint32Array(1))[0]});
 return createGateway({boundary,authenticate:adapters.authenticate,listRecords:adapters.listRecords,enabled});
}
