import { useState, useEffect } from "react";
import { useNavigate, useLocation, useRouteError, useLoaderData, useFetcher, useNavigation, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import styles from "../components/app.link-product.module.css";

// 1. Authentication Loader - Fetch products from Shopify
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(`
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            productType
            status
            totalVariants
            featuredImage { url }
          }
        }
      }
    }
  `);
  const data = await response.json();
  const products = data?.data?.products?.edges?.map(e => e.node) || [];
  return { products };
};

// 2. Action - Save product link to Neon database
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request); // eslint-disable-next-line no-unused-vars
  const shop = session.shop;
  const formData = await request.formData();
  const groupId = parseInt(formData.get("groupId"));
  const productId = formData.get("productId");

  // await prisma.assetGroup.update({
  //   where: { id: groupId },
  //   data: { productId }
  // });

  // return { success: true };

  if (!groupId || isNaN(groupId)) {
    return { success: false, error: "Invalid asset group" };
  }

  const result = await prisma.assetGroup.updateMany({
    where: { id: groupId, shop },
    data: { productId },
  });

  if (result.count === 0) {
    return { success: false, error: "Asset group not found or access denied" };
  }

  return { success: true };
};

// 3. SVG Icon Components
const BackIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={styles.backIcon}
  >
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const SearchIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const SortIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ marginRight: '6px' }}
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

const SaveIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ marginRight: '6px' }}
  >
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

const ImagePlaceholderIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

// 4. Page Component
export default function LinkProduct() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = useNavigation();
  const fetcher = useFetcher();
  const { products } = useLoaderData();

  //const groupId = location.state?.groupId || "";
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get("groupId") || "";

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [sortOrder, setSortOrder] = useState("asc"); // "asc" or "desc"

  // Navigate back to /app/dashboard on successful action submission
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Product linked successfully!");
      navigate("/app/dashboard");
    }
  }, [fetcher.data, navigate, shopify]);

  const handleDiscard = () => {
    //navigate("/app/asset-saved", { state: { groupId } });
    navigate(`/app/asset-saved?groupId=${groupId}`);
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!selectedProductId) {
      try {
        shopify.toast.show("Please select a product");
      } catch (err) {
        console.warn("Toast failed - Fallback to console alert.", err);
      }
      return;
    }

    const formData = new FormData();
    formData.append("groupId", groupId);
    formData.append("productId", selectedProductId);
    fetcher.submit(formData, { method: "POST" });
  };

  // 1. Filter products by title
  const filteredProducts = products.filter(product =>
    product.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 2. Sort filtered products alphabetically
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const titleA = (a.title || "").toLowerCase();
    const titleB = (b.title || "").toLowerCase();
    if (sortOrder === "asc") {
      return titleA.localeCompare(titleB);
    } else {
      return titleB.localeCompare(titleA);
    }
  });

  const isLoading = navigation.state === "loading" || fetcher.state === "submitting";
  const hasNoProducts = products.length === 0;

  return (
    <div className={styles.pageContainer}>
      {/* AppHeader commented out as requested to match app.asset-saved.jsx style */}
      {/* <AppHeader onAvatarClick={() => {}} /> */}

      <main className={styles.mainContent}>
        {/* Page Title, Discard and Save Actions */}
        <div className={styles.pageHeader}>
          <div className={styles.headerLeft}>
            <button
              type="button"
              className={styles.backButton}
              onClick={handleDiscard}
              aria-label="Back"
            >
              <BackIcon />
            </button>
            <h2 className={styles.pageTitle}>Your Product</h2>
          </div>
          <div className={styles.headerRight}>
            <button
              type="button"
              className={styles.discardButton}
              onClick={handleDiscard}
            >
              Discard
            </button>
            <button
              type="button"
              className={`${styles.saveButton} ${!selectedProductId ? styles.saveButtonDisabled : ""}`}
              onClick={handleSave}
              disabled={isLoading}
            >
              <SaveIcon />
              Save
            </button>
          </div>
        </div>

        {/* List Card */}
        <div className={styles.card}>
          {/* Search and Sort row */}
          <div className={styles.searchSortRow}>
            <div className={styles.searchWrapper}>
              <span className={styles.searchIcon}>
                <SearchIcon />
              </span>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Find Product"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              type="button"
              className={styles.sortButton}
              onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
            >
              <SortIcon />
              Sort {sortOrder === "asc" ? "A→Z" : "Z→A"}
            </button>
          </div>

          {/* Table headers */}
          <div className={styles.tableHeader}>
            <span className={styles.tableHeaderCol}>Product</span>
            <span className={styles.tableHeaderCol}>Status</span>
          </div>

          {/* Products List Rendering */}
          {isLoading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <span>Loading products...</span>
            </div>
          ) : hasNoProducts ? (
            <div className={styles.emptyState}>
              <h3 className={styles.emptyStateTitle}>No products found</h3>
              <p className={styles.emptyStateDescription}>
                Add products in your Shopify admin to link them.
              </p>
            </div>
          ) : sortedProducts.length === 0 ? (
            <div className={styles.emptyState}>
              <h3 className={styles.emptyStateTitle}>No matches found</h3>
              <p className={styles.emptyStateDescription}>
                Try adjusting your search criteria.
              </p>
            </div>
          ) : (
            <div className={styles.productList}>
              {sortedProducts.map((product) => {
                const isSelected = selectedProductId === product.id;
                const imageUrl = product.featuredImage?.url;

                return (
                  <div
                    key={product.id}
                    className={`${styles.productRow} ${
                      isSelected ? styles.productRowSelected : ""
                    }`}
                    onClick={() => setSelectedProductId(product.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setSelectedProductId(product.id);
                      }
                    }}
                  >
                    <div className={styles.productMain}>
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={product.title}
                          className={styles.thumbnail}
                        />
                      ) : (
                        <div className={styles.thumbnailPlaceholder}>
                          <ImagePlaceholderIcon />
                        </div>
                      )}
                      <div className={styles.productDetails}>
                        <h4 className={styles.productTitle}>{product.title}</h4>
                        <span className={styles.productMeta}>
                          {product.productType || "Unknown Type"} &middot; {product.totalVariants} {product.totalVariants === 1 ? "variant" : "variants"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span
                        className={`${styles.statusBadge} ${
                          product.status === "ACTIVE"
                            ? styles.statusActive
                            : product.status === "DRAFT"
                            ? styles.statusDraft
                            : styles.statusArchived
                        }`}
                      >
                        {product.status ? product.status.toLowerCase() : "unknown"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
