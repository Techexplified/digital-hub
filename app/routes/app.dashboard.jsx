import { useState, useMemo } from "react";
import { useLoaderData, useRouteError, useNavigate, Link } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import styles from "../components/app.dashboard.module.css";

// 1. Loader - Queries database & shopify graphql api
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const assetGroups = await prisma.assetGroup.findMany({
    where: {
      shop,
      productId: { not: null },
    },
    include: {
      assets: true,
      downloadTokens: true,
    },
  });

  const productIds = [
    ...new Set(assetGroups.map((ag) => ag.productId).filter(Boolean)),
  ];

  let currencyCode = "USD";
  let shopifyProducts = [];

  try {
    if (productIds.length > 0) {
      // Chunk into batches of 250 to stay within Shopify's nodes() limit
      const chunkSize = 250;
      const chunks = [];
      for (let i = 0; i < productIds.length; i += chunkSize) {
        chunks.push(productIds.slice(i, i + chunkSize));
      }

      for (const chunk of chunks) {
        const graphqlResponse = await admin.graphql(
          `#graphql
          query getDashboardData($ids: [ID!]!) {
            shop {
              currencyCode
            }
            nodes(ids: $ids) {
              ... on Product {
                id
                title
                status
                totalVariants
                featuredImage {
                  url
                }
              }
            }
          }`,
          { variables: { ids: chunk } }
        );
        const graphqlData = await graphqlResponse.json();
        currencyCode = graphqlData?.data?.shop?.currencyCode || currencyCode;
        const nodes = (graphqlData?.data?.nodes || []).filter(Boolean);
        shopifyProducts = [...shopifyProducts, ...nodes];
      }
    } else {
      const graphqlResponse = await admin.graphql(
        `#graphql
        query getShopCurrency {
          shop {
            currencyCode
          }
        }`
      );
      const graphqlData = await graphqlResponse.json();
      currencyCode = graphqlData?.data?.shop?.currencyCode || "USD";
    }
  } catch (error) {
    console.error("Error querying Shopify GraphQL:", error);
  }

  const allTokens = assetGroups.flatMap((g) => g.downloadTokens || []);

  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const tokensThisMonth = allTokens.filter(
    (t) => t.createdAt && new Date(t.createdAt) >= startOfThisMonth
  );
  const tokensLastMonth = allTokens.filter(
    (t) =>
      t.createdAt &&
      new Date(t.createdAt) >= startOfLastMonth &&
      new Date(t.createdAt) <= endOfLastMonth
  );

  const ordersCurrent = new Set(tokensThisMonth.map((t) => t.orderId).filter(Boolean)).size;
  const ordersPrevious = new Set(tokensLastMonth.map((t) => t.orderId).filter(Boolean)).size;

  // TODO: wire actual sales total once stored on DownloadToken or a new Order model
  const salesCurrent = 0;
  const salesPrevious = 0;

  const liveProductsCurrent = shopifyProducts.filter((p) => p.status === "ACTIVE").length;
  // TODO: compute properly once enough historical data exists
  const liveProductsPrevious = 0;

  const productsMap = {};
  for (const shopifyProduct of shopifyProducts) {
    productsMap[shopifyProduct.id] = {
      id: shopifyProduct.id,
      title: shopifyProduct.title,
      status:
        shopifyProduct.status === "ACTIVE"
          ? "Active"
          : shopifyProduct.status === "DRAFT"
            ? "Draft"
            : "Archived",
      variantCount: shopifyProduct.totalVariants || 0,
      imageUrl: shopifyProduct.featuredImage?.url || null,
      assetCount: 0,
      downloads: 0,
      sales: 0,
    };
  }

  // for (const group of assetGroups) {
  //   const pId = group.productId;
  //   if (pId && productsMap[pId]) {
  //     productsMap[pId].assetCount += group.assets?.length || 0;
  //     productsMap[pId].downloads +=
  //       group.downloadTokens?.reduce(
  //         (sum, token) => sum + (token.downloadCount || 0),
  //         0
  //       ) || 0;
  //   }
  // }

  for (const group of assetGroups) {
  const pId = group.productId;
  if (pId && productsMap[pId]) {
    productsMap[pId].assetCount += group.assets?.length || 0;
    productsMap[pId].downloads += group.downloadTokens?.reduce(
      (sum, token) => sum + (token.downloadCount || 0), 0
    ) || 0;
    productsMap[pId].sales += group.downloadTokens?.reduce(
      (sum, token) => sum + (parseFloat(token.saleAmount) || 0), 0
    ) || 0;
  }
}

  return {
    stats: {
      orders: { current: ordersCurrent, previous: ordersPrevious },
      sales: { current: salesCurrent, previous: salesPrevious },
      liveProducts: { current: liveProductsCurrent, previous: liveProductsPrevious },
    },
    products: Object.values(productsMap),
    currencyCode,
  };
};

