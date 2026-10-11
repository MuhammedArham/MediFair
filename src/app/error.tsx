"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <section role="alert" className="workspace-panel"><h2>We couldn’t load this view</h2><p>Your saved records remain in the local database. Check the local setup, then try again.</p><button className="button button-primary mt-4" onClick={reset}>Try again</button></section>; }
