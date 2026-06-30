import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  console.log("=== DOWNLOADS ROUTE HIT ===", request.url);

  try {
    const { session, admin } = await authenticate.public.appProxy(request);
    console.log("Proxy auth result:", { hasSession: !!session, hasAdmin: !!admin });

    const url = new URL(request.url);
    const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");
    console.log("logged_in_customer_id:", loggedInCustomerId);
    const now = new Date();

    if (!loggedInCustomerId) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    if (!session) {
      return Response.json({ error: "No session found for shop" }, { status: 401 });
    }

    const customerResponse = await admin.graphql(`
      query getCustomer($id: ID!) {
        customer(id: $id) {
          email
        }
      }`,
      { variables: { id: `gid://shopify/Customer/${loggedInCustomerId}` } }
    );

    const customerData = await customerResponse.json();
    console.log("Customer GraphQL response:", JSON.stringify(customerData));

    const customerEmail = customerData?.data?.customer?.email;

    if (!customerEmail) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    const tokens = await prisma.downloadToken.findMany({
      where: {
        customerEmail,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        group: {
          include: { assets: true },
        },
      },
    });

    console.log("Tokens found:", tokens.length);

    const downloads = tokens
      .filter((t) => !t.group?.accessLimit || t.downloadCount < t.group.accessLimit)
      .map((t) => ({
        token: t.token,
        expiresAt: t.expiresAt,
        downloadCount: t.downloadCount,
        accessLimit: t.group?.accessLimit,
        assets: t.group?.assets.map((a) => ({
          id: a.id,
          type: a.type,
          name: a.name || a.linkName,
          size: a.size,
          url: a.url,
          linkName: a.linkName,
          link_name: a.linkName,
          instructions: a.instructions,
        })) || [],
      }));

    return Response.json({ downloads });
  } catch (err) {
    console.error("=== DOWNLOADS ROUTE ERROR ===", err);
    throw err;
  }
};