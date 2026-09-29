import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "YouTube feature terms",
  description: "Terms and user controls for Asset Insight's optional YouTube video publishing feature.",
};

export default function YoutubeTermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950 sm:px-8 sm:py-16">
      <article className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-12 [&_a]:underline [&_a]:underline-offset-4">
        <Link href="/">Back to Asset Insight</Link>
        <h1 className="mt-10 text-3xl font-semibold tracking-tight sm:text-4xl">YouTube feature terms</h1>
        <p className="mt-5 leading-7 text-slate-600">Last updated 29 September 2026</p>
        <div className="mt-8 space-y-8 leading-7 text-slate-600">
          <section>
            <h2 className="text-xl font-semibold text-slate-950">YouTube&apos;s terms and privacy</h2>
            <p className="mt-3">Asset Insight&apos;s optional video publishing feature uses YouTube API Services. By using these YouTube features, you agree to be bound by the <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>. Review the <Link href="/privacy#youtube-privacy">Asset Insight privacy notice</Link> and <a href="https://policies.google.com/privacy">Google Privacy Policy</a> before connecting a channel or authorizing a video upload.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-950">Authority and review</h2>
            <p className="mt-3">Connect only a channel you are authorized to manage, and submit only videos you have the necessary rights and permissions to share. Connecting makes this channel available to authorized Asset Insight administrators and superadmins for shared management. An administrator must review the individual video title, description, and visibility and explicitly confirm the YouTube action. Review the original footage, audio, and embedded information for confidential or personal content. Connecting a channel or submitting a report is not by itself authorization to upload a video to YouTube.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-950">Visibility and report release</h2>
            <p className="mt-3">Choose Private, Unlisted, or Public. Public content is available to anyone; unlisted content can be viewed and shared by anyone with its link. Private viewing is controlled by YouTube. Asset Insight initially transfers approved videos privately and applies the requested visibility only when the report&apos;s existing approval and release requirements are met. YouTube review, upload limits, or other restrictions may prevent that change. A saved link is not a guarantee of public availability.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-950">Stopping access and removing data</h2>
            <p className="mt-3">Use Admin → YouTube to revoke access and request removal of the stored YouTube data, or use <a href="https://security.google.com/settings/security/permissions">Google account permissions</a> to revoke access directly. Original Asset Insight media and reports remain separate. These controls do not delete uploaded YouTube videos; use <a href="https://studio.youtube.com/">YouTube Studio</a> to manage them. Provider requests already in flight may finish. Previously generated or downloaded files are not automatically rewritten.</p>
          </section>
          <p className="break-words">Questions or data-removal requests: <a href="mailto:manom8193@gmail.com">manom8193@gmail.com</a>.</p>
        </div>
      </article>
    </main>
  );
}
