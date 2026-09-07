"use client";

import "./authentication.css";

import { FormEvent, ReactNode, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Role =
  | "Administrator"
  | "Health Worker"
  | "Public Health Nurse"
  | "Barangay Health Worker"
  | "Rural Health Midwife"
  | "Nutrition Scholar";

const roles: Role[] = [
  "Administrator",
  "Health Worker",
  "Public Health Nurse",
  "Barangay Health Worker",
  "Rural Health Midwife",
  "Nutrition Scholar",
];

const roleDescriptions: Record<Role, string> = {
  Administrator:
    "System administrator access is reviewed before activation.",
  "Health Worker":
    "Health worker access is reviewed before activation.",
  "Public Health Nurse":
    "Public health nurses coordinate approved RHU activities.",
  "Barangay Health Worker":
    "Barangay health workers are assigned to a barangay after review.",
  "Rural Health Midwife":
    "Rural health midwives support maternal and child health services.",
  "Nutrition Scholar":
    "Nutrition scholars support community nutrition monitoring.",
};

/* =========================================================
   BRAND PANEL
========================================================= */

export function BrandPanel() {
  return (
    <section
      className="brand-panel"
      aria-label="eCHIMS introduction"
    >
      <div className="brand-mark" aria-label="eCHIMS logo">
        <span>e</span>chims
      </div>

      <div className="brand-copy">
        <h2>
          Early Child Health Information and Monitoring System
        </h2>

        <p>
          Comprehensive healthcare management for Rural Health Units
        </p>
      </div>

      <div className="brand-stats">
        <div>
          <strong>500+</strong>
          <span>Children Tracked</span>
        </div>

        <div>
          <strong>50+</strong>
          <span>Barangays</span>
        </div>
      </div>

      <footer>
        <span>Bachelor of Science in Information Technology</span>
        <small>© 2025 Rural Health Units</small>
      </footer>
    </section>
  );
}

/* =========================================================
   INPUT FIELD
========================================================= */

function InputField({
  label,
  id,
  type = "text",
  placeholder,
  required = true,
}: {
  label: string;
  id: string;
  type?: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>

      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

/* =========================================================
   PASSWORD FIELD
========================================================= */

function PasswordField({
  confirm = false,
}: {
  confirm?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  const id = confirm ? "confirmPassword" : "password";

  return (
    <label className="field" htmlFor={id}>
      <span>
        {confirm ? "Confirm Password" : "Password"}
      </span>

      <div className="password-wrap">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          placeholder={
            confirm
              ? "Re-enter your password"
              : "Enter your password"
          }
          required
          minLength={8}
        />

        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible(!visible)}
          aria-label={
            visible ? "Hide password" : "Show password"
          }
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </label>
  );
}

/* =========================================================
   AUTH LAYOUT
========================================================= */

function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <BrandPanel />
        {children}
      </div>
    </main>
  );
}

/* =========================================================
   SIGN IN
========================================================= */

export function SignInPage() {
  const router = useRouter();
  const supabase = createClient();

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setLoading(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      setError("Please enter your email and password.");
      setLoading(false);
      return;
    }

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <div className="auth-content">
          <h1>Welcome back</h1>

          <p className="subtitle">
            Sign in to your eCHIMS account
          </p>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <form onSubmit={handleSignIn}>
            <InputField
              label="Email Address"
              id="email"
              type="email"
              placeholder="you@example.com"
            />

            <PasswordField />

            <div className="form-options">
              <Link href="/forgot-password">
                Forgot password?
              </Link>
            </div>

            <button
              className="primary-button"
              type="submit"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="divider">
            <span>NEW TO eCHIMS?</span>
          </div>

          <p className="form-switch">
            Don't have an account?{" "}
            <Link href="/register">Register</Link>
          </p>

          <Terms />
        </div>
      </div>
    </AuthLayout>
  );
}

/* =========================================================
   REGISTER
========================================================= */

