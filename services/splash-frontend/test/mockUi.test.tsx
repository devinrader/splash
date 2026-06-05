import { render, screen } from "@testing-library/react";
import { assert, test } from "vitest";
import { Card } from "../src/components/mockUi";

test("renders a Card without a header when showHeader is false", () => {
  render(
    <Card showHeader={false}>
      <p>Body content</p>
    </Card>
  );

  assert.ok(screen.getByText("Body content"));
  assert.ok(screen.queryByRole("heading") === null);
});

test("applies Card presentation variant classes", () => {
  render(
    <Card title="Variant Card" borderless shadowless>
      <p>Body content</p>
    </Card>
  );

  const article = screen.getByText("Body content").closest("article");
  assert.ok(article);
  assert.ok(article.classList.contains("app-card"));
  assert.ok(article.classList.contains("app-card-borderless"));
  assert.ok(article.classList.contains("app-card-shadowless"));
});
