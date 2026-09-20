import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How Asset Insight collects, uses, retains, and protects account and device security data.",
};

const sections = [
  {
    title: "Device and network security data",
    body: "When you sign in, we collect security metadata about that browser or app installation. This can include the device platform and form factor, operating system, browser or app version, screen details, camera availability and capability ranges, and browser-origin storage quota or native disk capacity. We also record the IP address derived by our server from the validated network proxy chain.",
  },
  {
    title: "Camera privacy",
    body: "Camera permission is used only to confirm whether camera hardware exists and to collect sanitized capability information for an administrator's access review. Asset Insight does not retain raw browser media-device identifiers and does not capture or store photos, video, or audio during device registration.",
  },
  {
    title: "How the data is used",
    body: "Authorized administrators use this information to approve, reject, revoke, or restore access for a particular installation, investigate unusual access, and apply an exact-address IP block to a particular user where necessary. Security decisions and policy changes are recorded in an access-controlled audit history.",
  },
  {
    title: "Retention and access",
    body: "Device registrations, observed IP addresses, and security audit history are retained indefinitely to preserve the requested security record. Access is limited to authorized administrators and the services that enforce account security. Short-lived enrollment and approval-status challenges expire automatically.",
  },
  {
    title: "Account deletion",
    body: "When a user or administrator account is deleted, device registrations, IP observations, access challenges, and security audit records associated with that account are deleted as part of the same account-deletion process.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950 sm:px-8 sm:py-16">
      <article className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-12">
        <Link href="/" className="text-sm font-semibold text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline">
          Back to Asset Insight
        </Link>
        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Privacy notice</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Security data, explained clearly.</h1>
        <p className="mt-5 text-base leading-7 text-slate-600">Last updated 15 July 2026</p>

        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
              <p className="mt-3 leading-7 text-slate-600">{section.body}</p>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
