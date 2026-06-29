import Link from 'next/link';

// Call-to-action shown to logged-out visitors at the bottom of a public preview
// (event or profile). `href` should point at a real next step — typically
// /register?next=... so signing up returns the visitor to this page.
export default function PublicCta({ label, href = '/' }: { label: string; href?: string }) {
  return (
    <>
      <Link className="btn solid block" style={{ marginTop: 22 }} href={href}>
        {label}
      </Link>
      <div className="footnote">powered by plur.nyc</div>
    </>
  );
}
