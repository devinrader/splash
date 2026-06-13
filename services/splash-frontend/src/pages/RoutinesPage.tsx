import { useEffect, useState } from "react";
import { fetchMaintenanceRecommendations } from "../api";
import { Card } from "../components/mockUi";
import type {
  MaintenanceRecommendationItemData,
  MaintenanceRecommendationsData,
  SwimmabilityConfidence
} from "../types";
import { AlertsPage } from "./AlertsPage";

export function RoutinesPage() {
  const [recommendations, setRecommendations] = useState<MaintenanceRecommendationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const response = await fetchMaintenanceRecommendations();
        if (cancelled) {
          return;
        }
        setRecommendations(response.data);
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRecommendations(null);
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <section className="automation-shell">
        <div className="automation-grid">
          <Card title="Recommended Next Steps">
            {loading ? <p className="chart-empty-state">Loading recommendations…</p> : null}
            {!loading && errorMessage ? <p className="settings-message settings-message-error">{errorMessage}</p> : null}
            {!loading && !errorMessage && recommendations ? (
              <div className="recommendation-list" aria-label="maintenance recommendations">
                {recommendations.recommendations.map((recommendation) => (
                  <article
                    className={`recommendation-item recommendation-priority-${recommendation.priority}`}
                    key={recommendation.id}
                  >
                    <div className="recommendation-item-header">
                      <div className="recommendation-item-copy">
                        <span className={`recommendation-priority-pill recommendation-priority-pill-${recommendation.priority}`}>
                          {formatPriority(recommendation.priority)}
                        </span>
                        <strong>{recommendation.title}</strong>
                      </div>
                      <span className="recommendation-confidence">
                        {formatConfidence(recommendation.confidence)} confidence
                      </span>
                    </div>
                    <p className="panel-copy">{recommendation.summary}</p>
                    <div className="automation-record-list">
                      <div className="automation-record-row">
                        <strong>Action</strong>
                        <span>{recommendation.recommended_action}</span>
                      </div>
                      <div className="automation-record-row">
                        <strong>Category</strong>
                        <span>{formatCategory(recommendation.category)}</span>
                      </div>
                    </div>
                    {recommendation.why.length > 0 ? (
                      <div>
                        <strong className="recommendation-subheading">Why</strong>
                        <ul className="recommendation-reason-list">
                          {recommendation.why.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {recommendation.blocking_factors.length > 0 ? (
                      <div>
                        <strong className="recommendation-subheading">Blocking Factors</strong>
                        <ul className="recommendation-reason-list">
                          {recommendation.blocking_factors.map((factor) => (
                            <li key={factor}>{factor}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {recommendation.supporting_inputs.length > 0 ? (
                      <div className="automation-record-list">
                        {recommendation.supporting_inputs.map((item) => (
                          <div className="automation-record-row" key={`${recommendation.id}-${item.key}`}>
                            <strong>{item.label}</strong>
                            <span>{item.detail}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}
          </Card>
        </div>
      </section>
      <AlertsPage />
    </>
  );
}

function formatPriority(priority: MaintenanceRecommendationItemData["priority"]): string {
  switch (priority) {
    case "now":
      return "Do this now";
    case "soon":
      return "Do this soon";
    case "monitor":
      return "Monitor";
  }
}

function formatConfidence(confidence: SwimmabilityConfidence): string {
  switch (confidence) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "unknown":
      return "Unknown";
  }
}

function formatCategory(category: MaintenanceRecommendationItemData["category"]): string {
  switch (category) {
    case "retest":
      return "Retest";
    case "chemistry_adjustment":
      return "Chemistry adjustment";
    case "circulation":
      return "Circulation";
    case "cover_usage":
      return "Cover usage";
    case "cleaning":
      return "Cleaning";
    case "inspection":
      return "Inspection";
    case "wait":
      return "Wait";
  }
}
