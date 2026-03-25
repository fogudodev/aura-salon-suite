/**
 * useRealtime Hook
 * 
 * Subscribe to Supabase Realtime changes on a table.
 * 
 * Usage:
 *   useRealtime('bookings', { event: '*' }, (payload) => {
 *     queryClient.invalidateQueries({ queryKey: ['bookings'] });
 *   });
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

interface RealtimeOptions {
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  schema?: string;
  /** Query keys to invalidate on change */
  invalidateKeys?: string[][];
}

export function useRealtime(
  table: string,
  options: RealtimeOptions = {},
  callback?: (payload: any) => void
) {
  const queryClient = useQueryClient();
  const { event = "*", schema = "public", invalidateKeys } = options;
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handleChange = (payload: any) => {
      callbackRef.current?.(payload);
      if (invalidateKeys) {
        invalidateKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
    };

    const channel = api
      .channel(`${table}-changes`)
      .on(
        "postgres_changes" as any,
        { event, schema, table },
        handleChange
      )
      .subscribe();

    return () => {
      api.removeChannel(channel);
    };
  }, [table, event, schema, queryClient, invalidateKeys]);
}