// SVG Icon Components
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const ImageIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const LayersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const MusicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const SortIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px" }}>
    <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// Fallback icon when product has no image — stable based on product id, not index
const getProductFallback = (product) => {
  const title = (product.title || "").toLowerCase();
  if (title.includes("course") || title.includes("video") || title.includes("tutorial")) {
    return { icon: <ImageIcon />, bgClass: styles.iconBgBlue, categoryLabel: "Digital course" };
  }
  if (title.includes("preset") || title.includes("motion") || title.includes("audio")) {
    return { icon: <MusicIcon />, bgClass: styles.iconBgPurple, categoryLabel: "Preset pack" };
  }
  if (title.includes("template") || title.includes("ui")) {
    return { icon: <LayersIcon />, bgClass: styles.iconBgYellow, categoryLabel: "Template pack" };
  }
  if (title.includes("pack") || title.includes("bundle") || title.includes("design")) {
    return { icon: <ImageIcon />, bgClass: styles.iconBgRed, categoryLabel: "Asset bundle" };
  }
  // Stable fallback based on product id hash, not row index
  const fallbacks = [
    { icon: <ImageIcon />, bgClass: styles.iconBgBlue, categoryLabel: "Digital asset" },
    { icon: <LayersIcon />, bgClass: styles.iconBgYellow, categoryLabel: "Template pack" },
    { icon: <MusicIcon />, bgClass: styles.iconBgPurple, categoryLabel: "Preset pack" },
    { icon: <ImageIcon />, bgClass: styles.iconBgRed, categoryLabel: "Asset bundle" },
  ];
  const hash = (product.id || "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return fallbacks[hash % fallbacks.length];
};

export default function Dashboard() {
  const { stats, products, currencyCode } = useLoaderData();
  console.log("stats", stats);

  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("Active");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const formatCurrency = (amount) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch (err) {
      return `${currencyCode} ${amount}`;
    }
  };

  const getProgressWidths = (current, previous) => {
    if (current === 0 && previous === 0) {
      return { currentWidth: "0%", previousWidth: "0%" };
    }
    const maxVal = Math.max(current, previous);
    return {
      currentWidth: `${(current / maxVal) * 100}%`,
      previousWidth: `${(previous / maxVal) * 100}%`,
    };
  };

  const activeCount = useMemo(() => products.filter((p) => p.status === "Active").length, [products]);
  const draftCount = useMemo(() => products.filter((p) => p.status === "Draft").length, [products]);
  const archivedCount = useMemo(() => products.filter((p) => p.status === "Archived").length, [products]);

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const filteredProducts = useMemo(() => {
    return products
      .filter((product) => activeTab === "All" || product.status === activeTab)
      .filter((product) =>
        product.title?.toLowerCase().includes(searchQuery.toLowerCase())
      );
  }, [products, activeTab, searchQuery]);

  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      const valA = a.sales || 0;
      const valB = b.sales || 0;
      if (valA !== valB) return sortOrder === "desc" ? valB - valA : valA - valB;
      const downloadsA = a.downloads || 0;
      const downloadsB = b.downloads || 0;
      if (downloadsA !== downloadsB) return sortOrder === "desc" ? downloadsB - downloadsA : downloadsA - downloadsB;
      return sortOrder === "desc"
        ? a.title.localeCompare(b.title)
        : b.title.localeCompare(a.title);
    });
  }, [filteredProducts, sortOrder]);

  const totalPages = Math.ceil(sortedProducts.length / itemsPerPage) || 1;

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedProducts.slice(start, start + itemsPerPage);
  }, [sortedProducts, currentPage]);

  const showingText = useMemo(() => {
    const totalCount = sortedProducts.length;
    if (totalCount === 0) return "No products";
    if (totalCount <= itemsPerPage) return `Showing ${totalCount} of ${totalCount} products`;
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalCount);
    return `Showing ${startItem}–${endItem} of ${totalCount} products`;
  }, [sortedProducts, currentPage]);

  const ordersWidths = getProgressWidths(stats.orders.current, stats.orders.previous);
  console.log("ordersWidths", ordersWidths);

  const salesWidths = getProgressWidths(stats.sales.current, stats.sales.previous);
  const liveProductsWidths = getProgressWidths(stats.liveProducts.current, stats.liveProducts.previous);

  return (
    <div className={styles.pageContainer}>
      <main className={styles.mainContent}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div className={styles.headerLeft}>
            <span className={styles.dashboardLabel}>Dashboard</span>
            <h2 className={styles.pageTitle}>Welcome back, Merchant</h2>
            <p className={styles.pageSubtitle}>Here's what's happening with your Upload Studio today.</p>
          </div>
          <Link to="/app" className={styles.addAssetButton}>
            <PlusIcon /> Add Asset
          </Link>
        </div>

        {/* Stats Cards */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div>
              <div className={styles.statValue}>
                {stats.orders.current} {stats.orders.current === 1 ? "Order" : "Orders"}
              </div>
              <div className={styles.statLabel}>Total Digital Product Orders</div>
            </div>
            <div className={styles.progressBarContainer}>
              <div className={styles.barsWrapper}>
                <div className={styles.barTrack}>
                  <div className={`${styles.barFill} ${styles.currentBar}`} style={{ width: ordersWidths.currentWidth }} />
                </div>
                <div className={styles.barTrack}>
                  <div className={`${styles.barFill} ${styles.previousBar}`} style={{ width: ordersWidths.previousWidth }} />
                </div>
              </div>
              <span className={styles.vsLabel}>vs last month</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div>
              <div className={styles.statValue}>{formatCurrency(stats.sales.current)}</div>
              <div className={styles.statLabel}>Total Sales</div>
            </div>
            <div className={styles.progressBarContainer}>
              <div className={styles.barsWrapper}>
                <div className={styles.barTrack}>
                  <div className={`${styles.barFill} ${styles.currentBar}`} style={{ width: salesWidths.currentWidth }} />
                </div>
                <div className={styles.barTrack}>
                  <div className={`${styles.barFill} ${styles.previousBar}`} style={{ width: salesWidths.previousWidth }} />
                </div>
              </div>
              <span className={styles.vsLabel}>vs last month</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div>
              <div className={styles.statValue}>{stats.liveProducts.current}</div>
              <div className={styles.statLabel}>Total Digital Product Live</div>
            </div>
            <div className={styles.progressBarContainer}>
              <div className={styles.barsWrapper}>
                <div className={styles.barTrack}>
                  <div className={`${styles.barFill} ${styles.currentBar}`} style={{ width: liveProductsWidths.currentWidth }} />
                </div>
                <div className={styles.barTrack}>
                  <div className={`${styles.barFill} ${styles.previousBar}`} style={{ width: liveProductsWidths.previousWidth }} />
                </div>
              </div>
              <span className={styles.vsLabel}>vs last month</span>
            </div>
          </div>
        </div>

        {/* Products Card */}
        <div className={styles.contentCard}>
          {/* Tabs */}
          <div className={styles.tabsContainer}>
            {[
              { label: "Active", count: activeCount },
              { label: "Draft", count: draftCount },
              { label: "Archived", count: archivedCount },
              { label: "All", count: null },
            ].map(({ label, count }) => (
              <button
                key={label}
                onClick={() => handleTabClick(label)}
                className={`${styles.tabButton} ${activeTab === label ? styles.tabButtonActive : ""}`}
              >
                {label}
                {count > 0 && <span className={styles.tabBadge}>{count}</span>}
              </button>
            ))}
          </div>

          {/* Search + Sort */}
          <div className={styles.searchSortRow}>
            <div className={styles.searchWrapper}>
              <span className={styles.searchIcon}><SearchIcon /></span>
              <input
                type="text"
                placeholder="Filter products..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className={styles.searchInput}
              />
            </div>
            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
              className={styles.sortButton}
            >
              <SortIcon />
              Sort
            </button>
          </div>

          {/* Table */}
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={`${styles.th} ${styles.thProduct}`}>Product</th>
                  <th className={`${styles.th} ${styles.thStatus}`}>Status</th>
                  <th className={`${styles.th} ${styles.thAssets}`}>Assets</th>
                  <th className={`${styles.th} ${styles.thSales}`}>Sales</th>
                  <th className={`${styles.th} ${styles.thDownloads}`}>Downloads</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className={styles.emptyState}>
                        <h3 className={styles.emptyStateTitle}>No products found</h3>
                        <p className={styles.emptyStateDescription}>
                          Try adjusting your filters or add a new digital asset.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedProducts.map((product) => {
                    const { icon, bgClass, categoryLabel } = getProductFallback(product);
                    return (
                      <tr key={product.id} className={styles.productRow}>
                        <td className={styles.td}>
                          <div className={styles.productColCell}>
                            {/* Product image if available, fallback icon otherwise */}
                            <div className={`${styles.productIconWrapper} ${!product.imageUrl ? bgClass : ""}`}>
                              {product.imageUrl ? (
                                <img
                                  src={product.imageUrl}
                                  alt={product.title}
                                  className={styles.productImage}
                                />
                              ) : (
                                icon
                              )}
                            </div>
                            <div className={styles.productDetails}>
                              <h4 className={styles.productTitle}>{product.title}</h4>
                              <p className={styles.productSubtitle}>
                                {categoryLabel} &middot; {product.variantCount}{" "}
                                {product.variantCount === 1 ? "variant" : "variants"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className={styles.td}>
                          <span className={`${styles.statusBadge} ${product.status === "Active"
                              ? styles.statusActive
                              : product.status === "Draft"
                                ? styles.statusDraft
                                : styles.statusArchived
                            }`}>
                            {product.status}
                          </span>
                        </td>
                        {/* Plain text — no link */}
                        <td className={styles.td}>
                          {product.assetCount} {product.assetCount === 1 ? "file" : "files"}
                        </td>
                        <td className={styles.td}>{formatCurrency(product.sales)}</td>
                        <td className={styles.td}>{product.downloads}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className={styles.paginationFooter}>
            <p className={styles.showingText}>{showingText}</p>
            {totalPages > 1 && (
              <div className={styles.paginationControls}>
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => prev - 1)}
                  className={styles.pageBtn}
                  aria-label="Previous page"
                >
                  <ChevronLeftIcon />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`${styles.pageBtn} ${currentPage === page ? styles.pageBtnActive : ""}`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((prev) => prev + 1)}
                  className={styles.pageBtn}
                  aria-label="Next page"
                >
                  <ChevronRightIcon />
                </button>
              </div>
            )}
          </div>
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