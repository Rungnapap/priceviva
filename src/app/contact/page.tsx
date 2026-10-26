import type { Metadata } from "next";
import { Mail } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { backdrops } from "@/data/site-backgrounds";
import { getT } from "@/i18n/server";
import { contactEmail } from "@/lib/server/contact";

export const metadata: Metadata = { title: "Contact", description: "How to contact PriceViva." };

/** Contact details come only from CONTACT_EMAIL (server setting). Nothing is invented; no form, no email backend. */
export default async function ContactPage() {
  const t = await getT();
  const email = contactEmail();
  return (
    <div>
      <PageHeader title={t("contact.title")} icon={<Mail className="h-6 w-6" />} backdrop={backdrops.calm}>
        {t("contact.lead")}
      </PageHeader>
      <div className="pa-container max-w-3xl space-y-6 py-10">
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-card">
          {email ? (
            <>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("contact.email")}</h2>
              <p className="mt-2 break-all text-xl font-semibold">
                <a href={`mailto:${email}`} className="text-primary-ink underline-offset-4 hover:underline">{email}</a>
              </p>
              <a href={`mailto:${email}`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover">
                <Mail className="h-4 w-4" aria-hidden="true" /> {t("contact.write")}
              </a>
            </>
          ) : (
            <p className="text-muted">{t("contact.notSet")}</p>
          )}
        </section>
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6 text-sm">
          <h2 className="font-semibold">{t("contact.helpful")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>{t("contact.h1")}</li>
            <li>{t("contact.h2")}</li>
            <li>{t("contact.h3")}</li>
          </ul>
          <p className="mt-4 text-muted">{t("contact.shops")}</p>
        </section>
      </div>
    </div>
  );
}
