"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function TermsPage() {
  const router = useRouter();

  const handleAccept = () => {
    sessionStorage.setItem("echims_terms_accepted", "true");
    router.push("/register");
  };

  return (
    <main className="min-h-screen bg-[#CAF0F8] px-4 py-10">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-3xl font-bold text-slate-800">
          Terms and Conditions
        </h1>

        <p className="mb-6 text-sm text-slate-500">
          eCHIMS – Early Child Health Information and Monitoring System
        </p>

        <div className="legal-scroll max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 p-6 text-sm leading-7 text-slate-700">
          <h2 className="mb-2 text-lg font-semibold">
            1. Authorized Use
          </h2>

          <p className="mb-5">
            eCHIMS is intended for authorized health personnel
            involved in child health program management. Users
            must only access information necessary for their
            assigned responsibilities.
          </p>

          <h2 className="mb-2 text-lg font-semibold">
            2. Account Responsibility
          </h2>

          <p className="mb-5">
            Users are responsible for maintaining the
            confidentiality of their account credentials and
            must not share their account with another person.
          </p>

          <h2 className="mb-2 text-lg font-semibold">
            3. Protection of Information
          </h2>

          <p className="mb-5">
            Users must handle child, guardian, health,
            vaccination, nutrition, and other system information
            responsibly and only for legitimate health program
            activities.
          </p>

          <h2 className="mb-2 text-lg font-semibold">
            4. Accurate Information
          </h2>

          <p className="mb-5">
            Users are expected to provide accurate and
            appropriate information when registering and when
            recording child health activities.
          </p>

          <h2 className="mb-2 text-lg font-semibold">
            5. System Security
          </h2>

          <p className="mb-5">
            Unauthorized access, misuse of accounts, alteration
            of records, and other activities that compromise
            system security are prohibited.
          </p>

          <h2 className="mb-2 text-lg font-semibold">
            6. Acceptance
          </h2>

          <p>
            By accepting these Terms and Conditions, you
            acknowledge that you understand and agree to follow
            the requirements governing authorized use of eCHIMS.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Link
            href="/register"
            className="rounded-lg border border-slate-300 px-6 py-3 text-center font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to Registration
          </Link>

          <button
            type="button"
            onClick={handleAccept}
            className="rounded-lg bg-sky-600 px-6 py-3 font-semibold text-white hover:bg-sky-700"
          >
            Accept and Continue
          </button>
        </div>
      </div>
    </main>
  );
}