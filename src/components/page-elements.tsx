import Link from "next/link";
import { ArrowRight, CircleHelp, ShieldCheck } from "lucide-react";

export function PageHeading({ eyebrow, title, description, action }: {
  eyebrow: string;
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return <div className="page-heading">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>
    {action && <Link href={action.href} className="button button-primary">{action.label}<ArrowRight size={17} aria-hidden="true" /></Link>}
  </div>;
}

export function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="notice" role="note"><ShieldCheck size={20} aria-hidden="true" /><div><strong>{title}</strong><p>{children}</p></div></div>;
}

export function PlaceholderCard({ icon, title, body, steps }: {
  icon: React.ReactNode;
  title: string;
  body: string;
  steps?: string[];
}) {
  return <section className="placeholder-card">
    <div className="placeholder-icon">{icon}</div>
    <div className="badge">COMING IN A FUTURE BUILD</div>
    <h2>{title}</h2>
    <p>{body}</p>
    {steps && <ul className="plain-list">{steps.map((step) => <li key={step}><span className="list-check">✓</span>{step}</li>)}</ul>}
  </section>;
}

export function HelpCard({ title, body, href, link }: { title: string; body: string; href: string; link: string }) {
  return <aside className="help-card"><CircleHelp size={22} aria-hidden="true" /><h3>{title}</h3><p>{body}</p><a href={href} target="_blank" rel="noreferrer">{link}<ArrowRight size={15} aria-hidden="true" /></a></aside>;
}
