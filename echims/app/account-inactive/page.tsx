export default function AccountInactivePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#CAF0F8] px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <h1 className="text-2xl font-bold text-[#03045E]">
          Account Inactive
        </h1>

        <p className="mt-4 text-sm leading-6 text-gray-600">
          Your eCHIMS account is currently inactive.
          Please contact the system administrator for assistance.
        </p>

        <a
          href="/login"
          className="mt-6 inline-block rounded-lg bg-[#0077B6] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#005F91]"
        >
          Back to Login
        </a>
      </div>
    </main>
  )
}