export function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [role, setRole] =
    useState<Role>("Public Health Nurse");

  const [submitted, setSubmitted] =
    useState(false);

  const [error, setError] = useState("");

  const [loading, setLoading] =
    useState(false);

  async function handleRegister(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setLoading(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const fullName = String(
      formData.get("fullName") ?? ""
    ).trim();

    const username = String(
      formData.get("username") ?? ""
    ).trim();

    const contactNumber = String(
      formData.get("contactNumber") ?? ""
    ).trim();

    const email = String(
      formData.get("email") ?? ""
    )
      .trim()
      .toLowerCase();

    const employeeId = String(
      formData.get("employeeId") ?? ""
    ).trim();

    const licenseNumber = String(
      formData.get("licenseNumber") ?? ""
    ).trim();

    const barangay = String(
      formData.get("barangay") ?? ""
    ).trim();

    const password = String(
      formData.get("password") ?? ""
    );

    const confirmPassword = String(
      formData.get("confirmPassword") ?? ""
    );

    /* Password confirmation */

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    /* Password length */

    if (password.length < 8) {
      setError(
        "Password must contain at least 8 characters."
      );
      setLoading(false);
      return;
    }

    /*
      Create the user in Supabase Authentication.

      The additional information is temporarily
      stored in Supabase Auth user metadata.
    */

    const { data, error } =
      await supabase.auth.signUp({
        email,
        password,

        options: {
          data: {
            full_name: fullName,
            username,
            contact_number: contactNumber,
            role,
            employee_id: employeeId || null,
            license_number: licenseNumber || null,
            barangay: barangay || null,
          },
        },
      });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    /*
      Supabase successfully created the account.
    */

    console.log("Registered user:", data.user);

    setSubmitted(true);
    setLoading(false);

    /*
      If email confirmation is disabled,
      the user may already have a session.

      If email confirmation is enabled,
      the user needs to confirm their email first.
    */

    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    /*
      Email confirmation is probably enabled.
      Send the user to sign in after registration.
    */

    router.push("/sign-in");
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <div className="auth-content">
          <h1>Create your account</h1>

          <p className="subtitle">
            Register for the eCHIMS health network
          </p>

          {submitted && (
            <div className="success-message">
              <strong>
                Registration successful
              </strong>

              <span>
                Your account has been created.
                Please check your email if email
                confirmation is required.
              </span>
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister}>
            <InputField
              label="Full Name"
              id="fullName"
              placeholder="Juan Dela Cruz"
            />

            <InputField
              label="Username"
              id="username"
              placeholder="juan.delacruz"
            />

            <InputField
              label="Contact Number"
              id="contactNumber"
              type="tel"
              placeholder="09XX XXX XXXX"
            />

            <InputField
              label="Email Address"
              id="email"
              type="email"
              placeholder="you@example.com"
            />

            <label
              className="field"
              htmlFor="role"
            >
              <span>Account Role</span>

              <select
                id="role"
                name="role"
                value={role}
                onChange={(event) =>
                  setRole(
                    event.target.value as Role
                  )
                }
              >
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <small>
                {roleDescriptions[role]}
              </small>
            </label>

            {role !== "Administrator" && (
              <InputField
                label="Employee ID"
                id="employeeId"
                placeholder="Official employee number"
              />
            )}

            {[
              "Health Worker",
              "Public Health Nurse",
              "Barangay Health Worker",
              "Rural Health Midwife",
            ].includes(role) && (
              <InputField
                label="License Number"
                id="licenseNumber"
                placeholder="Professional license number"
                required={
                  role !== "Barangay Health Worker"
                }
              />
            )}

            {[
              "Barangay Health Worker",
              "Nutrition Scholar",
            ].includes(role) && (
              <InputField
                label="Barangay Assignment"
                id="barangay"
                placeholder="Select or enter barangay"
              />
            )}

            <PasswordField />

            <PasswordField confirm />

            <button
              className="primary-button"
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Creating account..."
                : "Submit Registration"}
            </button>
          </form>

          <div className="divider">
            <span>ALREADY REGISTERED?</span>
          </div>

          <p className="form-switch">
            Already have an account?{" "}
            <Link href="/sign-in">
              Sign in
            </Link>
          </p>

          <Terms />
        </div>
      </div>
    </AuthLayout>
  );
}

/* =========================================================
   FORGOT PASSWORD
========================================================= */

