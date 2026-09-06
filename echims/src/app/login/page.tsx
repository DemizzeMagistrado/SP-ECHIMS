"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-blue-100 dark:bg-black">
      <div className="w-full max-w-md px-6">

        {/* eCHIMS Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">
            eCHIMS
          </h1>

          <p className="mt-2 text-green-600">
            Early Child Health Information and Monitoring System
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border p-8">

          <h2 className="text-2xl font-semibold">
            Welcome Back
          </h2>

          <p className="mt-2 text-sm text-blue-500">
            Sign in to your eCHIMS account
          </p>

          <form
            onSubmit={handleLogin}
            className="mt-6 space-y-5"
          >

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-2"
              >
                Email
              </label>

              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="example@email.com"
                required
                className="w-full rounded-lg border px-4 py-3 bg-white dark:bg-gray-800"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-2"
              >
                Password
              </label>

              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
                className="w-full rounded-lg border px-4 py-3 bg-white dark:bg-gray-800"
              />
            </div>

            {/* Remember / Forgot */}
            <div className="flex items-center justify-between text-sm">

              <label className="flex items-center gap-2">
                <input type="checkbox" />
                Remember me
              </label>

              <button
                type="button"
                className="underline"
              >
                Forgot password?
              </button>

            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-600">
                {error}
              </p>
            )}

            {/* Login */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-3 font-medium bg-black text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Logging in..." : "Log In"}
            </button>

          </form>

          <p className="mt-6 text-center text-xs text-blue-500">
            Authorized RHU Personnel Only
          </p>

        </div>
      </div>
    </main>
  );
}