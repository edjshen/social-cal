export default function PublicCta({ label }: { label: string }) {
  return (
    <>
      <a className="btn solid block" style={{ marginTop: 22 }} href="/">{label}</a>
      <div className="footnote">Orbit — your social calendar is your profile.<br />See when your people are free, and actually make plans.</div>
    </>
  );
}
