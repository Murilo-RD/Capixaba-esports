import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/moonastery")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const server = await import("@/lib/moonastery/server");
        try {
          const url = new URL(request.url);
          if (url.searchParams.get("resource") === "home")
            return server.apiResponse(await server.loadPublicHome());
          if (url.searchParams.get("resource") === "news")
            return server.apiResponse(
              await server.loadPublicNews(url.searchParams.get("slug") || ""),
            );
          return server.apiResponse({ error: "Recurso desconhecido.", code: "NOT_FOUND" }, 404);
        } catch (error) {
          return server.apiFailure(error);
        }
      },
      POST: async ({ request }) => {
        const server = await import("@/lib/moonastery/server");
        try {
          const size = Number(request.headers.get("content-length") || 0);
          if (size > 8 * 1024 * 1024)
            return server.apiResponse(
              { error: "Envio muito grande.", code: "UPLOAD_TOO_LARGE" },
              413,
            );
          return server.apiResponse(await server.handleMoonRequest(request));
        } catch (error) {
          return server.apiFailure(error);
        }
      },
    },
  },
});
