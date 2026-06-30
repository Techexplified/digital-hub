import { useState, useEffect } from "react";
import { useNavigate, useRouteError, useLoaderData, useFetcher, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import styles from "../components/app.settings.module.css";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  return {
    shop,
    portalHeaderText: settings?.portalHeaderText ?? "My Digital Vault",
    loginPromptMessage: settings?.loginPromptMessage ?? "Please log in to your customer account to access and download your purchased files.",
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const portalHeaderText = formData.get("portalHeaderText");
  const loginPromptMessage = formData.get("loginPromptMessage");

  await prisma.shopSettings.upsert({
    where: { shop },
    update: { portalHeaderText, loginPromptMessage },
    create: { shop, portalHeaderText, loginPromptMessage },
  });

  return { success: true };
};

// SVG Icons
const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={styles.backIcon}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

export default function Settings() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const fetcher = useFetcher();
  const { shop, portalHeaderText: savedHeader, loginPromptMessage: savedPrompt } = useLoaderData();

  const [portalHeaderText, setPortalHeaderText] = useState(savedHeader);
  const [loginPromptMessage, setLoginPromptMessage] = useState(savedPrompt);

  const handleDiscard = () => {
    navigate("/app/dashboard");
  };

  const handleSave = (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("portalHeaderText", portalHeaderText);
    formData.append("loginPromptMessage", loginPromptMessage);
    fetcher.submit(formData, { method: "POST" });
  };

  const handleOpenThemeEditor = () => {
    try {
      shopify.toast.show("Opening Shopify Theme Editor...");
    } catch (err) {
      console.log("Opening Shopify Theme Editor...");
    }
    window.open(`https://${shop}/admin/themes/current/editor?context=apps`, "_blank");
  };

  useEffect(() => {
    if (fetcher.data?.success) {
      try {
        shopify.toast.show("Settings saved successfully!");
      } catch (err) {
        console.log("Toast failed - Settings saved successfully.");
      }
    }
  }, [fetcher.data, shopify]);

  const isLoading = navigation.state === "loading" || fetcher.state === "submitting";

  return (
    <div className={styles.pageContainer}>
      <main className={styles.mainContent}>
        <div className={styles.pageHeader}>
          <div className={styles.headerLeft}>
            <button type="button" className={styles.backButton} onClick={handleDiscard} aria-label="Back">
              <BackIcon />
            </button>
            <div className={styles.headerTitleWrapper}>
              <h2 className={styles.pageTitle}>Settings</h2>
              <p className={styles.pageSubtitle}>Manage your app preferences, security policies, and integrations.</p>
            </div>
          </div>
          <div className={styles.headerRight}>
            <button type="button" className={styles.saveButton} onClick={handleSave} disabled={isLoading}>
              Save
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} className={styles.settingsForm}>
          {/* Card 1: Storefront Appearance */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Storefront Appearance</h3>
              <p className={styles.cardSubtitle}>Customize how your download portal looks to your customers.</p>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.formRow}>
                <label htmlFor="portal-header-text" className={styles.fieldLabel}>
                  Portal Header Text
                </label>
                <input
                  id="portal-header-text"
                  type="text"
                  className={styles.textInput}
                  value={portalHeaderText}
                  onChange={(e) => setPortalHeaderText(e.target.value)}
                />
              </div>

              <div className={styles.formRow}>
                <label htmlFor="login-prompt-message" className={styles.fieldLabel}>
                  Login Prompt Message
                </label>
                <input
                  id="login-prompt-message"
                  type="text"
                  className={styles.textInput}
                  value={loginPromptMessage}
                  onChange={(e) => setLoginPromptMessage(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Card 2: App Integration */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>App Integration</h3>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.integrationRow}>
                <div className={styles.integrationLeft}>
                  <span className={styles.checkCircleWrapper}><CheckCircleIcon /></span>
                  <span className={styles.integrationText}>App Block</span>
                </div>
                <button type="button" className={styles.themeEditorButton} onClick={handleOpenThemeEditor}>
                  <span className={styles.gearIcon}><SettingsIcon /></span>
                  Configure in Shopify Theme Editor
                </button>
              </div>
            </div>
          </div>
        </form>
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