export function ForgotPasswordPage() {
  const supabase = createClient();

  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleForgotPassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setLoading(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const email = String(
      formData.get("email") ?? ""
    )
      .trim()
      .toLowerCase();

    if (!email) {
      setError("Please enter your email address.");
      setLoading(false);
      return;
    }

    const { error } =
      await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setLoading(false);
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <div className="auth-content compact">

          <Link
            className="back-link"
            href="/sign-in"
          >
            ← Back to sign in
          </Link>

          <h1>Reset your password</h1>

          <p className="subtitle">
            Enter the email linked to your RHU
            account and we'll send reset instructions.
          </p>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {submitted ? (
            <div className="success-message">
              <strong>Check your inbox</strong>

              <span>
                If an account exists for that email,
                a password reset link has been sent.
              </span>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword}>

              <InputField
                label="Email Address"
                id="email"
                type="email"
                placeholder="you@example.com"
              />

              <button
                className="primary-button"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? "Sending..."
                  : "Send Reset Link"}
              </button>

            </form>
          )}

          <p className="form-switch">
            Remember your password?{" "}
            <Link href="/sign-in">
              Sign in
            </Link>
          </p>

        </div>
      </div>
    </AuthLayout>
  );
}

/* =========================================================
   RESET PASSWORD
========================================================= */
export function ResetPasswordPage() {
  const supabase = createClient();
  const router = useRouter();

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleResetPassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setLoading(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const password = String(
      formData.get("password") ?? ""
    );

    const confirmPassword = String(
      formData.get("confirmPassword") ?? ""
    );

    if (password.length < 8) {
      setError(
        "Password must contain at least 8 characters."
      );
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords must match.");
      setLoading(false);
      return;
    }

    const { error } =
      await supabase.auth.updateUser({
        password,
      });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    setTimeout(() => {
      router.push("/sign-in");
      router.refresh();
    }, 2000);
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <div className="auth-content compact">

          <Link
            className="back-link"
            href="/sign-in"
          >
            ← Back to sign in
          </Link>

          <h1>Reset your password</h1>

          <p className="subtitle">
            Create a new password for your eCHIMS
            account.
          </p>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {success ? (
            <div className="success-message">
              <strong>
                Password updated successfully
              </strong>

              <span>
                Your password has been changed.
                Redirecting you to sign in...
              </span>
            </div>
          ) : (
            <form onSubmit={handleResetPassword}>

              <PasswordField />

              <PasswordField confirm />

              <button
                className="primary-button"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? "Updating..."
                  : "Update Password"}
              </button>

            </form>
          )}

          <p className="form-switch">
            Remember your password?{" "}
            <Link href="/sign-in">
              Sign in
            </Link>
          </p>

        </div>
      </div>
    </AuthLayout>
  );
}

/* =========================================================
   TERMS
========================================================= */
function Terms() {
  return (
    <p className="terms">
      By signing in, you agree to our{" "}
      <Link href="/terms">
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link href="/privacy">
        Privacy Policy
      </Link>
    </p>
  );
}
export function TermsPage() {
  const router = useRouter();

  return (
    <AuthLayout>
      <div className="auth-card legal-card">
        <div className="auth-content">

          <Link
            className="back-link"
            href="/register"
          >
            ← Back to registration
          </Link>

          <h1>Terms of Service</h1>

          <p className="subtitle">
            Please review the terms and conditions
            before using eCHIMS.
          </p>

          <div className="legal-scroll">
            <div className="legal-content">

              <section>
                <h2>1. Acceptance of Terms</h2>
                <p>
                  By accessing or using eCHIMS, you agree
                  to comply with these Terms of Service.
                  If you do not agree with these terms,
                  please do not use the system.
                </p>
              </section>

              <section>
                <h2>2. Purpose of the System</h2>
                <p>
                  eCHIMS is an Early Child Health Information
                  and Monitoring System designed to support
                  authorized Rural Health Unit personnel in
                  managing child health, vaccination,
                  nutritional monitoring, micronutrient
                  supplementation, and related health
                  information.
                </p>
              </section>

              <section>
                <h2>3. Authorized Use</h2>
                <p>
                  Access to eCHIMS is limited to authorized
                  users. Users are responsible for ensuring
                  that information entered into the system is
                  accurate and appropriate for their assigned
                  responsibilities.
                </p>
              </section>

              <section>
                <h2>4. Account Responsibility</h2>
                <p>
                  Users are responsible for maintaining the
                  confidentiality of their account credentials.
                  Users must not share their passwords or
                  allow unauthorized individuals to access
                  their accounts.
                </p>
              </section>

              <section>
                <h2>5. Proper Use of Information</h2>
                <p>
                  Information accessed through eCHIMS must
                  only be used for legitimate health-service,
                  monitoring, reporting, and administrative
                  purposes related to the user's authorized
                  duties.
                </p>
              </section>

              <section>
                <h2>6. Account Access and Suspension</h2>
                <p>
                  The system administrator may review,
                  restrict, suspend, or deactivate an account
                  when necessary to maintain system security
                  and proper use of the platform.
                </p>
              </section>

              <section>
                <h2>7. System Availability</h2>
                <p>
                  eCHIMS may occasionally be unavailable due
                  to maintenance, technical issues, network
                  interruptions, or other circumstances.
                </p>
              </section>

              <section>
                <h2>8. Changes to These Terms</h2>
                <p>
                  These Terms of Service may be updated when
                  necessary. Users will be expected to comply
                  with the latest applicable version of the
                  terms.
                </p>
              </section>

            </div>
          </div>

          <p className="legal-updated">
            Last updated: 2025
          </p>

          <div className="legal-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => router.push("/register")}
            >
              Accept
            </button>
          </div>

        </div>
      </div>
    </AuthLayout>
  );
}

