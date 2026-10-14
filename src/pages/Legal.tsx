import { FileText, Gavel, Printer, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

// Privacy Policy, Terms of Service and End User License Agreement. Written to match what the app
// actually does (see README "Security and privacy" and the migrations); update both together.
const UPDATED = 'October 14, 2026';
const REPO = 'https://github.com/mole-rat3832/Fridge-Wise';
const CONTACT = `${REPO}/issues`;

interface Section {
  id: string;
  title: string;
  body: ReactNode;
}

const DOCS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/privacy', label: 'Privacy Policy', icon: ShieldCheck },
  { to: '/terms', label: 'Terms of Service', icon: Gavel },
  { to: '/eula', label: 'End User License Agreement', icon: FileText },
];

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="font-semibold underline underline-offset-2" rel="noopener">
      {children}
    </a>
  );
}

function Contact() {
  return (
    <>
      Questions or requests: open an issue on the <Ext href={CONTACT}>FridgeWise GitHub repository</Ext>. Issues are public, so please don't post personal information
      there; say that you need to reach the developer privately and you'll get a private way to do it. Most data requests (seeing, exporting or deleting your data) you can
      do yourself, right away, in Settings.
    </>
  );
}

function LegalDoc({ title, icon: Icon, summary, sections }: { title: string; icon: LucideIcon; summary: ReactNode[]; sections: Section[] }) {
  useEffect(() => {
    document.title = `${title} · FridgeWise`;
    return () => {
      document.title = 'FridgeWise';
    };
  }, [title]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="max-w-3xl">
        <p className="inline-flex items-center gap-2 rounded-full bg-tint px-3 py-1 text-xs font-bold uppercase tracking-wide text-fg-2">
          <Icon size={14} aria-hidden /> Legal
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-fg-2">
          Effective and last updated {UPDATED}. Applies to FridgeWise, the website and app at this address.
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[15rem_1fr] lg:gap-12">
        <nav aria-label="On this page" className="lg:sticky lg:top-20 lg:self-start">
          <p className="text-xs font-bold uppercase tracking-wide text-fg-2">On this page</p>
          <ol className="mt-2 space-y-1 text-sm">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-lg px-2 py-1 text-fg-2 hover:bg-tint hover:text-fg">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
          <div className="mt-6 hidden space-y-1 border-t border-line pt-4 text-sm lg:block">
            {DOCS.filter((d) => d.label !== title).map((d) => (
              <Link key={d.to} to={d.to} className="flex items-center gap-2 rounded-lg px-2 py-1 font-semibold hover:bg-tint">
                <d.icon size={15} aria-hidden /> {d.label}
              </Link>
            ))}
            <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left font-semibold hover:bg-tint" onClick={() => window.print()}>
              <Printer size={15} aria-hidden /> Print or save as PDF
            </button>
          </div>
        </nav>

        <article className="min-w-0 max-w-3xl">
          <section className="card border-l-4 border-l-accent p-5" aria-labelledby="short-version">
            <h2 id="short-version" className="text-lg font-bold">
              The short version
            </h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-fg-2 marker:text-fg-3">
              {summary.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-fg-2">This summary is for convenience. The full text below is what applies.</p>
          </section>

          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="legal scroll-mt-20 border-b border-line py-7 last:border-0">
              <h2 id={`${s.id}-h`} className="text-xl font-bold">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-3 space-y-3 text-fg-2 [&_li]:pl-1 [&_strong]:text-fg [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">{s.body}</div>
            </section>
          ))}

          <nav aria-label="Other legal documents" className="mt-6 flex flex-wrap gap-2">
            {DOCS.filter((d) => d.label !== title).map((d) => (
              <Link key={d.to} to={d.to} className="btn btn-secondary btn-sm">
                <d.icon size={16} aria-hidden /> {d.label}
              </Link>
            ))}
          </nav>
        </article>
      </div>
    </div>
  );
}

