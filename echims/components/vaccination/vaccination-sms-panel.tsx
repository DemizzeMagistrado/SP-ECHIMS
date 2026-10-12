"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { ProgramSmsPanel } from "@/components/sms/program-sms-panel";
export function VaccinationSmsPanel() {
  const client = useMemo(() => createClient(), []);
  const [owner, setOwner] = useState<string | null>(null),
    [ready, setReady] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    const initial = generation.current;
    const apply = (id: string | null) => {
      if (active) {
        setOwner(id);
        setReady(true);
      }
    };
    void client.auth
      .getUser()
      .then(
        ({
          data,
          error,
        }: {
          data: { user: { id: string } | null };
          error: unknown;
        }) => {
          if (active && generation.current === initial)
            apply(error ? null : (data.user?.id ?? null));
        },
      )
      .catch(() => {
        if (active && generation.current === initial) apply(null);
      });
    const { data: subscription } = client.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        generation.current++;
        apply(session?.user.id ?? null);
      },
    );
    return () => {
      active = false;
      generation.current++;
      subscription.subscription.unsubscribe();
    };
  }, [client]);
  if (!ready)
    return (
      <p className="text-sm text-muted-foreground">Checking your session…</p>
    );
  if (!owner)
    return (
      <p className="text-sm text-muted-foreground">
        Please sign in to view vaccination SMS reminders.
      </p>
    );
  return (
    <ProgramSmsPanel
      key={`${owner}:VACCINATION`}
      ownerId={owner}
      program="VACCINATION"
    />
  );
}
