import React from "react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useSettings } from "@/lib/SettingsContext";

const UPDATED = "15 November 2026";

function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-foreground mb-2">{title}</h2>
      <div className="space-y-2 text-sm text-foreground/90 leading-relaxed">{children}</div>
    </section>
  );
}

// Plain-language privacy notice. DRAFT: have a Ghanaian lawyer confirm it against the Data Protection Act, 2012
// (Act 843) and your registration with the Data Protection Commission before relying on it.
export default function Privacy() {
  useDocumentTitle("Privacy notice");
  const { settings } = useSettings();
  const CONTACT = settings.contact_email;
  const NAME = settings.company_name;
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to the home page
        </Link>
        <h1 className="text-3xl font-bold text-foreground">Privacy notice</h1>
        <p className="text-sm text-muted-foreground mt-1">{NAME}, Akwaaba Services. Last updated {UPDATED}.</p>

        <Section title="Who we are">
          <p>
            Airport Assist Ghana provides meet-and-assist, fast-track and porter services at Kotoka International Airport, Accra.
            We decide what personal information we collect and why, which makes us responsible for looking after it.
          </p>
        </Section>

        <Section title="What we collect and why">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Your email address:</strong> to send you your booking confirmation, your supervisor's details and any update on your booking. You do not need an account.</li>
            <li><strong>Your booking:</strong> names and contact numbers of the passengers, nationality, flight details, number of bags, special requests, and what you paid. To deliver the service and keep our accounts.</li>
            <li><strong>A photo of your ID</strong> (optional): so our supervisor can identify the right passenger at the airport.</li>
            <li><strong>Your customer record:</strong> your name and contact details, the bookings you have made, and notes our team writes after speaking with you (for example a request or a promise to call back). So anyone on the team can help you without asking you to repeat yourself.</li>
            <li><strong>Staff:</strong> name, work email and role, so we can control who can see what.</li>
          </ul>
          <p>We use this information only to provide and manage the service, to contact you about your booking, and to meet our legal and accounting duties. We do not sell it. We send offers and news only to customers who have told us they want them, and you can ask us to stop at any time.</p>
        </Section>

        <Section title="How long we keep it">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>ID photos are deleted 30 days after your flight date.</strong> Photos that were uploaded but never used in a booking are deleted after 7 days.</li>
            <li>Booking and payment records are kept for as long as our accounting and legal duties require.</li>
            <li>Backups can hold older copies until the backup itself expires.</li>
            <li>If you ask us to delete your personal data, we remove your name, contact details, photo and login. Payment records stay for accounting but no longer identify you.</li>
          </ul>
        </Section>

        <Section title="Who can see it">
          <p>
            The supervisor assigned to your booking sees your booking and, if you gave one, your ID photo. Our management and administrators see bookings and reports.
            Passengers only ever see their own bookings. Every view of an ID photo by staff is logged.
          </p>
          <p>
            We use these services to run the platform, and they handle data on our behalf: Supabase (database, sign-in and file storage),
            Resend (sending emails such as your booking confirmation) and Cloudflare (hosting the website).
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You can ask us to show you what we hold about you, correct it, or delete it. You can also withdraw your consent for us to use your details,
            although we then may not be able to provide the service.
            {CONTACT ? <> Contact us at <a className="text-primary underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</> : <> Contact the Airport Assist desk at the airport.</>}
          </p>
          <p>If you are unhappy with how we handle your data, you can complain to Ghana's Data Protection Commission.</p>
        </Section>

        <Section title="How we protect it">
          <p>
            Access is limited by role, the connection is encrypted, administrators sign in with a second step, and changes to bookings and money records are logged.
            No system is perfectly safe, so we only collect what the service needs.
          </p>
        </Section>
      </div>
    </main>
  );
}