// --- Privacy Policy ---------------------------------------------------------------------------

const RETENTION: Array<[string, string]> = [
  ['Account, profile and settings', 'Until you delete your account'],
  ['Food items, change history and saved recipes', 'Until you delete them or your account'],
  ['Scan photos', '30 days after upload, then deleted automatically (or right away when you delete your account)'],
  ['Unsaved recipe ideas', '14 days'],
  ['Daily limit counters (time and type of each AI request)', '35 days'],
  ['Push subscription and reminder log', 'Until you turn reminders off, the subscription expires, or you delete your account'],
  ['Recipe chat with the AI chef', 'Not stored on our servers; kept in your browser tab until you close it or sign out'],
  ['Offline copy on your device', 'Until you sign out, delete your account or clear the site data'],
];

export function PrivacyPolicy() {
  return (
    <LegalDoc
      title="Privacy Policy"
      icon={ShieldCheck}
      summary={[
        'We collect what the app needs to work: your account details, the food you add, and the photos you scan.',
        'Only you can see your kitchen. We do not sell your data, show ads or use third-party trackers.',
        'Scan photos and the text of your AI requests are sent to Google Gemini to read receipts, understand updates and suggest recipes.',
        'Scan photos are deleted after 30 days. You can export your data or delete your account, and everything in it, at any time in Settings.',
        'FridgeWise is not meant for children under 13.',
      ]}
      sections={[
        {
          id: 'who',
          title: 'Who we are',
          body: (
            <p>
              FridgeWise is an independent, non-commercial student project, built for a school AI competition and run by its developer (GitHub user{' '}
              <Ext href="https://github.com/mole-rat3832">mole-rat3832</Ext>), referred to here as "we" or "us". We are responsible for the personal information described in
              this policy. FridgeWise is in beta.
            </p>
          ),
        },
        {
          id: 'collect',
          title: 'What we collect',
          body: (
            <>
              <p>
                <strong>Account.</strong> Your email address and password (stored only as a secure hash by our authentication provider, never in readable form), and the
                optional name you give. When you set up, we also store your household size, timezone, date format, reminder preferences and when you finished setup.
              </p>
              <p>
                <strong>Your kitchen.</strong> The food you add or scan (name, brand, category, quantity, unit, storage place, price, barcode, purchase and expiration dates,
                notes, and whether it was used or tossed), the history of changes to each item (old and new values, whether you or the AI made the change, and how sure the AI
                was), and the recipes you save or generate.
              </p>
              <p>
                <strong>Photos.</strong> The receipt and product photos you scan. Photos are made smaller in your browser before upload and stored privately. Receipts can show
                a store name, date, time and sometimes part of a payment card number, so crop or cover anything you don't want stored.
              </p>
              <p>
                <strong>AI requests.</strong> The words you type or say in "Tell FridgeWise what happened" and in the recipe chat, and a small record of each AI request (its
                time and type) so we can apply the daily limits.
              </p>
              <p>
                <strong>Reminders.</strong> If you turn on notifications, your browser gives us a push subscription (an address at your browser's push service plus encryption
                keys). We also keep a log of which reminders were sent so you don't get the same one twice.
              </p>
              <p>
                <strong>Technical data.</strong> Like any website, our hosting and database providers receive your IP address and basic request information (such as browser
                type and time) to deliver the service, keep it secure and fix problems. The sign-up and sign-in pages use Cloudflare Turnstile, which checks signals from your
                browser to tell people from bots.
              </p>
              <p>
                <strong>On your device.</strong> The app saves some data in your browser's storage: your sign-in session, an offline copy of your list and profile, your
                appearance settings, and whether you have seen the tour. We don't use advertising or analytics cookies.
              </p>
              <p>
                <strong>Voice input.</strong> If you use the microphone button, your browser's own speech recognition turns your voice into text. Depending on your browser,
                that may be done by its maker (for example Google in Chrome or Apple in Safari) under their privacy terms. FridgeWise only receives the text.
              </p>
              <p>We don't ask for or want sensitive information such as health details. Please don't put it in notes, item names or chats.</p>
            </>
          ),
        },
        {
          id: 'use',
          title: 'How we use it',
          body: (
            <>
              <ul>
                <li>To run FridgeWise: show your kitchen, calculate expiration dates, track what you used and tossed, and show your stats.</li>
                <li>To provide the AI features you ask for: reading scans, applying plain-language updates (after you confirm) and suggesting recipes.</li>
                <li>To send the reminders you turn on.</li>
                <li>To enforce daily limits, prevent abuse and keep accounts secure.</li>
                <li>To send account emails, such as confirming your address and resetting your password.</li>
                <li>To find and fix bugs.</li>
              </ul>
              <p>
                We do not sell or rent your personal information, use it for advertising, or build marketing profiles. We don't make decisions about you that have legal or
                similarly significant effects based on automated processing.
              </p>
              <p>
                Where privacy laws such as the GDPR apply, we rely on performing our agreement with you (providing the app you signed up for), our legitimate interests (keeping
                the service secure and working), and your consent where we ask for it (for example notifications, camera and microphone, which you can withdraw in your browser
                or in Settings).
              </p>
            </>
          ),
        },
        {
          id: 'ai',
          title: 'AI processing with Google Gemini',
          body: (
            <>
              <p>
                The AI features use the Google Gemini API, called only from our server, never from your browser. Depending on the feature, we send Google: the photo you
                scan; the text of your request or chat; the names, quantities, dates and storage places of relevant items (identified by short references, not your name or
                email); and context such as today's date, your timezone and the number of servings. We don't send your email address, password or account ID to the AI.
              </p>
              <p>
                Google processes this under the{' '}
                <Ext href="https://ai.google.dev/gemini-api/terms">Gemini API Additional Terms of Service</Ext> and the{' '}
                <Ext href="https://policies.google.com/privacy">Google Privacy Policy</Ext>. FridgeWise may use Google's unpaid tier of the API. Under Google's terms for unpaid
                services, Google may use the content sent to it to provide, improve and develop its products, and human reviewers may read it. So please don't include
                personal or sensitive information in photos, notes or chats.
              </p>
              <p>
                AI output is always shown to you first. It never changes your kitchen until you confirm, every change is logged, and you can undo it.
              </p>
            </>
          ),
        },
        {
          id: 'providers',
          title: 'Service providers and sharing',
          body: (
            <>
              <p>We share personal information only with the providers that run FridgeWise for us, and only as needed for that:</p>
              <ul>
                <li>
                  <strong>Supabase</strong>: database, sign-in, photo storage and server functions. Data is stored on servers in the United States (Oregon).
                </li>
                <li>
                  <strong>Google</strong>: the Gemini API for the AI features (see above).
                </li>
                <li>
                  <strong>Netlify</strong>: hosts and delivers the website.
                </li>
                <li>
                  <strong>Cloudflare</strong>: Turnstile bot protection on the sign-up, sign-in and password pages.
                </li>
                <li>
                  <strong>Your browser's push service</strong> (for example Google, Apple, Mozilla or Microsoft): delivers notifications. Reminder contents are encrypted on
                  the way, so the push service can't read them.
                </li>
                <li>
                  <strong>Email delivery</strong>: account emails (confirmation and password reset) are sent through our authentication provider's email service.
                </li>
              </ul>
              <p>
                We may also disclose information if the law requires it, to protect people's safety, or to investigate abuse of the service. If FridgeWise were ever handed
                over to someone else, this policy would continue to apply to the data collected under it.
              </p>
            </>
          ),
        },
        {
          id: 'retention',
          title: 'How long we keep it',
          body: (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-fg">
                      <th className="py-2 pr-4 font-semibold">Data</th>
                      <th className="py-2 font-semibold">Kept for</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RETENTION.map(([what, how]) => (
                      <tr key={what} className="border-b border-line last:border-0 align-top">
                        <td className="py-2 pr-4 text-fg">{what}</td>
                        <td className="py-2">{how}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                When you delete your account, your photos are deleted and all of your rows are removed from the database straight away. Copies in our providers' backups and
                logs are removed on their normal schedules. Providers keep their own technical logs for limited periods under their policies.
              </p>
            </>
          ),
        },
        {
          id: 'rights',
          title: 'Your choices and rights',
          body: (
            <>
              <ul>
                <li>
                  <strong>See and correct</strong>: everything you store is visible in the app, and you can edit or remove any item.
                </li>
                <li>
                  <strong>Export</strong>: download your items and change history as CSV files in Settings, Your data.
                </li>
                <li>
                  <strong>Delete</strong>: delete your account in Settings, Account. This removes your data as described above.
                </li>
                <li>
                  <strong>Notifications, camera and microphone</strong>: turn them on or off at any time in Settings or in your browser.
                </li>
                <li>
                  <strong>On your device</strong>: signing out removes the offline copy of your kitchen from that browser.
                </li>
              </ul>
              <p>
                Depending on where you live (for example in the EU, the UK or California), you may also have rights to access, correct, delete or receive a copy of your
                information, to object to or restrict some uses, and to complain to your data protection authority. We will respond to requests within the time the law
                requires, and we won't treat you differently for using these rights.
              </p>
            </>
          ),
        },
        {
          id: 'security',
          title: 'Security',
          body: (
            <p>
              Data is encrypted in transit (HTTPS). Database rules (row-level security) make sure each account can only read and change its own data, scan photos are in a
              private storage area, sign-in is protected against bots, and secret keys are kept on the server only. No system is perfectly secure, so please use a strong,
              unique password. If we learn of a breach that affects you, we will tell you as the law requires.
            </p>
          ),
        },
        {
          id: 'transfers',
          title: 'International transfers',
          body: (
            <p>
              FridgeWise is hosted in the United States, and our providers may process data in other countries too. When you use FridgeWise from elsewhere, your information
              is transferred to and processed in the United States, with the protections our providers offer for such transfers.
            </p>
          ),
        },
        {
          id: 'children',
          title: 'Children',
          body: (
            <p>
              FridgeWise is not meant for children under 13, and we don't knowingly collect their personal information. If you are under 18 (or under the age of digital
              consent where you live), please use FridgeWise with a parent or guardian's permission. If you believe a child under 13 has created an account, contact us and
              we will delete it.
            </p>
          ),
        },
        {
          id: 'changes',
          title: 'Changes to this policy',
          body: (
            <p>
              We will update this page when FridgeWise changes how it handles data, and change the date at the top. If a change is significant, we will also tell you in the
              app before it takes effect.
            </p>
          ),
        },
        {
          id: 'contact',
          title: 'Contact',
          body: (
            <p>
              <Contact />
            </p>
          ),
        },
      ]}
    />
  );
}

// --- Terms of Service -------------------------------------------------------------------------

export function TermsOfService() {
  return (
    <LegalDoc
      title="Terms of Service"
      icon={Gavel}
      summary={[
        'FridgeWise is a free beta made for a school AI competition. It may change, break or stop.',
        'You own your data. Use FridgeWise lawfully, keep your account secure, and do not try to get around its limits or protections.',
        'Expiration dates, reminders and recipes are guidance, not food safety advice. When in doubt, throw it out, and always check recipes for allergies.',
        'AI can be wrong. You review and confirm every change.',
        'The service is provided as is, with limited liability.',
      ]}
      sections={[
        {
          id: 'agreement',
          title: 'Agreement',
          body: (
            <p>
              These Terms are an agreement between you and the developer of FridgeWise ("we", "us"). By creating an account or using FridgeWise you agree to these Terms, the{' '}
              <Link to="/eula" className="font-semibold underline underline-offset-2">
                End User License Agreement
              </Link>{' '}
              and the{' '}
              <Link to="/privacy" className="font-semibold underline underline-offset-2">
                Privacy Policy
              </Link>
              . If you don't agree, please don't use FridgeWise.
            </p>
          ),
        },
        {
          id: 'service',
          title: 'The service',
          body: (
            <p>
              FridgeWise helps you keep track of the food you have at home, reminds you before it expires and suggests what to cook. It is a free, non-commercial student
              project in beta: features may change or be removed, the service may be unavailable at times, and it may be discontinued. We have no obligation to keep it running,
              but if we shut it down we will try to give notice so you can export your data.
            </p>
          ),
        },
        {
          id: 'accounts',
          title: 'Your account',
          body: (
            <ul>
              <li>You must be at least 13 years old. If you are under 18 (or the age of majority where you live), a parent or guardian must agree to these Terms for you.</li>
              <li>Give a real email address you control, and keep your password secret. You are responsible for what happens in your account.</li>
              <li>One person per account. Don't share accounts or create accounts in bulk.</li>
              <li>Tell us if you think someone else has access to your account.</li>
            </ul>
          ),
        },
        {
          id: 'content',
          title: 'Your content',
          body: (
            <>
              <p>
                You keep all rights to what you put into FridgeWise: items, notes, photos and messages ("your content"). You give us permission to store, process, copy and
                display your content only as needed to run FridgeWise for you, including sending it to our service providers such as the AI provider, as described in the
                Privacy Policy. This permission ends when you delete your content or your account, apart from backups that expire on their normal schedule.
              </p>
              <p>
                Only upload photos you have the right to use, and don't upload other people's personal information. You are responsible for your content and for the changes you
                confirm.
              </p>
            </>
          ),
        },
        {
          id: 'acceptable-use',
          title: 'Acceptable use',
          body: (
            <>
              <p>When using FridgeWise, you agree not to:</p>
              <ul>
                <li>break the law or anyone's rights, or upload content that is illegal, hateful, harassing or sexually explicit;</li>
                <li>try to access other people's data, probe or attack the service's security, or interfere with how it runs;</li>
                <li>get around the daily limits, use automated scripts or bots, scrape the service, or resell access to it;</li>
                <li>use the AI features to create harmful content, or try to make the AI ignore its instructions;</li>
                <li>upload malware or anything designed to damage devices or data;</li>
                <li>impersonate anyone, or misrepresent your connection to FridgeWise.</li>
              </ul>
              <p>We may remove content or limit, suspend or close accounts that break these rules, or to protect the service and its users.</p>
            </>
          ),
        },
        {
          id: 'food-safety',
          title: 'Food safety, health and AI',
          body: (
            <>
              <p>
                <strong>FridgeWise is a helper, not a food safety authority.</strong> Expiration dates come from the package, the USDA FoodKeeper shelf-life table or an AI
                estimate, and estimates can be wrong. Storage conditions, handling and the product itself all matter. Always check the package and use your own judgment
                (look, smell and common sense). When in doubt, throw it out.
              </p>
              <p>
                Recipes are suggestions generated by AI. They may contain mistakes, be unsuitable for your diet, or include ingredients you are allergic to, even if you mentioned
                your allergies. Check every ingredient, follow safe cooking temperatures, and make your own decisions. Nothing in FridgeWise is medical, nutritional or dietary
                advice.
              </p>
              <p>
                AI features can misread photos and misunderstand requests. FridgeWise shows a preview of every change and nothing happens until you confirm, so please review
                previews carefully. Reminders depend on your device, browser and settings, and may arrive late or not at all. Don't rely on them alone.
              </p>
            </>
          ),
        },
        {
          id: 'limits',
          title: 'Limits, price and availability',
          body: (
            <p>
              FridgeWise is free. To keep it that way, each account has daily limits (currently 40 scans and 60 AI requests a day, resetting at midnight in your timezone). We
              may change limits or features at any time. If we ever introduce paid features, they will come with separate terms and you will be asked before you are charged
              anything.
            </p>
          ),
        },
        {
          id: 'ip',
          title: 'Intellectual property',
          body: (
            <>
              <p>
                The FridgeWise source code is open source under the <Ext href={`${REPO}/blob/main/LICENSE.md`}>MIT License</Ext>. The FridgeWise name, logo and other brand
                assets are not covered by that license; they are © 2026 mole-rat3832, all rights reserved. Third-party software, fonts and data are used under their own
                licenses.
              </p>
              <p>If you send us feedback or ideas, we may use them freely without owing you anything.</p>
            </>
          ),
        },
        {
          id: 'third-parties',
          title: 'Third-party services',
          body: (
            <p>
              FridgeWise relies on services such as Supabase, Google, Netlify, Cloudflare and your browser's push service. Their own terms and policies apply to their parts, and
              we are not responsible for their services. Links to other websites are for convenience; we don't control those sites.
            </p>
          ),
        },
        {
          id: 'ending',
          title: 'Ending your use',
          body: (
            <p>
              You can stop using FridgeWise and delete your account at any time in Settings. We may suspend or end your access if you break these Terms, if we must for legal
              reasons, or if we shut the service down. Sections that by their nature should continue (such as ownership, disclaimers and limits of liability) continue after
              your use ends.
            </p>
          ),
        },
        {
          id: 'disclaimers',
          title: 'Disclaimers',
          body: (
            <p>
              FridgeWise is provided "as is" and "as available", without warranties of any kind, express or implied, including fitness for a particular purpose, accuracy and
              non-infringement. We don't promise that the service will be uninterrupted, error-free or secure, that data will never be lost, or that dates, reminders, scans or
              recipes will be accurate. Export your data if it matters to you.
            </p>
          ),
        },
        {
          id: 'liability',
          title: 'Limitation of liability',
          body: (
            <p>
              To the fullest extent the law allows, we are not liable for any indirect, incidental, special or consequential damages, or for spoiled or wasted food, illness,
              allergic reactions, lost data or lost profits arising from your use of FridgeWise or reliance on it. Our total liability for any claim about FridgeWise is limited
              to USD 10. Some places don't allow these limits, so they may not fully apply to you.
            </p>
          ),
        },
        {
          id: 'law',
          title: 'Your rights under local law',
          body: (
            <p>
              Nothing in these Terms limits rights you have under consumer protection or other laws that can't be changed by agreement. If a court finds part of these Terms
              unenforceable, the rest still applies. If we don't enforce a term right away, we can still enforce it later.
            </p>
          ),
        },
        {
          id: 'changes',
          title: 'Changes to these Terms',
          body: (
            <p>
              We may update these Terms as FridgeWise changes. We will change the date at the top, and for significant changes we will tell you in the app before they take
              effect. If you keep using FridgeWise after that, you accept the new Terms; if you don't agree, you can delete your account.
            </p>
          ),
        },
        {
          id: 'contact',
          title: 'Contact',
          body: (
            <p>
              <Contact />
            </p>
          ),
        },
      ]}
    />
  );
}

// --- EULA -------------------------------------------------------------------------------------

export function Eula() {
  return (
    <LegalDoc
      title="End User License Agreement"
      icon={FileText}
      summary={[
        'You may install and use the FridgeWise app on your own devices for personal, non-commercial use.',
        'The source code is open source under the MIT License. This agreement covers the app as we deliver it and the FridgeWise brand.',
        'Do not pass off a modified copy as the official FridgeWise or use its name and logo.',
        'The app updates itself, and stores some data on your device so it works offline.',
      ]}
      sections={[
        {
          id: 'scope',
          title: 'What this agreement covers',
          body: (
            <p>
              This End User License Agreement ("EULA") is between you and the developer of FridgeWise. It covers the FridgeWise app as delivered from this website, whether you
              use it in a browser or install it to your home screen or desktop, including the files your device keeps for offline use ("the App"). Your use of the online
              service is also covered by the{' '}
              <Link to="/terms" className="font-semibold underline underline-offset-2">
                Terms of Service
              </Link>{' '}
              and the{' '}
              <Link to="/privacy" className="font-semibold underline underline-offset-2">
                Privacy Policy
              </Link>
              .
            </p>
          ),
        },
        {
          id: 'license',
          title: 'License',
          body: (
            <p>
              We give you a personal, non-exclusive, non-transferable, revocable license to install and use the App on devices you own or control, for your own non-commercial
              use, in line with the Terms of Service. The App is licensed, not sold.
            </p>
          ),
        },
        {
          id: 'open-source',
          title: 'Open source',
          body: (
            <>
              <p>
                The FridgeWise source code is published under the <Ext href={`${REPO}/blob/main/LICENSE.md`}>MIT License</Ext>. Nothing in this EULA limits the rights the MIT
                License gives you to use, copy, modify and distribute that code. If you build your own app from it, use your own name and logo, and your app is not covered by
                this EULA, our Terms or our service.
              </p>
              <p>
                The App also includes third-party open-source components (such as React) and fonts (Nunito, Atkinson Hyperlegible and Lexend, under the SIL Open Font
                License), each under its own license.
              </p>
            </>
          ),
        },
        {
          id: 'restrictions',
          title: 'Restrictions',
          body: (
            <>
              <p>You may not:</p>
              <ul>
                <li>use the FridgeWise name, logo or brand, or present a modified or copied version as the official FridgeWise;</li>
                <li>remove or change copyright, license or legal notices in the App;</li>
                <li>use the App to break the law or the Terms of Service, or to attack or overload the FridgeWise service;</li>
                <li>rent, sell or sublicense the App as delivered from this website.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'updates',
          title: 'Updates',
          body: (
            <p>
              The App updates itself: when a new version is available, it is downloaded in the background and used the next time you open the App. Updates may add, change or
              remove features. Using an old copy indefinitely is not supported.
            </p>
          ),
        },
        {
          id: 'device',
          title: 'Your device and permissions',
          body: (
            <>
              <p>
                To work offline and stay quick, the App stores files and some of your data in your browser (see the Privacy Policy). You can remove them by signing out and
                clearing this site's data, or by uninstalling the App.
              </p>
              <p>
                The App asks for permissions only when you use the feature that needs them: the camera to scan, the microphone for voice input, and notifications for
                reminders. You can allow or block each one in your browser or device settings at any time.
              </p>
            </>
          ),
        },
        {
          id: 'ownership',
          title: 'Ownership',
          body: (
            <p>
              Apart from the rights given to you here and by the open-source licenses, we and our licensors keep all rights in the App. The FridgeWise name, logo and images
              made from them are © 2026 mole-rat3832, all rights reserved.
            </p>
          ),
        },
        {
          id: 'termination',
          title: 'Ending this license',
          body: (
            <p>
              This license lasts until it ends. It ends automatically if you break this EULA or the Terms of Service, and you can end it at any time by deleting your account
              and uninstalling the App. When it ends, stop using the App and remove it from your devices.
            </p>
          ),
        },
        {
          id: 'warranty',
          title: 'No warranty and limited liability',
          body: (
            <p>
              The App is provided "as is", without warranties of any kind. The disclaimers and limitation of liability in the Terms of Service also apply to the App, to the
              fullest extent the law allows. Nothing here limits rights you have under laws that can't be changed by agreement.
            </p>
          ),
        },
        {
          id: 'contact',
          title: 'Contact',
          body: (
            <p>
              <Contact />
            </p>
          ),
        },
      ]}
    />
  );
}
