// REVIEW ONLY. Copied to an isolated bundle, never automatically deployed.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {createRuntime} from "./runtime-config.mjs";
Deno.serve(createRuntime({getEnv:name=>Deno.env.get(name),createClient}));
