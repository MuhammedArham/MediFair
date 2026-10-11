import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return <div className="not-found"><span className="eyebrow">PAGE NOT FOUND</span><h1>We couldn’t find that case.</h1><p>Only the synthetic sample case is available in this base demo.</p><Link href="/" className="button button-primary"><ArrowLeft size={17} /> Back to overview</Link></div>;
}
