import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      // Customer requested their data - log it, no deletion required
      console.log(`Data request for customer ${payload.customer?.email} at shop ${shop}`);
      return new Response("OK", { status: 200 });

    case "CUSTOMERS_REDACT":
      // Delete customer data from your DB
      await prisma.downloadToken.deleteMany({
        where: {
          customerEmail: payload.customer?.email,
          group: { shop },
        },
      });
      console.log(`Redacted customer data for ${payload.customer?.email} at shop ${shop}`);
      return new Response("OK", { status: 200 });

    case "SHOP_REDACT":
      // 48hrs after uninstall - delete all shop data
      await prisma.downloadToken.deleteMany({
        where: { group: { shop } },
      });
      await prisma.asset.deleteMany({
        where: { group: { shop } },
      });
      await prisma.assetGroup.deleteMany({
        where: { shop },
      });
      console.log(`Redacted all data for shop ${shop}`);
      return new Response("OK", { status: 200 });

    default:
      return new Response("Unhandled topic", { status: 404 });
  }
};