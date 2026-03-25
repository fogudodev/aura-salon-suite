/**
 * Backend Client
 * 
 * Exports the Supabase client as the unified API.
 * 
 * Usage: import { api } from "@/lib/api-client";
 */

import { supabase } from "@/integrations/supabase/client";

export const api = supabase;
export const apiAuth = api.auth;
