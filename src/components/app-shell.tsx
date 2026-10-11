"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  GitCompareArrows,
  Handshake,
  Inbox,
  LayoutDashboard,
  Settings,


  FileText,
  Lightbulb,
  ShieldCheck,

} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/providers", label: "Find & Compare", icon: GitCompareArrows },
  { href: "/comparison", label: "My Quotes", icon: FileText },
  { href: "/documents", label: "Analyse Bills", icon: FileText },
  { href: "/opportunities", label: "Opportunities", icon: Lightbulb },
  { href: "/negotiation", label: "Negotiations", icon: Handshake },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children, emailMode, aiMode, demo }: { children: React.ReactNode; emailMode: string; aiMode: string; demo: boolean }) {
  const pathname = usePathname();
  const query = useSearchParams();
  const caseId = query.get("case") ?? (pathname.startsWith("/case/") && pathname !== "/case/new" ? pathname.split("/")[2] : "demo-case");
  const target = (href: string) => `${href}?case=${encodeURIComponent(caseId)}`;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <Link href="/" className="brand" aria-label="MediFair AI home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-name">MediFair<span> AI</span></span>
        </Link>
        <div className="sidebar-caption">YOUR WORKSPACE</div>
        <nav className="nav-list" aria-label="Primary">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link key={href} href={target(href)} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note"><ShieldCheck size={20} aria-hidden="true" /><span>Built around your consent and clarity.</span></div>
          <a className="sidebar-source" href="https://medicalcostsfinder.health.gov.au/" target="_blank" rel="noreferrer">
            Australian cost guidance <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark" aria-hidden="true"><span /></span><strong>MediFair AI</strong></div>
          <span className="topbar-trail">Private healthcare, made clearer</span>
          <span className="demo-pill"><span className="status-dot" /> {demo ? "SYNTHETIC DATA" : "REAL MODE"}</span>
        </header>
        <div className="mobile-nav" aria-label="Primary navigation">
          {nav.map(({ href, label }) => <Link key={href} href={target(href)} className={pathname === href ? "selected" : ""}>{label}</Link>)}
        </div>
        <main id="main-content" className="content"><div className="mode-strip"><span>{emailMode === "mock" ? "MOCK EMAIL" : `EMAIL: ${emailMode.toUpperCase()}`}</span><span>{aiMode === "mock" ? "SIMULATED AI" : `AI: ${aiMode.toUpperCase()}`}</span><Link href={target("/settings")}>Service settings</Link></div>{children}</main>
      </div>
    </div>
  );
}
