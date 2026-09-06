"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SupabaseTestPage() {
  const [status, setStatus] = useState("Testing Supabase connection...");

  useEffect(() => {
    async function testConnection() {
      const supabase = createClient();

      const { error } = await supabase
        .from("users")
        .select("user_id")
        .limit(1);

      if (error) {
        console.error("Supabase connection error:", error);
        setStatus(`❌ Connection failed: ${error.message}`);
        return;
      }

      setStatus("✅ Supabase connected successfully!");
    }

    testConnection();
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">
          eCHIMS Supabase Test
        </h1>

        <p className="mt-4">
          {status}
        </p>
      </div>
    </main>
  );
}