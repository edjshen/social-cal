import Link from 'next/link';

export default function PublicCta({ label }: { label: string }) {
  return (
    <>
      <Link className="btn solid block" style={{ marginTop: 22 }} href="/">
        {label}
      </Link>
      <div className="footnote">powered by plur.nyc</div>
    </>
  );
}
