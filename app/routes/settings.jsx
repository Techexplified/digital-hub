import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  console.log("=== SETTINGS ROUTE HIT ===", request.url);

  try {
    const { session } = await authenticate.public.appProxy(request);
    console.log("Settings route auth:", { hasSession: !!session });

    if (!session) {
      return Response.json({ error: "No session found for shop" }, { status: 401 });
    }

    const settings = await prisma.shopSettings.findUnique({
      where: { shop: session.shop },
    });

    return Response.json({
      portalHeaderText: settings?.portalHeaderText ?? "My Digital Vault",
      loginPromptMessage: settings?.loginPromptMessage ?? "Please log in to your customer account to access and download your purchased files.",
    });
  } catch (err) {
    console.error("=== SETTINGS ROUTE ERROR ===", err);
    return new Response("Internal error", { status: 500 });
  }
};