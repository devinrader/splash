import { Card } from "../components/mockUi";
import { WaterTestLogPage } from "./WaterTestLogPage";

export function ChemistryPage() {
  return (
    <>
      <section className="automation-shell">
        <div className="automation-grid">
          <Card title="Chemistry Workspace">
            <p className="panel-copy">
              Chemistry owns manual water testing now. Later slices will add
              chemistry status, chemical additions, and SLAM workflows here
              without splitting them back into separate top-level destinations.
            </p>
          </Card>
        </div>
      </section>
      <WaterTestLogPage />
    </>
  );
}
