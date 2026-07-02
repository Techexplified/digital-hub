import { useEffect } from "react";
import { useNavigate, useLoaderData, useFetcher, useRouteError, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import styles from "../components/app.onboarding.module.css";

export const loader = async ({ request }) => {
  const { session, redirect } = await authenticate.admin(request);
  const shop = session.shop;

  const shopRecord = await prisma.shop.findUnique({
    where: { shop },
  });

  if (shopRecord?.onboardingCompleted) {
    throw redirect("/app");
  }

  return { shop };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  await prisma.shop.upsert({
    where: { shop },
    update: { onboardingCompleted: true },
    create: { shop, onboardingCompleted: true },
  });

  return { success: true };
};

// Inline SVG components
const AppBlockIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <rect x="7" y="7" width="4" height="4" rx="0.5" fill="currentColor" />
    <rect x="13" y="7" width="4" height="4" rx="0.5" />
    <rect x="7" y="13" width="10" height="4" rx="0.5" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const LightBulbIcon = () => (
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
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5.5 5.5 0 0 0 7.5 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5" />
    <path d="M9 18h6" />
    <path d="M10 22h4" />
  </svg>
);

const DoubleCheckIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="17 6 8.5 15 5 11.5" />
    <polyline points="21 6 12.5 15 11 13.5" />
  </svg>
);

export default function Onboarding() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [searchParams] = useSearchParams();
  const { shop } = useLoaderData();

  // const handleOpenThemeEditor = () => {
  //   try {
  //     shopify.toast.show("Opening Shopify Theme Editor...");
  //   } catch (err) {
  //     console.log("Opening Shopify Theme Editor...");
  //   }
  //   console.log("Shop value:", shop);
  //   window.open(`https://${shop}/admin/themes/current/editor?context=apps`, "_blank");
  // };

  const handleOpenThemeEditor = () => {
  try {
    shopify.toast.show("Opening Shopify Theme Editor...");
  } catch (err) {
    console.log("Opening Shopify Theme Editor...");
  }
  
  const themeEditorUrl = `https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/themes/current/editor?context=apps`;  
  // Use App Bridge navigation for embedded apps
  open(themeEditorUrl, "_blank");
};

  const handleFinishSetup = () => {
    fetcher.submit({}, { method: "POST" });
  };

  useEffect(() => {
    if (fetcher.data?.success) {
      try {
        shopify.toast.show("Setup finished successfully!");
      } catch (err) {
        console.log("Toast failed - Setup finished successfully.");
      }
      const query = searchParams.toString();
      navigate(query ? `/app?${query}` : "/app");
    }
  }, [fetcher.data, navigate, searchParams, shopify]);

  const isSubmitting = fetcher.state === "submitting";

  return (
    <div className={styles.pageContainer}>
      <main className={styles.mainContent}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>Welcome aboard!</h1>
            <p className={styles.subtitle}>Let's get your app up and running in just a few steps.</p>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Add App Block to Theme</h2>
              <p className={styles.sectionSubtitle}>Choose where you want your customers to access their files.</p>
              <p className={styles.recommendation}>Recommendation: Add to Customer Account Page</p>
            </div>

            <div className={styles.previewContainer}>
              <div className={styles.previewBox}>
                <div className={styles.previewIconWrapper}>
                  <AppBlockIcon />
                </div>
                <span className={styles.previewText}>App block preview</span>
              </div>

              <button
                type="button"
                className={styles.themeEditorButton}
                onClick={handleOpenThemeEditor}
              >
                <ExternalLinkIcon /> Open Theme Editor
              </button>
            </div>

            <div className={styles.tipBanner}>
              <span className={styles.tipIcon}>
                <LightBulbIcon />
              </span>
              <span>Tip: Look for "App Blocks" in the sidebar of the theme editor.</span>
            </div>
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.finishButton}
              onClick={handleFinishSetup}
              disabled={isSubmitting}
            >
              <DoubleCheckIcon /> Finish Setup
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
