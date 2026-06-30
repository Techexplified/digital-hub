import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import crypto from "crypto";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "ORDERS_PAID") {
    return new Response("Unhandled topic", { status: 404 });
  }

  const order = payload;
  const customerEmail = order.email;
  const orderId = String(order.id);

  // Loop through each line item in the order
  for (const lineItem of order.line_items) {
    const shopifyProductId = `gid://shopify/Product/${lineItem.product_id}`;

    // Find the asset group linked to this product
    const assetGroup = await prisma.assetGroup.findFirst({
      where: {
        shop,
        productId: shopifyProductId,
      },
    });

    if (!assetGroup) continue; // not a digital product, skip

    // Generate a unique secure token
    const token = crypto.randomBytes(32).toString("hex");

    // Set expiry to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Save token to Neon
    await prisma.downloadToken.create({
      data: {
        customerEmail,
        orderId,
        groupId: assetGroup.id,
        token,
        expiresAt,
        downloadCount: 0,
      },
    });

    console.log(`Download token created for ${customerEmail}: ${token}`);
  }

  return new Response("OK", { status: 200 });
};