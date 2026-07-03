const EMBEDDED_PARAMS = ["shop", "host", "embedded", "id_token"];

/**
 * Build an in-app path that preserves Shopify embedded iframe params.
 */
export function buildAppUrl(path, searchParams, extraParams = {}) {
  const params = new URLSearchParams();

  for (const key of EMBEDDED_PARAMS) {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  }

  for (const [key, value] of Object.entries(extraParams)) {
    if (value != null && value !== "") {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Navigate within the embedded app without losing Shopify session context.
 * Uses a full page load so Shopify auth params are always sent to the server.
 */
export function navigateEmbedded(path, searchParams, extraParams = {}) {
  if (typeof window === "undefined") return;

  const url = buildAppUrl(path, searchParams, extraParams);
  window.location.assign(url);
}

/**
 * Current path + embedded params for fetcher form submissions.
 */
export function currentEmbeddedAction(pathname, searchParams) {
  return buildAppUrl(pathname, searchParams);
}
