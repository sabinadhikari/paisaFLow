import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

const APP_URL = "/paisaflow/index.html";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PaisaFlow — Personal Finance Manager" },
      {
        name: "description",
        content:
          "Track income, expenses, budgets, savings goals and cash flow in a private, offline-first finance manager.",
      },
      { property: "og:title", content: "PaisaFlow — Personal Finance Manager" },
      { "http-equiv": "refresh", content: `0; url=${APP_URL}` },
      {
        property: "og:description",
        content:
          "Private, offline-first personal finance manager with budgets, savings goals and spending insights.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    window.location.replace(APP_URL);
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Opening PaisaFlow…</p>
        <noscript>
          <a href={APP_URL} className="mt-3 inline-block text-sm font-medium underline">
            Continue to PaisaFlow
          </a>
        </noscript>
      </div>
    </div>
  );
}
