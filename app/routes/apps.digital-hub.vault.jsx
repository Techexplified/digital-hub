import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { cors } = await authenticate.public.appProxy(request);

  return cors(
    new Response(null, {
      status: 302,
      headers: { Location: "/account" },
    }),
  );
};
