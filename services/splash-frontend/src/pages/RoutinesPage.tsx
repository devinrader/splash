import { Card } from "../components/mockUi";
import { AlertsPage } from "./AlertsPage";

export function RoutinesPage() {
  return (
    <>
      <section className="automation-shell">
        <div className="automation-grid">
          <Card title="Routines Overview">
            <p className="panel-copy">
              Routines owns alerts, reminders, maintenance flows, and future
              guided processes. The first migration slice moves the existing
              alerts inbox here while later routine workflows are still being
              built.
            </p>
          </Card>
        </div>
      </section>
      <AlertsPage />
    </>
  );
}
