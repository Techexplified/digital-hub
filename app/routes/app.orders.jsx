import { useState, useMemo, useEffect } from "react";
import { useLoaderData, useRouteError, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import styles from "../components/app.orders.module.css";

// 1. Loader - Queries database & shopify graphql api
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Query download_tokens joined with asset_groups to get orders only for this shop
  const tokens = await prisma.downloadToken.findMany({
    where: {
      group: {
        shop: shop,
      },
    },
    include: {
      group: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Get unique product IDs to query Shopify in batches (prevents N+1 query issue)
  const productIds = [
    ...new Set(tokens.map((t) => t.group?.productId).filter(Boolean)),
  ];

  const productsMap = {};

  if (productIds.length > 0) {
    try {
      const response = await admin.graphql(
        `#graphql
        query getProducts($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              priceRangeV2 {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
            }
          }
        }`,
        { variables: { ids: productIds } }
      );
      const resJson = await response.json();
      const nodes = resJson?.data?.nodes || [];
      for (const node of nodes) {
        if (node) {
          productsMap[node.id] = {
            title: node.title,
            price: node.priceRangeV2?.minVariantPrice?.amount || null,
            currencyCode: node.priceRangeV2?.minVariantPrice?.currencyCode || null
          };
        }
      }
    } catch (error) {
      console.error("Error querying product titles and prices via GraphQL:", error);
    }
  }

  // Map to the required structure
  const orders = tokens.map((token, index) => {
    const pId = token.group?.productId;
    const prodInfo = pId ? productsMap[pId] : null;
    return {
      id: token.id,
      customerEmail: token.customerEmail || "No Email",
      createdAt: token.createdAt ? token.createdAt.toISOString() : null,
      productName: prodInfo?.title || "Unknown Product",
      productPrice: prodInfo?.price || null,
      currencyCode: prodInfo?.currencyCode || null,
      orderId: token.orderId || String(tokens.length - index),
    };
  });

  return { orders };
};

// SVG Icon Components
const CalendarIcon = () => (
  <svg className={styles.dateIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className={styles.chevronIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const SearchIcon = () => (
  <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const DownloadIcon = () => (
  <svg className={styles.downloadIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// Helper to determine stable avatar color based on email string
const getAvatarStyle = (email) => {
  const char = (email[0] || "O").toLowerCase();
  const index = char.charCodeAt(0) % 6;
  const classes = [
    styles.avatarPurple,
    styles.avatarBlue,
    styles.avatarGreen,
    styles.avatarYellow,
    styles.avatarPink,
    styles.avatarIndigo
  ];
  return classes[index];
};

// Date formatter
const formatDate = (dateStr) => {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

// Price formatter
const formatPrice = (amount, currencyCode) => {
  if (!amount) return "$9.99"; // Fallback to default
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode || "USD",
    }).format(parseFloat(amount));
  } catch (error) {
    return `${currencyCode || "$"} ${amount}`;
  }
};

export default function OrdersRoute() {
  const { orders } = useLoaderData();
  const navigation = useNavigation();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Reset to page 1 on new search or date filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, startDate, endDate]);

  // Client-side filtering by email, product name, and date range
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const emailMatch = order.customerEmail.toLowerCase().includes(searchQuery.toLowerCase());
      const productMatch = order.productName.toLowerCase().includes(searchQuery.toLowerCase());
      
      let dateMatch = true;
      if (startDate || endDate) {
        const orderDate = order.createdAt ? new Date(order.createdAt) : null;
        if (orderDate) {
          if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (orderDate < start) dateMatch = false;
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (orderDate > end) dateMatch = false;
          }
        } else {
          dateMatch = false;
        }
      }

      return (emailMatch || productMatch) && dateMatch;
    });
  }, [orders, searchQuery, startDate, endDate]);

  // Picker button display text
  const datePickerLabel = useMemo(() => {
    if (!startDate && !endDate) return "Jan 1 — Jan 31, 2025";
    return `${startDate ? formatDate(startDate) : "Start"} — ${endDate ? formatDate(endDate) : "End"}`;
  }, [startDate, endDate]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(start, start + itemsPerPage);
  }, [filteredOrders, currentPage]);

  const isTransitioning = navigation.state === "loading";

  // Export filtered list to PDF using a clean print layout
  const handleDownloadPDF = () => {
    if (filteredOrders.length === 0) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to export the PDF report.");
      return;
    }

    const dateLabel = startDate || endDate 
      ? `${startDate ? formatDate(startDate) : "Start"} to ${endDate ? formatDate(endDate) : "End"}`
      : "All Time";
      
    const searchLabel = searchQuery ? `Search query: "${searchQuery}"` : "All Customers/Products";

    const rowsHtml = filteredOrders.map((order) => {
      const displayOrderId = order.orderId.startsWith("#") ? order.orderId : `#${order.orderId}`;
      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${displayOrderId}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${order.customerEmail}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${formatDate(order.createdAt)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${formatPrice(order.productPrice, order.currencyCode)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${order.productName}</td>
        </tr>
      `;
    }).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Orders Report - Digital Hub</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #1e293b;
              padding: 40px 24px;
              margin: 0;
            }
            .header {
              margin-bottom: 24px;
              border-bottom: 2px solid #e2e8f0;
              padding-bottom: 16px;
            }
            .title {
              font-size: 26px;
              font-weight: bold;
              margin: 0 0 6px 0;
              color: #0f172a;
            }
            .subtitle {
              font-size: 14px;
              color: #64748b;
              margin: 0;
            }
            .meta-grid {
              display: flex;
              gap: 40px;
              margin-top: 12px;
              font-size: 13px;
              color: #475569;
            }
            .meta-item strong {
              color: #0f172a;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 16px;
              font-size: 13px;
            }
            th {
              background-color: #f8fafc;
              color: #475569;
              font-weight: 600;
              text-align: left;
              padding: 12px 10px;
              border-bottom: 1px solid #cbd5e1;
            }
            .th-right {
              text-align: right;
            }
            tr:nth-child(even) {
              background-color: #f8fafc;
            }
            .footer {
              margin-top: 40px;
              text-align: center;
              font-size: 11px;
              color: #94a3b8;
              border-top: 1px solid #e2e8f0;
              padding-top: 16px;
            }
            @media print {
              body {
                padding: 0;
              }
              .no-print {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">Orders Report</h1>
            <p class="subtitle">Digital Hub Shopify Administrator Dashboard</p>
            <div class="meta-grid">
              <div class="meta-item"><strong>Date Range:</strong> ${dateLabel}</div>
              <div class="meta-item"><strong>Filters:</strong> ${searchLabel}</div>
              <div class="meta-item"><strong>Generated:</strong> ${new Date().toLocaleDateString()}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 12%;">Order ID</th>
                <th style="width: 38%;">Customer Email</th>
                <th style="width: 15%; text-align: right;">Date</th>
                <th style="width: 15%; text-align: right;">Amount</th>
                <th style="width: 20%; text-align: right;">Product</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="footer">
            Generated automatically by Digital Hub.
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() {
                window.close();
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Generate pagination page numbers
  const pageNumbers = useMemo(() => {
    const nums = [];
    for (let i = 1; i <= totalPages; i++) {
      nums.push(i);
    }
    return nums;
  }, [totalPages]);

  return (
    <div className={styles.pageContainer}>
      <main className={styles.mainContent}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <div className={styles.headerLeft}>
            <h1 className={styles.pageTitle}>Orders</h1>
            <p className={styles.pageSubtitle}>
              Track all customer upload orders, file submissions and fulfillment status.
            </p>
          </div>
          <div className={styles.datePickerContainer}>
            <button
              className={styles.datePickerButton}
              type="button"
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
            >
              <CalendarIcon />
              <span>{datePickerLabel}</span>
              <ChevronDownIcon />
            </button>
            {isDatePickerOpen && (
              <div className={styles.datePickerDropdown}>
                <div className={styles.datePickerFields}>
                  <div className={styles.dateField}>
                    <span className={styles.fieldLabel}>Start Date</span>
                    <input
                      className={styles.dateInput}
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className={styles.dateField}>
                    <span className={styles.fieldLabel}>End Date</span>
                    <input
                      className={styles.dateInput}
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className={styles.datePickerActions}>
                  <button
                    className={styles.clearBtn}
                    type="button"
                    onClick={() => {
                      setStartDate("");
                      setEndDate("");
                      setIsDatePickerOpen(false);
                    }}
                  >
                    Clear
                  </button>
                  <button
                    className={styles.applyBtn}
                    type="button"
                    onClick={() => setIsDatePickerOpen(false)}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content Card */}
        <div className={styles.contentCard}>
          {/* Table Controls (Search & Download) */}
          <div className={styles.tableControls}>
            <div className={styles.searchWrapper}>
              <SearchIcon />
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Search orders or customers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              className={styles.downloadButton}
              type="button"
              onClick={handleDownloadPDF}
              disabled={filteredOrders.length === 0}
            >
              <DownloadIcon />
              <span>Download</span>
            </button>
          </div>

          {/* Table / Empty State / Loading State */}
          {isTransitioning ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <h3 className={styles.loadingStateTitle}>Loading orders...</h3>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className={styles.emptyState}>
              <h3 className={styles.emptyStateTitle}>No orders found</h3>
              <p className={styles.emptyStateDescription}>
                {searchQuery
                  ? "We couldn't find any orders matching your search query. Try clearing or modifying the text."
                  : "No upload orders or file submissions have been recorded for this shop yet."}
              </p>
            </div>
          ) : (
            <>
              <div className={styles.tableContainer}>
                <table className={styles.ordersTable}>
                  <thead>
                    <tr>
                      <th className={styles.colOrderId}>Order ID</th>
                      <th className={styles.colCustomer}>Customer</th>
                      <th className={`${styles.colDate} ${styles.thRight}`}>Date</th>
                      <th className={`${styles.colAmount} ${styles.thRight}`}>Amount</th>
                      <th className={`${styles.colProduct} ${styles.thRight}`}>Product</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.map((order, idx) => {
                      const displayOrderId = order.orderId.startsWith("#")
                        ? order.orderId
                        : `#${order.orderId}`;
                      const avatarClass = getAvatarStyle(order.customerEmail);
                      const initial = (order.customerEmail[0] || "U").toUpperCase();

                      return (
                        <tr key={order.id}>
                          <td className={styles.colOrderId}>{displayOrderId}</td>
                          <td className={styles.colCustomer}>
                            <div className={styles.customerCell}>
                              <div className={`${styles.avatar} ${avatarClass}`}>
                                {initial}
                              </div>
                              <span className={styles.customerEmail}>
                                {order.customerEmail}
                              </span>
                            </div>
                          </td>
                          <td className={styles.colDate}>
                            {formatDate(order.createdAt)}
                          </td>
                          <td className={styles.colAmount}>
                            {formatPrice(order.productPrice, order.currencyCode)}
                          </td>
                          <td className={styles.colProduct}>
                            {order.productName}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div className={styles.paginationFooter}>
                <p className={styles.showingText}>
                  Showing {paginatedOrders.length} of {filteredOrders.length} orders
                </p>
                {totalPages > 1 && (
                  <div className={styles.paginationControls}>
                    <button
                      className={styles.pageBtn}
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      aria-label="Previous Page"
                    >
                      <ChevronLeftIcon />
                    </button>
                    {pageNumbers.map((num) => (
                      <button
                        key={num}
                        className={`${styles.pageBtn} ${currentPage === num ? styles.pageBtnActive : ""}`}
                        type="button"
                        onClick={() => setCurrentPage(num)}
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      className={styles.pageBtn}
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      aria-label="Next Page"
                    >
                      <ChevronRightIcon />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// Error Boundary & Headers
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
