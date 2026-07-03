const EMBEDDED_PARAMS = ["shop", "host", "embedded"];

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
