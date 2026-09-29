import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How Asset Insight uses device security data and data from its optional YouTube connection, including publication, storage, and access controls.",
};

const sections = [
  {
    title: "Device and network security data",
    body: "When you sign in, we collect security metadata about that browser or app installation. This can include the device platform and form factor, operating system, browser or app version, screen details, camera availability and capability ranges, and browser-origin storage quota or native disk capacity. We also record the IP address derived by our server from the validated network proxy chain.",
  },
  {
    title: "Camera privacy during device registration",
    body: "Camera permission is used only to confirm whether camera hardware exists and to collect sanitized capability information for an administrator's access review. Asset Insight does not retain raw browser media-device identifiers and does not capture or store photos, video, or audio during device registration.",
  },
  {
    title: "How the data is used",
    body: "Authorized administrators use this information to approve, reject, revoke, or restore access for a particular installation, investigate unusual access, and apply an exact-address IP block to a particular user where necessary. Security decisions and policy changes are recorded in an access-controlled audit history.",
  },
  {
    title: "Security data retention and access",
    body: "Device registrations, observed IP addresses, and security audit history are retained indefinitely to preserve the requested security record. Access is limited to authorized administrators and the services that enforce account security. Short-lived enrollment and approval-status challenges expire automatically.",
  },
  {
    title: "Security records when an account is deleted",
    body: "When a user or administrator account is deleted, device registrations, IP observations, access challenges, and security audit records associated with that account are deleted as part of the same account-deletion process.",
  },
];

const youtubeSections = [
  {
    title: "Optional YouTube connection",
    body: "Asset Insight uses YouTube API Services for optional Asset and Lot Listing video publication. An authorized administrator connects the shared channel through Google after reviewing this notice and the YouTube feature terms. Other authorized Asset Insight administrators and superadmins can manage this shared connection and review videos for that channel. Connecting does not authorize automatic uploads. Each video requires a separate administrator review of its title, description, and visibility before it is sent to YouTube. Google handles sign-in; Asset Insight does not collect or store your Google password.",
  },
  {
    title: "Data we access and store",
    body: "The connection reads the selected channel's ID and title. We store these details, encrypted access and refresh tokens, token expiry, and records of the administrator's connection and publication consent. For videos submitted through Asset Insight, we store the report and lot association, original media reference, title and description, upload progress and receipts, YouTube video ID and link, publication status, and operational errors. Credentials and private upload-session details remain on the server and are not included in reports or sent to appraiser browsers.",
  },
  {
    title: "How videos are shared",
    body: "An explicit reviewed report submission prepares eligible videos for administrator review. The administrator can edit the suggested title and description and choose Private, Unlisted, or Public. Only confirming that YouTube review authorizes transfer. Original video bytes, including audio and embedded metadata, are transferred without privacy redaction. Review the text and video for personal or confidential information before confirming. Asset Insight does not automatically append private contact details, valuations, GPS information, or private notes. Uploads start private; requested visibility is applied only after the report's approval and release requirements are met. Public videos, titles, and descriptions can be viewed and found by anyone. Unlisted videos can be watched and shared by anyone with the link. Private videos remain subject to YouTube's private-viewing permissions. Google's restrictions can prevent the requested visibility even after release.",
  },
  {
    title: "Why we use this data",
    body: "We use connection and video data to upload authorized clips, verify publication, avoid duplicate uploads during retries, and display status and confirmed public or unlisted links to authorized administrators. New report Excel files do not include a YouTube column. Original clips remain in Asset Insight's report storage and media ZIP; these are the originals supplied to Asset Insight, not downloads from YouTube. Capturing media, saving a draft, or connecting a channel does not automatically upload historical reports to YouTube.",
  },
  {
    title: "Disconnecting, revoking access, and removing videos",
    body: "Admin → YouTube provides Revoke access and erase YouTube data, with a confirmation explaining its effects. This stops new authorized work, requests Google permission revocation, and queues removal of stored YouTube credentials, channel details, and video API records. The interface distinguishes pending work from completed removal; an operation already sent to Google may finish. You can also revoke access in your Google account permissions. The service checks authorization periodically and initiates local cleanup when revocation or deletion of the authorizing account is detected. These controls do not delete videos on YouTube, original report media, or reports. Manage or delete uploaded videos separately in YouTube Studio. Previously generated files and downloaded copies are not automatically rewritten.",
  },
  {
    title: "Stored records and privacy requests",
    body: "YouTube API records are refreshed or removed on a bounded maintenance schedule. Unverifiable stale data is not kept indefinitely. Cache removal retains minimal suppression and administrative receipts so delayed work cannot restore erased data or upload the same video again. It does not rewrite historical report submission provenance or links already saved in generated files. Original report information and user-supplied media are separate from this YouTube API cache. You can request broader data removal through the contact below, including if you no longer have an Asset Insight account. Do not send passwords or authorization tokens.",
  },
  {
    title: "Browser storage and external services",
    body: "Asset Insight uses authentication cookies and browser or device storage to maintain your session, settings, and locally saved work. Reading this notice does not load an embedded YouTube player. Following a Google or YouTube link, signing in through Google, or watching a video on YouTube opens that service, whose own privacy policy and cookie or storage controls apply.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950 sm:px-8 sm:py-16">
      <article className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-12">
        <Link href="/" className="text-sm font-semibold text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline">
          Back to Asset Insight
        </Link>
        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Privacy notice</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Asset Insight privacy notice</h1>
        <p className="mt-5 text-base leading-7 text-slate-600">Last updated 29 September 2026</p>
        <p className="mt-3 leading-7 text-slate-600">This notice explains device security records and the optional YouTube connection. You do not need to sign in to read it.</p>

        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
              <p className="mt-3 leading-7 text-slate-600">{section.body}</p>
            </section>
          ))}
        </div>

        <section aria-labelledby="youtube-privacy" className="mt-12 border-t border-slate-200 pt-10">
          <h2 id="youtube-privacy" className="text-2xl font-semibold tracking-tight">YouTube and Google data</h2>
          <div className="mt-8 space-y-8">
            {youtubeSections.map((section) => (
              <section key={section.title}>
                <h3 className="text-lg font-semibold">{section.title}</h3>
                <p className="mt-3 leading-7 text-slate-600">{section.body}</p>
              </section>
            ))}
          </div>
          <ul className="mt-8 space-y-3 text-sm leading-6 text-slate-700 [&_a]:underline [&_a]:underline-offset-4">
            <li><Link href="/terms/youtube">Asset Insight YouTube feature terms</Link></li>
            <li><a href="https://policies.google.com/privacy">Google Privacy Policy</a></li>
            <li><a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a></li>
            <li><a href="https://security.google.com/settings/security/permissions">Revoke access in Google account permissions</a></li>
            <li><a href="https://studio.youtube.com/">Manage published videos in YouTube Studio</a></li>
          </ul>
          <p className="mt-8 break-words leading-7 text-slate-600">Privacy questions and data-removal requests: <a className="underline underline-offset-4" href="mailto:manom8193@gmail.com">manom8193@gmail.com</a>.</p>
        </section>
      </article>
    </main>
  );
}
