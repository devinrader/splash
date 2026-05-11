import { Card } from "../components/mockUi";

export function PlaceholderPage({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return (
    <section className="placeholder-shell">
      <Card title={title} status="Placeholder">
        <p className="panel-kicker">{kicker}</p>
        <p className="panel-copy">{description}</p>
      </Card>
    </section>
  );
}
