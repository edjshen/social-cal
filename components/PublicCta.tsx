export default function PublicCta({ label }: { label: string }) {
  return (
    <>
      <a className="btn solid block" style={{ marginTop: 22 }} href="/">{label}</a>
      <div className="footnote">powered by plur.nyc</div>
    </>
  );
}
