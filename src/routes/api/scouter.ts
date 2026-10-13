import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/scouter")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const server = await import("@/lib/moonastery/server");
        try {
          const actor = await server.requireActor(request, ["owner", "coach"]);
          const length = Number(request.headers.get("content-length") || 0);
          if (length > 21 * 1024 * 1024)
            throw new server.ApiError("Limite de replay: 20 MB.", 413, "UPLOAD_TOO_LARGE");
          const body = await server.boundedBody(request, 21 * 1024 * 1024);
          const form = await new Response(body as BodyInit, {
            headers: { "Content-Type": request.headers.get("content-type") || "" },
          }).formData();
          const file = form.get("file");
          if (
            !(file instanceof File) ||
            file.size > 20 * 1024 * 1024 ||
            file.size < 1 ||
            !file.name.toLowerCase().endsWith(".replay")
          )
            throw new server.ApiError("Envie um arquivo .replay de até 20 MB.");
          const { ingestReplay } = await import("@/lib/gameplay-scouter/pipeline.server");
          return server.apiResponse(
            await ingestReplay(actor.db, actor.user.id, {
              bytes: new Uint8Array(await file.arrayBuffer()),
              filename: file.name,
            }),
          );
        } catch (error) {
          return server.apiFailure(error);
        }
      },
    },
  },
});