/* =========================================================
   PRIVACY POLICY
========================================================= */
export function PrivacyPage() {
  const router = useRouter();

  return (
    <AuthLayout>
      <div className="auth-card legal-card">
        <div className="auth-content">

          <Link
            className="back-link"
            href="/register"
          >
            ← Back to registration
          </Link>

          <h1>Privacy Policy</h1>

          <p className="subtitle">
            Please review how eCHIMS collects, uses,
            and protects information.
          </p>

          <div className="legal-scroll">
            <div className="legal-content">

              <section>
                <h2>1. Information We Collect</h2>
                <p>
                  eCHIMS may collect information necessary
                  for account management, child health
                  monitoring, vaccination records,
                  nutritional assessments, micronutrient
                  supplementation, inventory management,
                  and system administration.
                </p>
              </section>

              <section>
                <h2>2. Use of Information</h2>
                <p>
                  Information stored in eCHIMS is used to
                  support child health monitoring, vaccination
                  compliance, nutritional risk assessment,
                  reporting, inventory monitoring, and
                  authorized health-service activities.
                </p>
              </section>

              <section>
                <h2>3. Protection of Information</h2>
                <p>
                  Appropriate technical and administrative
                  measures are applied to help protect
                  information from unauthorized access,
                  alteration, disclosure, or misuse.
                </p>
              </section>

              <section>
                <h2>4. User Account Information</h2>
                <p>
                  Account information such as name, username,
                  email address, contact information, role,
                  and other registration details may be
                  processed for authentication, authorization,
                  and account management.
                </p>
              </section>

              <section>
                <h2>5. Child Health Information</h2>
                <p>
                  Child health information entered into eCHIMS
                  must only be accessed and processed by
                  authorized personnel for legitimate
                  healthcare and monitoring purposes.
                </p>
              </section>

              <section>
                <h2>6. Access Control</h2>
                <p>
                  eCHIMS uses role-based access controls to
                  help ensure that users can only access
                  information and functions appropriate to
                  their assigned responsibilities.
                </p>
              </section>

              <section>
                <h2>7. Data Retention</h2>
                <p>
                  Information may be retained for as long as
                  necessary to support authorized health
                  monitoring, reporting, administrative, and
                  record-keeping requirements.
                </p>
              </section>

              <section>
                <h2>8. Privacy Policy Updates</h2>
                <p>
                  This Privacy Policy may be updated when
                  necessary to reflect changes in the system,
                  its processes, or applicable requirements.
                </p>
              </section>

            </div>
          </div>

          <p className="legal-updated">
            Last updated: 2025
          </p>

          <div className="legal-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => router.push("/register")}
            >
              Accept
            </button>
          </div>

        </div>
      </div>
    </AuthLayout>
  );
}