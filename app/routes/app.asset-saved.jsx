import { useLocation, useRouteError, useSearchParams } from "react-router";
import { navigateEmbedded } from "../utils/embedded-navigation";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import styles from "../components/app.asset-saved.module.css";

// 1. Authentication Loader (Embedded Shopify Admin Route)
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

// 2. SVG Icon Components
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

const SuccessCheckIcon = () => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// 3. Page Component
export default function AssetSaved() {
  const location = useLocation();

  //const groupId = location.state?.groupId || "";
  const [searchParams] = useSearchParams();
  const groupId = location.state?.groupId || searchParams.get("groupId") || "";

  // const handleBack = () => {
  //   navigate("/app");
  // };

  const handleBack = () => {
    navigateEmbedded("/app", searchParams);
  };

  const handleLinkProduct = () => {
    navigateEmbedded("/app/link-product", searchParams, { groupId });
  };

  const handleCreateProduct = () => {
    navigateEmbedded("/app/new-product", searchParams, { groupId });
  };


  return (
    <div className={styles.pageContainer}>
      <main className={styles.mainContent}>
        {/* Page Title & Back Button */}
        <div className={styles.pageHeader}>
          <button
            type="button"
            className={styles.backButton}
            onClick={handleBack}
            aria-label="Back to dashboard"
          >
            <BackIcon />
          </button>
          <h2 className={styles.pageTitle}>Add assets</h2>
        </div>

        {/* Success Card */}
        <div className={styles.card}>
          <div className={styles.cardBody}>
            {/* Animated Checkmark Badge */}
            <div className={styles.iconWrapper}>
              <div className={styles.iconCircle}>
                <SuccessCheckIcon />
              </div>
            </div>

            {/* Success message */}
            <h2 className={styles.successTitle}>

              Asset Saved Successfully  {/*as Draft {groupId}*/}

            </h2>
          </div>

          {/* Action Buttons Footer */}
          <div className={styles.cardFooter}>
            <button
              type="button"
              className={styles.linkButton}
              onClick={handleLinkProduct}
            >
              Link Asset to Existing Product
            </button>
            <button
              type="button"
              className={styles.createButton}
              onClick={handleCreateProduct}
            >
              Create New Digital Product
            </button>
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
