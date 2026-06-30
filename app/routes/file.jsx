import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  console.log("=== FILE ROUTE HIT ===", request.url);

  try {
    const { session } = await authenticate.public.appProxy(request);
    console.log("File route auth:", { hasSession: !!session });

    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const assetId = parseInt(url.searchParams.get("asset"));
    console.log("token:", token, "assetId:", assetId);

    if (!token || !assetId) {
      return new Response("Missing token or asset", { status: 400 });
    }

    const downloadToken = await prisma.downloadToken.findUnique({
      where: { token },
      include: { group: { include: { assets: true } } },
    });
    console.log("downloadToken found:", !!downloadToken);

    if (!downloadToken) {
      return new Response("Invalid token", { status: 404 });
    }

    if (downloadToken.expiresAt && downloadToken.expiresAt < new Date()) {
      return new Response("Token expired", { status: 403 });
    }

    if (
      downloadToken.group?.accessLimit &&
      downloadToken.downloadCount >= downloadToken.group.accessLimit
    ) {
      return new Response("Download limit reached", { status: 403 });
    }

    const asset = downloadToken.group?.assets.find((a) => a.id === assetId);
    console.log("asset found:", !!asset, asset?.type);

    if (!asset || asset.type !== "file" || !asset.fileData) {
      return new Response("File not found", { status: 404 });
    }

    await prisma.downloadToken.update({
      where: { id: downloadToken.id },
      data: { downloadCount: { increment: 1 } },
    });

    console.log("Streaming file:", asset.name, asset.size);

    return new Response(asset.fileData, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${asset.name || "download"}"`,
        "Content-Length": String(asset.size || asset.fileData.length),
      },
    });
  } catch (err) {
    console.error("=== FILE ROUTE ERROR ===", err);
    return new Response("Internal error", { status: 500 });
  }
};