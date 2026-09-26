"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PrivacyPage() {
  const router = useRouter();

  const handleAccept = () => {
    sessionStorage.setItem("echims_terms_accepted", "true");
    router.push("/register");
  };

  return (
    <main className="min-h-screen bg-[#CAF0F8] px-4 py-10">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-3xl font-bold text-slate-800">
          Privacy Policy
        </h1>

        <p className="mb-6 text-sm text-slate-500">
          eCHIMS – Early Child Health Information and Monitoring System
        </p>

        <div className="legal-scroll max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 p-6 text-sm leading-7 text-slate-700">
          <h2 className="mb-2 text-lg font-semibold">
            1. Information Collected
          </h2>

          <p className="mb-5">
            During registration, eCHIMS may collect information
            necessary to establish and manage authorized
            personnel accounts, including personal, contact,
            professional, and assignment information.
          </p>

          <h2 className="mb-2 text-lg font-semibold">
            2. Use of Information
          </h2>

          <p className="mb-5">
            Information is used to manage authorized access,
            assign personnel to appropriate health facilities
            and areas, support health program activities, and
            maintain system accountability.
          </p>

          <h2 className="mb-2 text-lg font-semibold">
            3. Child Health Information
          </h2>

          <p className="mb-5">
            Child and guardian information recorded in eCHIMS
            should only be accessed and processed by authorized
            personnel for legitimate child health program
            activities.
          </p>

          <h2 className="mb-2 text-lg font-semibold">
            4. Data Security
          </h2>

          <p className="mb-5">
            Access controls, authentication, role-based
            permissions, and other security mechanisms are used
            to help protect information stored in the system.
          </p>

          <h2 className="mb-2 text-lg font-semibold">
            5. User Responsibility
          </h2>

          <p className="mb-5">
            Users must protect their login credentials and must
            not disclose or misuse information accessed through
            eCHIMS.
          </p>

          <h2 className="mb-2 text-lg font-semibold">
            6. Acceptance
          </h2>

          <p>
            By accepting this Privacy Policy, you acknowledge
            that you understand how information associated with
            your eCHIMS account may be collected and used for
            authorized system and child health program
            activities.
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